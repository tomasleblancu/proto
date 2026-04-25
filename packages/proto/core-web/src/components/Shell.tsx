import { useState, useCallback, useRef, useMemo, useEffect, memo, type ReactNode } from 'react'
import { useMountEffect } from '../hooks/useMountEffect.js'
import { ResponsiveGridLayout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { XIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react'
import { loadShellState, saveShellState, clearShellState, loadCockpitLayout, saveCockpitLayout, clearCockpitLayout } from './shell/persistence.js'
import { Toolbar } from './shell/Toolbar.js'
import { FocusView } from './shell/FocusView.js'
import { EmptyState } from './shell/EmptyState.js'
import { CommandPalette, type CommandItem } from './CommandPalette.js'
import { useCommandPalette } from '../hooks/useCommandPalette.js'
import { WidgetErrorBoundary } from './shell/WidgetErrorBoundary.js'
import type { ActiveEntity, GridLayouts, LayoutItem, WidgetInstance, WidgetType } from './shell/types.js'
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
  layouts: GridLayouts
}

interface Props {
  // Widget registry + layouts (app-provided)
  widgets: WidgetRegistry
  defaultWidgets: WidgetInstance[]
  defaultLayouts: GridLayouts
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
  /** Set of session_keys with an in-flight chat stream — used to badge entity tabs. */
  streamingSessions?: Set<string>

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

const SHELL_STYLES = `
#shell-root.proto-canvas {
  --dot-color: hsl(var(--muted-foreground) / 0.13);
  --dot-size: 1.5px;
  --dot-gap: 18px;
  --cross-color: hsl(var(--muted-foreground) / 0.06);
  background-color: hsl(var(--background));
  background-image:
    radial-gradient(circle, var(--dot-color) var(--dot-size), transparent var(--dot-size)),
    linear-gradient(var(--cross-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--cross-color) 1px, transparent 1px);
  background-size:
    var(--dot-gap) var(--dot-gap),
    calc(var(--dot-gap) * 5) calc(var(--dot-gap) * 5),
    calc(var(--dot-gap) * 5) calc(var(--dot-gap) * 5);
}
.dark #shell-root.proto-canvas {
  --dot-color: hsl(var(--muted-foreground) / 0.11);
  --cross-color: hsl(var(--muted-foreground) / 0.04);
}
`

export default function Shell({
  widgets: widgetRegistry,
  defaultWidgets,
  defaultLayouts,
  cockpits,
  companyId, refreshKey, onSendToChat,
  agentView, onAgentDismiss,
  activeEntity, onActivateEntity, onDeactivateEntity,
  openEntities, onCloseTab, streamingSessions,
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

  const [maximizedWidgetId, setMaximizedWidgetId] = useState<string | null>(null)

  // Escape to exit maximized mode
  useEffect(() => {
    if (!maximizedWidgetId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximizedWidgetId(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [maximizedWidgetId])

  const [widgets, setWidgets] = useState<WidgetInstance[]>(() => {
    const saved = loadShellState(companyId)
    return saved?.widgets || defaultWidgets
  })
  const [layouts, setLayouts] = useState<GridLayouts>(() => {
    const saved = loadShellState(companyId)
    return saved?.layouts || { ...defaultLayouts }
  })

  const addWidget = useCallback((type: WidgetType) => {
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`
    const def = widgetRegistry.get(type)
    const size = def?.defaultSize || { w: 3, h: 4, minW: 2, minH: 3 }
    const widget: WidgetInstance = { id, type, title: def?.title || type }

    setWidgets(prev => [...prev, widget])
    setLayouts(prev => ({
      ...prev,
      lg: [...(prev.lg || []), { i: id, x: 0, y: Infinity, ...size }],
    }))
  }, [widgetRegistry])

  const removeWidget = useCallback((id: string) => {
    setMaximizedWidgetId(prev => prev === id ? null : prev)
    setWidgets(prev => prev.filter(w => w.id !== id))
    setLayouts(prev => ({
      ...prev,
      lg: (prev.lg || []).filter(l => l.i !== id),
    }))
  }, [])

  const [cockpitLayoutOverrides, setCockpitLayoutOverrides] = useState<Record<string, GridLayouts>>({})

  const currentCockpitLayouts = useMemo<GridLayouts | undefined>(() => {
    if (!activeEntity || !activeCockpit) return undefined
    const cached = cockpitLayoutOverrides[activeEntity.type]
    if (cached) return cached
    const stored = loadCockpitLayout(activeEntity.type, companyId)
    return stored || activeCockpit.layouts
  }, [activeEntity, activeCockpit, cockpitLayoutOverrides, companyId])

  const onCockpitLayoutChange = useCallback((_: readonly LayoutItem[], all: GridLayouts) => {
    if (!activeEntity) return
    setCockpitLayoutOverrides(prev => ({ ...prev, [activeEntity.type]: all }))
    saveCockpitLayout(activeEntity.type, all, companyId)
  }, [activeEntity, companyId])

  const resetShell = useCallback(() => {
    if (cockpitMode && activeEntity && activeCockpit) {
      clearCockpitLayout(activeEntity.type, companyId)
      setCockpitLayoutOverrides(prev => {
        const next = { ...prev }
        delete next[activeEntity.type]
        return next
      })
      return
    }
    clearShellState(companyId)
    setWidgets([...defaultWidgets])
    setLayouts({ ...defaultLayouts })
  }, [defaultWidgets, defaultLayouts, companyId, cockpitMode, activeEntity, activeCockpit])

  // Persist widgets whenever the list changes
  useEffect(() => {
    saveShellState(widgets, layouts, companyId)
  }, [widgets])

  function onLayoutChange(_layout: readonly LayoutItem[], allLayouts: GridLayouts) {
    setLayouts(allLayouts)
    saveShellState(widgets, allLayouts, companyId)
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
    return (
      <MemoizedWidget
        key={widget.id}
        widget={widget}
        registry={widgetRegistry}
        ctx={shellCtx}
      />
    )
  }

  const widgetCatalog = useMemo(
    () => Array.from(widgetRegistry.values())
      .filter(w => w.category === 'general')
      .map(w => ({ type: w.type, title: w.title, icon: w.icon || '▦' })),
    [widgetRegistry]
  )

  const { open: cmdOpen, close: cmdClose } = useCommandPalette()

  const commandItems = useMemo<CommandItem[]>(() => [
    ...Array.from(widgetRegistry.values()).map(w => ({
      id: `widget-${w.type}`,
      label: w.title,
      icon: w.icon,
      category: 'Widgets',
      description: `Abrir widget ${w.title}`,
      action: () => addWidget(w.type),
    })),
  ], [widgetRegistry, addWidget])

  return (
    <div ref={containerRef} id="shell-root" className="h-full overflow-y-auto scrollbar-thin bg-background proto-canvas relative">
      <style dangerouslySetInnerHTML={{ __html: SHELL_STYLES }} />
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
        streamingSessions={streamingSessions}
        role={role}
        companies={companies}
        effectiveCompanyId={effectiveCompanyId}
        setCompanyId={setCompanyId}
        onSignOut={onSignOut}
        userEmail={userEmail}
        rightActions={toolbarExtras}
      />

      {maximizedWidgetId && (() => {
        const widget = widgets.find(w => w.id === maximizedWidgetId)
        if (!widget) return null
        return (
          <div className="absolute inset-0 top-[41px] z-10 bg-background flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
              <span className="text-sm font-medium text-muted-foreground select-none">{widget.title}</span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setMaximizedWidgetId(null)}
                  className="p-1 -m-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                  aria-label="Restaurar widget"
                >
                  <Minimize2Icon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setMaximizedWidgetId(null); removeWidget(widget.id) }}
                  className="p-1 -m-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                  aria-label="Cerrar widget"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 shell-content">
              {renderWidget(widget)}
            </div>
          </div>
        )
      })()}

      {focusMode && agentView && (
        <FocusView
          spec={agentView.spec}
          title={agentView.title}
          widgets={widgets}
          onDismiss={onAgentDismiss}
          onSendToChat={onSendToChat}
        />
      )}

      {cockpitMode && activeCockpit && activeEntity && (
        <ResponsiveGridLayout
          key={activeEntity.type}
          className="p-2"
          width={containerWidth - 16}
          breakpoints={{ lg: 800, md: 600, sm: 0 }}
          cols={{ lg: 12, md: 8, sm: 4 }}
          rowHeight={60}
          layouts={currentCockpitLayouts || activeCockpit.layouts}
          onLayoutChange={onCockpitLayoutChange}
          dragConfig={{ enabled: true, handle: '.cockpit-drag-handle', bounded: false }}
          resizeConfig={{ enabled: true }}
          margin={[8, 8]}
        >
          {activeCockpit.widgets.map(widget => (
            <div key={widget.id} className="bg-card border border-primary/20 rounded-lg overflow-hidden flex flex-col shadow-sm shadow-primary/5">
              <div className="cockpit-drag-handle flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent cursor-grab active:cursor-grabbing">
                <span className="text-sm font-medium text-muted-foreground select-none">{widget.title}</span>
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

      {!focusMode && !cockpitMode && (
        <div>
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
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setMaximizedWidgetId(widget.id)}
                      className="p-1 -m-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                      aria-label="Maximizar widget"
                    >
                      <Maximize2Icon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeWidget(widget.id)}
                      className="p-1 -m-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                      aria-label="Cerrar widget"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-2 shell-content">
                  {renderWidget(widget)}
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
        </div>
      )}

      <CommandPalette items={commandItems} open={cmdOpen} onClose={cmdClose} />
      {overlays}
    </div>
  )
}

const MemoizedWidget = memo(function MemoizedWidget({
  widget,
  registry,
  ctx,
}: {
  widget: WidgetInstance
  registry: WidgetRegistry
  ctx: ShellContext
}) {
  const def = registry.get(widget.type)
  if (!def) {
    return <p className="text-xs text-muted-foreground p-2">Widget "{widget.type}" not found.</p>
  }
  return (
    <WidgetErrorBoundary widgetType={widget.type}>
      {def.render(widget, ctx)}
    </WidgetErrorBoundary>
  )
})
