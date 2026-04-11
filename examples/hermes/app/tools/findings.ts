import { z } from 'zod'
import { defineTool, getSupabase, err, json } from '@proto/core-mcp'

const SOURCES = ['email', 'document', 'manual', 'agent_inference'] as const
const CATEGORIES = [
  'status_update', 'issue', 'payment', 'logistics',
  'document', 'contact', 'other',
] as const

export default [
  defineTool({
    name: 'record_finding',
    description: [
      'Registra un hallazgo del agente sobre un pedido. Llamalo cada vez que',
      'leas un correo, documento, o infieras algo relevante del estado de la',
      'carga. Si el finding viene de un correo, pasa gmail_message_id para',
      'trazabilidad y dedup (no se duplicara). Llamalo ANTES o junto con',
      'advance_step para dejar registro del porque avanzo la fase.',
    ].join(' '),
    schema: {
      order_id: z.string(),
      company_id: z.string(),
      source: z.enum(SOURCES),
      summary: z.string().describe('Una linea corta: "Carga llego a San Antonio"'),
      details: z.string().optional().describe('Texto libre con mas contexto'),
      category: z.enum(CATEGORIES).optional(),
      phase: z.string().optional().describe('Fase del pedido al momento del finding'),
      actor: z.string().optional().describe('Nombre del contacto que lo reporto'),
      gmail_message_id: z.string().optional(),
      mail_message_id: z.string().optional(),
      document_id: z.string().optional(),
      occurred_at: z.string().optional().describe('ISO timestamp del evento (no el de registro)'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const payload: any = { ...args }
      if (!payload.category) payload.category = 'status_update'
      if (payload.gmail_message_id) {
        const { data: existing } = await db
          .from('order_findings')
          .select('id')
          .eq('order_id', payload.order_id)
          .eq('gmail_message_id', payload.gmail_message_id)
          .maybeSingle()
        if (existing) return json({ deduped: true, id: existing.id })
      }
      const { data, error } = await db.from('order_findings').insert(payload).select().single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'list_findings',
    description: 'Lista findings registrados para un pedido, ordenados por occurred_at desc.',
    schema: {
      order_id: z.string(),
      category: z.enum(CATEGORIES).optional(),
      limit: z.number().optional(),
    },
    handler: async ({ order_id, category, limit = 50 }) => {
      const db = getSupabase()
      let q = db.from('order_findings').select('*').eq('order_id', order_id)
      if (category) q = q.eq('category', category)
      const { data, error } = await q.order('occurred_at', { ascending: false }).limit(limit)
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'delete_finding',
    description: 'Elimina un finding por id (solo si fue registrado por error).',
    schema: { id: z.string() },
    handler: async ({ id }) => {
      const db = getSupabase()
      const { error } = await db.from('order_findings').delete().eq('id', id)
      return error ? err(error.message) : json({ ok: true })
    },
  }),
]
