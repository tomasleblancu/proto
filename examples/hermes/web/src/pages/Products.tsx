import { useState } from 'react'
import { supabase } from 'proto/web'
import { Skeleton } from 'proto/web'
import { useData } from 'proto/web'

interface Product {
  id: string
  name: string
  description: string | null
  category: string | null
  material: string | null
  origin_country: string | null
  image_urls: string[] | null
  active: boolean
}

interface Props {
  companyId: string
  onSelectProduct: (productId: string, productName: string) => void
}

export default function Products({ companyId, onSelectProduct }: Props) {
  const [search, setSearch] = useState('')

  const { data: products, loading } = useData<Product[]>(
    async (_signal) => {
      const { data } = await supabase
        .from('products')
        .select('id, name, description, category, material, origin_country, image_urls, active')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')
      return (data as Product[]) || []
    },
    [companyId],
    [],
  )

  const filtered = search
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase())
      )
    : products

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-white">Productos</h1>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white w-56 focus:outline-none focus:border-neutral-500 placeholder:text-neutral-600"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-border overflow-hidden">
                <Skeleton className="aspect-square w-full" />
                <div className="px-3 py-2.5 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <svg className="mx-auto mb-3 text-neutral-700" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {products.length === 0 ? (
              <>
                <p className="text-neutral-400 mb-1">Sin productos en el catalogo</p>
                <p className="text-xs text-neutral-600">Los productos se agregan automaticamente cuando haces un intake de importacion.</p>
              </>
            ) : (
              <p className="text-neutral-400">Sin resultados para "{search}"</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(product => (
              <button
                key={product.id}
                onClick={() => onSelectProduct(product.id, product.name)}
                className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden text-left hover:border-neutral-600 transition-colors group"
              >
                {/* Image */}
                <div className="aspect-square bg-neutral-800 flex items-center justify-center overflow-hidden">
                  {product.image_urls && product.image_urls.length > 0 ? (
                    <img
                      src={product.image_urls[0]}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <svg className="text-neutral-700" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  )}
                </div>

                {/* Info */}
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium text-neutral-200 truncate">{product.name}</p>
                  {product.category && (
                    <p className="text-[11px] text-neutral-500 mt-0.5">{product.category}</p>
                  )}
                  {product.material && (
                    <p className="text-[11px] text-neutral-600 truncate">{product.material}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
