import { supabase } from '@tleblancureta/proto/web'
import { useData } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import { PlusIcon } from 'lucide-react'

const PHASE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  sourcing: { label: 'Sourcing', variant: 'outline' },
  negotiation: { label: 'Negociacion', variant: 'outline' },
  preliminary_costing: { label: 'Costeo prelim.', variant: 'secondary' },
  forwarder_quotation: { label: 'Forwarder', variant: 'secondary' },
  final_costing: { label: 'Costeo final', variant: 'secondary' },
  purchase_order: { label: 'OC', variant: 'default' },
  production: { label: 'Produccion', variant: 'default' },
  documentation: { label: 'Documentos', variant: 'default' },
  shipping: { label: 'Despachado', variant: 'default' },
  customs_cl: { label: 'Aduana', variant: 'default' },
  last_mile: { label: 'Ultima milla', variant: 'default' },
  received: { label: 'Recibido', variant: 'default' },
  closed: { label: 'Cerrado', variant: 'secondary' },
}

interface Props {
  companyId: string
  refreshKey: number
  onSelectOrder: (orderId: string, label: string) => void
  onSendToChat: (message: string) => void
  onCreateOrder?: () => void
}

export default function OrdersWidget({ companyId, refreshKey, onSelectOrder, onSendToChat, onCreateOrder }: Props) {
  const { data: orders, loading } = useData(
    async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, supplier_name, current_phase, status, po_number, total_amount, currency, products, product_requirements')
        .eq('company_id', companyId)
        .or('current_phase.is.null,current_phase.neq.closed')
        .order('created_at', { ascending: false })
        .limit(20)
      return data || []
    },
    [companyId, refreshKey],
    [],
  )

  if (loading) return <div className="space-y-1">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>

  if (orders.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground mb-2">Sin pedidos activos</p>
        <button
          onClick={() => onCreateOrder ? onCreateOrder() : onSendToChat('Quiero importar un producto nuevo')}
          className="text-xs text-primary hover:underline"
        >
          Crear primer pedido
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {onCreateOrder && (
        <button
          onClick={onCreateOrder}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 mb-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          <PlusIcon className="w-3 h-3" /> Nuevo pedido
        </button>
      )}
      {orders.map(order => {
        const cfg = PHASE[order.current_phase] || { label: order.current_phase || 'Pedido', variant: 'secondary' as const }
        const products = Array.isArray(order.products) ? order.products : []
        const title = products[0]?.name || order.product_requirements?.name || order.supplier_name || 'Pedido'
        return (
          <button key={order.id} onClick={() => onSelectOrder(order.id, title)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors text-left">
            <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center shrink-0">
              <span className="text-muted-foreground/30 text-sm">📋</span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block">{title}</span>
              {order.total_amount && (
                <span className="text-xs text-muted-foreground">{order.currency} {order.total_amount.toLocaleString()}</span>
              )}
            </div>
            <Badge variant={cfg.variant} className="text-[10px] h-4 shrink-0">{cfg.label}</Badge>
          </button>
        )
      })}
    </div>
  )
}
