import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSupabase } from '@proto/core-mcp'

export function registerProductTools(server: McpServer) {
  server.tool(
    'create_product',
    'Create a product in the company catalog. Used during intake to register a new product before creating an order.',
    {
      company_id: z.string().describe('Company ID'),
      name: z.string().describe('Product name'),
      description: z.string().optional().describe('Detailed description'),
      category: z.string().optional().describe('Category (textil, electronica, etc)'),
      material: z.string().optional().describe('Material or composition'),
      dimensions: z.string().optional().describe('Dimensions or sizes'),
      weight: z.string().optional().describe('Unit weight'),
      colors: z.array(z.string()).optional().describe('Colors'),
      certifications: z.array(z.string()).optional().describe('Required certifications'),
      packaging: z.string().optional().describe('Individual packaging'),
      hs_code: z.string().optional().describe('HS tariff code'),
      origin_country: z.string().optional().describe('Preferred origin country'),
      reference_urls: z.array(z.string()).optional().describe('Reference links (Alibaba, Amazon, etc)'),
      reference_brand: z.string().optional().describe('Reference brand'),
      customization: z.string().optional().describe('Customization needs (logo, label, etc)'),
      regulations: z.string().optional().describe('Chilean regulations (SAG, ISP, SEC)'),
      image_urls: z.array(z.string()).optional().describe('Product image URLs'),
      notes: z.string().optional().describe('Additional notes'),
    },
    async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('products').insert({
        company_id: args.company_id,
        name: args.name,
        description: args.description,
        category: args.category,
        material: args.material,
        dimensions: args.dimensions,
        weight: args.weight,
        colors: args.colors,
        certifications: args.certifications,
        packaging: args.packaging,
        hs_code: args.hs_code,
        origin_country: args.origin_country,
        reference_urls: args.reference_urls,
        reference_brand: args.reference_brand,
        customization: args.customization,
        regulations: args.regulations,
        image_urls: args.image_urls,
        notes: args.notes,
      }).select().single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Producto creado: ${data.name} (ID: ${data.id})` }] }
    }
  )

  server.tool(
    'list_products',
    'List products in the company catalog.',
    {
      company_id: z.string().describe('Company ID'),
      active_only: z.boolean().default(true).describe('Only active products'),
      search: z.string().optional().describe('Search by name or description'),
    },
    async (args) => {
      const db = getSupabase()
      let query = db.from('products').select('*')
        .eq('company_id', args.company_id)
        .order('name')

      if (args.active_only) query = query.eq('active', true)
      if (args.search) query = query.or(`name.ilike.%${args.search}%,description.ilike.%${args.search}%`)

      const { data, error } = await query
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      if (!data || data.length === 0) return { content: [{ type: 'text' as const, text: 'No hay productos en el catalogo.' }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'get_product',
    'Get product details from the catalog.',
    { product_id: z.string().describe('Product ID') },
    async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('products').select('*').eq('id', args.product_id).single()
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'update_product',
    'Update a product in the catalog.',
    {
      product_id: z.string().describe('Product ID'),
      name: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      material: z.string().optional(),
      dimensions: z.string().optional(),
      weight: z.string().optional(),
      colors: z.array(z.string()).optional(),
      certifications: z.array(z.string()).optional(),
      packaging: z.string().optional(),
      hs_code: z.string().optional(),
      origin_country: z.string().optional(),
      reference_urls: z.array(z.string()).optional(),
      reference_brand: z.string().optional(),
      customization: z.string().optional(),
      regulations: z.string().optional(),
      image_urls: z.array(z.string()).optional(),
      notes: z.string().optional(),
      active: z.boolean().optional(),
    },
    async (args) => {
      const db = getSupabase()
      const { product_id, ...updates } = args
      const clean = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined))
      if (Object.keys(clean).length === 0) {
        return { content: [{ type: 'text' as const, text: 'No hay campos para actualizar.' }] }
      }
      const { error } = await db.from('products').update({ ...clean, updated_at: new Date().toISOString() }).eq('id', product_id)
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Producto ${product_id} actualizado.` }] }
    }
  )

  server.tool(
    'add_order_item',
    'Add a product (from catalog) to an order as a line item.',
    {
      order_id: z.string().describe('Order ID'),
      product_id: z.string().describe('Product ID from catalog'),
      supplier_id: z.string().describe('Supplier ID — obligatorio, debe existir en product_suppliers'),
      quantity: z.number().describe('Quantity'),
      unit_price: z.number().optional().describe('Unit price'),
      currency: z.string().default('USD').describe('Currency'),
      notes: z.string().optional().describe('Item notes'),
    },
    async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('order_items').insert({
        order_id: args.order_id,
        product_id: args.product_id,
        supplier_id: args.supplier_id,
        quantity: args.quantity,
        unit_price: args.unit_price,
        currency: args.currency,
        notes: args.notes,
      }).select('*, products(name)').single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Agregado: ${(data as any).products?.name} x${args.quantity} al pedido.` }] }
    }
  )

  server.tool(
    'list_order_items',
    'List line items for an order, with product details.',
    { order_id: z.string().describe('Order ID') },
    async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('order_items')
        .select('*, products(*)')
        .eq('order_id', args.order_id)
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'delete_order_item',
    'Remove an item from an order.',
    { item_id: z.string().describe('Order item ID') },
    async (args) => {
      const db = getSupabase()
      const { error } = await db.from('order_items').delete().eq('id', args.item_id)
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Item eliminado del pedido.` }] }
    }
  )
}
