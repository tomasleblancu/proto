import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@tleblancureta/proto/web'
import { XIcon, DownloadIcon, Loader2Icon, FileIcon } from 'lucide-react'
import { useData } from '@tleblancureta/proto/web'
import { useMountEffect } from '@tleblancureta/proto/web'

interface Props {
  doc: {
    id: string
    filename?: string | null
    storage_path?: string | null
  } | null
  onClose: () => void
}

export function DocPreviewModal({ doc, onClose }: Props) {
  const { data: url, loading, error: fetchError } = useData<string | null>(
    async (_signal) => {
      if (!doc) return null
      let path = doc.storage_path
      if (!path) {
        const { data } = await supabase
          .from('documents')
          .select('storage_path, filename')
          .eq('id', doc.id)
          .single()
        path = data?.storage_path || null
      }
      if (!path) throw new Error('Documento sin archivo asociado')
      // Legacy docs have local filesystem paths — can't preview those
      if (path.startsWith('/data/') || path.startsWith('/tmp/')) {
        throw new Error('Archivo no disponible — fue registrado antes de que el storage estuviera configurado.')
      }
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(path, 3600)
      if (error || !data?.signedUrl) throw new Error(error?.message || 'No se pudo generar URL')
      return data.signedUrl
    },
    [doc?.id, doc?.storage_path],
    null,
  )
  const error = fetchError?.message ?? null

  // Escape key — use refs so the mount-only listener always sees current props
  const docRef = useRef(doc)
  const onCloseRef = useRef(onClose)
  docRef.current = doc
  onCloseRef.current = onClose
  useMountEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && docRef.current) onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!doc) return null

  const filename = doc.filename || 'documento'
  const ext = (filename.split('.').pop() || '').toLowerCase()
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
  const isPdf = ext === 'pdf'

  async function handleDownload() {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{filename}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleDownload}
              disabled={!url}
              className="h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadIcon className="w-3.5 h-3.5" /> Descargar
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center justify-center"
              aria-label="Cerrar"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-muted/30 overflow-auto flex items-center justify-center">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2Icon className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          )}
          {error && <p className="text-sm text-destructive px-4">{error}</p>}
          {url && !loading && !error && (
            <>
              {isImage && <img src={url} alt={filename} className="max-w-full max-h-[80vh] object-contain" />}
              {isPdf && <iframe src={url} title={filename} className="w-full h-[80vh]" />}
              {!isImage && !isPdf && (
                <div className="text-center p-8">
                  <FileIcon className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Vista previa no disponible para este tipo de archivo</p>
                  <button
                    onClick={handleDownload}
                    className="h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                  >
                    <DownloadIcon className="w-3.5 h-3.5" /> Descargar archivo
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
