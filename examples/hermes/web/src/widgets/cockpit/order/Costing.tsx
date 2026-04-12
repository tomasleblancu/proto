import { useState } from 'react'
import { supabase } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import { InlineEdit } from '@tleblancureta/proto/web'
import { cacheGet, cacheSet } from '@tleblancureta/proto/web'
import { useData } from '@tleblancureta/proto/web'
import {
  computeEstimated as computeEstimatedShared,
  computeActualFromPayments,
  mergeActual,
  type CostingDefault as SharedCostingDefault,
  type PaymentRow,
} from '@app/shared/index.js'
import { BaseProps } from './shared'

// ── Types ──

interface CostingDefault {
  key: string
  value: number
  unit: string
  currency: string
  category: string
  qty_type: string
  minimum: number
}

interface OrderData {
  cbm: number | null
  weight_kg: number | null
  total_amount: number | null
  currency: string | null
  incoterm: string | null
  country_origin: string | null
  supplier_id: string | null
}

interface OrderItem {
  id: string
  description: string | null
  sku: string | null
  quantity: number
  unit_price: number
  cbm_unit: number | null
  weight_unit_kg: number | null
  target_unit_price: number | null
  target_currency: string | null
  products: { name: string }[] | null
}

interface CostingRow {
  id: string
  item_id: string | null
  currency: string
  fx_rate: number | null
  estimated: Record<string, number>
  actual: Record<string, number>
  notes: string | null
}

interface WidgetData {
  order: OrderData | null
  items: OrderItem[]
  defaults: CostingDefault[]
  costing: CostingRow | null
  payments: PaymentRow[]
  samples_cost: number
}

// ── Labels & order ──

const FIELD_LABELS: Record<string, string> = {
  fob: 'FOB',
  freight: 'Flete',
  insurance: 'Seguro',
  deconsolidation: 'Desconsol.',
  port: 'Puerto',
  duties: 'Arancel',
  customs_agent: 'Honorarios ag.',
  transport: 'Transporte',
  samples: 'Muestras',
  other: 'Otros',
  landed_total: 'Landed total',
  iva: 'IVA (ref.)',
}

// Grouped display: each group shows as one row with a summed value,
// expandable to show individual fields on click.
interface FieldGroup {
  label: string
  fields: string[]
  // If true, render as a standalone row (not grouped)
  standalone?: boolean
  // Visual flags
  isTotal?: boolean
  isDashed?: boolean
}

const FIELD_GROUPS: FieldGroup[] = [
  { label: 'FOB', fields: ['fob'], standalone: true },
  { label: 'Logistica', fields: ['freight', 'insurance', 'deconsolidation', 'port'] },
  { label: 'Aduana', fields: ['duties', 'customs_agent'] },
  { label: 'Destino', fields: ['transport', 'samples', 'other'] },
  { label: 'Landed total', fields: ['landed_total'], standalone: true, isTotal: true },
  { label: 'IVA (ref.)', fields: ['iva'], standalone: true, isDashed: true },
]

// ── Helpers ──

function fmt(val: number | undefined, currency: string): string {
  if (val === undefined || val === null) return '-'
  return `${currency} ${val.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function computeEstimated(
  items: OrderItem[],
  defaults: CostingDefault[],
  _order: OrderData | null,
  samplesCost: number,
): Record<string, number> {
  const sharedItems = items.map(it => ({
    quantity: it.quantity || 0,
    unit_price: Number(it.unit_price) || 0,
    cbm_unit: it.cbm_unit != null ? Number(it.cbm_unit) : null,
  }))
  const sharedDefaults: SharedCostingDefault[] = defaults.map(d => ({
    key: d.key,
    value: d.value,
    unit: d.unit,
    qty_type: d.qty_type,
    minimum: d.minimum,
  }))
  const hasTlc = true // TODO: derive from country_origin
  return computeEstimatedShared(sharedItems, sharedDefaults, hasTlc, samplesCost) as Record<string, number>
}

// ── Rendering ──

function DeltaBadge({ val, currency }: { val: number; currency: string }) {
  if (val === 0) return <span className="text-muted-foreground/40">-</span>
  const positive = val > 0
  return (
    <span className={`font-mono text-[10px] ${positive ? 'text-red-500' : 'text-emerald-500'}`}>
      {positive ? '+' : ''}{fmt(val, currency)}
    </span>
  )
}

function sumFields(fields: string[], data: Record<string, number>): number | undefined {
  let total = 0
  let found = false
  for (const f of fields) {
    if (data[f] !== undefined) { total += data[f]; found = true }
  }
  return found ? total : undefined
}

function CostingRow({ label, est, act, currency, hasActual, isTotal, isDashed, indent }: {
  label: string; est: number | undefined; act: number | undefined; currency: string
  hasActual: boolean; isTotal?: boolean; isDashed?: boolean; indent?: boolean
}) {
  const delta = (act ?? 0) - (est ?? 0)
  return (
    <div className={`grid ${hasActual ? 'grid-cols-4' : 'grid-cols-2'} gap-1 py-0.5 ${isTotal ? 'border-t border-border/40 mt-1 pt-1 font-medium' : ''} ${isDashed ? 'border-t border-dashed border-border/30 mt-1 pt-1 opacity-50' : ''}`}>
      <span className={`${indent ? 'pl-2 text-muted-foreground/60' : 'text-muted-foreground'} ${isTotal ? 'text-foreground' : ''}`}>
        {label}
      </span>
      <span className="text-right font-mono">
        {est !== undefined ? fmt(est, currency) : <span className="text-muted-foreground/40">-</span>}
      </span>
      {hasActual && (
        <span className="text-right font-mono">
          {act !== undefined ? fmt(act, currency) : <span className="text-muted-foreground/40">-</span>}
        </span>
      )}
      {hasActual && (
        <span className="text-right">
          {(est !== undefined && act !== undefined)
            ? <DeltaBadge val={delta} currency={currency} />
            : <span className="text-muted-foreground/40">-</span>
          }
        </span>
      )}
    </div>
  )
}

function CostingTable({ estimated, actual, currency }: { estimated: Record<string, number>; actual: Record<string, number>; currency: string }) {
  const hasActual = Object.keys(actual).length > 0
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  // Filter to groups that have at least one field with data
  const visibleGroups = FIELD_GROUPS.filter(g =>
    g.fields.some(f => estimated[f] !== undefined || actual[f] !== undefined)
  )

  if (visibleGroups.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60 text-center py-2">Sin datos suficientes para estimar.</p>
  }

  const toggle = (label: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })

  return (
    <div className="text-[11px]">
      <div className={`grid ${hasActual ? 'grid-cols-4' : 'grid-cols-2'} gap-1 pb-1 border-b border-border/40 text-[10px] text-muted-foreground/60 font-medium`}>
        <span />
        <span className="text-right">Estimado</span>
        {hasActual && <span className="text-right">Real</span>}
        {hasActual && <span className="text-right">Delta</span>}
      </div>
      {visibleGroups.map(group => {
        const activeFields = group.fields.filter(f => estimated[f] !== undefined || actual[f] !== undefined)

        // Standalone: single field, render directly
        if (group.standalone || activeFields.length === 1) {
          const f = activeFields[0]
          return (
            <CostingRow
              key={group.label}
              label={group.label}
              est={estimated[f]}
              act={actual[f]}
              currency={currency}
              hasActual={hasActual}
              isTotal={group.isTotal}
              isDashed={group.isDashed}
            />
          )
        }

        // Multi-field group: show summed row, expandable
        const isOpen = expanded.has(group.label)
        const estSum = sumFields(activeFields, estimated)
        const actSum = sumFields(activeFields, actual)

        return (
          <div key={group.label}>
            <div
              className="cursor-pointer hover:bg-accent/30 rounded-sm transition-colors -mx-1 px-1"
              onClick={() => toggle(group.label)}
            >
              <div className={`grid ${hasActual ? 'grid-cols-4' : 'grid-cols-2'} gap-1 py-0.5`}>
                <span className="text-muted-foreground flex items-center gap-1">
                  <svg className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 6 10" fill="currentColor"><path d="M0 0l6 5-6 5z" /></svg>
                  {group.label}
                </span>
                <span className="text-right font-mono">
                  {estSum !== undefined ? fmt(estSum, currency) : <span className="text-muted-foreground/40">-</span>}
                </span>
                {hasActual && (
                  <span className="text-right font-mono">
                    {actSum !== undefined ? fmt(actSum, currency) : <span className="text-muted-foreground/40">-</span>}
                  </span>
                )}
                {hasActual && (
                  <span className="text-right">
                    {(estSum !== undefined && actSum !== undefined)
                      ? <DeltaBadge val={actSum - estSum} currency={currency} />
                      : <span className="text-muted-foreground/40">-</span>
                    }
                  </span>
                )}
              </div>
            </div>
            {isOpen && activeFields.map(f => (
              <CostingRow
                key={f}
                label={FIELD_LABELS[f] || f}
                est={estimated[f]}
                act={actual[f]}
                currency={currency}
                hasActual={hasActual}
                indent
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Main widget ──

async function patchItem(itemId: string, patch: Record<string, any>) {
  const { error } = await supabase.from('order_items').update(patch).eq('id', itemId)
  if (error) throw error
}


export function OrderCostingWidget({ orderId, refreshKey }: BaseProps) {
  const key = `order-costing:${orderId}`
  const [reloadKey, setReloadKey] = useState(0)

  const { data } = useData(
    async () => {
      const [orderRes, itemsRes, defaultsRes, costingRes, paymentsRes, samplesRes] = await Promise.all([
        supabase.from('orders').select('cbm, weight_kg, total_amount, currency, incoterm, country_origin, supplier_id').eq('id', orderId).maybeSingle(),
        supabase.from('order_items').select('id, description, sku, quantity, unit_price, cbm_unit, weight_unit_kg, target_unit_price, target_currency, products(name)').eq('order_id', orderId),
        supabase.from('costing_defaults').select('key, value, unit, currency, category, qty_type, minimum').order('sort_order'),
        supabase.from('costings').select('*').eq('order_id', orderId).is('item_id', null).maybeSingle(),
        supabase.from('payments').select('type, amount, currency, status').eq('order_id', orderId),
        supabase.from('samples').select('cost').eq('order_id', orderId),
      ])
      const samplesCost = (samplesRes.data || []).reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0)
      const payload: WidgetData = {
        order: orderRes.data as OrderData | null,
        items: (itemsRes.data || []) as OrderItem[],
        defaults: (defaultsRes.data || []) as CostingDefault[],
        costing: costingRes.data as CostingRow | null,
        payments: (paymentsRes.data || []) as PaymentRow[],
        samples_cost: samplesCost,
      }
      cacheSet(key, payload)
      return payload
    },
    [orderId, refreshKey, reloadKey, key],
    cacheGet<WidgetData>(key) ?? null,
  )

  if (!data) return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-3" style={{ width: `${80 + (i % 3) * 20}px` }} />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
      <Skeleton className="h-px w-full" />
      <div className="flex justify-between">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  )

  const { order, items, defaults, costing, payments, samples_cost } = data
  const currency = 'USD'

  // Compute estimated dynamically
  const estimated = computeEstimated(items, defaults, order, samples_cost)
  // Compute actual from payments, merge with persisted overrides (invoice breakdowns)
  const fromPayments = computeActualFromPayments(payments, currency, costing?.fx_rate ?? null)
  const persisted = (costing?.actual || {}) as Record<string, number>
  const actual = mergeActual(fromPayments, persisted) as Record<string, number>

  if (Object.keys(estimated).length === 0 && Object.keys(actual).length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground mb-1">Sin datos para costeo</p>
        <p className="text-[10px] text-muted-foreground/60">
          Agrega items al pedido y CBM para ver el estimado.
        </p>
      </div>
    )
  }

  const cbmTotal = items.reduce((s, it) => s + (Number(it.cbm_unit) || 0) * (it.quantity || 0), 0)
  const weightTotal = items.reduce((s, it) => s + (Number(it.weight_unit_kg) || 0) * (it.quantity || 0), 0)
  const itemsSinCbm = items.filter(it => !it.cbm_unit)

  return (
    <div className="space-y-3">
      <CostingTable estimated={estimated} actual={actual} currency={currency} />
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/50">
        {cbmTotal > 0 && (
          <span>
            {cbmTotal.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m³
            {weightTotal > 0 && ` · ${weightTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })} kg`}
          </span>
        )}
        <span className="inline-flex items-center gap-0.5">
          USD→CLP:
          <InlineEdit
            value={data.costing?.fx_rate != null ? String(data.costing.fx_rate) : ''}
            onSave={async (v) => {
              const fx = parseFloat(v) || null
              if (data.costing?.id) {
                await supabase.from('costings').update({ fx_rate: fx }).eq('id', data.costing.id)
              }
              setReloadKey(k => k + 1)
            }}
            type="number"
            placeholder="900"
            className="text-[10px]"
            inputClassName="text-[10px] w-16 font-mono"
          />
        </span>
      </div>
      {itemsSinCbm.length > 0 && (
        <p className="text-[10px] text-amber-500">
          {itemsSinCbm.length === items.length
            ? 'Sin CBM — flete y puerto usan minimos. Carga el volumen unitario en cada item.'
            : `${itemsSinCbm.length} item${itemsSinCbm.length > 1 ? 's' : ''} sin CBM unitario.`}
        </p>
      )}

      {/* Prorrateo por item */}
      {estimated.landed_total > 0 && (() => {
        const totalFob = estimated.fob || 0
        if (!totalFob) return null

        const cols = 'grid-cols-7'

        return (
          <div className="border-t border-border/30 pt-2 mt-2">
            <p className="text-[10px] text-muted-foreground/50 mb-1.5">Prorrateo por item (est.)</p>
            <div className="text-[11px] space-y-1">
              <div className={`grid ${cols} gap-1 text-[10px] text-muted-foreground/60 font-medium pb-0.5`}>
                <span className="col-span-2" />
                <span className="text-right">FOB/u</span>
                <span className="text-right">Landed/u</span>
                <span className="text-right">Factor</span>
                <span className="text-right">Target</span>
                <span className="text-right">Margen</span>
              </div>
              {items.map(it => {
                const label = it.products?.[0]?.name || it.description || it.sku || 'Item'
                const unitPrice = Number(it.unit_price) || 0
                const lineFob = unitPrice * (it.quantity || 0)
                const share = lineFob / totalFob
                const itemLanded = estimated.landed_total * share
                const landedPerUnit = it.quantity ? itemLanded / it.quantity : 0
                const factor = unitPrice ? landedPerUnit / unitPrice : 0

                const targetPrice = it.target_unit_price != null ? Number(it.target_unit_price) : null
                const targetCur = it.target_currency || 'CLP'
                // Margen: necesitamos landed en misma moneda que target
                // Si target es CLP y landed es USD, usamos fx_rate del costing
                let marginPct: number | null = null
                if (targetPrice != null && targetPrice > 0 && landedPerUnit > 0) {
                  let landedInTargetCur = landedPerUnit
                  if (targetCur === 'CLP' && currency === 'USD') {
                    const fx = data.costing?.fx_rate || 900
                    landedInTargetCur = landedPerUnit * fx
                  }
                  marginPct = ((targetPrice - landedInTargetCur) / targetPrice) * 100
                }

                return (
                  <div key={it.id} className={`grid ${cols} gap-1`}>
                    <span className="col-span-2 truncate text-foreground/80">
                      {it.quantity}× {label}
                    </span>
                    <span className="text-right font-mono">{fmt(unitPrice, currency)}</span>
                    <span className="text-right font-mono font-medium">{fmt(landedPerUnit, currency)}</span>
                    <span className="text-right font-mono text-muted-foreground">{factor.toFixed(2)}×</span>
                    <span className="text-right font-mono">
                      <InlineEdit
                        value={targetPrice != null ? String(targetPrice) : ''}
                        onSave={async (v) => {
                          await patchItem(it.id, { target_unit_price: parseFloat(v) || null })
                          setReloadKey(k => k + 1)
                        }}
                        type="number"
                        placeholder="—"
                        className="text-[11px] justify-end"
                        inputClassName="text-[11px] w-20 font-mono text-right"
                      />
                    </span>
                    <span className={`text-right font-mono font-medium ${marginPct != null ? (marginPct >= 0 ? 'text-emerald-500' : 'text-red-500') : ''}`}>
                      {marginPct != null ? `${marginPct.toFixed(1)}%` : <span className="text-muted-foreground/40">-</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// Modal removed — actual costs are now derived from payments
