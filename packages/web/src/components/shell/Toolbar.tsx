import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusIcon, RotateCcwIcon, SunIcon, MoonIcon, MonitorIcon, UserIcon, LogOutIcon, Building2Icon, ChevronDownIcon, CheckIcon, XIcon, HomeIcon, SettingsIcon, ShoppingCartIcon, LayoutGridIcon } from 'lucide-react'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { WIDGET_CATALOG } from './catalog'
import type { ActiveEntity, WidgetType } from './types'

interface Props {
  widgetCount: number
  cockpitMode: boolean
  activeEntity: ActiveEntity | null | undefined
  onDeactivateEntity: (() => void) | undefined
  onReset: () => void
  onAddWidget: (type: WidgetType) => void
  onOpenSettings?: () => void
  onOpenCart?: () => void
  cartCount?: number
  editingLayout?: boolean
  onToggleEditLayout?: () => void
  openEntities?: ActiveEntity[]
  onSelectEntity?: (e: ActiveEntity) => void
  onCloseTab?: (e: ActiveEntity) => void
  role?: string | null
  companies?: Array<{ id: string; name: string }>
  effectiveCompanyId?: string
  setCompanyId?: (id: string) => void
  onSignOut?: () => void
  userEmail?: string
}

export function Toolbar({ widgetCount, cockpitMode, activeEntity, onDeactivateEntity, onReset, onAddWidget, onOpenSettings, onOpenCart, cartCount = 0, editingLayout, onToggleEditLayout, openEntities, onSelectEntity, onCloseTab, role, companies, effectiveCompanyId, setCompanyId, onSignOut, userEmail }: Props) {
  const [showCatalog, setShowCatalog] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showCompany, setShowCompany] = useState(false)
  const currentCompany = companies?.find(c => c.id === effectiveCompanyId)

  return (
    <div className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border px-3 py-1.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <button
          onClick={onDeactivateEntity}
          className={`p-1.5 rounded-md transition-colors shrink-0 ${!cockpitMode ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
          aria-label="Inicio"
          title="Inicio"
        >
          <HomeIcon className="w-3.5 h-3.5" />
        </button>
        {openEntities && openEntities.length > 0 ? (
          <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-thin">
            {openEntities.map(e => {
              const isActive = !!(cockpitMode && activeEntity && activeEntity.type === e.type && activeEntity.id === e.id)
              return (
                <div
                  key={`${e.type}-${e.id}`}
                  className={`group flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md border text-[11px] cursor-pointer transition-colors shrink-0 max-w-[200px] ${
                    isActive
                      ? 'bg-primary/10 border-primary/40 text-foreground'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                  onClick={() => onSelectEntity?.(e)}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
                  <span className="truncate">{e.label}</span>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onCloseTab?.(e) }}
                    className="p-0.5 rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-accent shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Cerrar tab"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground pl-1">{widgetCount} widgets</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onReset}>
          <RotateCcwIcon className="w-3 h-3" /> Reset
        </Button>
        {onToggleEditLayout && !cockpitMode && (
          <Button
            variant={editingLayout ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 text-xs gap-1 ${editingLayout ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={onToggleEditLayout}
          >
            {editingLayout ? <><CheckIcon className="w-3 h-3" /> Listo</> : <><LayoutGridIcon className="w-3 h-3" /> Editar</>}
          </Button>
        )}
        {role === 'admin' && companies && companies.length > 1 && setCompanyId && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 max-w-[180px]"
              onClick={() => setShowCompany(!showCompany)}
            >
              <Building2Icon className="w-3 h-3 shrink-0" />
              <span className="truncate">{currentCompany?.name || 'Empresa'}</span>
              <ChevronDownIcon className="w-3 h-3 shrink-0 opacity-60" />
            </Button>
            {showCompany && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowCompany(false)} />
                <div className="absolute right-0 top-8 bg-card border border-border rounded-lg shadow-lg p-1 z-30 w-60 max-h-80 overflow-y-auto scrollbar-thin">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">Empresas</div>
                  {companies.map(c => {
                    const active = c.id === effectiveCompanyId
                    return (
                      <button
                        key={c.id}
                        onClick={() => { setCompanyId(c.id); setShowCompany(false) }}
                        className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2 ${active ? 'bg-accent/50' : ''}`}
                      >
                        <Building2Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{c.name}</span>
                        {active && <CheckIcon className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {onOpenCart && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative" onClick={onOpenCart} aria-label="Carro" title="Carro">
            <ShoppingCartIcon className="w-3.5 h-3.5" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Button>
        )}
        <div className="relative">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowCatalog(!showCatalog)}>
            <PlusIcon className="w-3 h-3" /> Agregar
          </Button>
          {showCatalog && (
            <div className="absolute right-0 top-8 bg-card border border-border rounded-lg shadow-lg p-1 z-30 w-40">
              {WIDGET_CATALOG.map(w => (
                <button
                  key={w.type}
                  onClick={() => { onAddWidget(w.type); setShowCatalog(false) }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <span>{w.icon}</span> {w.title}
                </button>
              ))}
            </div>
          )}
        </div>
        {onSignOut && (
          <div className="relative ml-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowProfile(!showProfile)} aria-label="Perfil">
              <UserIcon className="w-3.5 h-3.5" />
            </Button>
            {showProfile && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowProfile(false)} />
                <div className="absolute right-0 top-8 bg-card border border-border rounded-lg shadow-lg p-1 z-30 w-48">
                  {userEmail && (
                    <div className="px-3 py-1.5 text-[11px] text-muted-foreground truncate border-b border-border/50 mb-1">{userEmail}</div>
                  )}
                  {onOpenSettings && (
                    <button
                      onClick={() => { setShowProfile(false); onOpenSettings() }}
                      className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      <SettingsIcon className="w-3.5 h-3.5" /> Configuracion
                    </button>
                  )}
                  <ThemeToggleRow />
                  <div className="border-t border-border/50 mt-1 pt-1">
                    <button
                      onClick={() => { setShowProfile(false); onSignOut() }}
                      className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      <LogOutIcon className="w-3.5 h-3.5" /> Salir
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ThemeToggleRow() {
  const { theme, setTheme } = useTheme()
  const next: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
  const Icon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : MonitorIcon
  const label = theme === 'dark' ? 'Oscuro' : theme === 'light' ? 'Claro' : 'Auto'

  return (
    <button
      onClick={() => setTheme(next[theme])}
      className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
    >
      <Icon className="w-3.5 h-3.5" /> Tema: {label}
    </button>
  )
}
