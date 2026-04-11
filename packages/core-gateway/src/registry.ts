/**
 * Loads skill + agent definitions from the filesystem.
 * Skills live in skills/<name>/SKILL.md, agents in agents/<name>.md.
 * Parsed once at import time and cached in module scope.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'yaml'
import { config } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Types ──

export interface Skill {
  name: string
  description: string | null
  mcp_tools: string[]
  depends: string[]
  filePath: string
}

export interface Agent {
  name: string
  filePath: string
}

// ── Resolve repo root (2 levels up from packages/gateway/src/) ──

function repoRoot(): string {
  return resolve(__dirname, '..', '..', '..')
}

// ── Skill loader ──

function parseSkillFrontmatter(filePath: string): Skill | null {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    if (!raw.startsWith('---')) return null
    const parts = raw.split('---')
    if (parts.length < 3) return null
    const meta = yaml.parse(parts[1]) || {}
    const name = meta.name as string
    if (!name) return null
    return {
      name,
      description: meta.description ?? null,
      mcp_tools: meta['mcp-tools'] ?? [],
      depends: Array.isArray(meta.depends) ? meta.depends : [],
      filePath,
    }
  } catch (err) {
    console.warn(`[registry] Failed to parse ${filePath}:`, err)
    return null
  }
}

function discoverSkills(): Skill[] {
  const dir = resolve(repoRoot(), config.skills_dir)
  if (!existsSync(dir)) return []

  const skills: Skill[] = []
  for (const entry of readdirSync(dir)) {
    const entryPath = join(dir, entry)
    if (!statSync(entryPath).isDirectory()) continue
    const skillFile = join(entryPath, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const skill = parseSkillFrontmatter(skillFile)
    if (skill) skills.push(skill)
  }
  return skills
}

// ── Agent loader ──

function discoverAgents(): Agent[] {
  const dir = resolve(repoRoot(), config.agents_dir)
  if (!existsSync(dir)) return []

  const agents: Agent[] = []
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue
    agents.push({
      name: basename(entry, '.md'),
      filePath: join(dir, entry),
    })
  }
  return agents
}

// ── Cached at module level (read once at startup) ──

let _skills: Skill[] | null = null
let _agents: Agent[] | null = null

export function loadSkills(): Skill[] {
  if (!_skills) _skills = discoverSkills()
  return _skills
}

export function loadAgents(): Agent[] {
  if (!_agents) _agents = discoverAgents()
  return _agents
}
