import { useRef, useState } from 'react'
import { supabase } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import { Separator } from '@tleblancureta/proto/web'
import { InlineEdit } from '@tleblancureta/proto/web'
import { cacheGet, cacheSet } from '@tleblancureta/proto/web'
import { useData } from '@tleblancureta/proto/web'
import { ImagePlusIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { BaseProps } from './shared'

export function ProductHeaderWidget({ productId, refreshKey, onDelete }: BaseProps) {
  const key = `product-header:${productId}`
  const [reloadKey, setReloadKey] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: product } = useData(
    async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle()
      if (data) cacheSet(key, data)
      return data
    },
    [productId, refreshKey, reloadKey, key],
    cacheGet<any>(key) ?? null,
  )

  // Count linked orders for delete warning
  const { data: orderCount } = useData(
    async () => {
      const { count } = await supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
      return count || 0
    },
    [productId, refreshKey],
    0,
  )

  if (!product) return <Skeleton className="h-32 w-full" />

  const img = product.image_urls?.[0]

  async function save(field: string, value: string) {
    await supabase.from('products').update({ [field]: value || null }).eq('id', productId)
    cacheSet(key, { ...product, [field]: value || null })
    setReloadKey(k => k + 1)
  }

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${product.company_id}/${productId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path)
      const newUrls = [...(product.image_urls || []), pub.publicUrl]
      await supabase.from('products').update({ image_urls: newUrls }).eq('id', productId)
      setReloadKey(k => k + 1)
    } catch (e: any) {
      console.error('upload failed:', e)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    const warning = orderCount > 0
      ? `Este producto esta vinculado a ${orderCount} pedido(s). Se quitara el producto de esos pedidos.\n\nEliminar "${product.name}"?`
      : `Eliminar "${product.name}"?`

    if (!confirm(warning)) return

    setDeleting(true)
    try {
      // Unlink from order_items
      if (orderCount > 0) {
        await supabase.from('order_items').update({ product_id: null }).eq('product_id', productId)
      }
      // Soft-delete (set inactive)
      await supabase.from('products').update({ active: false }).eq('id', productId)
      onDelete?.()
    } catch (e: any) {
      console.error('delete failed:', e)
      alert(`Error: ${e.message}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex gap-3 h-full">
      {/* Image — clickable to upload */}
      <button
        onClick={() => fileRef.current?.click()}
        className="w-32 h-32 rounded-lg bg-accent flex items-center justify-center overflow-hidden shrink-0 border border-border relative group"
        title="Cambiar imagen"
        disabled={uploading}
      >
        {img
          ? <img src={img} alt={product.name} className="w-full h-full object-cover" />
          : <span className="text-muted-foreground/30 text-4xl">📦</span>}
        <div className="absolute inset-0 bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {uploading
            ? <Loader2Icon className="w-5 h-5 animate-spin text-muted-foreground" />
            : <ImagePlusIcon className="w-5 h-5 text-muted-foreground" />}
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUpload(f)
          e.target.value = ''
        }}
      />

      {/* Details */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <InlineEdit
              value={product.name}
              onSave={v => save('name', v)}
              allowEmpty={false}
              className="text-base font-semibold"
              inputClassName="text-base font-semibold w-full"
            />
            <div className="flex flex-wrap gap-1 mt-1">
              <InlineEdit
                value={product.category}
                onSave={v => save('category', v)}
                placeholder="+ categoria"
                display={v => <Badge variant="outline" className="text-[10px] cursor-text">{v}</Badge>}
                className="text-[10px]"
                inputClassName="text-[10px] w-24"
              />
              <InlineEdit
                value={product.material}
                onSave={v => save('material', v)}
                placeholder="+ material"
                display={v => <Badge variant="secondary" className="text-[10px] cursor-text">{v}</Badge>}
                className="text-[10px]"
                inputClassName="text-[10px] w-24"
              />
              <InlineEdit
                value={product.sku}
                onSave={v => save('sku', v)}
                placeholder="+ SKU"
                display={v => <Badge variant="outline" className="text-[10px] font-mono cursor-text">{v}</Badge>}
                className="text-[10px]"
                inputClassName="text-[10px] w-24 font-mono"
              />
            </div>
          </div>
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              title="Eliminar producto"
            >
              {deleting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <Trash2Icon className="w-4 h-4" />}
            </button>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <EditRow label="Origen" value={product.origin_country} onSave={v => save('origin_country', v)} />
          <EditRow label="HS code" value={product.hs_code} onSave={v => save('hs_code', v)} inputClassName="font-mono" />
          <EditRow label="Dimensiones" value={product.dimensions} onSave={v => save('dimensions', v)} />
          <EditRow label="Peso" value={product.weight} onSave={v => save('weight', v)} />
          <div className="col-span-2 mt-1">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">Descripcion</p>
            <InlineEdit
              value={product.description}
              onSave={v => save('description', v)}
              placeholder="+ agregar descripcion"
              className="text-foreground/80 text-[11px]"
              inputClassName="text-[11px] w-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function EditRow({ label, value, onSave, inputClassName = '' }: { label: string; value: string | null; onSave: (v: string) => Promise<void>; inputClassName?: string }) {
  return (
    <>
      <span className="text-muted-foreground/60">{label}</span>
      <InlineEdit
        value={value}
        onSave={onSave}
        placeholder="—"
        className="text-foreground truncate"
        inputClassName={`text-[11px] w-full ${inputClassName}`}
      />
    </>
  )
}
