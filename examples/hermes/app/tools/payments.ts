import { z } from 'zod'
import { defineTool, getSupabase, agent, agentErr } from 'proto/mcp'
import { PAYMENT_TYPES, PAYMENT_STATUSES, DEFAULT_PAYEE, type PaymentType } from '../shared/index.js'

const COSTING_MAP: Record<string, string> = {
  deposit: 'fob',
  balance: 'fob',
  freight: 'freight',
  insurance: 'insurance',
  customs_provision: 'port + deconsolidation + customs_agent + duties + iva (distribuir segun estimado)',
  transport: 'transport',
}

export default [
  defineTool({
    name: 'record_payment',
    description: 'Registra un pago vinculado a un pedido. Opcionalmente lo enlaza a un documento que lo justifica.',
    schema: {
      company_id: z.string(),
      order_id: z.string(),
      type: z.enum(PAYMENT_TYPES),
      amount: z.number(),
      currency: z.string().default('USD'),
      payee: z.enum(['supplier', 'forwarder', 'customs', 'port', 'other']).optional(),
      due_date: z.string().optional(),
      paid_at: z.string().optional(),
      status: z.enum(PAYMENT_STATUSES).default('pending'),
      reference: z.string().optional(),
      linked_document_id: z.string().optional(),
      notes: z.string().optional(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const payee = args.payee ?? DEFAULT_PAYEE[args.type as PaymentType]
      const { data, error } = await db.from('payments').insert({ ...args, payee }).select().single()
      if (error) return agentErr(`No se pudo registrar pago: ${error.message}`)

      const costingField = COSTING_MAP[args.type] || 'other'
      return agent({
        summary: `Pago registrado: ${args.type} ${args.amount} ${args.currency} (${payee})`,
        data: {
          id: data.id,
          order_id: data.order_id,
          type: data.type,
          amount: data.amount,
          currency: data.currency,
          payee: data.payee,
          status: data.status,
          linked_document_id: data.linked_document_id,
        },
        hint: `Actualiza costeo actual con upsert_costing: ${args.type} → actual.${costingField}. `
            + (args.currency !== 'USD' ? `Convierte ${args.currency} a USD usando fx_rate antes de guardar en el costeo.` : ''),
      })
    },
  }),

  defineTool({
    name: 'update_payment',
    description: 'Actualiza un pago existente (monto, moneda, estado, tipo, etc).',
    schema: {
      payment_id: z.string(),
      type: z.enum(PAYMENT_TYPES).optional(),
      amount: z.number().optional(),
      currency: z.string().optional(),
      status: z.enum(PAYMENT_STATUSES).optional(),
      payee: z.enum(['supplier', 'forwarder', 'customs', 'port', 'other']).optional(),
      paid_at: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    },
    handler: async ({ payment_id, ...patch }) => {
      const db = getSupabase()
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      if (Object.keys(clean).length === 0) return agentErr('Nada que actualizar')
      const { data, error } = await db.from('payments').update(clean).eq('id', payment_id).select().single()
      if (error) return agentErr(`No se pudo actualizar pago: ${error.message}`)

      return agent({
        summary: `Pago ${payment_id} actualizado: ${Object.keys(clean).join(', ')}`,
        data: {
          id: data.id,
          type: data.type,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          payee: data.payee,
        },
      })
    },
  }),

  defineTool({
    name: 'delete_payment',
    description: 'Elimina un pago registrado por error.',
    schema: { payment_id: z.string() },
    handler: async ({ payment_id }) => {
      const db = getSupabase()
      const { error } = await db.from('payments').delete().eq('id', payment_id)
      if (error) return agentErr(`No se pudo eliminar pago: ${error.message}`)
      return agent({
        summary: `Pago ${payment_id} eliminado.`,
        data: { deleted_id: payment_id },
      })
    },
  }),

  defineTool({
    name: 'list_payments',
    description: 'Lista pagos de un pedido.',
    schema: { order_id: z.string() },
    handler: async ({ order_id }) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('payments')
        .select('id, type, amount, currency, payee, status, linked_document_id')
        .eq('order_id', order_id)
        .order('created_at')
      if (error) return agentErr(`No se pudieron listar pagos: ${error.message}`)

      const paid = data.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0)
      const pending = data.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0)

      return agent({
        summary: `${data.length} pago(s) para pedido ${order_id} — pagado: ${paid}, pendiente: ${pending}`,
        data: { payments: data, total_paid: paid, total_pending: pending },
      })
    },
  }),
]
