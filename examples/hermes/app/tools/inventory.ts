import { z } from 'zod'
import { defineTool, getSupabase } from '@proto/core-mcp'

const COMPANY_ID = () => process.env.COMPANY_ID || ''

export default [
  defineTool({
    name: 'get_inventory',
    description: 'Get current inventory levels for a product or all products. Shows reserved (in orders), in_transit (shipped), and available (ready for sale).',
    schema: {
      product_id: z.string().optional().describe('Specific product ID. If omitted, returns all products with inventory.'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const companyId = COMPANY_ID()

      let query = db.from('inventory')
        .select('*, products(name, category)')
        .eq('company_id', companyId)

      if (args.product_id) query = query.eq('product_id', args.product_id)

      const { data, error } = await query.order('updated_at', { ascending: false })
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }

      if (!data || data.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No hay inventario registrado.' }] }
      }

      const summary = data.map((inv: any) => {
        const total = inv.reserved + inv.in_transit + inv.available
        return {
          producto: inv.products?.name || inv.product_id,
          reservado: inv.reserved,
          en_transito: inv.in_transit,
          disponible: inv.available,
          total,
        }
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] }
    },
  }),

  defineTool({
    name: 'adjust_inventory',
    description: 'Make an inventory adjustment (add or subtract stock). Use positive numbers to add, negative to subtract.',
    schema: {
      product_id: z.string().describe('Product ID'),
      field: z.enum(['reserved', 'in_transit', 'available']).describe('Which stock type to adjust'),
      quantity: z.number().describe('Amount to adjust (positive = add, negative = subtract)'),
      adjustment_type: z.enum([
        'manual', 'order_created', 'order_shipped', 'order_delivered',
        'order_cancelled', 'sale', 'return', 'damage', 'count',
      ]).describe('Type of adjustment'),
      reason: z.string().optional().describe('Reason for the adjustment'),
      order_id: z.string().optional().describe('Related order ID'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const companyId = COMPANY_ID()

      const { data: existing } = await db.from('inventory')
        .select('id, reserved, in_transit, available')
        .eq('product_id', args.product_id)
        .eq('company_id', companyId)
        .single()

      if (!existing) {
        await db.from('inventory').insert({
          product_id: args.product_id,
          company_id: companyId,
          reserved: 0,
          in_transit: 0,
          available: 0,
        })
      }

      const current = existing ? (existing as any)[args.field] : 0
      const newValue = current + args.quantity

      if (newValue < 0) {
        return { content: [{ type: 'text' as const, text: `Error: no hay suficiente stock. ${args.field} actual: ${current}, ajuste: ${args.quantity}` }] }
      }

      const { error: updateError } = await db.from('inventory')
        .update({ [args.field]: newValue, updated_at: new Date().toISOString() })
        .eq('product_id', args.product_id)
        .eq('company_id', companyId)

      if (updateError) return { content: [{ type: 'text' as const, text: `Error: ${updateError.message}` }] }

      await db.from('inventory_adjustments').insert({
        product_id: args.product_id,
        company_id: companyId,
        adjustment_type: args.adjustment_type,
        field: args.field,
        quantity: args.quantity,
        reason: args.reason,
        order_id: args.order_id,
        created_by: process.env.USER_ID || '',
      })

      return { content: [{ type: 'text' as const, text: `Inventario ajustado: ${args.field} ${args.quantity > 0 ? '+' : ''}${args.quantity} (nuevo: ${newValue})` }] }
    },
  }),

  defineTool({
    name: 'get_inventory_history',
    description: 'Get the adjustment history for a product.',
    schema: {
      product_id: z.string().describe('Product ID'),
      limit: z.number().default(20).describe('Max records'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('inventory_adjustments')
        .select('*, products(name)')
        .eq('product_id', args.product_id)
        .order('created_at', { ascending: false })
        .limit(args.limit)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      if (!data || data.length === 0) return { content: [{ type: 'text' as const, text: 'Sin movimientos de inventario.' }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  }),
]

// ============================================================================
// Auto-adjust helper (not an MCP tool) — called by orders.ts when
// update_order_status transitions an order through the legacy status flow.
// ============================================================================

interface Adjustment {
  field: 'reserved' | 'in_transit' | 'available'
  quantity: number
  type: string
}

function getAdjustments(from: string, to: string, qty: number): Adjustment[] {
  if (['sourcing', 'draft'].includes(from) && to === 'po_sent') {
    return [{ field: 'reserved', quantity: qty, type: 'order_created' }]
  }

  if (['po_sent', 'production'].includes(from) && to === 'shipped') {
    return [
      { field: 'reserved', quantity: -qty, type: 'order_shipped' },
      { field: 'in_transit', quantity: qty, type: 'order_shipped' },
    ]
  }

  if (from === 'in_transit' && to === 'customs') return []

  if (['in_transit', 'customs'].includes(from) && to === 'delivered') {
    return [
      { field: 'in_transit', quantity: -qty, type: 'order_delivered' },
      { field: 'available', quantity: qty, type: 'order_delivered' },
    ]
  }

  if (to === 'cancelled') {
    if (['sourcing', 'draft', 'po_sent', 'production'].includes(from)) {
      return [{ field: 'reserved', quantity: -qty, type: 'order_cancelled' }]
    }
    if (['shipped', 'in_transit', 'customs'].includes(from)) {
      return [{ field: 'in_transit', quantity: -qty, type: 'order_cancelled' }]
    }
  }

  return []
}

export async function adjustInventoryForStatusChange(
  orderId: string,
  fromStatus: string,
  toStatus: string,
) {
  const db = getSupabase()
  const companyId = COMPANY_ID()

  const { data: items } = await db.from('order_items')
    .select('id, product_id, quantity')
    .eq('order_id', orderId)

  if (!items || items.length === 0) return

  for (const item of items) {
    const { data: inv } = await db.from('inventory')
      .select('id')
      .eq('product_id', item.product_id)
      .eq('company_id', companyId)
      .single()

    if (!inv) {
      await db.from('inventory').insert({
        product_id: item.product_id,
        company_id: companyId,
        reserved: 0, in_transit: 0, available: 0,
      })
    }

    const adjustments = getAdjustments(fromStatus, toStatus, item.quantity)

    for (const adj of adjustments) {
      const { data: current } = await db.from('inventory')
        .select(adj.field)
        .eq('product_id', item.product_id)
        .eq('company_id', companyId)
        .single()

      const currentVal = (current as any)?.[adj.field] || 0
      const newVal = Math.max(0, currentVal + adj.quantity)

      await db.from('inventory')
        .update({ [adj.field]: newVal, updated_at: new Date().toISOString() })
        .eq('product_id', item.product_id)
        .eq('company_id', companyId)

      await db.from('inventory_adjustments').insert({
        product_id: item.product_id,
        company_id: companyId,
        adjustment_type: adj.type,
        field: adj.field,
        quantity: adj.quantity,
        reason: `Pedido ${orderId}: ${fromStatus} → ${toStatus}`,
        order_id: orderId,
        created_by: process.env.USER_ID || '',
      })
    }
  }
}
