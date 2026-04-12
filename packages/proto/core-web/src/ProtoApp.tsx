/**
 * ProtoApp — zero-config React app component.
 *
 * Wraps Shell with auth, entity management, and standard routing.
 * The developer only passes their widgets array — everything else
 * is handled by the framework.
 *
 * Usage:
 *
 *   import { ProtoApp, defineWidget } from 'proto/web'
 *
 *   const widgets = [
 *     defineWidget({ type: 'items', title: 'Items', ... }),
 *   ]
 *
 *   export default function App() {
 *     return <ProtoApp widgets={widgets} />
 *   }
 */
import { useState, useCallback, useRef, useMemo } from 'react'
import Shell, { type CockpitDefinition } from './components/Shell'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { buildWidgetRegistry, type WidgetDefinition } from './lib/define-widget'
import { protoSocket } from './lib/api'
import type { EntityDefinition } from 'proto/shared'
import type { ActiveEntity, WidgetInstance } from './components/shell/types'

export interface ProtoAppProps {
  /** Widget definitions — the core of your app's UI. */
  widgets: WidgetDefinition[]

  /** Entity definitions — for cockpit mode (optional). */
  entities?: EntityDefinition[]

  /** Default widgets shown on first load. If omitted, shows all general widgets. */
  defaultWidgets?: WidgetInstance[]

  /** Default grid layouts. If omitted, auto-generates a simple grid. */
  defaultLayouts?: Record<string, unknown[]>

  /** App display name (shown in header). */
  appName?: string

  /** Login component override. */
  loginComponent?: React.ComponentType
}

function DefaultLogin() {
  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      Please sign in.
    </div>
  )
}

export function ProtoApp({
  widgets: widgetDefs,
  entities = [],
  defaultWidgets: defaultWidgetsProp,
  defaultLayouts: defaultLayoutsProp,
  appName,
  loginComponent: LoginComponent = DefaultLogin,
}: ProtoAppProps) {
  useTheme()

  const { user, companyId, companies, profile, loading, signOut, setCompanyId } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const chatSendRef = useRef<((msg: string) => void) | null>(null)

  type Entity = { type: string; id: string; label: string }
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null)
  const [openEntities, setOpenEntities] = useState<Entity[]>([])

  const widgetRegistry = useMemo(() => buildWidgetRegistry(widgetDefs), [widgetDefs])

  const cockpits = useMemo<Record<string, CockpitDefinition>>(() =>
    Object.fromEntries(
      entities
        .filter(e => !!e.cockpit)
        .map(e => [e.name, { widgets: e.cockpit!.widgets, layouts: e.cockpit!.layouts }])
    ), [entities])

  // Auto-generate defaults from general widgets if not provided
  const defaultWidgets = useMemo(() => {
    if (defaultWidgetsProp) return defaultWidgetsProp
    return widgetDefs
      .filter(w => w.category === 'general')
      .map((w, i) => ({ id: `${w.type}-${i}`, type: w.type, title: w.title }))
  }, [widgetDefs, defaultWidgetsProp])

  const defaultLayouts = useMemo(() => {
    if (defaultLayoutsProp) return defaultLayoutsProp
    const lg = defaultWidgets.map((w, i) => ({
      i: w.id, x: (i * 4) % 10, y: Math.floor(i / 2) * 5, w: 4, h: 5, minW: 2, minH: 3,
    }))
    return { lg, md: lg, sm: lg }
  }, [defaultWidgets, defaultLayoutsProp])

  const onSendToChat = useCallback((message: string) => {
    chatSendRef.current?.(message)
  }, [])

  const activateEntity = useCallback((e: ActiveEntity) => {
    setActiveEntity(e as Entity)
    setOpenEntities(prev => {
      const exists = prev.find(p => p.type === e.type && p.id === e.id)
      return exists ? prev : [...prev, e as Entity]
    })
  }, [])

  const closeEntityTab = useCallback((e: ActiveEntity) => {
    setOpenEntities(prev => {
      const next = prev.filter(p => !(p.type === e.type && p.id === e.id))
      setActiveEntity(curr =>
        (curr && curr.type === e.type && curr.id === e.id)
          ? (next[next.length - 1] || null)
          : curr
      )
      return next
    })
  }, [])

  // WebSocket setup
  const wsSetup = useRef(false)
  if (!wsSetup.current && user) {
    wsSetup.current = true
    protoSocket.connect().catch(() => {})
    protoSocket.onShellRefresh(() => setRefreshKey(k => k + 1))
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>
  }

  if (!user) {
    return <LoginComponent />
  }

  const effectiveCompanyId = companyId || user.id

  return (
    <Shell
      widgets={widgetRegistry}
      defaultWidgets={defaultWidgets}
      defaultLayouts={defaultLayouts}
      cockpits={cockpits}
      companyId={effectiveCompanyId}
      refreshKey={refreshKey}
      onSendToChat={onSendToChat}
      activeEntity={activeEntity}
      onActivateEntity={activateEntity}
      onDeactivateEntity={() => setActiveEntity(null)}
      openEntities={openEntities}
      onCloseTab={closeEntityTab}
      companies={companies}
      effectiveCompanyId={effectiveCompanyId}
      setCompanyId={setCompanyId}
      onSignOut={signOut}
      userEmail={profile?.full_name || user.email || ''}
    />
  )
}
