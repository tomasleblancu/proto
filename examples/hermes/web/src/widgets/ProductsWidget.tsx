import { supabase } from '@tleblancureta/proto/web'
import { useData } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import { ShoppingCartIcon, CheckIcon, PlusIcon } from 'lucide-react'
import type { CartItem } from '../shared/types'

interface Props {
  companyId: string
  refreshKey?: number
  onSelectProduct?: (productId: string, label: string) => void
  onAddToCart?: (item: CartItem) => void
  onCreateProduct?: () => void
  cartItems?: CartItem[]
}

export default function ProductsWidget({ companyId, refreshKey, onSelectProduct, onAddToCart, onCreateProduct, cartItems = [] }: Props) {
  const cartIds = new Set(cartItems.map(i => i.productId))

  const { data: products, loading } = useData(
    async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, category, material, image_urls')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')
      return data || []
    },
    [companyId, refreshKey],
    [],
  )

  if (loading) return <div className="space-y-1">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>

  if (products.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground">Sin productos</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {onCreateProduct && (
        <button
          onClick={onCreateProduct}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 mb-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          <PlusIcon className="w-3 h-3" /> Nuevo producto
        </button>
      )}
      {products.map(p => {
        const inCart = cartIds.has(p.id)
        return (
          <div key={p.id} className="relative flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
            <button
              onClick={() => onSelectProduct?.(p.id, p.name)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center overflow-hidden shrink-0 relative">
                {p.image_urls?.[0]
                  ? <img src={p.image_urls[0]} alt={p.name} className="w-full h-full object-cover" />
                  : <span className="text-muted-foreground/30 text-sm">📦</span>
                }
                {inCart && (
                  <div className="absolute inset-0 bg-primary/80 flex items-center justify-center">
                    <CheckIcon className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{p.name}</span>
                {p.category && <span className="text-xs text-muted-foreground">{p.category}</span>}
              </div>
            </button>

            {onAddToCart && !inCart && (
              <button
                onClick={() => onAddToCart({
                  productId: p.id,
                  name: p.name,
                  category: p.category || undefined,
                  imageUrl: p.image_urls?.[0] || undefined,
                  quantity: 1,
                })}
                className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 transition-colors shrink-0"
                title="Agregar al carro"
              >
                <ShoppingCartIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
