import { z } from 'zod'
import { defineTool, getSupabase, err, json } from '@tleblancureta/proto/mcp'
import { SAMPLE_STATUSES, isValidSampleTransition, type SampleStatus } from '../shared/index.js'

export default [
  defineTool({
    name: 'create_sample',
    description: 'Crea una muestra. El supplier debe existir en DB primero.',
    schema: {
      supplier_id: z.string(),
      description: z.string(),
      sku_candidate: z.string().optional(),
      qty: z.number().default(1),
      cost: z.number().optional(),
      currency: z.string().default('USD'),
      shipping_method: z.enum(['courier', 'with_main_shipment', 'hand_carry']).optional(),
      order_id: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const company_id = ctx.company_id!
      const db = getSupabase()
      const { data: supplier } = await db.from('suppliers').select('id').eq('id', args.supplier_id).single()
      if (!supplier) return err('Supplier no existe — creá el supplier antes de la muestra')
      const { data, error } = await db.from('samples').insert({ ...args, company_id, status: 'requested' }).select().single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'update_sample_status',
    description: 'Cambia el status de una muestra validando la transicion.',
    schema: {
      sample_id: z.string(),
      to_status: z.enum(SAMPLE_STATUSES),
    },
    handler: async ({ sample_id, to_status }) => {
      const db = getSupabase()
      const { data: s } = await db.from('samples').select('status').eq('id', sample_id).single()
      if (!s) return err('Muestra no encontrada')
      if (!isValidSampleTransition(s.status as SampleStatus, to_status)) {
        return err(`Transicion invalida ${s.status} -> ${to_status}`)
      }
      const patch: Record<string, unknown> = { status: to_status, updated_at: new Date().toISOString() }
      if (to_status === 'received') patch.received_at = new Date().toISOString()
      const { data, error } = await db.from('samples').update(patch).eq('id', sample_id).select().single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'evaluate_sample',
    description: 'Registra el resultado de evaluacion de una muestra.',
    schema: {
      sample_id: z.string(),
      result: z.enum(['approved', 'rejected', 'needs_revision']),
      notes: z.string().optional(),
      evaluated_by: z.string().optional(),
    },
    handler: async ({ sample_id, result, notes, evaluated_by }) => {
      const db = getSupabase()
      const { data, error } = await db.from('samples').update({
        status: result,
        evaluation_result: result,
        evaluation_notes: notes,
        evaluated_by,
        evaluated_at: new Date().toISOString(),
      }).eq('id', sample_id).select().single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'list_samples',
    description: 'Lista muestras con filtros opcionales.',
    schema: {
      status: z.enum(SAMPLE_STATUSES).optional(),
      supplier_id: z.string().optional(),
    },
    handler: async ({ status, supplier_id }, ctx) => {
      const company_id = ctx.company_id!
      const db = getSupabase()
      let q = db.from('samples').select('*').eq('company_id', company_id)
      if (status) q = q.eq('status', status)
      if (supplier_id) q = q.eq('supplier_id', supplier_id)
      const { data, error } = await q.order('created_at', { ascending: false })
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'promote_sample_to_item',
    description: 'Convierte una muestra aprobada en un order_item dentro de un pedido. Si pasas source_item_id, ese item original (de sourcing) se cancela automaticamente y queda linkeado al nuevo via metadata.replaced_by.',
    schema: {
      sample_id: z.string(),
      order_id: z.string(),
      source_item_id: z.string().optional().describe('item original de sourcing que se reemplaza'),
    },
    handler: async ({ sample_id, order_id, source_item_id }) => {
      const db = getSupabase()
      const { data: s } = await db.from('samples').select('*').eq('id', sample_id).single()
      if (!s) return err('Muestra no encontrada')
      if (s.status !== 'approved') return err('Solo se promueven muestras aprobadas')

      const { data: item, error } = await db.from('order_items').insert({
        order_id,
        company_id: s.company_id,
        sku: s.sku_candidate,
        description: s.description,
        quantity: s.qty,
        unit_price: s.cost,
        currency: s.currency,
        current_phase: 'negotiation',
        current_step: 'request_quote',
        metadata: {
          promoted_from_sample: sample_id,
          ...(source_item_id ? { promoted_from_item: source_item_id } : {}),
        },
      }).select().single()
      if (error) return err(error.message)

      await db.from('samples').update({ linked_item_id: item.id, order_id }).eq('id', sample_id)

      if (source_item_id) {
        await db.from('order_items').update({
          cancelled: true,
          metadata: { replaced_by: item.id, replaced_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }).eq('id', source_item_id)
      }

      return json(item)
    },
  }),
]
