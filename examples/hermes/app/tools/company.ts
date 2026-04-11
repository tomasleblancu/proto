import { z } from 'zod'
import { defineTool, getSupabase } from '@proto/core-mcp'

const COMPANY_ID = () => process.env.COMPANY_ID || ''

async function resolveUserId(): Promise<string> {
  const raw = process.env.USER_ID || ''
  if (/^[0-9a-f]{8}-/.test(raw)) return raw
  if (raw.includes('@')) {
    const db = getSupabase()
    const { data } = await db.auth.admin.listUsers()
    const user = data?.users?.find(u => u.email === raw)
    if (user) return user.id
  }
  return raw
}

// COMPANY_ID is consumed in other tools; keep exported for them.
void COMPANY_ID

export default [
  defineTool({
    name: 'get_profile',
    description: 'Get the current user\'s profile and company info.',
    schema: {},
    handler: async () => {
      const db = getSupabase()
      const userId = await resolveUserId()
      if (!userId) return { content: [{ type: 'text' as const, text: 'Error: no se pudo identificar al usuario' }] }

      const [profileRes, companiesRes] = await Promise.all([
        db.from('profiles').select('*').eq('id', userId).single(),
        db.from('companies').select('*').eq('owner_id', userId),
      ])

      const profile = profileRes.data
      const companies = companiesRes.data || []

      const missing: string[] = []
      if (!profile?.full_name) missing.push('nombre')
      if (!profile?.role_title) missing.push('cargo')
      if (!profile?.phone) missing.push('telefono')
      if (companies.length === 0) missing.push('empresa')
      else if (!companies[0].rut) missing.push('RUT empresa')

      return { content: [{ type: 'text' as const, text: JSON.stringify({
        profile: profile || { status: 'no creado' },
        companies,
        completitud: missing.length === 0 ? '100%' : `Faltan: ${missing.join(', ')}`,
      }, null, 2) }] }
    },
  }),

  defineTool({
    name: 'update_profile',
    description: 'Update the current user\'s profile (name, role/title, phone). User ID is resolved automatically from the session.',
    schema: {
      full_name: z.string().optional().describe('Full name'),
      role_title: z.string().optional().describe('Role or job title'),
      phone: z.string().optional().describe('Phone number'),
      onboarding_completed: z.boolean().optional().describe('Mark onboarding as completed'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const userId = await resolveUserId()
      if (!userId) return { content: [{ type: 'text' as const, text: 'Error: no se pudo identificar al usuario' }] }

      const patch: Record<string, any> = {
        id: userId,
        updated_at: new Date().toISOString(),
      }
      if (args.full_name !== undefined) patch.full_name = args.full_name
      if (args.role_title !== undefined) patch.role_title = args.role_title
      if (args.phone !== undefined) patch.phone = args.phone
      if (args.onboarding_completed !== undefined) {
        patch.onboarding_completed = args.onboarding_completed
        if (args.onboarding_completed) patch.onboarding_completed_at = new Date().toISOString()
      }

      const { error } = await db.from('profiles').upsert(patch)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Perfil actualizado: ${args.full_name || ''} (${args.role_title || ''})` }] }
    },
  }),

  defineTool({
    name: 'create_company',
    description: 'Create a new company. The owner is automatically set to the current user.',
    schema: {
      name: z.string().describe('Company name'),
      rut: z.string().optional().describe('Chilean RUT (e.g. 76.123.456-7)'),
      contact_email: z.string().optional().describe('Contact email'),
      contact_phone: z.string().optional().describe('Contact phone'),
      industry: z.string().optional().describe('Industry / rubro'),
      size: z.string().optional().describe('Company size (1-10, 11-50, 51-200, 200+)'),
      website: z.string().optional().describe('Website URL'),
      address: z.string().optional().describe('Street address'),
      country: z.string().optional().describe('Country code (CL, PE, AR, ...)'),
      import_experience: z.string().optional().describe('Import experience: nuevo | ocasional | frecuente'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const userId = await resolveUserId()
      if (!userId) return { content: [{ type: 'text' as const, text: 'Error: no se pudo identificar al usuario' }] }

      const { data, error } = await db.from('companies').insert({
        name: args.name,
        rut: args.rut,
        contact_email: args.contact_email,
        contact_phone: args.contact_phone,
        industry: args.industry,
        size: args.size,
        website: args.website,
        address: args.address,
        country: args.country,
        import_experience: args.import_experience,
        owner_id: userId,
      }).select().single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Empresa creada: ${data.name} (ID: ${data.id})` }] }
    },
  }),

  defineTool({
    name: 'list_companies',
    description: 'List companies owned by the current user.',
    schema: {},
    handler: async () => {
      const db = getSupabase()
      const userId = await resolveUserId()
      let query = db.from('companies').select('*').order('created_at', { ascending: false })
      if (userId) query = query.eq('owner_id', userId)

      const { data, error } = await query
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      if (!data || data.length === 0) return { content: [{ type: 'text' as const, text: 'No hay empresas registradas.' }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  }),

  defineTool({
    name: 'add_company_user',
    description: 'Add a user (client) to a company.',
    schema: {
      company_id: z.string().describe('Company ID'),
      user_email: z.string().describe('Email of the user to add'),
      role: z.enum(['admin', 'client']).default('client').describe('Role in the company'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data: users } = await db.auth.admin.listUsers()
      const user = users?.users?.find(u => u.email === args.user_email)

      if (!user) {
        return { content: [{ type: 'text' as const, text: `Usuario con email ${args.user_email} no encontrado.` }] }
      }

      const { error } = await db.from('company_users').insert({
        company_id: args.company_id,
        user_id: user.id,
        role: args.role,
      })

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Usuario ${args.user_email} agregado como ${args.role}.` }] }
    },
  }),
]
