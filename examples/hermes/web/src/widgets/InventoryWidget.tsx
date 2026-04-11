import { supabase } from '@proto/core-web'
import { useData } from '@proto/core-web'
import { Skeleton } from '@proto/core-web'

interface InventoryRow {
  product_id: string
  reserved: number
  in_transit: number
  available: number
  products: { name: string } | null
}

interface Props {
  companyId: string
  refreshKey: number
  onSendToChat: (msg: string) => void
}

export default function InventoryWidget({ companyId, refreshKey, onSendToChat }: Props) {
  const { data: rows, loading } = useData(
    async () => {
      const { data } = await supabase
        .from('inventory')
        .select('product_id, reserved, in_transit, available, products(name)')
        .eq('company_id', companyId)
      return (data as unknown as InventoryRow[]) || []
    },
    [companyId, refreshKey],
    [] as InventoryRow[],
  )

  if (loading) return <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>

  if (rows.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">Sin inventario</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">El inventario se crea automaticamente al procesar pedidos.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-4 gap-1 text-[11px] text-muted-foreground/60 px-1">
        <span>Producto</span>
        <span className="text-center">Reserv.</span>
        <span className="text-center">Transito</span>
        <span className="text-center">Disp.</span>
      </div>

      {rows.map(row => {
        const total = row.reserved + row.in_transit + row.available
        const name = row.products?.name || 'Sin nombre'
        return (
          <button
            key={row.product_id}
            onClick={() => onSendToChat(`Muestrame el historial de inventario del producto "${name}" (ID: ${row.product_id})`)}
            className="grid grid-cols-4 gap-1 items-center w-full text-left p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <span className="text-xs font-medium truncate">{name}</span>
            <span className="text-xs text-center">
              {row.reserved > 0 ? (
                <span className="text-yellow-400">{row.reserved}</span>
              ) : (
                <span className="text-muted-foreground/30">0</span>
              )}
            </span>
            <span className="text-xs text-center">
              {row.in_transit > 0 ? (
                <span className="text-blue-400">{row.in_transit}</span>
              ) : (
                <span className="text-muted-foreground/30">0</span>
              )}
            </span>
            <span className="text-xs text-center">
              {row.available > 0 ? (
                <span className="text-emerald-400 font-medium">{row.available}</span>
              ) : (
                <span className="text-muted-foreground/30">0</span>
              )}
            </span>
          </button>
        )
      })}

      {/* Totals */}
      <div className="grid grid-cols-4 gap-1 px-1 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
        <span>Total</span>
        <span className="text-center">{rows.reduce((s, r) => s + r.reserved, 0)}</span>
        <span className="text-center">{rows.reduce((s, r) => s + r.in_transit, 0)}</span>
        <span className="text-center font-medium text-emerald-400">{rows.reduce((s, r) => s + r.available, 0)}</span>
      </div>
    </div>
  )
}
