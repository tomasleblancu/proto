import { z } from 'zod'
import { defineTool, getSupabase, ok, err, json } from '@proto/core-mcp'

export default [
  defineTool({
    name: 'create_supplier',
    description: 'Crea un proveedor para una empresa. Requerido antes de crear muestras.',
    schema: {
      company_id: z.string(),
      name: z.string(),
      country_code: z.string().optional(),
      contact_name: z.string().optional(),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
      website: z.string().optional(),
      notes: z.string().optional(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('suppliers').insert(args).select().single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'link_product_supplier',
    description: 'Vincula un proveedor a un producto (multi-proveedor). Permite registrar precio, MOQ y lead time.',
    schema: {
      product_id: z.string(),
      supplier_id: z.string(),
      company_id: z.string(),
      unit_price: z.number().optional().describe('Precio unitario del proveedor'),
      currency: z.string().default('USD'),
      moq: z.number().optional().describe('Minimum order quantity'),
      lead_time_days: z.number().optional().describe('Lead time en dias'),
      is_preferred: z.boolean().default(false).describe('Marcar como proveedor preferido'),
      notes: z.string().optional(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('product_suppliers').insert(args).select('*, suppliers(name)').single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'unlink_product_supplier',
    description: 'Desvincula un proveedor de un producto.',
    schema: {
      product_id: z.string(),
      supplier_id: z.string(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { error } = await db.from('product_suppliers')
        .delete()
        .eq('product_id', args.product_id)
        .eq('supplier_id', args.supplier_id)
      return error ? err(error.message) : ok('Proveedor desvinculado del producto.')
    },
  }),

  defineTool({
    name: 'list_product_suppliers',
    description: 'Lista los proveedores vinculados a un producto, con precio, MOQ y lead time.',
    schema: {
      product_id: z.string(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('product_suppliers')
        .select('*, suppliers(id, name, country_code, contact_email, website)')
        .eq('product_id', args.product_id)
        .order('is_preferred', { ascending: false })
        .order('created_at')
      return error ? err(error.message) : json(data)
    },
  }),
]
