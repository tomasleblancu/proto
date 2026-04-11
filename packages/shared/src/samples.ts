// Muestras: entidad first-class. Una muestra puede existir antes de que exista
// un order_item, y luego promoverse a uno via promote_sample_to_item.
// Requiere que el supplier ya exista en DB (no hay leads).

export const SAMPLE_STATUSES = [
  'requested',
  'in_transit',
  'received',
  'under_evaluation',
  'approved',
  'rejected',
  'needs_revision',
  'cancelled',
] as const

export type SampleStatus = (typeof SAMPLE_STATUSES)[number]

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  requested: 'Solicitada',
  in_transit: 'En transito',
  received: 'Recibida',
  under_evaluation: 'En evaluacion',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  needs_revision: 'Requiere ajustes',
  cancelled: 'Cancelada',
}

export const SAMPLE_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  requested: ['in_transit', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: ['under_evaluation', 'cancelled'],
  under_evaluation: ['approved', 'rejected', 'needs_revision', 'cancelled'],
  needs_revision: ['under_evaluation', 'rejected', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
}

export const SAMPLE_SHIPPING_METHODS = [
  'courier',
  'with_main_shipment',
  'hand_carry',
] as const
export type SampleShippingMethod = (typeof SAMPLE_SHIPPING_METHODS)[number]

export function isValidSampleTransition(from: SampleStatus, to: SampleStatus): boolean {
  return SAMPLE_TRANSITIONS[from].includes(to)
}
