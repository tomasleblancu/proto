/**
 * defineEntity — declarative activatable entity.
 *
 * An entity is a first-class object in the app that can be "focused" by the
 * agent or the user. Activating it triggers:
 *   - The MCP side: `activate_<name>`, `deactivate_<name>`, `get_active_<name>`
 *     tools generated from this definition (see @proto/core-mcp → registerEntityTools).
 *   - The web side: Shell switches to cockpit mode using `cockpit` layouts + widgets.
 *   - The chat side: `snapshotBuilder` runs and injects the markdown into the
 *     agent's context so the next turn has fresh data without tool calls.
 *
 * The definition is pure data (plus an optional async function). It loads from
 * both Node (MCP) and the browser (Shell + chat) without React imports.
 *
 * Example:
 *
 *   export default defineEntity({
 *     name: 'order',
 *     displayName: 'pedido',
 *     table: 'orders',
 *     labelField: 'supplier_name',
 *     cockpit: {
 *       widgets: [
 *         { id: 'cockpit-header', type: 'order-header', title: 'Pedido' },
 *         ...
 *       ],
 *       layouts: { lg: [...], md: [...], sm: [...] },
 *     },
 *     snapshotBuilder: async (entity, { supabase }) => {
 *       // query related data, return markdown string
 *     },
 *   })
 */

export interface EntityCockpitWidget {
  id: string
  type: string
  title: string
  props?: Record<string, unknown>
}

export interface EntityCockpit {
  widgets: EntityCockpitWidget[]
  /** react-grid-layout Layouts — opaque at this layer. */
  layouts: Record<string, unknown>
}

export interface EntityDefinition<T = Record<string, unknown>> {
  /** Unique id used as activeEntity.type and as the tool suffix. */
  name: string
  /** Human-readable singular noun used in generated tool descriptions. */
  displayName: string
  /** Supabase table the entity lives in. */
  table: string
  /** Column to use as the default label when surfacing this entity. */
  labelField: string
  /** Shell cockpit layout shown when this entity is active. */
  cockpit?: EntityCockpit
  /**
   * Builds a markdown snapshot of the entity + related data. Called from the
   * browser before each chat turn so the agent has fresh context without
   * burning tool calls on reads. Return null to skip injection.
   */
  snapshotBuilder?: (
    entity: T,
    ctx: { supabase: unknown }
  ) => Promise<string | null>
  /**
   * Optional override for the agent-facing description of the generated
   * `activate_<name>` tool. If omitted, a generic template is used.
   */
  activateDescription?: string
}

export function defineEntity<T = Record<string, unknown>>(
  def: EntityDefinition<T>
): EntityDefinition<T> {
  return def
}

export type EntityRegistry = Map<string, EntityDefinition>

export function buildEntityRegistry(
  defs: readonly EntityDefinition[]
): EntityRegistry {
  const map: EntityRegistry = new Map()
  for (const def of defs) {
    if (map.has(def.name)) {
      console.warn(`[defineEntity] duplicate entity name: ${def.name}`)
    }
    map.set(def.name, def)
  }
  return map
}
