import { useState } from 'react'
import { supabase } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import { Separator } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { ShellDialog } from '@tleblancureta/proto/web'
import { InlineEdit } from '@tleblancureta/proto/web'
import { cacheGet, cacheSet } from '@tleblancureta/proto/web'
import { useData } from '@tleblancureta/proto/web'
import { PencilIcon } from 'lucide-react'
import { BaseProps, patchOrder } from './shared'

async function patchItem(itemId: string, patch: Record<string, any>) {
  const { error } = await supabase.from('order_items').update(patch).eq('id', itemId)
  if (error) throw error
}

// ── Item Edit Modal ──

interface ItemForm {
  quantity: string
  unit_price: string
  cbm_unit: string
  weight_unit_kg: string
  target_unit_price: string
  target_currency: string
  description: string
}

function EditItemModal({ item, currency, open, onClose, onSaved }: {
  item: any; currency: string; open: boolean; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<ItemForm>({
    quantity: String(item.quantity || ''),
    unit_price: String(item.unit_price ?? ''),
    cbm_unit: String(item.cbm_unit ?? ''),
    weight_unit_kg: String(item.weight_unit_kg ?? ''),
    target_unit_price: String(item.target_unit_price ?? ''),
    target_currency: item.target_currency || 'CLP',
    description: item.description || '',
  })
  const [saving, setSaving] = useState(false)

  const label = item.products?.name || item.description || item.sku || 'Item'

  const set = (field: keyof ItemForm, value: string) => setForm(f => ({ ...f, [field]: value }))

  async function handleSave() {
    setSaving(true)
    try {
      await patchItem(item.id, {
        quantity: parseInt(form.quantity) || 1,
        unit_price: parseFloat(form.unit_price) || null,
        cbm_unit: parseFloat(form.cbm_unit) || null,
        weight_unit_kg: parseFloat(form.weight_unit_kg) || null,
        target_unit_price: parseFloat(form.target_unit_price) || null,
        target_currency: form.target_currency || 'CLP',
        description: form.description || null,
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ShellDialog open={open} onClose={onClose} title={label} className="max-w-sm">
      <div className="space-y-3">
        <Field label="Descripcion">
          <Input value={form.description} onChange={e => set('description', e.target.value)} className="text-sm" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad">
            <Input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} className="text-sm font-mono" />
          </Field>
          <Field label={`Precio unitario (${currency})`}>
            <Input type="number" step="0.01" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} className="text-sm font-mono" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CBM unitario (m³/u)">
            <Input type="number" step="0.0001" value={form.cbm_unit} onChange={e => set('cbm_unit', e.target.value)} className="text-sm font-mono" />
          </Field>
          <Field label="Peso unitario (kg/u)">
            <Input type="number" step="0.01" value={form.weight_unit_kg} onChange={e => set('weight_unit_kg', e.target.value)} className="text-sm font-mono" />
          </Field>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Precio target (${form.target_currency})`}>
            <Input type="number" step="1" value={form.target_unit_price} onChange={e => set('target_unit_price', e.target.value)} className="text-sm font-mono" />
          </Field>
          <Field label="Moneda target">
            <select
              value={form.target_currency}
              onChange={e => set('target_currency', e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
            {saving ? '...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </ShellDialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

// ── Main Widget ──

export function OrderSupplierWidget({ orderId, refreshKey }: BaseProps) {
  const key = `order-supplier:${orderId}`
  const [reloadKey, setReloadKey] = useState(0)
  const [editingItem, setEditingItem] = useState<any>(null)

  const { data } = useData(
    async () => {
      const [ord, items] = await Promise.all([
        supabase
          .from('orders')
          .select('supplier_name, supplier_contact, payment_terms, incoterm, currency, total_amount, supplier_id, supplier:supplier_id(id, name, contact_name, contact_email, contact_phone, country_code)')
          .eq('id', orderId)
          .maybeSingle(),
        supabase
          .from('order_items')
          .select('id, description, quantity, unit_price, currency, supplier_id, product_id, sku, cbm_unit, weight_unit_kg, target_unit_price, target_currency, products(name), supplier:supplier_id(id, name, country_code)')
          .eq('order_id', orderId),
      ])
      const payload = { order: ord.data, items: items.data || [] }
      cacheSet(key, payload)
      return payload
    },
    [orderId, refreshKey, reloadKey, key],
    cacheGet<any>(key) ?? null,
  )

  if (!data) return (
    <div className="space-y-3">
      <div>
        <Skeleton className="h-4 w-36 mb-1" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="space-y-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <Separator />
      <div className="space-y-1">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )

  const { order, items } = data
  if (!order) return <p className="text-xs text-muted-foreground">Pedido no encontrado.</p>

  const reload = () => setReloadKey(k => k + 1)

  // Agrupar items por supplier
  const mainSupplier = order.supplier || (order.supplier_name && order.supplier_name !== 'Por definir'
    ? { id: order.supplier_id, name: order.supplier_name }
    : null)

  const groups = new Map<string, { supplier: any; items: any[] }>()
  for (const it of items as any[]) {
    const sup = it.supplier || mainSupplier
    if (!sup) continue
    const k = sup.id || sup.name
    if (!groups.has(k)) groups.set(k, { supplier: sup, items: [] })
    groups.get(k)!.items.push(it)
  }
  if (mainSupplier && groups.size === 0) {
    groups.set(mainSupplier.id || mainSupplier.name, { supplier: mainSupplier, items: [] })
  }

  if (groups.size === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground mb-1">Sin proveedor asignado</p>
        <p className="text-[10px] text-muted-foreground/60">El agente asignara uno durante sourcing.</p>
      </div>
    )
  }

  const isMulti = groups.size > 1

  return (
    <div className="space-y-3">
      {isMulti && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
          Pedido consolidado · {groups.size} proveedores · 1 BL
        </div>
      )}

      {Array.from(groups.values()).map((g, idx) => {
        const sup = g.supplier
        const contact = [sup.contact_name, sup.contact_email, sup.contact_phone].filter(Boolean).join(' · ')
        const subtotal = g.items.reduce((s: number, it: any) => s + (Number(it.unit_price) || 0) * (it.quantity || 0), 0)
        return (
          <div key={sup.id || sup.name || idx} className={isMulti ? 'border border-border/60 rounded-lg p-2 space-y-2' : 'space-y-2'}>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate flex-1">{sup.name}</p>
                {sup.country_code && (
                  <Badge variant="outline" className="text-[9px]">{sup.country_code}</Badge>
                )}
              </div>
              {contact && <p className="text-[11px] text-muted-foreground truncate">{contact}</p>}
            </div>

            {g.items.length > 0 && (
              <div className="space-y-0.5 text-[11px]">
                {g.items.map((it: any) => {
                  const label = it.products?.name || it.description || it.sku || 'Item'
                  const unitPrice = Number(it.unit_price) || 0
                  const line = unitPrice * (it.quantity || 0)
                  const cur = it.currency || order.currency || 'USD'
                  return (
                    <div
                      key={it.id}
                      className="group flex justify-between gap-2 py-0.5 rounded-sm hover:bg-accent/30 px-1 -mx-1 cursor-pointer transition-colors"
                      onClick={() => setEditingItem(it)}
                    >
                      <span className="truncate text-foreground/80">
                        {it.quantity?.toLocaleString() || 1}× {label}
                        {unitPrice > 0 && (
                          <span className="text-muted-foreground/50 ml-1">
                            @{cur} {unitPrice.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/u
                          </span>
                        )}
                        {Number(it.cbm_unit) > 0 && (
                          <span className="text-muted-foreground/40 ml-1">
                            · {Number(it.cbm_unit).toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} m³/u
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {line > 0 && (
                          <span className="font-mono text-muted-foreground">
                            {cur} {line.toLocaleString()}
                          </span>
                        )}
                        <PencilIcon className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </div>
                  )
                })}
                {isMulti && subtotal > 0 && (
                  <div className="flex justify-between gap-2 pt-1 border-t border-border/40 mt-1">
                    <span className="text-muted-foreground/60">Subtotal</span>
                    <span className="font-mono font-medium">
                      {order.currency || 'USD'} {subtotal.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <Separator />

      <div className="space-y-1 text-[11px]">
        <EditableRow label="Pago" value={order.payment_terms || ''} onSave={v => patchOrder(orderId, { payment_terms: v || null }).then(reload)} />
        <EditableRow label="Incoterm" value={order.incoterm || ''} onSave={v => patchOrder(orderId, { incoterm: v || null }).then(reload)} />
        {order.total_amount && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground/60">Total</span>
            <span className="text-foreground truncate">{order.currency || 'USD'} {Number(order.total_amount).toLocaleString()}</span>
          </div>
        )}
      </div>

      {editingItem && (
        <EditItemModal
          key={editingItem.id}
          item={editingItem}
          currency={order.currency || 'USD'}
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function EditableRow({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => Promise<void> }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground/60">{label}</span>
      <InlineEdit
        value={value}
        onSave={onSave}
        placeholder="—"
        className="text-[11px] text-foreground"
        inputClassName="text-[11px] w-24"
      />
    </div>
  )
}
