import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSupabase } from '../supabase.js'
import { PHASES, type Phase } from '@hermes/shared'
import { err, isValidStep, json } from './_helpers.js'

export function registerItemTools(server: McpServer) {
  server.tool(
    'create_order_item',
    'Crea un item dentro de un pedido. Inicia en sourcing.identify_need salvo que se especifique otra fase/step. IMPORTANTE: si el item corresponde a un producto del catalogo, pasa product_id — sin eso la UI del cockpit de producto no listara este pedido.',
    {
      order_id: z.string(),
      company_id: z.string(),
      description: z.string(),
      product_id: z.string().optional().describe('FK a products. REQUERIDO si el item viene del catalogo de productos'),
      supplier_id: z.string().describe('FK a suppliers. OBLIGATORIO — todo item debe tener proveedor asignado.'),
      quantity: z.number().int().default(1),
      sku: z.string().optional(),
      unit_price: z.number().optional(),
      currency: z.string().default('USD'),
      cbm_unit: z.number().optional().describe('Volumen por unidad en m3. Critico para costeo de flete/puerto.'),
      weight_unit_kg: z.number().optional().describe('Peso por unidad en kg.'),
      target_unit_price: z.number().optional().describe('Precio de venta target por unidad (en target_currency). Para calcular margen.'),
      target_currency: z.string().optional().describe('Moneda del precio target. Default CLP.'),
      current_phase: z.enum(PHASES).default('sourcing'),
      current_step: z.string().default('identify_need'),
    },
    async (args) => {
      if (!isValidStep(args.current_phase as Phase, args.current_step)) {
        return err(`Step invalido para fase ${args.current_phase}`)
      }
      const db = getSupabase()
      const { data, error } = await db.from('order_items').insert(args).select().single()
      return error ? err(error.message) : json(data)
    }
  )

  server.tool(
    'update_order_item',
    'Actualiza campos de un item existente: cantidad, precio, CBM unitario, peso, descripcion, SKU, supplier.',
    {
      item_id: z.string(),
      description: z.string().optional(),
      sku: z.string().optional(),
      quantity: z.number().int().optional(),
      unit_price: z.number().optional(),
      currency: z.string().optional(),
      supplier_id: z.string().optional(),
      cbm_unit: z.number().optional().describe('Volumen por unidad en m3. Critico para costeo.'),
      weight_unit_kg: z.number().optional().describe('Peso por unidad en kg.'),
      target_unit_price: z.number().optional().describe('Precio de venta target por unidad (en target_currency). Para calcular margen.'),
      target_currency: z.string().optional().describe('Moneda del precio target. Default CLP.'),
    },
    async (args) => {
      const { item_id, ...patch } = args
      // Remove undefined values
      const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      if (Object.keys(cleanPatch).length === 0) return err('Nada que actualizar')
      const db = getSupabase()
      const { data, error } = await db.from('order_items').update(cleanPatch).eq('id', item_id).select().single()
      return error ? err(error.message) : json(data)
    }
  )
}
