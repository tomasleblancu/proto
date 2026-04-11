/**
 * Order entity — the core unit of work in Hermes. Activating an order opens
 * the cockpit (order-header, supplier, items, costing, docs, contacts,
 * findings, timeline) and injects a fresh markdown snapshot on every chat
 * turn so the agent doesn't need to burn tool calls on basic reads.
 */
import { defineEntity } from '@proto/core-shared'
import { PHASE_LABELS, PHASE_STEPS, type Phase } from '../shared/index.js'

interface SupabaseLike {
  from: (table: string) => any
}

export default defineEntity({
  name: 'order',
  displayName: 'pedido',
  table: 'orders',
  labelField: 'supplier_name',

  activateDescription: `Activa un pedido como foco del agente. DEBE llamarse siempre que empieces a trabajar sobre un pedido especifico, y cada vez que cambies de pedido.

Efectos:
- El frontend entra en "cockpit mode": reemplaza los widgets generales por una ficha viva del pedido (producto, proveedor, costeo, timeline) que se actualiza sola en cada turno.
- Las tools scoped (advance_phase, update_costing, assign_supplier, register_payment, etc.) operaran sobre este pedido sin necesidad de pasar el order_id.
- Las tools globales (list_orders, list_products, get_company, search_alibaba) siguen disponibles sin restriccion.

Si cambias de pedido, vuelve a llamar activate_order con el nuevo id — reemplaza el anterior.`,

  cockpit: {
    widgets: [
      { id: 'cockpit-header', type: 'order-header', title: 'Pedido' },
      { id: 'cockpit-supplier', type: 'order-supplier', title: 'Proveedores e items' },
      { id: 'cockpit-docs', type: 'order-docs', title: 'Documentos' },
      { id: 'cockpit-costing', type: 'order-costing', title: 'Costeo' },
      { id: 'cockpit-contacts', type: 'order-contacts', title: 'Contactos' },
      { id: 'cockpit-findings', type: 'order-findings', title: 'Hallazgos' },
      { id: 'cockpit-timeline', type: 'order-timeline', title: 'Actividad' },
    ],
    layouts: {
      lg: [
        { i: 'cockpit-header', x: 0, y: 0, w: 10, h: 3, minW: 4, minH: 2 },
        { i: 'cockpit-supplier', x: 0, y: 3, w: 6, h: 5, minW: 4, minH: 3 },
        { i: 'cockpit-docs', x: 6, y: 3, w: 4, h: 5, minW: 3, minH: 3 },
        { i: 'cockpit-costing', x: 0, y: 8, w: 6, h: 5, minW: 4, minH: 3 },
        { i: 'cockpit-contacts', x: 6, y: 8, w: 4, h: 5, minW: 3, minH: 3 },
        { i: 'cockpit-findings', x: 0, y: 13, w: 6, h: 6, minW: 4, minH: 3 },
        { i: 'cockpit-timeline', x: 6, y: 13, w: 4, h: 6, minW: 4, minH: 3 },
      ],
      md: [
        { i: 'cockpit-header', x: 0, y: 0, w: 6, h: 3 },
        { i: 'cockpit-supplier', x: 0, y: 3, w: 6, h: 5 },
        { i: 'cockpit-docs', x: 0, y: 8, w: 6, h: 4 },
        { i: 'cockpit-costing', x: 0, y: 12, w: 6, h: 5 },
        { i: 'cockpit-contacts', x: 0, y: 17, w: 6, h: 4 },
        { i: 'cockpit-findings', x: 0, y: 21, w: 6, h: 5 },
        { i: 'cockpit-timeline', x: 0, y: 26, w: 6, h: 4 },
      ],
      sm: [
        { i: 'cockpit-header', x: 0, y: 0, w: 4, h: 3 },
        { i: 'cockpit-supplier', x: 0, y: 3, w: 4, h: 5 },
        { i: 'cockpit-docs', x: 0, y: 8, w: 4, h: 4 },
        { i: 'cockpit-costing', x: 0, y: 12, w: 4, h: 5 },
        { i: 'cockpit-contacts', x: 0, y: 17, w: 4, h: 4 },
        { i: 'cockpit-findings', x: 0, y: 21, w: 4, h: 5 },
        { i: 'cockpit-timeline', x: 0, y: 26, w: 4, h: 4 },
      ],
    },
  },

  snapshotBuilder: async (orderStub: { id: string }, { supabase }) => {
    const db = supabase as SupabaseLike
    const [orderRes, itemsRes, docsRes, paymentsRes] = await Promise.all([
      db.from('orders')
        .select('*, suppliers:supplier_id(id, name, country_code, contact_name, contact_email, contact_phone, website)')
        .eq('id', orderStub.id)
        .maybeSingle(),
      db.from('order_items')
        .select('*, supplier:supplier_id(id, name, country_code)')
        .eq('order_id', orderStub.id)
        .eq('cancelled', false)
        .order('created_at'),
      db.from('documents')
        .select('id, doc_type, filename, validated, created_at')
        .eq('order_id', orderStub.id)
        .order('created_at', { ascending: false }),
      db.from('payments')
        .select('id, type, amount, currency, status, payee, paid_at, due_date, notes')
        .eq('order_id', orderStub.id)
        .order('created_at'),
    ])

    const order = orderRes.data
    if (!order) return null

    const items = itemsRes.data ?? []
    const docs = docsRes.data ?? []
    const payments = paymentsRes.data ?? []

    const itemIds = items.map((i: any) => i.id)
    let transitions: any[] = []
    if (itemIds.length > 0) {
      const { data } = await db.from('phase_transitions')
        .select('item_id, from_phase, to_phase, from_step, to_step, actor, reason, ts')
        .in('item_id', itemIds)
        .order('ts', { ascending: false })
        .limit(15)
      transitions = data ?? []
    }

    const lines: string[] = []

    lines.push(`# Pedido: ${order.supplier_name || '(sin proveedor)'}`)
    lines.push('')
    lines.push(`- **ID**: ${order.id}`)
    lines.push(`- **Status**: ${order.status}`)
    if (order.current_phase) {
      lines.push(`- **Fase global**: ${PHASE_LABELS[order.current_phase as Phase] || order.current_phase}`)
    }
    if (order.po_number) lines.push(`- **PO**: ${order.po_number}`)
    if (order.total_amount != null) {
      lines.push(`- **Monto total**: ${order.currency || 'USD'} ${Number(order.total_amount).toLocaleString('es-CL')}`)
    }
    if (order.incoterm || order.incoterm_typed) {
      lines.push(`- **Incoterm**: ${order.incoterm_typed || order.incoterm}`)
    }
    if (order.payment_terms) lines.push(`- **Condiciones de pago**: ${order.payment_terms}`)
    if (order.country_origin) lines.push(`- **Pais origen**: ${order.country_origin}`)
    if (order.estimated_arrival) lines.push(`- **ETA**: ${order.estimated_arrival}`)

    const sup = order.suppliers as any
    if (sup) {
      lines.push('')
      lines.push(`## Proveedor principal`)
      lines.push(`- Nombre: ${sup.name}`)
      if (sup.country_code) lines.push(`- Pais: ${sup.country_code}`)
      if (sup.contact_name) lines.push(`- Contacto: ${sup.contact_name}`)
      if (sup.contact_email) lines.push(`- Email: ${sup.contact_email}`)
      if (sup.contact_phone) lines.push(`- Tel: ${sup.contact_phone}`)
      if (sup.website) lines.push(`- Web: ${sup.website}`)
    }

    if (items.length > 0) {
      lines.push('')
      lines.push(`## Items (${items.length})`)
      for (const item of items) {
        const phaseLabel = PHASE_LABELS[item.current_phase as Phase] || item.current_phase
        const stepsInPhase = PHASE_STEPS[item.current_phase as Phase] as readonly string[] | undefined
        const stepIdx = stepsInPhase ? stepsInPhase.indexOf(item.current_step) + 1 : '?'
        const totalSteps = stepsInPhase?.length ?? '?'

        lines.push('')
        lines.push(`### ${item.description || item.sku || 'Item sin nombre'}`)
        lines.push(`- ID: ${item.id}`)
        lines.push(`- Fase: ${phaseLabel} → paso ${stepIdx}/${totalSteps} (${item.current_step})`)
        if (item.quantity) lines.push(`- Cantidad: ${item.quantity}`)
        if (item.unit_price != null) lines.push(`- Precio unit: ${item.currency || 'USD'} ${item.unit_price}`)
        if (item.cbm_unit) lines.push(`- CBM/unit: ${item.cbm_unit}`)
        if (item.weight_unit_kg) lines.push(`- Peso/unit: ${item.weight_unit_kg} kg`)
        if (item.on_hold) lines.push(`- ⚠ EN HOLD`)
        if (item.blocked_reason) lines.push(`- ⛔ BLOQUEADO: ${item.blocked_reason}`)
        if (item.supplier && (item.supplier as any).name !== order.supplier_name) {
          lines.push(`- Proveedor: ${(item.supplier as any).name}`)
        }
      }
    }

    if (docs.length > 0) {
      lines.push('')
      lines.push(`## Documentos (${docs.length})`)
      for (const doc of docs) {
        const check = doc.validated ? 'ok' : 'pendiente'
        lines.push(`- ${doc.doc_type}: ${doc.filename} [${check}]`)
      }
    }

    if (payments.length > 0) {
      lines.push('')
      lines.push(`## Pagos (${payments.length})`)
      for (const p of payments) {
        const date = p.paid_at ? `pagado ${p.paid_at}` : (p.due_date ? `vence ${p.due_date}` : '')
        lines.push(`- ${p.type} (${p.payee || ''}): ${p.currency} ${p.amount} [${p.status}] ${date}`)
      }
    }

    if (transitions.length > 0) {
      lines.push('')
      lines.push(`## Timeline reciente`)
      for (const t of transitions.slice(0, 10)) {
        const date = t.ts ? new Date(t.ts).toLocaleDateString('es-CL') : ''
        const fromLabel = t.from_phase ? `${t.from_phase}.${t.from_step}` : '(inicio)'
        const toLabel = `${t.to_phase}.${t.to_step}`
        lines.push(`- ${date}: ${fromLabel} → ${toLabel} [${t.actor}]${t.reason ? ` — ${t.reason}` : ''}`)
      }
    }

    return lines.join('\n')
  },
})
