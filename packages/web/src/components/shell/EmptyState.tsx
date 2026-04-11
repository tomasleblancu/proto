import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WIDGET_CATALOG } from './catalog'
import type { WidgetType } from './types'

export function EmptyState({ onAddWidget }: { onAddWidget: (type: WidgetType) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100%-40px)] text-center px-4">
      <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center mb-3">
        <PlusIcon className="w-5 h-5 text-muted-foreground/30" />
      </div>
      <p className="text-sm text-muted-foreground/60 mb-1">Shell vacio</p>
      <p className="text-xs text-muted-foreground/30 mb-4">Agrega widgets para ver tus pedidos, productos y mas.</p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {WIDGET_CATALOG.map(w => (
          <Button key={w.type} variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onAddWidget(w.type)}>
            <span>{w.icon}</span> {w.title}
          </Button>
        ))}
      </div>
    </div>
  )
}
