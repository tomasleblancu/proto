import { supabase } from '@proto/core-web'
import { Badge } from '@proto/core-web'
import { Skeleton } from '@proto/core-web'
import { cacheGet, cacheSet } from '@proto/core-web'
import { useData } from '@proto/core-web'
import { StarIcon } from 'lucide-react'
import { BaseProps } from './shared'

interface ProductSupplier {
  id: string
  unit_price: number | null
  currency: string
  moq: number | null
  lead_time_days: number | null
  is_preferred: boolean
  notes: string | null
  suppliers: {
    id: string
    name: string
    country_code: string | null
    contact_email: string | null
    website: string | null
  }
}

export function ProductSuppliersWidget({ productId, refreshKey }: BaseProps) {
  const key = `product-suppliers:${productId}`

  const { data: rows } = useData(
    async () => {
      const { data } = await supabase
        .from('product_suppliers')
        .select('*, suppliers(id, name, country_code, contact_email, website)')
        .eq('product_id', productId)
        .order('is_preferred', { ascending: false })
        .order('created_at')
      const result = (data || []) as unknown as ProductSupplier[]
      cacheSet(key, result)
      return result
    },
    [productId, refreshKey, key],
    cacheGet<ProductSupplier[]>(key) ?? null,
  )

  if (rows === null) return <Skeleton className="h-24 w-full" />

  if (rows.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No hay proveedores vinculados a este producto.</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Pide al agente que vincule un proveedor.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {rows.map(row => {
        const s = row.suppliers
        return (
          <div
            key={row.id}
            className="flex items-start gap-2 p-2 rounded-md border border-border hover:bg-accent/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {row.is_preferred && (
                  <StarIcon className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                )}
                <span className="text-xs font-medium truncate">{s.name}</span>
                {s.country_code && (
                  <Badge variant="outline" className="text-[9px] shrink-0">{s.country_code}</Badge>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {row.unit_price != null && (
                  <span>{row.currency} {Number(row.unit_price).toLocaleString()}/ud</span>
                )}
                {row.moq != null && <span>MOQ {row.moq.toLocaleString()}</span>}
                {row.lead_time_days != null && <span>{row.lead_time_days}d lead time</span>}
              </div>
              {s.contact_email && (
                <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{s.contact_email}</p>
              )}
              {row.notes && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{row.notes}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
