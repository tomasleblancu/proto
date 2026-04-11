import { supabase } from '../lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'
import { useData } from '@/hooks/useData'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  sourcing: { label: 'Buscando', color: 'bg-cyan-900/50 text-cyan-400' },
  draft: { label: 'Borrador', color: 'bg-neutral-700 text-neutral-300' },
  po_sent: { label: 'OC Enviada', color: 'bg-blue-900/50 text-blue-400' },
  production: { label: 'Produccion', color: 'bg-yellow-900/50 text-yellow-400' },
  shipped: { label: 'Despachado', color: 'bg-indigo-900/50 text-indigo-400' },
  in_transit: { label: 'En transito', color: 'bg-purple-900/50 text-purple-400' },
  customs: { label: 'Aduana', color: 'bg-orange-900/50 text-orange-400' },
  delivered: { label: 'Entregado', color: 'bg-emerald-900/50 text-emerald-400' },
  cancelled: { label: 'Cancelado', color: 'bg-red-900/50 text-red-400' },
  on_hold: { label: 'Pausado', color: 'bg-amber-900/50 text-amber-400' },
}

interface Order {
  id: string
  supplier_name: string
  status: string
  po_number: string | null
  total_amount: number | null
  currency: string
  created_at: string
  sourcing_method: string | null
  product_requirements: any
  products: any
}

interface Props {
  companyId: string | null
  visible: boolean
  refreshKey?: number
  onSelectOrder?: (orderId: string) => void
  onToggle?: () => void
}

function getOrderTitle(order: Order): string {
  // Try products array first (most reliable)
  if (Array.isArray(order.products) && order.products.length > 0) {
    const first = order.products[0]?.name
    if (first) {
      if (order.products.length > 1) return `${first} (+${order.products.length - 1})`
      return first
    }
  }
  // Try product requirements
  const req = order.product_requirements
  if (req?.name) return req.name
  if (req?.description && req.description.length < 50) return req.description
  // Fall back to supplier
  if (order.supplier_name && order.supplier_name !== 'Por definir') return order.supplier_name
  return 'Nuevo pedido'
}

function getOrderSubtitle(order: Order): string {
  const parts: string[] = []
  if (order.supplier_name && order.supplier_name !== 'Por definir') {
    parts.push(order.supplier_name)
  }
  if (order.po_number) {
    parts.push(`OC ${order.po_number}`)
  }
  const req = order.product_requirements
  if (req?.quantity) {
    parts.push(`${Number(req.quantity).toLocaleString()} uds`)
  } else if (Array.isArray(order.products) && order.products[0]?.quantity) {
    parts.push(`${Number(order.products[0].quantity).toLocaleString()} uds`)
  }
  if (order.sourcing_method === 'hermes' && order.status === 'sourcing') {
    parts.push('Hermes busca')
  }
  if (order.sourcing_method === 'client' && order.status === 'sourcing') {
    parts.push('Cliente busca')
  }
  return parts.join(' · ') || 'Sin detalles'
}

function getOrderAmount(order: Order): string | null {
  if (order.total_amount) {
    return `${order.currency} ${Number(order.total_amount).toLocaleString()}`
  }
  const req = order.product_requirements
  if (req?.target_unit_price_usd && req?.quantity) {
    const total = req.target_unit_price_usd * req.quantity
    return `~USD ${total.toLocaleString()}`
  }
  if (req?.total_budget) return req.total_budget
  return null
}

export default function OrderPanel({ companyId, visible, refreshKey, onSelectOrder, onToggle }: Props) {
  const { data: orders, loading } = useData<Order[]>(
    async (_signal) => {
      if (!companyId || !visible) return []
      const { data } = await supabase
        .from('orders')
        .select('id, supplier_name, status, po_number, total_amount, currency, created_at, sourcing_method, product_requirements, products')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20)
      return (data as Order[]) || []
    },
    [companyId, visible, refreshKey],
    [],
  )

  const active = orders.filter(o => !['delivered', 'cancelled'].includes(o.status))

  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="w-8 border-l border-border flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/50 transition-colors"
        title="Ver pedidos"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    )
  }

  return (
    <div className="w-72 border-l border-border bg-card/50 overflow-y-auto scrollbar-thin">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Pedidos activos ({active.length})
        </h2>
        <button onClick={onToggle} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-3 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="px-4 py-6 text-xs text-neutral-600">Sin pedidos activos</div>
      ) : (
        <div className="divide-y divide-neutral-800/50">
          {active.map(order => {
            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
            const amount = getOrderAmount(order)
            return (
              <div
                key={order.id}
                onClick={() => onSelectOrder?.(order.id)}
                className="px-4 py-3 hover:bg-neutral-800/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-neutral-200 leading-tight">
                    {getOrderTitle(order)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-snug">
                  {getOrderSubtitle(order)}
                </p>
                {amount && (
                  <p className="text-[11px] text-neutral-400 mt-0.5">{amount}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
