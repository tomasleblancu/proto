import { XIcon, SparklesIcon } from 'lucide-react'
import { Generative } from '../widgets/agent/Generative'
import type { WidgetInstance } from './types'

interface Props {
  spec: any
  title?: string
  widgets: WidgetInstance[]
  onDismiss?: () => void
  onSendToChat: (msg: string) => void
}

/**
 * Agent-generated focused view — replaces the normal widget grid while active.
 * Shows a minimized strip of the original widgets for context so the user can
 * see they're in a temporary view and not lost their layout.
 */
export function FocusView({ spec, title, widgets, onDismiss, onSendToChat }: Props) {
  return (
    <div className="p-2">
      {/* Minimized strip of original widgets */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-thin pb-1">
        <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">Widgets:</span>
        {widgets.map(w => (
          <span
            key={w.id}
            className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-card text-muted-foreground"
          >
            {w.title}
          </span>
        ))}
      </div>

      {/* Focused agent widget */}
      <div className="bg-card border border-primary/30 rounded-lg overflow-hidden flex flex-col shadow-lg shadow-primary/5">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="w-3 h-3 text-primary" />
            <span className="text-sm font-medium">{title || 'Vista generada'}</span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 -m-1 text-muted-foreground/40 hover:text-foreground transition-colors"
            aria-label="Cerrar vista"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
          <Generative spec={spec} onSendToChat={onSendToChat} />
        </div>
      </div>
    </div>
  )
}
