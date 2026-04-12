import { useState, useCallback, useRef, useMemo } from 'react'
import {
  Shell,
  Skeleton,
  Button,
  useAuth,
  useTheme,
  supabase,
  hermesSocket,
  buildWidgetRegistry,
  type CockpitDefinition,
} from 'proto/web'
import { Eraser, ShoppingCartIcon } from 'lucide-react'
import type { CartItem } from './shared/types'
import { WIDGETS } from './widgets/registry'
import { DEFAULT_WIDGETS, DEFAULT_LAYOUTS } from './widgets/catalog'
import { ENTITIES, orderEntity } from '@app/entities/index.js'
import CartModal from './widgets/modals/CartModal'
import CreateOrderDialog from './widgets/modals/CreateOrderDialog'
import CreateProductDialog from './widgets/modals/CreateProductDialog'
import SettingsModal from './widgets/modals/SettingsModal'
import Chat from './pages/Chat'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import GmailCallback from './pages/GmailCallback'
import ResetPassword from './pages/ResetPassword'
import Admin from './pages/Admin'

const WIDGET_REGISTRY = buildWidgetRegistry(WIDGETS)

const COCKPITS: Record<string, CockpitDefinition> = Object.fromEntries(
  ENTITIES
    .filter(e => !!e.cockpit)
    .map(e => [e.name, { widgets: e.cockpit!.widgets, layouts: e.cockpit!.layouts }])
)

const CART_KEY = 'hermes-cart'
function loadCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] }
}
function saveCart(items: CartItem[]) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)) } catch {}
}

export default function App() {
  useTheme()

  // Handle OAuth callback route
  if (window.location.pathname === '/gmail/callback') {
    return <GmailCallback />
  }
  // Handle password reset route
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

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>(loadCart)
  const [cartOpen, setCartOpen] = useState(false)

  const addToCart = useCallback((item: CartItem) => {
    setCartItems(prev => {
      const exists = prev.find(i => i.productId === item.productId)
      const next = exists
        ? prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + item.quantity } : i)
        : [...prev, item]
      saveCart(next)
      return next
    })
  }, [])

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    setCartItems(prev => {
      const next = prev.map(i => i.productId === productId ? { ...i, quantity } : i)
      saveCart(next)
      return next
    })
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setCartItems(prev => {
      const next = prev.filter(i => i.productId !== productId)
      saveCart(next)
      return next
    })
  }, [])

  const clearCart = useCallback(() => {
    setCartItems([])
    saveCart([])
  }, [])

  // Modals
  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [createOrderOpen, setCreateOrderOpen] = useState(false)
  const [createOrderProduct, setCreateOrderProduct] = useState<{ id: string; name: string } | null>(null)
  const [createOrderKey, setCreateOrderKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const openCreateOrder = useCallback((product?: { id: string; name: string }) => {
    setCreateOrderProduct(product || null)
    setCreateOrderKey(k => k + 1)
    setCreateOrderOpen(true)
  }, [])

  const openCreateProduct = useCallback(() => setCreateProductOpen(true), [])

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
    if (!orderEntity.snapshotBuilder) return
    orderEntity
      .snapshotBuilder({ id: orderId } as any, { supabase })
      .then(md => setOrderSnapshot(md))
      .catch(() => {})
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
    const ae = activeEntityRef.current
    if (ae?.type === 'order') refreshOrderSnapshot(ae.id)
  }, [refreshOrderSnapshot])

  const snapshotInit = useRef(false)
  if (!snapshotInit.current && activeEntity?.type === 'order') {
    snapshotInit.current = true
    refreshOrderSnapshot(activeEntity.id)
  }

  const wsSetup = useRef(false)
  if (!wsSetup.current && user) {
    wsSetup.current = true
    hermesSocket.connect().catch(() => {})
    hermesSocket.onShellRefresh(() => setRefreshKey(k => k + 1))
  }

  const onSendToChat = useCallback((message: string) => {
    chatSendRef.current?.(message)
  }, [])

  const contextExtras = useMemo(() => ({
    cartItems,
    addToCart,
    openCreateOrder,
    openCreateProduct,
  }), [cartItems, addToCart, openCreateOrder, openCreateProduct])

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
    return <Login />
  }

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

  const snapshotBlock = (activeEntity?.type === 'order' && orderSnapshot)
    ? `\n\n## SNAPSHOT DEL PEDIDO (datos actualizados al momento de este mensaje)\n\nYa tienes toda la informacion del pedido a continuacion. **NO necesitas llamar get_item_state, list_documents, list_payments ni otras tools de lectura** para entender el estado actual — usa este snapshot. Solo usa tools cuando necesites MODIFICAR datos o cuando el usuario pida informacion que no esta en el snapshot.\n\n${orderSnapshot}`
    : ''

  const entityBlock = `${scopeRules}${snapshotBlock}`

  const context = hasCompany
    ? `${userBlock}\n- Company ID: ${companyId}\n- Empresa: ${companies.find(c => c.id === companyId)?.name || ''}${entityBlock}`
    : `${userBlock}\n- User ID: ${user.id}\n\nEste usuario aun no tiene empresa. Ayudalo a crear una con create_company si lo necesita, o usa su user ID como company_id temporal.`

  const toolbarExtras = (
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative" onClick={() => setCartOpen(true)} aria-label="Carro" title="Carro">
      <ShoppingCartIcon className="w-3.5 h-3.5" />
      {cartItems.length > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
          {cartItems.length}
        </span>
      )}
    </Button>
  )

  const overlays = (
    <>
      {cartItems.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="absolute bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
          title="Ver carro"
        >
          <ShoppingCartIcon className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {cartItems.length}
          </span>
        </button>
      )}

      <CartModal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        companyId={effectiveCompanyId}
        items={cartItems}
        onUpdateQuantity={updateCartQuantity}
        onRemove={removeFromCart}
        onClear={clearCart}
        onSendToChat={onSendToChat}
        onOrderCreated={(id, label) => setActiveEntity({ type: 'order', id, label })}
      />

      <CreateProductDialog
        open={createProductOpen}
        onClose={() => setCreateProductOpen(false)}
        companyId={effectiveCompanyId}
        onCreated={() => setRefreshKey(k => k + 1)}
      />

      <CreateOrderDialog
        key={createOrderKey}
        open={createOrderOpen}
        onClose={() => { setCreateOrderOpen(false); setCreateOrderProduct(null) }}
        companyId={effectiveCompanyId}
        onSendToChat={onSendToChat}
        onOrderCreated={(id, label) => setActiveEntity({ type: 'order', id, label })}
        preselectedProduct={createOrderProduct}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        companyId={effectiveCompanyId}
        refreshKey={refreshKey}
      />
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Chat - left panel */}
      <div className="w-[480px] min-w-[360px] max-w-[640px] border-r border-border flex flex-col bg-background resize-x overflow-hidden">
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
            onAgentActivateEntity={(type, id) => {
              if (type !== 'order' && type !== 'product') return
              const def = ENTITIES.find(e => e.name === type)
              const label = def?.displayName
                ? def.displayName.charAt(0).toUpperCase() + def.displayName.slice(1)
                : type
              setActiveEntity({ type, id, label })
            }}
            onAgentDeactivateEntity={() => setActiveEntity(null)}
          />
        </div>
      </div>

      {/* Shell - right canvas */}
      <div className="flex-1 min-w-0">
        <Shell
          widgets={WIDGET_REGISTRY}
          defaultWidgets={DEFAULT_WIDGETS}
          defaultLayouts={DEFAULT_LAYOUTS}
          cockpits={COCKPITS}
          companyId={effectiveCompanyId}
          refreshKey={refreshKey}
          onSendToChat={onSendToChat}
          agentView={agentView}
          onAgentDismiss={onAgentDismiss}
          activeEntity={activeEntity}
          onActivateEntity={(e) => setActiveEntity(e as Entity)}
          onDeactivateEntity={() => setActiveEntityRaw(null)}
          openEntities={openEntities}
          onCloseTab={(e) => closeEntityTab(e as Entity)}
          role={role}
          companies={companies}
          effectiveCompanyId={effectiveCompanyId}
          setCompanyId={setCompanyId}
          onSignOut={signOut}
          userEmail={profile?.full_name || user.email || ''}
          onOpenSettings={() => setSettingsOpen(true)}
          toolbarExtras={toolbarExtras}
          contextExtras={contextExtras}
          overlays={overlays}
        />
      </div>
    </div>
  )
}
