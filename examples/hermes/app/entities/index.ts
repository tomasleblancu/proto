/**
 * Hermes entity registry.
 *
 * Loaded by:
 *   - MCP side (app/tools/index.ts) → registerEntityTools generates the
 *     activate_<name> / deactivate_<name> / get_active_<name> tools.
 *   - Web side (web/src/App.tsx) → Shell uses cockpit layouts + snapshotBuilder.
 *
 * To add a new entity: create `./<name>.ts` with a defineEntity() export and
 * append it here.
 */
import orderEntity from './order.js'
import productEntity from './product.js'

export const ENTITIES = [orderEntity, productEntity] as const

export { orderEntity, productEntity }
