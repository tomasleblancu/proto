import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageSquareIcon, PackageIcon, FileTextIcon, SettingsIcon, LogOutIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Company { id: string; name: string }

interface Props {
  companies: Company[]
  activeCompanyId: string | null
  onSelectCompany: (id: string) => void
  role: 'admin' | 'client' | null
  onSignOut: () => void
  activeView: 'chat' | 'products' | 'files' | 'admin'
  onViewChange: (view: 'chat' | 'products' | 'files' | 'admin') => void
}

const NAV = [
  { id: 'chat' as const, label: 'Chat', icon: MessageSquareIcon },
  { id: 'products' as const, label: 'Productos', icon: PackageIcon },
  { id: 'files' as const, label: 'Archivos', icon: FileTextIcon },
  { id: 'admin' as const, label: 'Config', icon: SettingsIcon },
]

export default function Sidebar({ companies, activeCompanyId, onSelectCompany, role, onSignOut, activeView, onViewChange }: Props) {
  return (
    <div className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="bg-emerald-600 text-white text-xs font-bold">H</AvatarFallback>
          </Avatar>
          <span className="font-semibold text-sm text-sidebar-foreground">Hermes</span>
        </div>
      </div>

      <div className="px-2 py-2 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={activeView === id ? 'secondary' : 'ghost'}
            className={cn('w-full justify-start gap-2.5 text-sm', activeView !== id && 'text-sidebar-foreground/60')}
            onClick={() => onViewChange(id)}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Button>
        ))}
      </div>

      {role === 'admin' && companies.length > 0 && (
        <>
          <Separator />
          <ScrollArea className="flex-1 px-2 py-2">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-medium">
              Empresas
            </p>
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => onSelectCompany(c.id)}
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors',
                  c.id === activeCompanyId ? 'text-emerald-400' : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80'
                )}
              >
                {c.name}
              </button>
            ))}
          </ScrollArea>
        </>
      )}

      <div className="px-3 py-3 border-t border-sidebar-border mt-auto">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs text-sidebar-foreground/40" onClick={onSignOut}>
          <LogOutIcon className="w-3 h-3" />
          Cerrar sesion
        </Button>
      </div>
    </div>
  )
}
