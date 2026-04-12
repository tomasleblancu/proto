import { Badge } from 'proto/web'
import type { DragContext } from 'proto/web'
import { PackageIcon, BoxIcon, UserIcon } from 'lucide-react'

const ICONS: Record<string, typeof PackageIcon> = {
  order: PackageIcon,
  product: BoxIcon,
  profile: UserIcon,
}

const TYPE_LABELS: Record<string, string> = {
  order: 'Pedido',
  product: 'Producto',
  profile: 'Perfil',
}

interface Props {
  context: DragContext
}

export default function ChatContext({ context }: Props) {
  const Icon = ICONS[context.type] || PackageIcon

  return (
    <div className="flex justify-end">
      <div className="bg-emerald-600/10 border border-emerald-600/20 rounded-xl px-3 py-2 max-w-[80%] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{context.label}</p>
          <p className="text-[10px] text-emerald-400/70">{TYPE_LABELS[context.type]}</p>
        </div>
        {context.meta && (
          <Badge variant="outline" className="text-[9px] h-4 flex-shrink-0 border-emerald-600/30 text-emerald-400/60">
            {context.meta}
          </Badge>
        )}
      </div>
    </div>
  )
}
