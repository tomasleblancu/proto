import { useState } from 'react'
import { supabase } from 'proto/web'
import { Badge } from 'proto/web'
import { Skeleton } from 'proto/web'
import { Separator } from 'proto/web'
import { InlineEdit } from 'proto/web'
import { cacheGet, cacheSet } from 'proto/web'
import { useData } from 'proto/web'
import { Trash2Icon, Loader2Icon } from 'lucide-react'
import { BaseProps, PHASES, PHASE_LABELS, patchOrder } from './shared'

export function OrderHeaderWidget({ orderId, refreshKey, onDelete }: BaseProps) {
  const key = `order-header:${orderId}`
  const [optimistic, setOptimistic] = useState<Record<string, any> | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data: fetched } = useData(
    async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(id, description, current_phase, current_step, metadata), supplier:supplier_id(id, name, contact_name, contact_email)')
        .eq('id', orderId)
        .maybeSingle()
      if (data) cacheSet(key, data)
      setOptimistic(null)
      return data
    },
    [orderId, refreshKey, key],
    cacheGet<any>(key) ?? null,
  )

  const order = optimistic ? { ...fetched, ...optimistic } : fetched
  if (!order) return (
    <div className="space-y-3">
      <div>
        <Skeleton className="h-5 w-48 mb-1.5" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-14 rounded-full" />
        ))}
      </div>
      <Separator />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-2 w-12 mb-1.5" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )

  const products = Array.isArray(order.products) ? order.products : []
  const mainProduct = products[0] || order.order_items?.[0] || null
  const derivedTitle =
    mainProduct?.name ||
    mainProduct?.description ||
    order.order_items?.[0]?.description ||
    ''
  const title = order.title || derivedTitle || 'Pedido sin titulo'

  const saveField = async (patch: Record<string, any>) => {
    await patchOrder(orderId, patch)
    setOptimistic(prev => ({ ...prev, ...patch }))
  }

  async function handleDelete() {
    const isDraft = !order.current_phase || order.current_phase === 'sourcing'
    const warning = isDraft
      ? `Eliminar pedido "${title}"?`
      : `Este pedido esta en fase "${PHASE_LABELS[order.current_phase] || order.current_phase}". Eliminar "${title}"? Esta accion no se puede deshacer.`

    if (!confirm(warning)) return

    setDeleting(true)
    try {
      await supabase.from('order_events').delete().eq('order_id', orderId)
      await supabase.from('order_items').delete().eq('order_id', orderId)
      await supabase.from('orders').delete().eq('id', orderId)
      onDelete?.()
    } catch (e: any) {
      console.error('delete failed:', e)
      alert(`Error: ${e.message}`)
    } finally {
      setDeleting(false)
    }
  }

  const currentPhase: string =
    order.current_phase ||
    order.order_items?.[0]?.current_phase ||
    'sourcing'

  const currentIdx = PHASES.indexOf(currentPhase as any)

  return (
    <div className="space-y-3">
      {/* Title row */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <InlineEdit
            value={title}
            onSave={(v) => saveField({ title: v || null })}
            className="text-sm font-semibold min-w-0 flex-1"
            inputClassName="text-sm font-semibold w-full"
            placeholder="Pedido sin titulo"
          />
          {order.po_number && (
            <Badge variant="outline" className="text-[10px] font-mono shrink-0">{order.po_number}</Badge>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              title="Eliminar pedido"
            >
              {deleting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <Trash2Icon className="w-4 h-4" />}
            </button>
          )}
        </div>
        {mainProduct?.quantity && (
          <p className="text-[11px] text-muted-foreground">
            {mainProduct.quantity.toLocaleString()} unidades
            {order.total_amount && (
              <> · Total {order.currency || 'USD'} {Number(order.total_amount).toLocaleString()}</>
            )}
          </p>
        )}
      </div>

      {/* Phase timeline */}
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin pb-1">
        {PHASES.map((p, i) => {
          const done = i < currentIdx
          const active = i === currentIdx
          return (
            <div key={p} className="flex items-center gap-0.5 flex-shrink-0">
              <div
                className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${
                  active
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : done
                      ? 'bg-emerald-600/10 border-emerald-600/40 text-emerald-500'
                      : 'border-border text-muted-foreground/40'
                }`}
              >
                {PHASE_LABELS[p] || p}
              </div>
              {i < PHASES.length - 1 && (
                <div className={`w-1.5 h-px ${done ? 'bg-emerald-600/50' : 'bg-border'}`} />
              )}
            </div>
          )
        })}
      </div>

      <Separator />

      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-2">
        <EditableStat
          label="Proveedor"
          value={order.supplier?.name || (order.supplier_name && order.supplier_name !== 'Por definir' ? order.supplier_name : '')}
          onSave={async (v) => {
            const name = v.trim()
            if (!name) {
              await saveField({ supplier_id: null, supplier_name: 'Por definir' })
              return
            }
            // Buscar supplier existente por nombre (ilike) en la company del pedido
            const { data: match } = await supabase
              .from('suppliers')
              .select('id, name, contact_name, contact_email, contact_phone')
              .eq('company_id', order.company_id)
              .ilike('name', `%${name}%`)
              .limit(1)
              .maybeSingle()
            if (match) {
              const contact = [match.contact_name, match.contact_email, match.contact_phone].filter(Boolean).join(' | ')
              await patchOrder(orderId, { supplier_id: match.id, supplier_name: match.name, supplier_contact: contact || null })
              setOptimistic(prev => ({ ...prev, supplier_id: match.id, supplier_name: match.name, supplier_contact: contact || null, supplier: match }))
            } else {
              await saveField({ supplier_name: name })
            }
          }}
        />
        <EditableStat
          label="Incoterm"
          value={order.incoterm || ''}
          onSave={(v) => saveField({ incoterm: v || null })}
        />
        <EditableStat
          label="ETA"
          type="date"
          value={order.estimated_arrival || ''}
          onSave={(v) => saveField({ estimated_arrival: v || null })}
        />
      </div>
    </div>
  )
}

function EditableStat({
  label,
  value,
  onSave,
  type = 'text',
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'date' | 'number'
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">{label}</p>
      <div className="text-xs font-medium">
        <InlineEdit
          value={value}
          onSave={onSave}
          type={type}
          placeholder="—"
          inputClassName="text-xs font-medium w-full"
        />
      </div>
    </div>
  )
}
