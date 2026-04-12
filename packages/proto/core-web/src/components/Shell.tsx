import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { useMountEffect } from '../hooks/useMountEffect.js'
import { ResponsiveGridLayout, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { XIcon } from 'lucide-react'
import { loadShellState, saveShellState, clearShellState } from './shell/persistence.js'
import { Toolbar } from './shell/Toolbar.js'
import { FocusView } from './shell/FocusView.js'
import { EmptyState } from './shell/EmptyState.js'
import type { ActiveEntity, WidgetInstance, WidgetType } from './shell/types.js'
import type { ShellContext, WidgetRegistry } from '../lib/define-widget.js'

export type { WidgetType, ActiveEntity } from './shell/types.js'

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(800)
  useMountEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(ref.current)
    setWidth(ref.current.clientWidth)
    return () => observer.disconnect()
  })
  return width
}

export interface CockpitDefinition {
  widgets: WidgetInstance[]
  layouts: any
}

interface Props {
  // Widget registry + layouts (app-provided)
  widgets: WidgetRegistry
  defaultWidgets: WidgetInstance[]
  defaultLayouts: any
  /** Cockpit definitions keyed by activeEntity.type. */
  cockpits?: Record<string, CockpitDefinition>

  // Framework context fields
  companyId: string
  refreshKey: number
  onSendToChat: (message: string) => void
  agentView?: { spec: any; title?: string } | null
  onAgentDismiss?: () => void
  activeEntity?: ActiveEntity | null
  onActivateEntity?: (e: ActiveEntity) => void
  onDeactivateEntity?: () => void
  openEntities?: ActiveEntity[]
  onCloseTab?: (e: ActiveEntity) => void

  // Toolbar
  role?: string | null
  companies?: Array<{ id: string; name: string }>
  effectiveCompanyId?: string
  setCompanyId?: (id: string) => void
  onSignOut?: () => void
  userEmail?: string
  onOpenSettings?: () => void
  toolbarExtras?: ReactNode

  /** App-specific ShellContext fields — merged into the ctx passed to widget.render. */
  contextExtras?: Record<string, unknown>
  /** App-owned overlays (modals, floating buttons) rendered as Shell children. */
  overlays?: ReactNode
}

export default function Shell({
  widgets: widgetRegistry,
  defaultWidgets,
  defaultLayouts,
  cockpits,
  companyId, refreshKey, onSendToChat,
  agentView, onAgentDismiss,
  activeEntity, onActivateEntity, onDeactivateEntity,
  openEntities, onCloseTab,
  role, companies, effectiveCompanyId, setCompanyId, onSignOut, userEmail,
  onOpenSettings, toolbarExtras,
  contextExtras, overlays,
}: Props) {
  const focusMode = !!agentView
  const activeCockpit = activeEntity ? cockpits?.[activeEntity.type] : undefined
  const cockpitMode = !!activeCockpit && !focusMode

  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = useContainerWidth(containerRef)

  const [localRefresh, setLocalRefresh] = useState(0)
  const effectiveRefreshKey = refreshKey + localRefresh

  const saved = loadShellState()
  const [widgets, setWidgets] = useState<WidgetInstance[]>(saved?.widgets || defaultWidgets)
  const [layouts, setLayouts] = useState<any>(saved?.layouts || { ...defaultLayouts })

  const addWidget = useCallback((type: WidgetType) => {
    const id = `${type}-${Date.now()}`
    const def = widgetRegistry.get(type)
    const size = def?.defaultSize || { w: 3, h: 4, minW: 2, minH: 3 }
    const widget: WidgetInstance = { id, type, title: def?.title || type }

    setWidgets(prev => [...prev, widget])
    setLayouts((prev: any) => {
      const next = { ...prev, lg: [...(prev.lg || []), { i: id, x: 0, y: Infinity, ...size }] }
      return next
    })
  }, [widgetRegistry])

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id))
    setLayouts((prev: any) => ({
      ...prev,
      lg: (prev.lg || []).filter((l: any) => l.i !== id),
    }))
  }, [])

  const resetShell = useCallback(() => {
    clearShellState()
    setWidgets([...defaultWidgets])
    setLayouts({ ...defaultLayouts })
  }, [defaultWidgets, defaultLayouts])

  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets
  const layoutsRef = useRef(layouts)
  layoutsRef.current = layouts

  const persistState = useCallback(() => {
    saveShellState(widgetsRef.current, layoutsRef.current)
  }, [])

  const prevWidgetCount = useRef(widgets.length)
  if (widgets.length !== prevWidgetCount.current) {
    prevWidgetCount.current = widgets.length
    persistState()
  }

  function onLayoutChange(_layout: any, allLayouts: any) {
    setLayouts(allLayouts)
    saveShellState(widgetsRef.current, allLayouts)
  }

  const triggerLocalRefresh = useCallback(() => setLocalRefresh(k => k + 1), [])

  const shellCtx = useMemo<ShellContext>(() => ({
    companyId,
    refreshKey: effectiveRefreshKey,
    activeEntity: activeEntity || null,
    onSendToChat,
    onActivateEntity,
    onDeactivateEntity,
    onCloseTab,
    triggerLocalRefresh,
    ...(contextExtras || {}),
  } as ShellContext), [
    companyId, effectiveRefreshKey, activeEntity,
    onSendToChat, onActivateEntity, onDeactivateEntity, onCloseTab,
    triggerLocalRefresh, contextExtras,
  ])

  function renderWidget(widget: WidgetInstance) {
    const def = widgetRegistry.get(widget.type)
    if (!def) {
      return <p className="text-xs text-muted-foreground p-2">Widget "{widget.type}" not found.</p>
    }
    return def.render(widget, shellCtx)
  }

  const widgetCatalog = useMemo(
    () => Array.from(widgetRegistry.values())
      .filter(w => w.category === 'general')
      .map(w => ({ type: w.type, title: w.title, icon: w.icon || '▦' })),
    [widgetRegistry]
  )

  return (
    <div ref={containerRef} id="shell-root" className="h-full overflow-y-auto scrollbar-thin bg-background dotted-bg relative">
      <Toolbar
        widgetCount={widgets.length}
        cockpitMode={cockpitMode}
        activeEntity={activeEntity}
        onDeactivateEntity={onDeactivateEntity}
        onReset={resetShell}
        onAddWidget={addWidget}
        widgetCatalog={widgetCatalog}
        onOpenSettings={onOpenSettings}
        openEntities={openEntities}
        onSelectEntity={(e) => onActivateEntity?.(e)}
        onCloseTab={onCloseTab}
        role={role}
        companies={companies}
        effectiveCompanyId={effectiveCompanyId}
        setCompanyId={setCompanyId}
        onSignOut={onSignOut}
        userEmail={userEmail}
        rightActions={toolbarExtras}
      />

      {focusMode && agentView && (
        <FocusView
          spec={agentView.spec}
          title={agentView.title}
          widgets={widgets}
          onDismiss={onAgentDismiss}
          onSendToChat={onSendToChat}
        />
      )}

      {cockpitMode && activeCockpit && (
        <ResponsiveGridLayout
          className="p-2"
          width={containerWidth - 16}
          breakpoints={{ lg: 800, md: 600, sm: 0 }}
          cols={{ lg: 10, md: 6, sm: 4 }}
          rowHeight={60}
          layouts={activeCockpit.layouts}
          dragConfig={{ enabled: false, bounded: false }}
          resizeConfig={{ enabled: false }}
          margin={[8, 8]}
        >
          {activeCockpit.widgets.map(widget => (
            <div key={widget.id} className="bg-card border border-primary/20 rounded-lg overflow-hidden flex flex-col shadow-sm shadow-primary/5">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
                <span className="text-sm font-medium text-muted-foreground">{widget.title}</span>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 shell-content">
                {renderWidget(widget)}
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {!focusMode && widgets.length === 0 && !cockpitMode && (
        <EmptyState onAddWidget={addWidget} widgetCatalog={widgetCatalog} />
      )}

      {!focusMode && (
        <div className={cockpitMode ? 'hidden' : ''}>
          <ResponsiveGridLayout
            className="p-2"
            width={containerWidth - 16}
            breakpoints={{ lg: 800, md: 600, sm: 0 }}
            cols={{ lg: 10, md: 6, sm: 4 }}
            rowHeight={60}
            layouts={layouts}
            onLayoutChange={onLayoutChange}
            dragConfig={{ enabled: true, handle: '.widget-drag-handle', bounded: false }}
            margin={[8, 8]}
          >
            {widgets.map(widget => (
              <div key={widget.id} className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
                <div className="widget-drag-handle flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-card cursor-grab active:cursor-grabbing">
                  <span className="text-sm font-medium text-muted-foreground select-none">{widget.title}</span>
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="p-1 -m-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                    aria-label="Cerrar widget"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-2 shell-content">
                  {renderWidget(widget)}
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
        </div>
      )}

      {overlays}
    </div>
  )
}
