import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  sourcing: { label: 'Buscando proveedor', variant: 'outline' },
  draft: { label: 'Borrador', variant: 'secondary' },
  po_sent: { label: 'OC Enviada', variant: 'default' },
  production: { label: 'En produccion', variant: 'default' },
  shipped: { label: 'Despachado', variant: 'default' },
  in_transit: { label: 'En transito', variant: 'default' },
  customs: { label: 'En aduana', variant: 'default' },
  delivered: { label: 'Entregado', variant: 'default' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  on_hold: { label: 'Pausado', variant: 'secondary' },
}

interface OrderData {
  id: string
  supplier_name: string
  status: string
  po_number: string | null
  total_amount: number | null
  currency: string
  incoterm: string | null
  payment_terms: string | null
  estimated_arrival: string | null
  sourcing_method: string | null
  product_requirements: any
  products: any[]
  created_at: string
}

interface Props {
  order: OrderData
  onAction: (message: string) => void
}

export default function OrderCard({ order, onAction }: Props) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
  const req = order.product_requirements || {}
  const products = Array.isArray(order.products) ? order.products : []

  const actions: { label: string; message: string }[] = []
  if (order.status === 'sourcing') {
    actions.push({ label: 'Ya tengo proveedor', message: `Tengo proveedor para el pedido ${order.id}. Quiero avanzarlo.` })
    actions.push({ label: 'Ver estado', message: `Como va la busqueda de proveedores para el pedido ${order.id}?` })
  } else if (order.status === 'draft') {
    actions.push({ label: 'Enviar OC', message: `Quiero enviar la orden de compra del pedido ${order.id}` })
    actions.push({ label: 'Modificar', message: `Necesito modificar el pedido ${order.id}` })
  } else if (['po_sent', 'production', 'shipped', 'in_transit'].includes(order.status)) {
    actions.push({ label: 'Actualizar estado', message: `Actualiza el estado del pedido ${order.id}` })
    actions.push({ label: 'Ver documentos', message: `Que documentos tenemos del pedido ${order.id}?` })
  } else if (order.status === 'customs') {
    actions.push({ label: 'Validar docs', message: `Valida los documentos del pedido ${order.id} para aduana` })
  }
  actions.push({ label: 'Timeline', message: `Muestrame el timeline del pedido ${order.id}` })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {order.po_number && (
            <span className="text-xs text-muted-foreground font-mono">OC {order.po_number}</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {products.map((p: any, i: number) => (
          <div key={i} className="flex items-baseline justify-between">
            <span className="text-sm font-medium">{p.name}</span>
            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
              {p.quantity?.toLocaleString()} uds
              {p.unit_price > 0 && ` · ${p.currency || 'USD'} ${p.unit_price}`}
            </span>
          </div>
        ))}
        {products.length === 0 && req?.description && (
          <p className="text-sm text-muted-foreground">{req.description}</p>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {order.supplier_name && order.supplier_name !== 'Por definir' && (
            <><span className="text-muted-foreground/60">Proveedor</span><span className="text-muted-foreground">{order.supplier_name}</span></>
          )}
          {order.sourcing_method && (
            <><span className="text-muted-foreground/60">Busqueda</span><span className="text-muted-foreground">{order.sourcing_method === 'hermes' ? 'Hermes busca' : 'Cliente busca'}</span></>
          )}
          {order.total_amount && (
            <><span className="text-muted-foreground/60">Monto</span><span className="text-muted-foreground">{order.currency} {order.total_amount.toLocaleString()}</span></>
          )}
          {order.incoterm && (
            <><span className="text-muted-foreground/60">Incoterm</span><span className="text-muted-foreground">{order.incoterm}</span></>
          )}
          {order.estimated_arrival && (
            <><span className="text-muted-foreground/60">ETA</span><span className="text-muted-foreground">{order.estimated_arrival}</span></>
          )}
          {req?.origin_country && (
            <><span className="text-muted-foreground/60">Origen</span><span className="text-muted-foreground">{req.origin_country}</span></>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-1.5 pt-0">
        {actions.map((a, i) => (
          <Button key={i} variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAction(a.message)}>
            {a.label}
          </Button>
        ))}
      </CardFooter>
    </Card>
  )
}
