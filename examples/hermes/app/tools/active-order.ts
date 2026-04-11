import { z } from 'zod'
import { defineTool, getSupabase } from '@proto/core-mcp'
import { getActiveOrder, setActiveOrder } from '../activeOrder.js'

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
const json = (obj: unknown) => ok(JSON.stringify(obj, null, 2))
const err = (msg: string) => ok(`Error: ${msg}`)

/**
 * Tools to manage the "active order" context in the MCP session.
 *
 * When the agent calls `activate_order`, the frontend intercepts the
 * tool_use event and swaps the shell into cockpit mode (order-focused
 * widgets). Subsequent scoped tools read the active order implicitly.
 */
export default [
  defineTool({
    name: 'activate_order',
    description: `Activa un pedido como foco del agente. DEBE llamarse siempre que empieces a trabajar sobre un pedido especifico, y cada vez que cambies de pedido.

Efectos:
- El frontend entra en "cockpit mode": reemplaza los widgets generales por una ficha viva del pedido (producto, proveedor, costeo, timeline) que se actualiza sola en cada turno.
- Las tools scoped (advance_phase, update_costing, assign_supplier, register_payment, etc.) operaran sobre este pedido sin necesidad de pasar el order_id.
- Las tools globales (list_orders, list_products, get_company, search_alibaba) siguen disponibles sin restriccion.

Si cambias de pedido, vuelve a llamar activate_order con el nuevo id — reemplaza el anterior.`,
    schema: {
      order_id: z.string().describe('UUID del pedido a activar'),
      item_id: z
        .string()
        .optional()
        .describe('Opcional: UUID del line item especifico dentro del pedido'),
    },
    handler: async ({ order_id, item_id }) => {
      const db = getSupabase()
      const { data: order, error } = await db
        .from('orders')
        .select('id, company_id, supplier_name, status, current_phase')
        .eq('id', order_id)
        .maybeSingle()

      if (error) return err(error.message)
      if (!order) return err(`Pedido ${order_id} no encontrado`)

      setActiveOrder({
        order_id: order.id,
        company_id: order.company_id,
        item_id,
      })

      return json({
        ok: true,
        activated: {
          order_id: order.id,
          company_id: order.company_id,
          item_id: item_id || null,
          status: order.status,
          current_phase: order.current_phase,
          supplier_name: order.supplier_name,
        },
        message: 'Pedido activado. El cockpit esta abierto en el frontend y las tools scoped apuntan a este pedido.',
      })
    },
  }),

  defineTool({
    name: 'deactivate_order',
    description: 'Desactiva el pedido activo. El frontend sale del cockpit mode y vuelve al layout general. Usa esto cuando termines de trabajar sobre un pedido y quieras volver a la vista general.',
    schema: {},
    handler: async () => {
      const prev = getActiveOrder()
      setActiveOrder(null)
      return json({ ok: true, deactivated: prev?.order_id || null })
    },
  }),

  defineTool({
    name: 'get_active_order',
    description: 'Devuelve el pedido activo actual (si hay). Util si no recuerdas sobre que pedido estas trabajando.',
    schema: {},
    handler: async () => {
      const active = getActiveOrder()
      if (!active) return json({ active: null })
      const db = getSupabase()
      const { data: order } = await db
        .from('orders')
        .select('id, company_id, supplier_name, status, current_phase, total_amount, currency')
        .eq('id', active.order_id)
        .maybeSingle()
      return json({ active, order })
    },
  }),
]
