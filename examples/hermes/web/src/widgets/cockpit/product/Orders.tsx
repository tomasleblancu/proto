import { supabase } from '@proto/core-web'
import { Badge } from '@proto/core-web'
import { Skeleton } from '@proto/core-web'
import { cacheGet, cacheSet } from '@proto/core-web'
import { useData } from '@proto/core-web'
import { BaseProps, STATUS_LABELS } from './shared'

export function ProductOrdersWidget({ productId, refreshKey, onSelectOrder }: BaseProps & { onSelectOrder?: (id: string, label: string) => void }) {
  const key = `product-orders:${productId}`

  const { data: orders } = useData(
    async () => {
      const { data } = await supabase
        .from('order_items')
        .select('order_id, quantity, orders(id, supplier_name, status, current_phase, total_amount, currency, created_at)')
        .eq('product_id', productId)
        .order('created_at', { ascending: false, foreignTable: 'orders' })
        .limit(20)
      const rows = (data || [])
        .map((r: any) => ({ ...r.orders, quantity: r.quantity }))
        .filter(Boolean)
      cacheSet(key, rows)
      return rows
    },
    [productId, refreshKey, key],
    cacheGet<any[] | null>(key) ?? null,
  )

  if (orders === null) return <Skeleton className="h-24 w-full" />
  if (orders.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">Este producto no tiene pedidos todavia.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {orders.map(o => (
        <button
          key={o.id}
          onClick={() => onSelectOrder?.(o.id, o.supplier_name || 'Pedido')}
          className="w-full text-left flex items-center gap-2 p-2 rounded-md border border-border hover:bg-accent/50 hover:border-primary/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium truncate">{o.supplier_name || 'Sin proveedor'}</span>
              <Badge variant="outline" className="text-[9px] shrink-0">
                {STATUS_LABELS[o.current_phase || o.status] || o.status}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground flex gap-2">
              {o.quantity && <span>{Number(o.quantity).toLocaleString()} uds</span>}
              {o.total_amount && <span>{o.currency || 'USD'} {Number(o.total_amount).toLocaleString()}</span>}
              <span>{new Date(o.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
