import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface MCPServerStdio {
  type: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
}

interface MCPServerHTTP {
  type: 'http'
  url: string
}

type MCPServerConfig = MCPServerStdio | MCPServerHTTP

interface ProjectConfig {
  name: string
  display_name: string
  timezone: string
  mcp_servers: Record<string, MCPServerConfig>
  prompts: Record<string, string>
  skills_dir: string
  agents_dir: string
  channel_excluded_skills: Record<string, Set<string>>
  always_allowed_tools: string[]
}

/**
 * APP_ROOT: the directory of the proto app being served (contains project.yaml + app/).
 * Resolution order:
 *   1. PROTO_APP_ROOT env var (absolute or relative to cwd)
 *   2. cwd, if it contains project.yaml
 *   3. Legacy fallback: 3 levels up from this file (backward compat for pre-carve-out layout)
 */
function resolveAppRoot(): string {
  const envRoot = process.env.PROTO_APP_ROOT
  if (envRoot) {
    return isAbsolute(envRoot) ? envRoot : resolve(process.cwd(), envRoot)
  }
  const cwdConfig = resolve(process.cwd(), 'project.yaml')
  if (existsSync(cwdConfig)) return process.cwd()
  return resolve(__dirname, '..', '..', '..')
}

export const APP_ROOT = resolveAppRoot()

/** Resolve a relative path against APP_ROOT (or return absolute paths as-is). */
export function resolveAppPath(relative: string): string {
  return isAbsolute(relative) ? relative : resolve(APP_ROOT, relative)
}

function loadConfig(): ProjectConfig {
  const configPath = process.env.PROJECT_CONFIG || 'project.yaml'
  const resolved = resolveAppPath(configPath)

  if (!existsSync(resolved)) {
    return {
      name: 'proto',
      display_name: 'Proto',
      timezone: 'UTC',
      mcp_servers: {},
      prompts: { default: 'prompts/default.md' },
      skills_dir: 'skills',
      agents_dir: 'agents',
      channel_excluded_skills: {},
      always_allowed_tools: [],
    }
  }

  const raw = yaml.parse(readFileSync(resolved, 'utf-8')) || {}
  const mcpRaw = raw.mcp?.servers || {}
  const mcp_servers: Record<string, MCPServerConfig> = {}

  for (const [name, cfg] of Object.entries(mcpRaw) as [string, any][]) {
    if (cfg.type === 'http') {
      mcp_servers[name] = { type: 'http', url: cfg.url }
    } else {
      mcp_servers[name] = {
        type: 'stdio',
        command: cfg.command || 'node',
        args: cfg.args || [],
        env: cfg.env || {},
      }
    }
  }

  const skillsRaw = raw.skills || {}
  const excluded: Record<string, Set<string>> = {}
  for (const [channel, skills] of Object.entries(skillsRaw.excluded_channels || {})) {
    excluded[channel] = new Set(skills as string[])
  }

  return {
    name: raw.name || 'proto',
    display_name: raw.display_name || 'Proto',
    timezone: raw.timezone || 'UTC',
    mcp_servers,
    prompts: raw.prompts || { default: 'prompts/default.md' },
    skills_dir: skillsRaw.dir || 'skills',
    agents_dir: raw.agents?.dir || 'agents',
    channel_excluded_skills: excluded,
    always_allowed_tools: raw.always_allowed_tools || [],
  }
}

export const config = loadConfig()

// Gateway env vars
export const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''

// Kapso (WhatsApp) env vars — no-op if not set
export const KAPSO_API_URL = process.env.KAPSO_API_URL || ''
export const KAPSO_API_KEY = process.env.KAPSO_API_KEY || ''
export const KAPSO_WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET || ''
export const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || ''
export const KAPSO_DEFAULT_COMPANY_ID = process.env.KAPSO_DEFAULT_COMPANY_ID || ''
export const MAX_TURNS = parseInt(process.env.CLAUDE_MAX_TURNS || '25', 10)
export const TIMEOUT_SECONDS = parseInt(process.env.CLAUDE_TIMEOUT || '120', 10)
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
export const PORT = parseInt(process.env.PORT || '8090', 10)
