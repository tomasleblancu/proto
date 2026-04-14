import { mkdirSync, writeFileSync, existsSync, readdirSync, copyFileSync, statSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import type { ChatRequest } from '@tleblancureta/proto/shared'
import { config, DATA_DIR } from './config.js'
import { buildSystemPrompt } from './skills.js'
import { loadSkills, loadAgents, type Skill, type Agent } from './registry.js'

/**
 * Deterministic session ID from project name + company_id + optional session_key.
 * Uses a simple hash to create a stable identifier (UUID v5 equivalent).
 */
function getSessionId(companyId: string, sessionKey?: string): string {
  const seed = `${config.name}-${companyId}${sessionKey ? `-${sessionKey}` : ''}`
  return createHash('sha256').update(seed).digest('hex').slice(0, 32)
}

interface SessionResult {
  sessionId: string
  sessionDir: string
  env: Record<string, string>
  promptFile: string
  mcpConfigFile: string
  claudeConfigDir: string
}

export async function prepareSession(request: ChatRequest): Promise<SessionResult> {
  const sessionId = getSessionId(request.company_id, request.session_key)

  const sessionSlug = request.session_key
    ? `${request.company_id}/${request.session_key}`
    : request.company_id

  const sessionDir = resolve(DATA_DIR, 'sessions', sessionSlug)
  mkdirSync(sessionDir, { recursive: true })

  // Claude config dir: use per-session dir in Docker, default (~/.claude) in local dev
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    ? resolve(DATA_DIR, 'claude-config', sessionSlug)
    : join(process.env.HOME || '', '.claude')

  if (process.env.CLAUDE_CONFIG_DIR) {
    mkdirSync(claudeConfigDir, { recursive: true })
    copyCredentials(claudeConfigDir)
  }

  // Load skills + agents from filesystem
  const skills = loadSkills()
  const agents = loadAgents()

  // Write system prompt (uses skill metadata for tool restrictions)
  const systemPrompt = buildSystemPrompt(request, skills)
  const promptFile = join(sessionDir, 'system-prompt.md')
  writeFileSync(promptFile, systemPrompt)

  // Copy enabled skills + all agents into session dir
  writeSkills(sessionDir, request, skills)
  writeAgents(sessionDir, agents)

  // Write MCP config (without secrets — secrets passed via env inheritance)
  const mcpConfigFile = writeMcpConfig(sessionDir, request)

  // Build environment for claude subprocess
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    COMPANY_ID: request.company_id,
    USER_ID: request.user_id,
    CHANNEL: request.channel,
  }

  // Only override CLAUDE_CONFIG_DIR in Docker (where we isolate per session)
  if (process.env.CLAUDE_CONFIG_DIR) {
    env.CLAUDE_CONFIG_DIR = claudeConfigDir
  }

  return { sessionId, sessionDir, env, promptFile, mcpConfigFile, claudeConfigDir }
}

/**
 * Copy enabled skills from repo into session dir.
 * Channel exclusions and per-request enabled_skills are applied here.
 */
function writeSkills(sessionDir: string, request: ChatRequest, skills: Skill[]): void {
  const enabledSet = new Set(request.enabled_skills)
  const channelExcluded = config.channel_excluded_skills[request.channel] || new Set()
  for (const s of channelExcluded) enabledSet.delete(s)

  const skillsDir = join(sessionDir, '.claude', 'skills')
  mkdirSync(skillsDir, { recursive: true })

  for (const entry of readdirSync(skillsDir)) {
    try { rmSync(join(skillsDir, entry), { recursive: true, force: true }) } catch {}
  }

  for (const skill of skills) {
    if (!enabledSet.has(skill.name)) continue
    const dir = join(skillsDir, skill.name)
    mkdirSync(dir, { recursive: true })
    copyFileSync(skill.filePath, join(dir, 'SKILL.md'))
  }
}

/**
 * Copy all agents from repo into session dir.
 */
function writeAgents(sessionDir: string, agents: Agent[]): void {
  const agentsDir = join(sessionDir, '.claude', 'agents')
  mkdirSync(agentsDir, { recursive: true })

  for (const entry of readdirSync(agentsDir)) {
    try { rmSync(join(agentsDir, entry), { force: true }) } catch {}
  }

  for (const agent of agents) {
    copyFileSync(agent.filePath, join(agentsDir, `${agent.name}.md`))
  }
}

function writeMcpConfig(sessionDir: string, request: ChatRequest): string {
  const mcpServers: Record<string, any> = {}

  for (const [name, serverConfig] of Object.entries(config.mcp_servers)) {
    if (serverConfig.type === 'http') {
      // HTTP MCP server — just pass the URL
      mcpServers[name] = { type: 'http', url: serverConfig.url }
      continue
    }

    // Stdio MCP server — resolve args and env
    const resolvedArgs = serverConfig.args.map(arg =>
      arg.startsWith('$') ? (process.env[arg.slice(1)] || '') : arg
    )

    const resolvedEnv: Record<string, string> = {}
    for (const [mcpVar, source] of Object.entries(serverConfig.env)) {
      if (source === '__COMPANY_ID__') {
        resolvedEnv[mcpVar] = request.company_id
      } else if (source === '__ALLOWED_TOOLS__') {
        continue
      } else {
        resolvedEnv[mcpVar] = process.env[source] || ''
      }
    }

    resolvedEnv.USER_ID = request.user_id
    resolvedEnv.COMPANY_ID = request.company_id

    if (request.session_key?.startsWith('order-')) {
      resolvedEnv.ACTIVE_ORDER_ID = request.session_key.slice('order-'.length)
    }
    if (process.env.SUPABASE_URL) resolvedEnv.SUPABASE_URL = process.env.SUPABASE_URL
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) resolvedEnv.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    mcpServers[name] = {
      command: serverConfig.command,
      ...(resolvedArgs.length > 0 && { args: resolvedArgs }),
      env: resolvedEnv,
    }
  }

  const mcpConfig = { mcpServers }
  const configFile = join(sessionDir, 'mcp-config.json')
  writeFileSync(configFile, JSON.stringify(mcpConfig))
  return configFile
}

/**
 * Copy Claude OAuth credentials from the global config to a session-specific config dir.
 * This allows each session to have its own CLAUDE_CONFIG_DIR while sharing the same auth.
 */
function copyCredentials(claudeConfigDir: string): void {
  const credsFile = join(claudeConfigDir, '.credentials.json')
  const candidates = [
    join(process.env.HOME || '', '.claude', '.credentials.json'),
    join(process.env.CLAUDE_CONFIG_DIR || '/data/claude', '.credentials.json'),
    '/data/claude-host/.credentials.json',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      copyFileSync(candidate, credsFile)
      console.log(`[credentials] Copied from ${candidate}`)
      return
    }
  }
  console.warn('[credentials] No credentials found. Run: claude login')
}

/**
 * Copy refreshed credentials from session config back to global config.
 * Claude Code may refresh the OAuth token during a session — sync it back
 * so future sessions use the fresh token.
 */
export function syncCredentialsBack(claudeConfigDir: string): void {
  const sessionCreds = join(claudeConfigDir, '.credentials.json')
  if (!existsSync(sessionCreds)) return

  const globalDir = process.env.CLAUDE_CONFIG_DIR || '/data/claude'
  const globalCreds = join(globalDir, '.credentials.json')

  try {
    if (!existsSync(globalCreds) || statSync(sessionCreds).mtimeMs > statSync(globalCreds).mtimeMs) {
      mkdirSync(globalDir, { recursive: true })
      copyFileSync(sessionCreds, globalCreds)
    }
  } catch {}
}
