/**
 * ProtoApp — zero-config React app component.
 *
 * Wraps Shell with auth, entity management, and standard routing.
 * The developer only passes their widgets array — everything else
 * is handled by the framework.
 *
 * Usage:
 *
 *   import { ProtoApp, defineWidget } from '@tleblancureta/proto/web'
 *
 *   const widgets = [
 *     defineWidget({ type: 'items', title: 'Items', ... }),
 *   ]
 *
 *   export default function App() {
 *     return <ProtoApp widgets={widgets} />
 *   }
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Shell, { type CockpitDefinition } from './components/Shell.js'
import { AdminPanel } from './components/admin/AdminPanel.js'
import { LoginForm } from './components/LoginForm.js'
import { ResizableLayout } from './components/ResizableLayout.js'
import { useAuth } from './hooks/useAuth.js'
import { useTheme } from './hooks/useTheme.js'
import { buildWidgetRegistry, type WidgetDefinition } from './lib/define-widget.js'
import { protoSocket, sendChatWs } from './lib/api.js'
import { ChatPanel } from './components/chat/ChatPanel.js'
import { Toaster } from './components/ui/toaster.js'
import type { EntityDefinition } from '../../core-shared/src/index.js'
import type { ActiveEntity, GridLayouts, WidgetInstance } from './components/shell/types.js'

export interface CompanyContextInput {
  user: { id: string; email?: string | null }
  role: 'admin' | 'client' | null
  companyId: string
  companies: { id: string; name: string }[]
  profile: { full_name: string | null; role_title: string | null; onboarding_completed: boolean } | null
  activeEntity?: { type: string; id: string; label: string } | null
}

export interface ProtoAppProps {
  /** Widget definitions — the core of your app's UI. */
  widgets: WidgetDefinition[]

  /** Entity definitions — for cockpit mode (optional). */
  entities?: EntityDefinition[]

  /** Default widgets shown on first load. If omitted, shows all general widgets. */
  defaultWidgets?: WidgetInstance[]

  /** Default grid layouts. If omitted, auto-generates a simple grid. */
  defaultLayouts?: GridLayouts

  /** App display name (shown in header). */
  appName?: string

  /** Login component override. */
  loginComponent?: React.ComponentType

  /** Build the company_context string sent with every chat message.
   *  Receives auth data, returns a string appended to the system prompt
   *  as `## Empresa activa`. If omitted, a default is generated from
   *  company name, user name, and role. */
  buildCompanyContext?: (input: CompanyContextInput) => string
}

function defaultBuildCompanyContext({ companyId, companies, profile, role, activeEntity }: CompanyContextInput): string {
  const company = companies.find(c => c.id === companyId)
  const lines: string[] = []
  if (company) lines.push(`Empresa: ${company.name}`)
  if (profile?.full_name) lines.push(`Usuario: ${profile.full_name}`)
  if (profile?.role_title) lines.push(`Cargo: ${profile.role_title}`)
  if (role) lines.push(`Rol: ${role}`)
  if (profile && 'onboarding_completed' in profile) {
    lines.push(`Onboarding: ${profile.onboarding_completed ? 'completado' : 'pendiente'}`)
  }
  if (activeEntity) {
    lines.push(`Entidad activa: ${activeEntity.type} "${activeEntity.label}" (id: ${activeEntity.id})`)
  }
  return lines.length > 0 ? lines.join('\n') : 'Sin empresa configurada'
}

export function ProtoApp({
  widgets: widgetDefs,
  entities = [],
  defaultWidgets: defaultWidgetsProp,
  defaultLayouts: defaultLayoutsProp,
  appName,
  loginComponent: LoginComponent = LoginForm,
  buildCompanyContext = defaultBuildCompanyContext,
}: ProtoAppProps) {
  useTheme()

  const { user, role, companyId, companies, profile, loading, signOut, setCompanyId } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)

  type Entity = { type: string; id: string; label: string }
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null)
  const [openEntities, setOpenEntities] = useState<Entity[]>([])

  const widgetRegistry = useMemo(() => buildWidgetRegistry(widgetDefs), [widgetDefs])

  const cockpits = useMemo<Record<string, CockpitDefinition>>(() =>
    Object.fromEntries(
      entities
        .filter(e => !!e.cockpit)
        .map(e => [e.name, { widgets: e.cockpit!.widgets, layouts: e.cockpit!.layouts as GridLayouts }])
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

  const chatSendRef = useRef<((msg: string) => void) | null>(null)

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

  const effectiveCompanyId = companyId || user?.id || ''

  const companyContext = useMemo(() => {
    if (!user) return ''
    return buildCompanyContext({
      user: { id: user.id, email: user.email },
      role,
      companyId: effectiveCompanyId,
      companies,
      profile,
      activeEntity,
    })
  }, [user?.id, user?.email, role, effectiveCompanyId, companies, profile, activeEntity, buildCompanyContext])

  // WebSocket setup — connect once when user is authenticated
  useEffect(() => {
    if (!user) return
    protoSocket.connect().catch(() => {})
    protoSocket.onShellRefresh(() => setRefreshKey(k => k + 1))
    return () => protoSocket.disconnect()
  }, [!!user])

  if (loading) {
    return (
      <>
        <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>
        <Toaster />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <LoginComponent />
        <Toaster />
      </>
    )
  }

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<AdminPanel widgets={widgetRegistry} />} />
          <Route path="*" element={
            <ResizableLayout
              chatPanel={
                <ChatPanel
                  companyId={effectiveCompanyId}
                  userId={user.email || user.id}
                  appName={appName}
                  companyContext={companyContext}
                  onStreamComplete={() => setRefreshKey(k => k + 1)}
                  onRegisterSend={(fn) => { chatSendRef.current = fn }}
                  activeEntity={activeEntity}
                  onClearEntity={() => setActiveEntity(null)}
                />
              }
              shellPanel={
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
                  role={role}
                  companies={companies}
                  effectiveCompanyId={effectiveCompanyId}
                  setCompanyId={setCompanyId}
                  onSignOut={signOut}
                  userEmail={profile?.full_name || user.email || ''}
                />
              }
            />
          } />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </>
  )
}
