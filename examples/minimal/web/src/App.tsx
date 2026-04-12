import { useState, useCallback, useRef } from 'react'
import {
  Shell,
  useAuth,
  useTheme,
  buildWidgetRegistry,
  type CockpitDefinition,
} from '@proto/core-web'
import { WIDGETS } from './widgets/registry'
import { DEFAULT_WIDGETS, DEFAULT_LAYOUTS } from './widgets/catalog'
import { ENTITIES } from '@app/entities/index.js'

const WIDGET_REGISTRY = buildWidgetRegistry(WIDGETS)

const COCKPITS: Record<string, CockpitDefinition> = Object.fromEntries(
  ENTITIES
    .filter(e => !!e.cockpit)
    .map(e => [e.name, { widgets: e.cockpit!.widgets, layouts: e.cockpit!.layouts }])
)

type Entity = { type: string; id: string; label: string }

export default function App() {
  useTheme()

  const { user, companyId, companies, profile, loading, signOut, setCompanyId } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null)
  const [openEntities, setOpenEntities] = useState<Entity[]>([])
  const chatSendRef = useRef<((msg: string) => void) | null>(null)

  const onSendToChat = useCallback((message: string) => {
    chatSendRef.current?.(message)
  }, [])

  const activateEntity = useCallback((e: Entity) => {
    setActiveEntity(e)
    setOpenEntities(prev => {
      const exists = prev.find(p => p.type === e.type && p.id === e.id)
      return exists ? prev : [...prev, e]
    })
  }, [])

  const closeEntityTab = useCallback((e: Entity) => {
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

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>
  }

  if (!user) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Please sign in.</div>
  }

  const effectiveCompanyId = companyId || user.id

  return (
    <Shell
      widgets={WIDGET_REGISTRY}
      defaultWidgets={DEFAULT_WIDGETS}
      defaultLayouts={DEFAULT_LAYOUTS}
      cockpits={COCKPITS}
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
