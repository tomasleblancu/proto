import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSupabase } from '@proto/core-mcp'
import { COSTING_FIELDS, type CostingBreakdown, computeEstimated, computeActualFromPayments, mergeActual, type CostingDefault, type PaymentRow } from '@proto/core-shared'
import { detectTlcRequirement } from '../shared/index.js'
import { agent, agentErr } from '@proto/core-mcp'

const breakdownSchema = z.object(
  Object.fromEntries(COSTING_FIELDS.map(f => [f, z.number().optional()]))
).passthrough()

export function registerCostingTools(server: McpServer) {
  server.tool(
    'upsert_costing',
    'Crea o actualiza el costeo de un pedido. Por defecto es a nivel pedido (consolidado). Pasa item_id solo si necesitas costeo por item individual. Usa type "estimated" para el preliminar y "actual" para el real. Cada llamada hace merge.',
    {
      company_id: z.string(),
      order_id: z.string(),
      item_id: z.string().optional().describe('Omitir para costeo consolidado del pedido. Pasar solo para costeo por item individual.'),
      type: z.enum(['estimated', 'actual']),
      breakdown: breakdownSchema.describe('Campos del costeo: fob, freight, insurance, duties, iva, port, customs_agent, deconsolidation, documentation, storage, receiving, transport, samples, other, landed_total'),
      currency: z.string().default('USD'),
      fx_rate: z.number().optional().describe('Tipo de cambio USD→CLP al momento del costeo'),
      notes: z.string().optional(),
    },
    async (args) => {
      const db = getSupabase()
      const { company_id, order_id, item_id, type, breakdown, currency, fx_rate, notes } = args

      let query = db.from('costings').select('id, estimated, actual')
      if (item_id) {
        query = query.eq('item_id', item_id)
      } else {
        query = query.eq('order_id', order_id).is('item_id', null)
      }
      const { data: existing } = await query.maybeSingle()

      let data: any, error: any
      const isUpdate = !!existing

      if (existing) {
        const current = (existing[type] as CostingBreakdown) || {}
        const merged = { ...current, ...breakdown }
        const patch: Record<string, any> = { [type]: merged }
        if (currency) patch.currency = currency
        if (fx_rate !== undefined) patch.fx_rate = fx_rate
        if (notes !== undefined) patch.notes = notes
        ;({ data, error } = await db.from('costings').update(patch).eq('id', existing.id).select('id, order_id, item_id, estimated, actual, currency, fx_rate').single())
      } else {
        const row: Record<string, any> = { company_id, order_id, item_id, currency, [type]: breakdown }
        if (fx_rate !== undefined) row.fx_rate = fx_rate
        if (notes !== undefined) row.notes = notes
        ;({ data, error } = await db.from('costings').insert(row).select('id, order_id, item_id, estimated, actual, currency, fx_rate').single())
      }

      if (error) return agentErr(`No se pudo ${isUpdate ? 'actualizar' : 'crear'} costeo: ${error.message}`)

      const scope = item_id ? `item ${item_id}` : `pedido ${order_id} (consolidado)`
      return agent({
        summary: `Costeo ${type} ${isUpdate ? 'actualizado' : 'creado'} para ${scope}`,
        data: {
          id: data.id,
          order_id: data.order_id,
          item_id: data.item_id,
          [type]: data[type],
          currency: data.currency,
          fx_rate: data.fx_rate,
        },
        hint: type === 'actual'
          ? 'IVA no se suma a landed_total. Recalcula landed_total = suma de todos los campos actual SIN iva.'
          : undefined,
      })
    }
  )

  server.tool(
    'get_costing',
    'Obtiene el costeo de un pedido (consolidado) o de un item individual. Sin item_id devuelve el costeo consolidado del pedido.',
    {
      order_id: z.string().optional().describe('ID del pedido. Requerido si no se pasa item_id.'),
      item_id: z.string().optional().describe('ID del item. Si se omite, devuelve el costeo consolidado del pedido.'),
    },
    async ({ order_id, item_id }) => {
      const db = getSupabase()

      // Resolve order_id if only item_id given
      let resolvedOrderId = order_id
      if (item_id && !order_id) {
        const { data: it } = await db.from('order_items').select('order_id').eq('id', item_id).single()
        if (it) resolvedOrderId = it.order_id
      }

      if (!resolvedOrderId && !item_id) return agentErr('Debes pasar order_id o item_id')

      // Get persisted costing
      let costingQuery = db.from('costings').select('id, order_id, item_id, estimated, actual, currency, fx_rate')
      if (item_id) {
        costingQuery = costingQuery.eq('item_id', item_id)
      } else {
        costingQuery = costingQuery.eq('order_id', resolvedOrderId!).is('item_id', null)
      }
      const { data } = await costingQuery.maybeSingle()

      const persistedActual = (data?.actual || {}) as CostingBreakdown
      let estimated = (data?.estimated || {}) as CostingBreakdown

      // Compute actual from payments + merge with persisted overrides
      const { data: paymentsData } = await db
        .from('payments')
        .select('type, amount, currency, status')
        .eq('order_id', resolvedOrderId!)
      const payments = (paymentsData || []) as PaymentRow[]
      const fromPayments = computeActualFromPayments(payments, data?.currency || 'USD', data?.fx_rate ?? null)
      const actual = mergeActual(fromPayments, persistedActual)

      // If no persisted estimated, compute dynamically (same as widget)
      if (Object.keys(estimated).length === 0 && resolvedOrderId) {
        const [itemsRes, defaultsRes, orderRes, samplesRes] = await Promise.all([
          db.from('order_items').select('quantity, unit_price, cbm_unit').eq('order_id', resolvedOrderId),
          db.from('costing_defaults').select('key, value, unit, qty_type, minimum'),
          db.from('orders').select('country_origin').eq('id', resolvedOrderId).single(),
          db.from('samples').select('cost').eq('order_id', resolvedOrderId),
        ])

        const items = (itemsRes.data || []).map(i => ({
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price) || 0,
          cbm_unit: i.cbm_unit != null ? Number(i.cbm_unit) : null,
        }))
        const defaults = (defaultsRes.data || []) as CostingDefault[]
        const country = orderRes.data?.country_origin || 'CN'
        const hasTlc = detectTlcRequirement(country) !== 'none'
        const samplesCost = (samplesRes.data || []).reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0)

        estimated = computeEstimated(items, defaults, hasTlc, samplesCost)
      }

      // Compute delta
      const delta: CostingBreakdown = {}
      const allKeys = new Set([...Object.keys(estimated), ...Object.keys(actual)])
      for (const key of allKeys) {
        const k = key as keyof CostingBreakdown
        const est = estimated[k] ?? 0
        const act = actual[k] ?? 0
        if (est !== 0 || act !== 0) {
          delta[k] = Math.round((act - est) * 100) / 100
        }
      }

      const scope = item_id ? `item ${item_id}` : `pedido ${resolvedOrderId} (consolidado)`
      return agent({
        summary: `Costeo ${scope}: estimado landed ${estimated.landed_total ?? 'N/A'}, actual landed ${actual.landed_total ?? 'N/A'}`,
        data: {
          id: data?.id ?? null,
          order_id: resolvedOrderId,
          item_id: item_id ?? null,
          estimated,
          actual,
          delta,
          currency: data?.currency ?? 'USD',
          fx_rate: data?.fx_rate ?? null,
        },
      })
    }
  )

  server.tool(
    'list_costings',
    'Lista los costeos de todos los items de un pedido.',
    { order_id: z.string() },
    async ({ order_id }) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('costings')
        .select('id, item_id, estimated, actual, currency, order_item:item_id(description, sku)')
        .eq('order_id', order_id)

      if (error) return agentErr(`Error listando costeos: ${error.message}`)

      const costings = (data || []).map((c: any) => ({
        id: c.id,
        item_id: c.item_id,
        item_description: c.order_item?.description,
        item_sku: c.order_item?.sku,
        estimated_landed: c.estimated?.landed_total,
        actual_landed: c.actual?.landed_total,
        currency: c.currency,
      }))

      return agent({
        summary: `${costings.length} costeo(s) para pedido ${order_id}`,
        data: { costings },
      })
    }
  )

  server.tool(
    'get_costing_defaults',
    'Obtiene los valores de referencia para costeo preliminar (flete, arancel, IVA, puerto, agente, etc). Configurados en /admin. Usarlos como base para estimar landed cost.',
    {},
    async () => {
      const db = getSupabase()
      const { data, error } = await db
        .from('costing_defaults')
        .select('key, label, value, unit, category, notes')
        .order('category')
      if (error) return agentErr(`Error obteniendo defaults: ${error.message}`)
      return agent({
        summary: `${data.length} default(s) de costeo cargados`,
        data: { defaults: data },
      })
    }
  )
}
