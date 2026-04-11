import { useState, useCallback, useRef } from 'react'
import { useAuth } from './hooks/useAuth'
import { useTheme, type Theme } from './hooks/useTheme'
import { hermesSocket } from './lib/api'
import { buildOrderSnapshot } from './lib/orderSnapshot'
import { Skeleton } from '@/components/ui/skeleton'
import Chat from './pages/Chat'
import Shell from './components/Shell'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import GmailCallback from './pages/GmailCallback'
import ResetPassword from './pages/ResetPassword'
import Admin from './pages/Admin'
import { Eraser } from 'lucide-react'

export default function App() {
  const { theme, setTheme } = useTheme()

  // Handle OAuth callback route
  if (window.location.pathname === '/gmail/callback') {
    return <GmailCallback />
  }
  // Handle password reset route (user arrives via email link)
  if (window.location.pathname === '/reset-password') {
    return <ResetPassword />
  }
  // Admin route
  const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
  const { user, role, companyId, companies, profile, loading, signOut, setCompanyId, reload } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const chatSendRef = useRef<((msg: string) => void) | null>(null)
  const chatClearRef = useRef<(() => void) | null>(null)
  const [chatMsgCount, setChatMsgCount] = useState(0)
  const [agentView, setAgentView] = useState<{ spec: any; title?: string } | null>(null)
  const [orderSnapshot, setOrderSnapshot] = useState<string | null>(null)
  type Entity = { type: 'order' | 'product'; id: string; label: string }
  const [activeEntity, setActiveEntityRaw] = useState<Entity | null>(() => {
    try {
      const raw = localStorage.getItem('hermes:activeEntity')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [openEntities, setOpenEntities] = useState<Entity[]>(() => {
    try {
      const raw = localStorage.getItem('hermes:openEntities')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  const persistActiveEntity = useCallback((e: Entity | null) => {
    try {
      if (e) localStorage.setItem('hermes:activeEntity', JSON.stringify(e))
      else localStorage.removeItem('hermes:activeEntity')
    } catch {}
  }, [])

  const persistOpenEntities = useCallback((entities: Entity[]) => {
    try { localStorage.setItem('hermes:openEntities', JSON.stringify(entities)) } catch {}
  }, [])

  const refreshOrderSnapshot = useCallback((orderId: string) => {
    buildOrderSnapshot(orderId).then(md => setOrderSnapshot(md)).catch(() => {})
  }, [])

  const setActiveEntity = useCallback((e: Entity | null) => {
    setActiveEntityRaw(e)
    persistActiveEntity(e)
    if (e) {
      if (e.type === 'order') refreshOrderSnapshot(e.id)
      setOpenEntities(prev => {
        const exists = prev.find(p => p.type === e.type && p.id === e.id)
        const next = exists
          ? prev.map(p => (p.type === e.type && p.id === e.id ? e : p))
          : [...prev, e]
        persistOpenEntities(next)
        return next
      })
    } else {
      setOrderSnapshot(null)
    }
  }, [persistActiveEntity, persistOpenEntities, refreshOrderSnapshot])

  const closeEntityTab = useCallback((e: Entity) => {
    setOpenEntities(prev => {
      const next = prev.filter(p => !(p.type === e.type && p.id === e.id))
      persistOpenEntities(next)
      setActiveEntityRaw(curr => {
        const newActive = (curr && curr.type === e.type && curr.id === e.id)
          ? (next[next.length - 1] || null)
          : curr
        persistActiveEntity(newActive)
        return newActive
      })
      return next
    })
  }, [persistActiveEntity, persistOpenEntities])

  const onAgentMount = useCallback((spec: any, title?: string) => {
    setAgentView({ spec, title })
  }, [])
  const onAgentDismiss = useCallback(() => setAgentView(null), [])

  const activeEntityRef = useRef(activeEntity)
  activeEntityRef.current = activeEntity

  const onStreamComplete = useCallback(() => {
    setRefreshKey(k => k + 1)
    // Refresh snapshot so next message has fresh order data
    const ae = activeEntityRef.current
    if (ae?.type === 'order') refreshOrderSnapshot(ae.id)
  }, [refreshOrderSnapshot])

  // Load snapshot for order restored from localStorage on mount
  const snapshotInit = useRef(false)
  if (!snapshotInit.current && activeEntity?.type === 'order') {
    snapshotInit.current = true
    refreshOrderSnapshot(activeEntity.id)
  }

  // Connect WS and listen for shell refresh events
  const wsSetup = useRef(false)
  if (!wsSetup.current && user) {
    wsSetup.current = true
    hermesSocket.connect().catch(() => {})
    hermesSocket.onShellRefresh(() => setRefreshKey(k => k + 1))
  }

  const onSendToChat = useCallback((message: string) => {
    chatSendRef.current?.(message)
  }, [])

  if (loading) {
    if (isAdminRoute) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex gap-2 mb-6 border-b border-border pb-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-7 w-24 rounded-md" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-7 flex-1 max-w-[200px]" />
                  <Skeleton className="h-5 w-16 ml-auto" />
                </div>
                <Skeleton className="h-7 w-full" />
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5].map(j => <Skeleton key={j} className="h-5 w-16 rounded-full" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div className="flex h-screen overflow-hidden">
        <div className="w-[380px] border-r border-border p-4 space-y-3">
          <Skeleton className="h-10 w-10 rounded-2xl mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
        <div className="flex-1 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    if (window.location.pathname === '/login') return <Login />
    return <Landing />
  }

  // Authenticated user on /login → redirect to home
  if (window.location.pathname === '/login') {
    window.location.replace('/')
    return null
  }

  if (isAdminRoute) {
    return <Admin />
  }

  const needsOnboarding = !profile?.onboarding_completed || !companyId
  if (needsOnboarding) {
    return <Onboarding user={user} profile={profile} onComplete={reload} signOut={signOut} />
  }

  const effectiveCompanyId = companyId || user.id
  const hasCompany = !!companyId

  const TECHNICAL_ROLES = /adquisicion|compra|import|comex|logistic|supply|procurement|operacion|gerente general|ceo|fundador|dueno|owner|foreign trade/i
  const isTechnical = profile?.role_title ? TECHNICAL_ROLES.test(profile.role_title) : false
  const toneBlock = `\n- Cargo: ${profile?.role_title || '(no especificado)'}\n- Perfil de comunicacion: ${isTechnical ? 'TECNICO — usa terminologia estandar de importacion (FOB, CIF, DIN, incoterm, lead time, MOQ, HS code, TLC, forwarder) sin explicar siglas.' : 'NO TECNICO — traduce jerga a lenguaje cotidiano: "FOB" → "precio puesto en el puerto de origen", "DIN" → "tramite de aduana", "lead time" → "tiempo desde que pagas hasta recibir". Evita siglas. Confirma entendimiento mas seguido.'}`
  const userBlock = `- Usuario: ${profile?.full_name || user.email}\n- Email: ${user.email}${toneBlock}`

  const entityKind = activeEntity?.type === 'order' ? 'pedido' : 'producto'
  const scopeRules = activeEntity
    ? `\n\n## CONTEXTO FIJO — SCOPE OBLIGATORIO DE LA CONVERSACION\n\nEl usuario tiene seleccionado en el frontend un ${entityKind} especifico:\n- Tipo: ${entityKind}\n- Nombre: "${activeEntity.label}"\n- ID: ${activeEntity.id}\n\n**REGLA ESTRICTA**: Toda esta conversacion opera EXCLUSIVAMENTE sobre ese ${entityKind}. No es una sugerencia — es un filtro obligatorio en TODAS tus acciones:\n\n1. **Listas y busquedas**: cuando el usuario diga "los pedidos", "mis pedidos", "todos los pedidos", "las cotizaciones", etc. SIN nombrar explicitamente otros, SIEMPRE interpreta que se refiere SOLO a los que estan asociados al ${entityKind} activo (id: ${activeEntity.id}). Filtra tus queries por ese id.\n${activeEntity.type === 'product'
      ? '   - Ejemplo: "lista los pedidos" → lista SOLO los pedidos que incluyen este producto (filtrando por product_id en order_items).\n   - Ejemplo: "elimina todos los pedidos" → elimina SOLO los pedidos que incluyen este producto. Nunca todos los de la empresa.\n'
      : '   - Ejemplo: "muestra los documentos" → SOLO los documentos de este pedido.\n   - Ejemplo: "actualiza el estado" → del pedido activo, no otro.\n'}\n2. **Acciones destructivas o masivas**: JAMAS operes fuera del scope del ${entityKind} activo sin confirmacion explicita del usuario ("si, quiero eliminar todos los de la empresa" o similar). Si tienes la menor duda, pregunta.\n\n3. **Referencias ambiguas**: "el proveedor", "la cantidad", "el precio", "el estado" → siempre del ${entityKind} activo.\n\n4. **Si el usuario quiere salir del scope** (ej: "no, quiero ver todos los pedidos de la empresa"), puedes ampliar, pero avisale: "Saliendo del contexto del ${entityKind} actual — el frontend todavia lo tiene marcado como activo, puedes desmarcarlo con la X arriba del input".\n\n5. El pedido ya esta activado automaticamente en el MCP (tools scoped operan sobre este pedido). El cockpit del frontend ya esta sincronizado. NO necesitas llamar activate_order.`
    : ''

  // For orders: inject the full MD snapshot so the agent doesn't need to tool for basic info
  const snapshotBlock = (activeEntity?.type === 'order' && orderSnapshot)
    ? `\n\n## SNAPSHOT DEL PEDIDO (datos actualizados al momento de este mensaje)\n\nYa tienes toda la informacion del pedido a continuacion. **NO necesitas llamar get_item_state, list_documents, list_payments ni otras tools de lectura** para entender el estado actual — usa este snapshot. Solo usa tools cuando necesites MODIFICAR datos o cuando el usuario pida informacion que no esta en el snapshot.\n\n${orderSnapshot}`
    : ''

  const entityBlock = `${scopeRules}${snapshotBlock}`

  const context = hasCompany
    ? `${userBlock}\n- Company ID: ${companyId}\n- Empresa: ${companies.find(c => c.id === companyId)?.name || ''}${entityBlock}`
    : `${userBlock}\n- User ID: ${user.id}\n\nEste usuario aun no tiene empresa. Ayudalo a crear una con create_company si lo necesita, o usa su user ID como company_id temporal.`

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Chat - left panel */}
      <div className="w-[480px] min-w-[360px] max-w-[640px] border-r border-border flex flex-col bg-background resize-x overflow-hidden">
        {/* Chat header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">H</div>
            <span className="font-semibold text-sm">Hermes</span>
          </div>
          {chatMsgCount > 0 && (
            <button
              onClick={() => chatClearRef.current?.()}
              className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
              title="Limpiar conversacion"
              aria-label="Limpiar conversacion"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Chat body */}
        <div className="flex-1 min-h-0">
          <Chat
            companyId={effectiveCompanyId}
            userId={user.email || 'web-user'}
            companyContext={context}
            hasCompany={hasCompany}
            onStreamComplete={onStreamComplete}
            onRegisterSend={(fn) => { chatSendRef.current = fn }}
            onRegisterClear={(fn) => { chatClearRef.current = fn }}
            onMessagesChange={setChatMsgCount}
            onAgentMount={onAgentMount}
            activeEntity={activeEntity}
            onClearEntity={() => setActiveEntity(null)}
            onFocusOrder={(id) => id ? setActiveEntity({ type: 'order', id, label: 'Pedido' }) : setActiveEntity(null)}
          />
        </div>
      </div>

      {/* Shell - right canvas */}
      <div className="flex-1 min-w-0">
        <Shell
          companyId={effectiveCompanyId}
          refreshKey={refreshKey}
          onSendToChat={onSendToChat}
          agentView={agentView}
          onAgentDismiss={onAgentDismiss}
          activeEntity={activeEntity}
          onActivateEntity={setActiveEntity}
          onDeactivateEntity={() => setActiveEntityRaw(null)}
          openEntities={openEntities}
          onCloseTab={closeEntityTab}
          role={role}
          companies={companies}
          effectiveCompanyId={effectiveCompanyId}
          setCompanyId={setCompanyId}
          onSignOut={signOut}
          userEmail={profile?.full_name || user.email || ''}
        />
      </div>
    </div>
  )
}
