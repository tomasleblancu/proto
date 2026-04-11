import { z } from 'zod'
import { defineTool, getSupabase, err, json } from '@proto/core-mcp'

const ROLES = ['forwarder', 'customs_agent', 'supplier', 'other'] as const

export default [
  defineTool({
    name: 'list_contacts',
    description: 'Lista contactos de la empresa por rol (forwarder, customs_agent, supplier, other). Si se pasa order_id, mezcla defaults de empresa + overrides de esa orden. Devuelve todos los emails del rol para armar filtros de Gmail.',
    schema: {
      company_id: z.string(),
      role: z.enum(ROLES).optional(),
      order_id: z.string().optional(),
    },
    handler: async ({ company_id, role, order_id }) => {
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
      company_id: z.string(),
      order_id: z.string().nullable().optional(),
      role: z.enum(ROLES),
      name: z.string(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      organization: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    },
    handler: async ({ id, ...rest }) => {
      const db = getSupabase()
      if (id) {
        const { data, error } = await db
          .from('contacts')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()
        return error ? err(error.message) : json(data)
      }
      const { data, error } = await db.from('contacts').insert(rest).select().single()
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
