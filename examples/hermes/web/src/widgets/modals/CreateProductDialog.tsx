import { useRef, useState } from 'react'
import { supabase } from '@tleblancureta/proto/web'
import { ShellDialog } from '@tleblancureta/proto/web'
import { Loader2Icon, ImagePlusIcon, XIcon } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
  onCreated?: () => void
}

interface ImagePreview {
  file: File
  url: string
}

export default function CreateProductDialog({ open, onClose, companyId, onCreated }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [material, setMaterial] = useState('')
  const [description, setDescription] = useState('')
  const [originCountry, setOriginCountry] = useState('')
  const [hsCode, setHsCode] = useState('')
  const [images, setImages] = useState<ImagePreview[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    const newImages = Array.from(files).map(file => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setImages(prev => [...prev, ...newImages])
  }

  function removeImage(idx: number) {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      // 1. Create product
      const { data: product, error: insertErr } = await supabase
        .from('products')
        .insert({
          company_id: companyId,
          name: name.trim(),
          category: category.trim() || null,
          material: material.trim() || null,
          description: description.trim() || null,
          origin_country: originCountry.trim() || null,
          hs_code: hsCode.trim() || null,
          active: true,
        })
        .select('id')
        .single()

      if (insertErr) throw new Error(insertErr.message)

      // 2. Upload images
      if (images.length > 0) {
        const urls: string[] = []
        for (const img of images) {
          const ext = img.file.name.split('.').pop() || 'jpg'
          const path = `${companyId}/${product.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
          const { error: upErr } = await supabase.storage
            .from('product-images')
            .upload(path, img.file, { cacheControl: '3600', upsert: false, contentType: img.file.type })
          if (!upErr) {
            const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path)
            urls.push(pub.publicUrl)
          }
        }
        if (urls.length > 0) {
          await supabase.from('products').update({ image_urls: urls }).eq('id', product.id)
        }
      }

      onCreated?.()
      resetAndClose()
    } catch (err: any) {
      setError(err.message || 'Error creando el producto')
      setSubmitting(false)
    }
  }

  function resetAndClose() {
    setName('')
    setCategory('')
    setMaterial('')
    setDescription('')
    setOriginCountry('')
    setHsCode('')
    images.forEach(img => URL.revokeObjectURL(img.url))
    setImages([])
    setSubmitting(false)
    setError(null)
    onClose()
  }

  return (
    <ShellDialog
      open={open}
      onClose={resetAndClose}
      title="Nuevo producto"
      description="Agrega un producto al catalogo."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Photos */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Fotos</label>
          <div className="flex flex-wrap gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border border-border group">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute inset-0 bg-background/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XIcon className="w-4 h-4 text-destructive" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-md border border-dashed border-border flex items-center justify-center hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <ImagePlusIcon className="w-5 h-5 text-muted-foreground/50" />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Nombre <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Bata de bano spa talla L"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Categoria</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="Ej: textil, plastico"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Material</label>
            <input
              type="text"
              value={material}
              onChange={e => setMaterial(e.target.value)}
              placeholder="Ej: PP non-woven"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Pais de origen</label>
            <input
              type="text"
              value={originCountry}
              onChange={e => setOriginCountry(e.target.value)}
              placeholder="Ej: China, CN"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">HS Code</label>
            <input
              type="text"
              value={hsCode}
              onChange={e => setHsCode(e.target.value)}
              placeholder="Ej: 4818900000"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Descripcion</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalles del producto, especificaciones..."
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={resetAndClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
          >
            {submitting && <Loader2Icon className="w-3 h-3 animate-spin" />}
            Crear producto
          </button>
        </div>
      </form>
    </ShellDialog>
  )
}
