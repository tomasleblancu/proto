import { supabase } from '@proto/core-web'
import { useData } from '@proto/core-web'

const DOC_LABELS: Record<string, string> = {
  proforma_invoice: 'Proforma',
  commercial_invoice: 'Factura Comercial',
  packing_list: 'Packing List',
  bl: 'B/L',
  certificate_of_origin: 'Cert. Origen',
  din: 'DIN',
  insurance: 'Seguro',
  customs_release: 'Retiro Aduana',
  other: 'Otro',
}

interface Document {
  id: string
  order_id: string
  doc_type: string
  filename: string
  storage_path: string
  created_at: string
  orders?: { supplier_name: string; po_number: string | null }
}

interface Props {
  companyId: string
}

export default function Files({ companyId }: Props) {
  const { data: docs, loading } = useData<Document[]>(
    async (_signal) => {
      const { data } = await supabase
        .from('documents')
        .select('*, orders(supplier_name, po_number)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      return (data as Document[]) || []
    },
    [companyId],
    [],
  )

  async function handleDownload(doc: Document) {
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // Group by order
  const grouped = docs.reduce<Record<string, Document[]>>((acc, doc) => {
    (acc[doc.order_id] = acc[doc.order_id] || []).push(doc)
    return acc
  }, {})

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-sm font-medium text-neutral-400 mb-4">Documentos</h1>

        {loading ? (
          <p className="text-xs text-neutral-600">Cargando...</p>
        ) : docs.length === 0 ? (
          <div className="text-center py-16">
            <svg className="mx-auto mb-3 text-neutral-700" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm text-neutral-600">Sin documentos</p>
            <p className="text-xs text-neutral-700 mt-1">Los documentos subidos via chat apareceran aqui.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([orderId, orderDocs]) => {
              const order = orderDocs[0]?.orders
              return (
                <div key={orderId}>
                  <p className="text-xs text-neutral-500 mb-2">
                    {order?.supplier_name || 'Sin proveedor'}
                    {order?.po_number && <span className="text-neutral-600"> / OC {order.po_number}</span>}
                  </p>
                  <div className="bg-neutral-900 rounded-xl border border-neutral-800 divide-y divide-neutral-800">
                    {orderDocs.map(doc => (
                      <div key={doc.id} className="px-4 py-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-neutral-200 truncate">{doc.filename}</p>
                          <p className="text-xs text-neutral-600">
                            {DOC_LABELS[doc.doc_type] || doc.doc_type}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="text-xs text-emerald-500 hover:text-emerald-400 flex-shrink-0 ml-3"
                        >
                          Descargar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
