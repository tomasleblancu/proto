/**
 * Active order state (per-session).
 *
 * The MCP server runs as a stdio subprocess per Claude Code session, so this
 * module-level variable is naturally isolated per user conversation.
 *
 * The agent calls `activate_order(order_id)` to "focus" on a specific order.
 * Scoped tools (advance_phase, update_costing, assign_supplier, etc.) read
 * from here instead of requiring order_id in every call. Global tools
 * (list_orders, list_products, get_company, etc.) ignore this state.
 *
 * Switching orders: call `activate_order` with a new id — it replaces.
 * Clearing: call `deactivate_order`.
 */

export interface ActiveOrder {
  order_id: string
  company_id: string
  // Optional: if the agent is working on a specific line item within the order
  item_id?: string
}

let _active: ActiveOrder | null = null

export function getActiveOrder(): ActiveOrder | null {
  return _active
}

export function setActiveOrder(o: ActiveOrder | null): void {
  _active = o
}

export function requireActiveOrder(): ActiveOrder {
  if (!_active) {
    throw new Error(
      'No hay pedido activo. El agente debe llamar activate_order(order_id) antes de usar tools scoped.',
    )
  }
  return _active
}
