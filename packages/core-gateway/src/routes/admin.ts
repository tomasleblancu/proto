/**
 * Admin metadata endpoint — exposes registered tools, entities, workflows,
 * and skills for the Proto admin panel.
 *
 * Reads the app directory (PROTO_APP_ROOT) to extract metadata without
 * executing tool handlers.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Hono } from 'hono'
import { resolveAppPath } from '../config.js'
import { loadSkills } from '../registry.js'

export function registerAdminRoutes(app: Hono) {
  app.get('/admin/meta', async (c) => {
    const [tools, entities, workflows] = await Promise.all([
      discoverToolMeta(),
      discoverEntityMeta(),
      discoverWorkflowMeta(),
    ])
    const skills = loadSkills().map(s => ({
      name: s.name,
      description: s.description,
      mcp_tools: s.mcp_tools,
    }))

    return c.json({ tools, entities, workflows, skills })
  })
}

async function discoverToolMeta(): Promise<{ name: string; description: string }[]> {
  const dir = resolveAppPath('app/tools')
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter(
    f => (f.endsWith('.ts') || f.endsWith('.js')) && f !== 'index.ts' && f !== 'index.js'
  )

  const tools: { name: string; description: string }[] = []

  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(join(dir, file)).href)
      const defs = mod.default
      if (!Array.isArray(defs)) continue
      for (const t of defs) {
        if (t && typeof t.name === 'string') {
          tools.push({ name: t.name, description: t.description || '' })
        }
      }
    } catch {
      // Skip files that fail to import
    }
  }

  return tools
}

async function discoverEntityMeta(): Promise<{ name: string; table: string }[]> {
  const dir = resolveAppPath('app/entities')
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter(
    f => (f.endsWith('.ts') || f.endsWith('.js')) && f !== 'index.ts' && f !== 'index.js'
  )

  const entities: { name: string; table: string }[] = []

  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(join(dir, file)).href)
      const def = mod.default
      if (def && typeof def.name === 'string') {
        entities.push({ name: def.name, table: def.table || '' })
      }
    } catch {}
  }

  return entities
}

async function discoverWorkflowMeta(): Promise<{ name: string; entityTable: string; phases: string[] }[]> {
  const dir = resolveAppPath('app/workflows')
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter(
    f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.startsWith('_')
  )

  const workflows: { name: string; entityTable: string; phases: string[] }[] = []

  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(join(dir, file)).href)
      const def = mod.default
      if (def && typeof def.name === 'string') {
        const phases = Array.isArray(def.phases)
          ? def.phases.map((p: any) => typeof p === 'string' ? p : p.name || '').filter(Boolean)
          : []
        workflows.push({ name: def.name, entityTable: def.entityTable || '', phases })
      }
    } catch {}
  }

  return workflows
}
