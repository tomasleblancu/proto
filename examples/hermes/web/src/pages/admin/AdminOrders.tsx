import { useState } from 'react'
import { Card, CardContent } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Separator } from '@tleblancureta/proto/web'
import { ORDER_STATUSES, STATUS_COLORS } from './AdminTypes'
import type { Order } from './AdminTypes'

interface Props {
  orders: Order[]
  onUpdateStatus: (orderId: string, status: string) => void
}

export default function AdminOrders({ orders, onUpdateStatus }: Props) {
  const [orderFilter, setOrderFilter] = useState<string>('all')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setOrderFilter('all')}
          className={`text-[11px] px-2 py-0.5 rounded-full border ${orderFilter === 'all' ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}
        >
          Todos ({orders.length})
        </button>
        {ORDER_STATUSES.map(s => {
          const count = orders.filter(o => o.status === s).length
          if (count === 0) return null
          return (
            <button
              key={s}
              onClick={() => setOrderFilter(s)}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${orderFilter === s ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}
            >
              {s} ({count})
            </button>
          )
        })}
      </div>
      {orders.filter(o => orderFilter === 'all' || o.status === orderFilter).map(order => (
        <Card key={order.id}>
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-400'}`} />
              <span className="text-sm font-medium flex-1 truncate">{order.supplier_name}</span>
              {order.po_number && <Badge variant="outline" className="text-[10px] font-mono">{order.po_number}</Badge>}
              <select
                value={order.status}
                onChange={e => onUpdateStatus(order.id, e.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">{order.company_name || order.company_id.slice(0, 8)}</Badge>
              <div className="flex items-center gap-3">
                {order.total_amount != null && (
                  <span className="font-mono">{order.currency || 'USD'} {Number(order.total_amount).toLocaleString()}</span>
                )}
                {order.estimated_arrival && <span>ETA {order.estimated_arrival}</span>}
                <span>upd {new Date(order.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {orders.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay pedidos registrados.</p>
      )}
    </div>
  )
}
