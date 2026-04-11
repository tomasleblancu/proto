/**
 * registerEntityTools — generates activate_<name> / deactivate_<name> /
 * get_active_<name> MCP tools from an array of entity definitions.
 *
 * The active state lives in a module-level Map, which is naturally per-process
 * for stdio transport (one subprocess per session) and per-session for HTTP
 * transport (each session builds a fresh server via `buildServer()`).
 *
 * Apps call this from their tools/index.ts:
 *
 *   import { registerEntityTools } from '@proto/core-mcp'
 *   import { ENTITIES } from '../entities/index.js'
 *
 *   export function registerAppTools(server) {
 *     registerUiTools(server)
 *     registerTools(server, ALL_APP_TOOLS)
 *     registerEntityTools(server, ENTITIES)
 *   }
 */
import { z } from 'zod'
import type { EntityDefinition } from '@proto/core-shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { defineTool, registerTools } from './define-tool.js'
import { getSupabase } from './supabase.js'
import { ok } from './tools/_helpers.js'

interface ActiveEntityState {
  id: string
}

const activeByName = new Map<string, ActiveEntityState | null>()

function json(obj: unknown) {
  return ok(JSON.stringify(obj, null, 2))
}

export function buildEntityTools(defs: readonly EntityDefinition[]) {
  return defs.flatMap(def => {
    const idField = `${def.name}_id`
    const singular = def.displayName || def.name

    const activateDesc = def.activateDescription
      ?? `Activa un ${singular} como foco del agente. Llama esta tool cuando empieces a trabajar sobre un ${singular} especifico, y cada vez que cambies de ${singular}. El frontend entra en "cockpit mode" con los widgets focalizados y las tools scoped operan sobre este ${singular} sin necesidad de repetir el id en cada llamada.`

    const deactivateDesc = `Desactiva el ${singular} activo. El frontend vuelve al layout general.`
    const getActiveDesc = `Devuelve el ${singular} activo actual (si hay).`

    return [
      defineTool({
        name: `activate_${def.name}`,
        description: activateDesc,
        schema: { [idField]: z.string().describe(`UUID del ${singular} a activar`) },
        handler: async (args: Record<string, string>) => {
          const id = args[idField]
          const db = getSupabase()
          const { data, error } = await db
            .from(def.table)
            .select('*')
            .eq('id', id)
            .maybeSingle()

          if (error) return ok(`Error: ${error.message}`)
          if (!data) return ok(`${singular} ${id} no encontrado`)

          activeByName.set(def.name, { id })

          return json({
            ok: true,
            activated: {
              type: def.name,
              id,
              label: (data as Record<string, unknown>)[def.labelField] ?? null,
            },
            entity: data,
            message: `${singular} activado. El cockpit del frontend quedo abierto.`,
          })
        },
      }),

      defineTool({
        name: `deactivate_${def.name}`,
        description: deactivateDesc,
        schema: {},
        handler: async () => {
          const prev = activeByName.get(def.name) ?? null
          activeByName.set(def.name, null)
          return json({ ok: true, deactivated: prev?.id ?? null })
        },
      }),

      defineTool({
        name: `get_active_${def.name}`,
        description: getActiveDesc,
        schema: {},
        handler: async () => {
          const active = activeByName.get(def.name) ?? null
          if (!active) return json({ active: null })
          const db = getSupabase()
          const { data } = await db
            .from(def.table)
            .select('*')
            .eq('id', active.id)
            .maybeSingle()
          return json({ active, entity: data })
        },
      }),
    ]
  })
}

export function registerEntityTools(
  server: McpServer,
  defs: readonly EntityDefinition[]
): void {
  registerTools(server, buildEntityTools(defs))
}
