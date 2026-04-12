import { PlusIcon } from 'lucide-react'
import { Button } from '../ui/button.js'
import type { WidgetType } from './types.js'

interface CatalogEntry {
  type: WidgetType
  title: string
  icon: string
}

interface Props {
  onAddWidget: (type: WidgetType) => void
  widgetCatalog: CatalogEntry[]
}

export function EmptyState({ onAddWidget, widgetCatalog }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100%-40px)] text-center px-4">
      <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center mb-3">
        <PlusIcon className="w-5 h-5 text-muted-foreground/30" />
      </div>
      <p className="text-sm text-muted-foreground/60 mb-1">Shell vacio</p>
      <p className="text-xs text-muted-foreground/30 mb-4">Agrega widgets para ver tus datos.</p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {widgetCatalog.map(w => (
          <Button key={w.type} variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onAddWidget(w.type)}>
            <span>{w.icon}</span> {w.title}
          </Button>
        ))}
      </div>
    </div>
  )
}
