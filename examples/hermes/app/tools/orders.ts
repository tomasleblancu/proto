import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSupabase } from '@proto/core-mcp'
import { isValidTransition, type OrderStatus } from '@proto/core-shared'
import { adjustInventoryForStatusChange } from './inventory.js'

export function registerOrderTools(server: McpServer) {
  server.tool(
    'create_order',
    'Create a new import order. Initial status: draft.',
    {
      company_id: z.string().describe('Company ID'),
      supplier_name: z.string().describe('Supplier name'),
      supplier_contact: z.string().optional().describe('Supplier contact info'),
      products: z.array(z.object({
        name: z.string(),
        hs_code: z.string().optional(),
        quantity: z.number(),
        unit_price: z.number(),
        currency: z.string().default('USD'),
      })).describe('Products list'),
      po_number: z.string().optional().describe('Purchase order number'),
      total_amount: z.number().optional().describe('Total order amount'),
      currency: z.string().default('USD').describe('Order currency'),
      incoterm: z.string().optional().describe('Incoterm (FOB, CIF, etc)'),
      payment_terms: z.string().optional().describe('Payment terms'),
      estimated_arrival: z.string().optional().describe('Estimated arrival date (YYYY-MM-DD)'),
    },
    async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('orders').insert({
        company_id: args.company_id,
        supplier_name: args.supplier_name,
        supplier_contact: args.supplier_contact,
        products: args.products,
        status: 'draft',
        po_number: args.po_number,
        total_amount: args.total_amount,
        currency: args.currency,
        incoterm: args.incoterm,
        payment_terms: args.payment_terms,
        estimated_arrival: args.estimated_arrival,
      }).select().single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }

      // Log creation event
      await db.from('order_events').insert({
        order_id: data.id,
        event_type: 'created',
        description: `Order created for ${args.supplier_name}`,
        metadata: { po_number: args.po_number },
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'update_order_status',
    'Update an order\'s status. Enforces valid state transitions.',
    {
      order_id: z.string().describe('Order ID'),
      new_status: z.string().describe('New status'),
      description: z.string().optional().describe('Reason for status change'),
    },
    async (args) => {
      const db = getSupabase()

      // Get current order
      const { data: order, error: fetchError } = await db
        .from('orders')
        .select('id, status')
        .eq('id', args.order_id)
        .single()

      if (fetchError || !order) {
        return { content: [{ type: 'text' as const, text: `Error: Order not found` }] }
      }

      const from = order.status as OrderStatus
      const to = args.new_status as OrderStatus

      if (!isValidTransition(from, to)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Invalid transition: ${from} → ${to}. Valid transitions from ${from}: ${
              (await import('@proto/core-shared')).VALID_TRANSITIONS[from].join(', ') || 'none'
            }`,
          }],
        }
      }

      const { error: updateError } = await db
        .from('orders')
        .update({ status: to, updated_at: new Date().toISOString() })
        .eq('id', args.order_id)

      if (updateError) {
        return { content: [{ type: 'text' as const, text: `Error: ${updateError.message}` }] }
      }

      // Log status change event
      await db.from('order_events').insert({
        order_id: args.order_id,
        event_type: 'status_change',
        description: args.description || `Status changed: ${from} → ${to}`,
        metadata: { from, to },
      })

      // Auto-adjust inventory
      try {
        await adjustInventoryForStatusChange(args.order_id, from, to)
      } catch (e) {
        // Don't fail the status update if inventory adjustment fails
      }

      return { content: [{ type: 'text' as const, text: `Order ${args.order_id} updated: ${from} → ${to}` }] }
    }
  )

  server.tool(
    'update_order',
    'Actualiza campos editables de un pedido (supplier, incoterm, terminos, totales, ETA, etc). IMPORTANTE: para linkear un proveedor, PASA supplier_id (FK a suppliers), NO solo supplier_name. Si pasas supplier_id, auto-sincroniza supplier_name/contact. Si pasas solo supplier_name sin id (y no hay un supplier con ese nombre), la tool lo rechaza — crealo con create_supplier primero. Registra un order_event con los cambios.',
    {
      order_id: z.string().describe('Order ID'),
      supplier_id: z.string().optional().describe('FK a suppliers. PREFERIDO para linkear proveedor. Si se pasa, sobreescribe supplier_name/contact desde la tabla suppliers.'),
      supplier_name: z.string().optional().describe('Texto libre. Usa SOLO para renombrar un supplier ya linkeado (con supplier_id). No uses este campo para linkear — crea el supplier con create_supplier y pasa supplier_id.'),
      supplier_contact: z.string().optional().describe('Contacto del proveedor'),
      po_number: z.string().optional(),
      total_amount: z.number().optional(),
      currency: z.string().optional(),
      incoterm: z.string().optional().describe('EXW, FOB, CIF, DDP, etc'),
      payment_terms: z.string().optional(),
      estimated_arrival: z.string().optional().describe('YYYY-MM-DD'),
      country_origin: z.string().optional().describe('ISO alpha-2'),
      description: z.string().optional().describe('Descripcion para el order_event'),
    },
    async (args) => {
      const db = getSupabase()
      const { order_id, description, supplier_id, ...rest } = args
      const updates: Record<string, any> = Object.fromEntries(
        Object.entries(rest).filter(([_, v]) => v !== undefined)
      )

      // Si se pasa supplier_id, resolver nombre/contacto desde suppliers
      if (supplier_id) {
        const { data: sup, error: supErr } = await db
          .from('suppliers')
          .select('id, name, contact_name, contact_email, contact_phone')
          .eq('id', supplier_id)
          .single()
        if (supErr || !sup) {
          return { content: [{ type: 'text' as const, text: `Error: supplier ${supplier_id} no encontrado` }] }
        }
        updates.supplier_id = supplier_id
        if (updates.supplier_name === undefined) updates.supplier_name = sup.name
        if (updates.supplier_contact === undefined) {
          const contact = [sup.contact_name, sup.contact_email, sup.contact_phone].filter(Boolean).join(' | ')
          if (contact) updates.supplier_contact = contact
        }
      } else if (updates.supplier_name) {
        // Se pasó supplier_name sin supplier_id. Validar que el order ya tenga
        // supplier_id linkeado — si no, forzar al agente a crear el supplier.
        const { data: existing } = await db
          .from('orders')
          .select('supplier_id')
          .eq('id', order_id)
          .single()
        if (!existing?.supplier_id) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: update_order recibio supplier_name="${updates.supplier_name}" pero el pedido no tiene supplier_id linkeado. Para linkear un proveedor debes: 1) llamar create_supplier(name, country_code, ...) 2) tomar el id devuelto 3) llamar update_order(order_id, supplier_id=<id>). Nunca linkees solo con texto libre — la UI del cockpit usa orders.supplier_id como fuente de verdad.`,
            }],
          }
        }
      }

      // Mapear incoterm texto -> incoterm_typed tipado cuando aplique
      if (updates.incoterm && ['EXW', 'FOB', 'CIF', 'DDP'].includes(updates.incoterm)) {
        updates.incoterm_typed = updates.incoterm
      }

      if (Object.keys(updates).length === 0) {
        return { content: [{ type: 'text' as const, text: 'Nada que actualizar.' }] }
      }

      updates.updated_at = new Date().toISOString()

      const { data, error } = await db
        .from('orders')
        .update(updates)
        .eq('id', order_id)
        .select()
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }

      const changedKeys = Object.keys(updates).filter(k => k !== 'updated_at')
      await db.from('order_events').insert({
        order_id,
        event_type: 'updated',
        description: description || `Order updated: ${changedKeys.join(', ')}`,
        metadata: { changes: Object.fromEntries(changedKeys.map(k => [k, updates[k]])) },
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'get_order',
    'Get order details and current status.',
    { order_id: z.string().describe('Order ID') },
    async (args) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('orders')
        .select('*, forwarders(*), customs_agents(*)')
        .eq('id', args.order_id)
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'list_orders',
    'List orders, optionally filtered by status or company.',
    {
      company_id: z.string().optional().describe('Filter by company'),
      status: z.string().optional().describe('Filter by status'),
      limit: z.number().default(20).describe('Max results'),
      offset: z.number().default(0).describe('Offset for pagination'),
    },
    async (args) => {
      const db = getSupabase()
      let query = db.from('orders').select('*').order('created_at', { ascending: false })

      if (args.company_id) query = query.eq('company_id', args.company_id)
      if (args.status) query = query.eq('status', args.status)
      query = query.range(args.offset, args.offset + args.limit - 1)

      const { data, error } = await query
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'delete_order',
    'Elimina un pedido en cascada (pagos, muestras, items, eventos, documentos). SOLO permitido cuando el pedido esta en estado "draft" (borrador). Cualquier otro estado es bloqueado para proteger pedidos con historial real.',
    {
      order_id: z.string().describe('Order ID'),
    },
    async (args) => {
      const db = getSupabase()

      const { data: order, error: fetchError } = await db
        .from('orders')
        .select('id, status')
        .eq('id', args.order_id)
        .single()

      if (fetchError || !order) {
        return { content: [{ type: 'text' as const, text: 'Error: Pedido no encontrado' }] }
      }

      if (order.status !== 'draft') {
        return { content: [{ type: 'text' as const, text: `No se puede eliminar: el pedido esta en estado "${order.status}". Solo se pueden eliminar borradores (draft). Para descartar un pedido en otro estado, cambialo a "cancelled".` }] }
      }

      // Cascade delete in dependency order (deepest first)
      // phase_transitions references order_items, so clean it before items
      const { data: items } = await db.from('order_items').select('id').eq('order_id', args.order_id)
      const itemIds = (items || []).map(i => i.id)
      if (itemIds.length > 0) {
        await db.from('phase_transitions').delete().in('item_id', itemIds)
        await db.from('samples').delete().in('linked_item_id', itemIds)
        await db.from('documents').delete().in('item_id', itemIds)
      }
      await db.from('payments').delete().eq('order_id', args.order_id)
      await db.from('samples').delete().eq('order_id', args.order_id)
      await db.from('order_events').delete().eq('order_id', args.order_id)
      await db.from('documents').delete().eq('order_id', args.order_id)
      await db.from('order_items').delete().eq('order_id', args.order_id)
      const { error } = await db.from('orders').delete().eq('id', args.order_id)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Pedido ${args.order_id} eliminado (con pagos, muestras, items, eventos y documentos asociados).` }] }
    }
  )

  server.tool(
    'get_order_timeline',
    'Get the full event history for an order.',
    { order_id: z.string().describe('Order ID') },
    async (args) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('order_events')
        .select('*')
        .eq('order_id', args.order_id)
        .order('created_at', { ascending: true })

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )
}
