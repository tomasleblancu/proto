import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShellDialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Dialog scoped to the shell (#shell-root) instead of the full viewport,
 * so the chat panel stays visible. Backdrop-blur + fade-in, shadcn vibes.
 */
export function ShellDialog({ open, onClose, title, description, children, className }: ShellDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById('shell-root'))
  }, [open])

  useEffect(() => {
    if (!open) { setMounted(false); return }
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !target) return null

  return createPortal(
    <div
      className={cn(
        'absolute inset-0 z-50 flex items-center justify-center p-6',
        'bg-background/60 backdrop-blur-sm transition-opacity duration-150',
        mounted ? 'opacity-100' : 'opacity-0'
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative bg-card border border-border rounded-lg shadow-lg',
          'w-full max-w-lg max-h-[90%] flex flex-col',
          'transition-all duration-150',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
          className
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-muted-foreground/60 hover:text-foreground"
          aria-label="Cerrar"
        >
          <XIcon className="w-4 h-4" />
        </button>
        {(title || description) && (
          <div className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        )}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>,
    target
  )
}
