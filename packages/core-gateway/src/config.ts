import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
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

function loadConfig(): ProjectConfig {
  const configPath = process.env.PROJECT_CONFIG || 'project.yaml'
  let resolved = resolve(configPath)

  // If not found at CWD, try repo root (2 levels up from packages/gateway/)
  if (!existsSync(resolved)) {
    const repoRoot = resolve(__dirname, '..', '..', '..')
    resolved = resolve(repoRoot, configPath)
  }

  if (!existsSync(resolved)) {
    return {
      name: 'hermes',
      display_name: 'Hermes',
      timezone: 'America/Santiago',
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
    name: raw.name || 'hermes',
    display_name: raw.display_name || 'Hermes',
    timezone: raw.timezone || 'America/Santiago',
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
export const MAX_TURNS = parseInt(process.env.CLAUDE_MAX_TURNS || '25', 10)
export const TIMEOUT_SECONDS = parseInt(process.env.CLAUDE_TIMEOUT || '120', 10)
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
export const PORT = parseInt(process.env.PORT || '8090', 10)
