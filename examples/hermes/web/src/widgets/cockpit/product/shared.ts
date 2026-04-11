export interface BaseProps {
  productId: string
  refreshKey: number
  onDelete?: () => void
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', sourcing: 'Buscando', po_sent: 'OC Enviada',
  production: 'Produccion', shipped: 'Despachado', in_transit: 'En transito',
  customs: 'Aduana', delivered: 'Entregado', cancelled: 'Cancelado', on_hold: 'Pausado',
}
