import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useData } from '@/hooks/useData'
import { EyeIcon } from 'lucide-react'
import { DocPreviewModal } from '../DocPreviewModal'

const DOC_LABELS: Record<string, string> = {
  proforma_invoice: 'Proforma', commercial_invoice: 'Factura', packing_list: 'Packing',
  bl: 'B/L', certificate_of_origin: 'Cert. Origen', din: 'DIN',
  insurance: 'Seguro', customs_release: 'Retiro', other: 'Otro',
  customs_funds_provision: 'Provisión fondos', port_invoice: 'Factura puerto',
  customs_agent_invoice: 'Factura agente aduana', forwarder_invoice: 'Factura forwarder',
}

interface Props { companyId: string }

export default function DocsWidget({ companyId }: Props) {
  const [previewDoc, setPreviewDoc] = useState<any | null>(null)

  const { data: docs, loading } = useData(
    async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, filename, doc_type, storage_path, mime_type, created_at, orders(supplier_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(15)
      return data || []
    },
    [companyId],
    [],
  )

  if (loading) return <p className="text-xs text-muted-foreground">Cargando...</p>

  if (docs.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Sin documentos</p>

  return (
    <>
      <div className="space-y-1">
        {docs.map(doc => (
          <div key={doc.id} className="group flex items-center justify-between p-1.5 rounded hover:bg-accent/50">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium truncate">{doc.filename}</p>
              <p className="text-[9px] text-muted-foreground">{DOC_LABELS[doc.doc_type] || doc.doc_type}</p>
            </div>
            <button
              onClick={() => setPreviewDoc(doc)}
              className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              aria-label="Previsualizar"
              title="Previsualizar"
            >
              <EyeIcon className="w-3 h-3" />
            </button>
            <span className="text-[9px] text-muted-foreground/50 flex-shrink-0 ml-2">
              {new Date(doc.created_at).toLocaleDateString('es-CL')}
            </span>
          </div>
        ))}
      </div>
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  )
}
