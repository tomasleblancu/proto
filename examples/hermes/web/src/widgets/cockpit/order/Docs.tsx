import { useState } from 'react'
import { supabase } from '@proto/core-web'
import { Skeleton } from '@proto/core-web'
import { cacheGet, cacheSet } from '@proto/core-web'
import { useData } from '@proto/core-web'
import { ReceiptIcon, CheckIcon, EyeIcon } from 'lucide-react'
import { BaseProps, DOC_CHECKLIST } from './shared'
import { DocPreviewModal } from '@/components/DocPreviewModal'

interface Doc {
  id: string
  kind: string | null
  doc_type: string | null
  filename: string | null
  storage_path?: string | null
  created_at: string
  receipt_document_id: string | null
  upload_status?: string
}

export function OrderDocsWidget({ orderId, refreshKey }: BaseProps) {
  const key = `order-docs:${orderId}`
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null)

  const { data: fetchedData } = useData(
    async () => {
      const [docsRes, paysRes] = await Promise.all([
        supabase
          .from('documents')
          .select('id, kind, doc_type, filename, storage_path, created_at, item_id, receipt_document_id, upload_status')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('id, linked_document_id, status, amount, currency')
          .eq('order_id', orderId),
      ])
      const rows = (docsRes.data || []) as Doc[]
      cacheSet(key, rows)
      return { docs: rows, payments: paysRes.data || [] }
    },
    [orderId, refreshKey, key],
    cacheGet<Doc[]>(key) ? { docs: cacheGet<Doc[]>(key)!, payments: [] as any[] } : null,
  )

  const docs = fetchedData?.docs ?? null
  const payments = fetchedData?.payments ?? []

  if (docs === null) return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${120 + (i % 3) * 40}px` }} />
        </div>
      ))}
      <Skeleton className="h-3 w-16 mt-2" />
    </div>
  )

  // Map legacy doc_type to modern kind
  const LEGACY_TO_KIND: Record<string, string> = {
    bl: 'bill_of_lading',
    proforma_invoice: 'proforma_invoice',
    commercial_invoice: 'commercial_invoice',
    packing_list: 'packing_list',
    certificate_of_origin: 'certificate_of_origin',
    din: 'din',
    insurance: 'insurance',
  }

  function resolveKind(d: Doc): string {
    if (d.kind) return d.kind
    if (d.doc_type) return LEGACY_TO_KIND[d.doc_type] || d.doc_type
    return 'other'
  }

  const byKind = new Map<string, any[]>()
  for (const d of docs) {
    const k = resolveKind(d)
    if (!byKind.has(k)) byKind.set(k, [])
    byKind.get(k)!.push(d)
  }

  // Docs no reconocidos en el checklist (excluye payment_receipt, que es auxiliar)
  const knownKinds = new Set(DOC_CHECKLIST.map(d => d.kind))
  const extras = docs.filter(d => {
    const k = resolveKind(d)
    return !knownKinds.has(k) && k !== 'payment_receipt'
  })

  // Tipos de doc que son facturas/pagables
  const PAYABLE_KINDS = new Set(['proforma_invoice', 'forwarder_invoice', 'customs_funds_provision', 'port_invoice', 'customs_agent_invoice'])
  function paymentStatus(doc: Doc): 'paid' | 'pending' | 'none' {
    if (!PAYABLE_KINDS.has(resolveKind(doc))) return 'none'
    const p = payments.find(pay => pay.linked_document_id === doc.id)
    if (!p) return 'pending'
    return p.status === 'paid' ? 'paid' : 'pending'
  }

  return (
    <div className="space-y-1.5">
      {DOC_CHECKLIST.map(row => {
        const matches = byKind.get(row.kind) || []
        const has = matches.length > 0
        const isPayable = PAYABLE_KINDS.has(row.kind)
        return (
          <div key={row.kind} className="space-y-0.5">
            <div className="flex items-center gap-2 text-[11px]">
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                has ? 'bg-emerald-600/20 text-emerald-500' : row.required ? 'border border-amber-500/50 text-amber-500' : 'border border-border text-muted-foreground/40'
              }`}>
                {has ? '✓' : row.required ? '!' : '·'}
              </div>
              <span className={`flex-1 truncate ${has ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                {row.label}
                {row.required && !has && <span className="text-amber-500/80 ml-1">*</span>}
              </span>
              {matches.length > 1 && (
                <span className="text-muted-foreground/50 shrink-0 text-[10px]">{matches.length}×</span>
              )}
              {has && !isPayable && (
                <button
                  onClick={() => setPreviewDoc(matches[0])}
                  className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent shrink-0"
                  aria-label="Previsualizar"
                  title="Previsualizar"
                >
                  <EyeIcon className="w-3 h-3" />
                </button>
              )}
            </div>
            {/* Si es un tipo pagable y hay matches, muestra una linea por cada con pago/receipt */}
            {isPayable && matches.map(doc => {
              const status = paymentStatus(doc)
              const hasReceipt = !!doc.receipt_document_id
              return (
                <div key={doc.id} className="flex items-center gap-1.5 pl-6 text-[10px] text-muted-foreground">
                  <span className="truncate flex-1">{doc.filename}</span>
                  {status === 'paid' && (
                    <span className="flex items-center gap-0.5 text-emerald-500">
                      <CheckIcon className="w-2.5 h-2.5" />pagado
                    </span>
                  )}
                  {status === 'pending' && (
                    <span className="text-amber-500">pendiente</span>
                  )}
                  {hasReceipt && (
                    <ReceiptIcon className="w-2.5 h-2.5 text-sky-500" aria-label="Con comprobante" />
                  )}
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent shrink-0"
                    aria-label="Previsualizar"
                    title="Previsualizar"
                  >
                    <EyeIcon className="w-2.5 h-2.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}

      {extras.length > 0 && (
        <div className="pt-1.5 mt-1.5 border-t border-border/40 space-y-1">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50">Otros</p>
          {extras.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-4 h-4 rounded flex items-center justify-center bg-muted/40 text-muted-foreground/60 shrink-0">·</span>
              <span className="flex-1 truncate text-muted-foreground/70">{d.filename || d.kind || d.doc_type}</span>
              <button
                onClick={() => setPreviewDoc(d)}
                className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent shrink-0"
                aria-label="Previsualizar"
                title="Previsualizar"
              >
                <EyeIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-1 text-[10px] text-muted-foreground/50">
        {docs.length} doc{docs.length === 1 ? '' : 's'} total
      </div>
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  )
}
