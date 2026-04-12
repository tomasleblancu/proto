import { z } from 'zod'
import { defineTool, getSupabase, err, json } from '@tleblancureta/proto/mcp'

const ROLES = ['forwarder', 'customs_agent', 'supplier', 'other'] as const

export default [
  defineTool({
    name: 'list_contacts',
    description: 'Lista contactos de la empresa por rol (forwarder, customs_agent, supplier, other). Si se pasa order_id, mezcla defaults de empresa + overrides de esa orden. Devuelve todos los emails del rol para armar filtros de Gmail.',
    schema: {
      role: z.enum(ROLES).optional(),
      order_id: z.string().optional(),
    },
    handler: async ({ role, order_id }, ctx) => {
      const company_id = ctx.company_id!
      const db = getSupabase()
      let q = db.from('contacts').select('*').eq('company_id', company_id)
      if (role) q = q.eq('role', role)
      if (order_id) {
        q = q.or(`order_id.is.null,order_id.eq.${order_id}`)
      } else {
        q = q.is('order_id', null)
      }
      const { data, error } = await q.order('role').order('name')
      if (error) return err(error.message)
      const emails = (data || []).map(c => c.email).filter(Boolean)
      return json({ contacts: data, emails })
    },
  }),

  defineTool({
    name: 'upsert_contact',
    description: 'Crea o actualiza un contacto. Pasa id para actualizar, omitelo para crear. Un rol puede tener multiples contactos (varias personas del mismo forwarder, etc.).',
    schema: {
      id: z.string().optional(),
      order_id: z.string().nullable().optional(),
      role: z.enum(ROLES),
      name: z.string(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      organization: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    },
    handler: async ({ id, ...rest }, ctx) => {
      const company_id = ctx.company_id!
      const db = getSupabase()
      if (id) {
        const { data, error } = await db
          .from('contacts')
          .update({ ...rest, company_id, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()
        return error ? err(error.message) : json(data)
      }
      const { data, error } = await db.from('contacts').insert({ ...rest, company_id }).select().single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'delete_contact',
    description: 'Elimina un contacto por id.',
    schema: { id: z.string() },
    handler: async ({ id }) => {
      const db = getSupabase()
      const { error } = await db.from('contacts').delete().eq('id', id)
      return error ? err(error.message) : json({ ok: true })
    },
  }),
]
