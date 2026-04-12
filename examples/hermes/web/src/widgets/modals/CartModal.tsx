import { useState } from 'react'
import { supabase } from 'proto/web'
import { ShellDialog } from 'proto/web'
import { MinusIcon, PlusIcon, TrashIcon, Loader2Icon } from 'lucide-react'
import type { CartItem } from '../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
  items: CartItem[]
  onUpdateQuantity: (productId: string, quantity: number) => void
  onRemove: (productId: string) => void
  onClear: () => void
  onSendToChat: (message: string) => void
  onOrderCreated?: (orderId: string, label: string) => void
}

export default function CartModal({ open, onClose, companyId, items, onUpdateQuantity, onRemove, onClear, onSendToChat, onOrderCreated }: Props) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateOrder() {
    if (items.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const label = items.length === 1
        ? items[0].name
        : `${items[0].name} +${items.length - 1}`

      // 1. Create order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          company_id: companyId,
          status: 'draft',
          current_phase: 'sourcing',
          currency: 'USD',
          products: items.map(i => ({ name: i.name, quantity: i.quantity })),
        })
        .select('id')
        .single()

      if (orderErr) throw new Error(orderErr.message)

      // 2. Create order items
      const itemRows = items.map(i => ({
        order_id: order.id,
        company_id: companyId,
        product_id: i.productId,
        description: i.name,
        quantity: i.quantity,
        current_phase: 'sourcing' as const,
        current_step: 'identify_need',
      }))

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(itemRows)

      if (itemsErr) throw new Error(itemsErr.message)

      // 3. Log event
      await supabase.from('order_events').insert({
        order_id: order.id,
        event_type: 'order_created',
        description: `Pedido creado desde carro: ${items.map(i => `${i.name} (x${i.quantity})`).join(', ')}`,
        metadata: { source: 'cart', item_count: items.length, notes: notes.trim() || null },
      })

      // 4. Notify agent
      const parts = [`Se creo el pedido ${order.id} desde el carro con ${items.length} item(s).`]
      items.forEach(i => parts.push(`- ${i.name}: ${i.quantity} un.`))
      if (notes.trim()) parts.push(`Notas: ${notes.trim()}.`)
      parts.push('Revisa el pedido y avanza al siguiente paso del workflow.')
      onSendToChat(parts.join('\n'))

      // 5. Navigate + clear
      onOrderCreated?.(order.id, label)
      onClear()
      setNotes('')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error creando el pedido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ShellDialog
      open={open}
      onClose={onClose}
      title={`Carro (${items.length})`}
      description={items.length > 0 ? 'Revisa los productos y crea el pedido.' : undefined}
      className="h-[70vh]"
    >
      {items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">El carro esta vacio</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Agrega productos desde el catalogo</p>
        </div>
      ) : (
        <div className="flex flex-col h-full gap-4">
          {/* Item list */}
          <div className="space-y-1 flex-1 overflow-y-auto scrollbar-thin min-h-0">
            {items.map(item => (
              <div key={item.productId} className="flex items-center gap-3 p-2 rounded-lg bg-accent/30">
                <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center overflow-hidden shrink-0">
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    : <span className="text-muted-foreground/30 text-sm">📦</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{item.name}</span>
                  {item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
                </div>

                {/* Quantity controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onUpdateQuantity(item.productId, Math.max(1, item.quantity - 1))}
                    className="w-6 h-6 rounded flex items-center justify-center border border-border hover:bg-accent transition-colors"
                  >
                    <MinusIcon className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (v > 0) onUpdateQuantity(item.productId, v)
                    }}
                    className="w-14 h-6 text-center text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                    className="w-6 h-6 rounded flex items-center justify-center border border-border hover:bg-accent transition-colors"
                  >
                    <PlusIcon className="w-3 h-3" />
                  </button>
                </div>

                <button
                  onClick={() => onRemove(item.productId)}
                  className="p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                  title="Quitar"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Notas para el pedido</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Proveedor preferido, requisitos especiales..."
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Vaciar carro
            </button>
            <button
              onClick={handleCreateOrder}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {submitting && <Loader2Icon className="w-3 h-3 animate-spin" />}
              Crear pedido
            </button>
          </div>
        </div>
      )}
    </ShellDialog>
  )
}
