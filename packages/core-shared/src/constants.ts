export const ORDER_STATUSES = [
  'sourcing', 'draft', 'po_sent', 'production', 'shipped',
  'in_transit', 'customs', 'delivered', 'cancelled', 'on_hold',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  sourcing: ['draft', 'cancelled'],
  draft: ['po_sent', 'cancelled'],
  po_sent: ['production', 'cancelled', 'on_hold'],
  production: ['shipped', 'cancelled', 'on_hold'],
  shipped: ['in_transit', 'cancelled', 'on_hold'],
  in_transit: ['customs', 'cancelled', 'on_hold'],
  customs: ['delivered', 'cancelled', 'on_hold'],
  delivered: [],
  cancelled: [],
  on_hold: ['sourcing', 'draft', 'po_sent', 'production', 'shipped', 'in_transit', 'customs', 'cancelled'],
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  sourcing: 'Busqueda y cotizacion',
  draft: 'Borrador (proveedor definido)',
  po_sent: 'OC enviada',
  production: 'En produccion',
  shipped: 'Despachado',
  in_transit: 'En transito',
  customs: 'En aduana',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  on_hold: 'Pausado',
}

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export const DOC_TYPES = [
  'proforma_invoice', 'commercial_invoice', 'packing_list',
  'bl', 'certificate_of_origin', 'din', 'insurance', 'customs_release', 'other',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export const REQUIRED_DOCS: Partial<Record<OrderStatus, DocType[]>> = {
  po_sent: ['proforma_invoice'],
  shipped: ['commercial_invoice', 'packing_list', 'bl'],
  in_transit: ['insurance'],
  customs: ['din'],
  delivered: ['customs_release'],
}

export function getRequiredDocsForStage(stage: OrderStatus): DocType[] {
  const stageOrder: OrderStatus[] = [
    'po_sent', 'production', 'shipped', 'in_transit', 'customs', 'delivered',
  ]
  const idx = stageOrder.indexOf(stage)
  if (idx === -1) return []

  const required: DocType[] = []
  for (let i = 0; i <= idx; i++) {
    const docs = REQUIRED_DOCS[stageOrder[i]]
    if (docs) required.push(...docs)
  }
  return [...new Set(required)]
}
