import { supabase } from './supabase'
import { PHASE_LABELS, PHASE_STEPS, type Phase } from '@hermes/shared'

/**
 * Builds a Markdown snapshot of an order's full state for agent context.
 * Queries Supabase directly from the frontend so the agent doesn't need
 * to burn tool calls just to understand the order.
 */
export async function buildOrderSnapshot(orderId: string): Promise<string | null> {
  const [orderRes, itemsRes, docsRes, paymentsRes, transitionsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*, suppliers:supplier_id(id, name, country_code, contact_name, contact_email, contact_phone, website)')
      .eq('id', orderId)
      .maybeSingle(),
    supabase
      .from('order_items')
      .select('*, supplier:supplier_id(id, name, country_code)')
      .eq('order_id', orderId)
      .eq('cancelled', false)
      .order('created_at'),
    supabase
      .from('documents')
      .select('id, doc_type, filename, validated, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('id, type, amount, currency, status, payee, paid_at, due_date, notes')
      .eq('order_id', orderId)
      .order('created_at'),
    supabase
      .from('phase_transitions')
      .select('from_phase, to_phase, from_step, to_step, actor, reason, ts')
      .eq('item_id', orderId)
      .order('ts', { ascending: false })
      .limit(1),
    // ^ dummy query — transitions are per-item, we'll fetch per item below
  ])

  const order = orderRes.data
  if (!order) return null

  const items = itemsRes.data ?? []
  const docs = docsRes.data ?? []
  const payments = paymentsRes.data ?? []

  // Fetch recent transitions for all items in this order
  const itemIds = items.map(i => i.id)
  let transitions: any[] = []
  if (itemIds.length > 0) {
    const { data } = await supabase
      .from('phase_transitions')
      .select('item_id, from_phase, to_phase, from_step, to_step, actor, reason, ts')
      .in('item_id', itemIds)
      .order('ts', { ascending: false })
      .limit(15)
    transitions = data ?? []
  }

  const lines: string[] = []

  // --- Order header ---
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

  // --- Supplier ---
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

  // --- Items ---
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

  // --- Documents ---
  if (docs.length > 0) {
    lines.push('')
    lines.push(`## Documentos (${docs.length})`)
    for (const doc of docs) {
      const check = doc.validated ? 'ok' : 'pendiente'
      lines.push(`- ${doc.doc_type}: ${doc.filename} [${check}]`)
    }
  }

  // --- Payments ---
  if (payments.length > 0) {
    lines.push('')
    lines.push(`## Pagos (${payments.length})`)
    for (const p of payments) {
      const date = p.paid_at ? `pagado ${p.paid_at}` : (p.due_date ? `vence ${p.due_date}` : '')
      lines.push(`- ${p.type} (${p.payee || ''}): ${p.currency} ${p.amount} [${p.status}] ${date}`)
    }
  }

  // --- Recent transitions ---
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
}
