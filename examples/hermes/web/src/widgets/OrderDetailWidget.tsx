import { supabase } from '@tleblancureta/proto/web'
import { useData } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Separator } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'

const STATUS_LABELS: Record<string, string> = {
  sourcing: 'Buscando', draft: 'Borrador', po_sent: 'OC Enviada',
  production: 'Produccion', shipped: 'Despachado', in_transit: 'En transito',
  customs: 'Aduana', delivered: 'Entregado', cancelled: 'Cancelado', on_hold: 'Pausado',
}

interface Props {
  orderId: string
  onSendToChat: (message: string) => void
}

export default function OrderDetailWidget({ orderId, onSendToChat }: Props) {
  const { data: order, loading } = useData(
    async () => {
      const { data } = await supabase.from('orders').select('*').eq('id', orderId).single()
      return data
    },
    [orderId],
    null as any,
  )

  if (loading || !order) return <Skeleton className="h-32 w-full" />

  const products = Array.isArray(order.products) ? order.products : []

  return (
    <div className="space-y-2">
      <Badge variant="outline" className="text-[9px]">{STATUS_LABELS[order.status] || order.status}</Badge>

      {products.map((p: any, i: number) => (
        <div key={i} className="flex justify-between text-[11px]">
          <span>{p.name}</span>
          <span className="text-muted-foreground">{p.quantity} uds</span>
        </div>
      ))}

      <Separator />

      <div className="grid grid-cols-2 gap-1 text-[10px]">
        {order.supplier_name && order.supplier_name !== 'Por definir' && (
          <><span className="text-muted-foreground/60">Proveedor</span><span>{order.supplier_name}</span></>
        )}
        {order.total_amount && (
          <><span className="text-muted-foreground/60">Monto</span><span>{order.currency} {order.total_amount.toLocaleString()}</span></>
        )}
        {order.estimated_arrival && (
          <><span className="text-muted-foreground/60">ETA</span><span>{order.estimated_arrival}</span></>
        )}
      </div>

      <div className="flex flex-wrap gap-1 pt-1">
        <Button variant="outline" size="sm" className="h-6 text-[10px]"
          onClick={() => onSendToChat(`Actualiza el estado del pedido ${orderId}`)}>
          Actualizar
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[10px]"
          onClick={() => onSendToChat(`Que documentos tiene el pedido ${orderId}?`)}>
          Docs
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[10px]"
          onClick={() => onSendToChat(`Muestrame el timeline del pedido ${orderId}`)}>
          Timeline
        </Button>
      </div>
    </div>
  )
}
