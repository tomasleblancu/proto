import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useData } from '@/hooks/useData'
import { ShellDialog } from '@/components/ui/shell-dialog'
import { Loader2Icon, PlusIcon, TrashIcon } from 'lucide-react'

interface Product {
  id: string
  name: string
  category: string | null
  image_urls: string[] | null
}

interface LineItem {
  productId: string
  description: string
  quantity: string
}

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
  onSendToChat: (message: string) => void
  onOrderCreated?: (orderId: string, label: string) => void
  preselectedProduct?: { id: string; name: string } | null
}

function emptyLine(product?: { id: string; name: string } | null): LineItem {
  return { productId: product?.id || '', description: product?.name || '', quantity: '1' }
}

export default function CreateOrderDialog({ open, onClose, companyId, onSendToChat, onOrderCreated, preselectedProduct }: Props) {
  const [items, setItems] = useState<LineItem[]>([emptyLine(preselectedProduct)])
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: products } = useData(
    async () => {
      if (!open) return []
      const { data } = await supabase
        .from('products')
        .select('id, name, category, image_urls')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')
      return (data || []) as Product[]
    },
    [companyId, open],
    [],
  )

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item))
  }

  function handleProductChange(idx: number, productId: string) {
    const product = products.find(p => p.id === productId)
    updateItem(idx, {
      productId,
      description: product?.name || items[idx].description,
    })
  }

  function addItem() {
    setItems(prev => [...prev, emptyLine()])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }

  const validItems = items.filter(i => i.description.trim())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validItems.length === 0 || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const label = validItems.length === 1
        ? validItems[0].description.trim()
        : `${validItems[0].description.trim()} +${validItems.length - 1}`

      // 1. Create order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          company_id: companyId,
          supplier_name: supplier.trim() || null,
          status: 'draft',
          current_phase: 'sourcing',
          currency: 'USD',
          products: validItems.map(i => ({ name: i.description.trim(), quantity: parseInt(i.quantity) || 1 })),
        })
        .select('id')
        .single()

      if (orderErr) throw new Error(orderErr.message)

      // 2. Create order items
      const rows = validItems.map(i => ({
        order_id: order.id,
        company_id: companyId,
        product_id: i.productId || null,
        description: i.description.trim(),
        quantity: parseInt(i.quantity) || 1,
        current_phase: 'sourcing' as const,
        current_step: 'identify_need',
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(rows)
      if (itemsErr) throw new Error(itemsErr.message)

      // 3. Log event
      await supabase.from('order_events').insert({
        order_id: order.id,
        event_type: 'order_created',
        description: `Pedido creado via formulario: ${validItems.map(i => `${i.description.trim()} (x${parseInt(i.quantity) || 1})`).join(', ')}`,
        metadata: { source: 'form', item_count: validItems.length, notes: notes.trim() || null },
      })

      // 4. Notify agent
      const parts = [`Se creo el pedido ${order.id} desde el formulario con ${validItems.length} item(s).`]
      validItems.forEach(i => parts.push(`- ${i.description.trim()}: ${parseInt(i.quantity) || 1} un.`))
      if (supplier.trim()) parts.push(`Proveedor preferido: ${supplier.trim()}.`)
      if (notes.trim()) parts.push(`Notas: ${notes.trim()}.`)
      parts.push('Revisa el pedido y avanza al siguiente paso del workflow.')
      onSendToChat(parts.join('\n'))

      onOrderCreated?.(order.id, label)
      resetAndClose()
    } catch (err: any) {
      setError(err.message || 'Error creando el pedido')
      setSubmitting(false)
    }
  }

  function resetAndClose() {
    setItems([emptyLine()])
    setSupplier('')
    setNotes('')
    setSubmitting(false)
    setError(null)
    onClose()
  }

  return (
    <ShellDialog
      open={open}
      onClose={resetAndClose}
      title="Nuevo pedido de importacion"
      description="El pedido se crea al instante. El agente continuara el workflow."
      className="h-[80vh]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full gap-4">
        {/* Items list */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-border p-3 space-y-2 relative">
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="absolute top-2 right-2 p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Producto</label>
                <select
                  value={item.productId}
                  onChange={e => handleProductChange(idx, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Sin producto (describir abajo)</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.category ? ` — ${p.category}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-[1fr_100px] gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Descripcion {idx === 0 && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => updateItem(idx, { description: e.target.value })}
                    placeholder="Ej: Batas de bano talla L"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={e => updateItem(idx, { quantity: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
          >
            <PlusIcon className="w-3 h-3" /> Agregar otro item
          </button>
        </div>

        {/* Shared fields */}
        <div className="space-y-3 shrink-0">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Proveedor preferido</label>
            <input
              type="text"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              placeholder="Opcional — nombre o contacto"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Material, colores, requisitos especiales..."
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={validItems.length === 0 || submitting}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {submitting && <Loader2Icon className="w-3 h-3 animate-spin" />}
              Crear pedido ({validItems.length} item{validItems.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      </form>
    </ShellDialog>
  )
}
