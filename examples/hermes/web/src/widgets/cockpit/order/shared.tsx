import { supabase } from '@proto/core-web'

/**
 * Shared primitives for order cockpit widgets.
 * All order cockpit widgets consume `BaseProps` and get re-queried when
 * `refreshKey` bumps (once per agent turn).
 */

export interface BaseProps {
  orderId: string
  refreshKey: number
  onSendToChat?: (msg: string) => void
  onDelete?: () => void
}

export async function patchOrder(orderId: string, patch: Record<string, any>) {
  const { error } = await supabase.from('orders').update(patch).eq('id', orderId)
  if (error) throw error
}

export const PHASES = [
  'sourcing', 'negotiation', 'preliminary_costing', 'forwarder_quotation',
  'final_costing', 'purchase_order', 'production', 'documentation',
  'shipping', 'customs_cl', 'last_mile', 'received', 'closed',
] as const

export const PHASE_LABELS: Record<string, string> = {
  sourcing: 'Sourcing',
  negotiation: 'Negociacion',
  preliminary_costing: 'Costeo prelim',
  forwarder_quotation: 'Forwarder',
  final_costing: 'Costeo final',
  purchase_order: 'PO',
  production: 'Produccion',
  documentation: 'Docs',
  shipping: 'Embarque',
  customs_cl: 'Aduana',
  last_mile: 'Last mile',
  received: 'Recibido',
  closed: 'Cerrado',
}

export const DOC_CHECKLIST: { kind: string; label: string; required: boolean }[] = [
  { kind: 'proforma_invoice', label: 'Proforma invoice', required: false },
  { kind: 'commercial_invoice', label: 'Commercial invoice', required: true },
  { kind: 'packing_list', label: 'Packing list', required: true },
  { kind: 'bill_of_lading', label: 'Bill of lading (BL)', required: true },
  { kind: 'certificate_of_origin', label: 'Certificado de origen', required: false },
  { kind: 'form_f', label: 'Form F (TLC China)', required: false },
  { kind: 'forwarder_invoice', label: 'Forwarder invoice', required: false },
  { kind: 'customs_funds_provision', label: 'Provisión de fondos (aduana)', required: false },
  { kind: 'port_invoice', label: 'Factura portuaria', required: false },
  { kind: 'customs_agent_invoice', label: 'Factura agente de aduana', required: false },
  { kind: 'din', label: 'DIN (aduana)', required: true },
]

export function formatAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  )
}
