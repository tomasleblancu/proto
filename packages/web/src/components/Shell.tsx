import { useState, useCallback, useRef } from 'react'
import { useMountEffect } from '@/hooks/useMountEffect'
import { ResponsiveGridLayout, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { XIcon, ShoppingCartIcon } from 'lucide-react'
import OrdersWidget from './widgets/OrdersWidget'
import ProductsWidget from './widgets/ProductsWidget'
import CreateOrderDialog from './widgets/CreateOrderDialog'
import CreateProductDialog from './widgets/CreateProductDialog'
import CartModal from './widgets/CartModal'
import SettingsModal from './widgets/SettingsModal'
import DocsWidget from './widgets/DocsWidget'
import ReordersWidget from './widgets/ReordersWidget'
import OrderDetailWidget from './widgets/OrderDetailWidget'
import AdminWidget from './widgets/AdminWidget'
import SettingsWidget from './widgets/SettingsWidget'
import InventoryWidget from './widgets/InventoryWidget'
import SchedulesWidget from './widgets/SchedulesWidget'
import { OrderHeaderWidget, OrderSupplierWidget, OrderTimelineWidget, OrderDocsWidget, OrderContactsWidget, OrderFindingsWidget, OrderCostingWidget } from './widgets/cockpit/order'
import { ProductHeaderWidget, ProductSuppliersWidget, ProductOrdersWidget } from './widgets/cockpit/product'
import {
  DEFAULT_SIZES, DEFAULT_WIDGETS, DEFAULT_LAYOUTS,
  ORDER_COCKPIT_WIDGETS, ORDER_COCKPIT_LAYOUTS,
  PRODUCT_COCKPIT_WIDGETS, PRODUCT_COCKPIT_LAYOUTS,
  WIDGET_CATALOG,
} from './shell/catalog'
import { loadShellState, saveShellState, clearShellState } from './shell/persistence'
import { Toolbar } from './shell/Toolbar'
import { FocusView } from './shell/FocusView'
import { EmptyState } from './shell/EmptyState'
import type { ActiveEntity, CartItem, WidgetInstance, WidgetType } from './shell/types'

export type { WidgetType, ActiveEntity } from './shell/types'

const CART_KEY = 'hermes-cart'
function loadCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] }
}
function saveCart(items: CartItem[]) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)) } catch {}
}

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

interface Props {
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
  role?: string | null
  companies?: Array<{ id: string; name: string }>
  effectiveCompanyId?: string
  setCompanyId?: (id: string) => void
  onSignOut?: () => void
  userEmail?: string
}

export default function Shell({
  companyId, refreshKey, onSendToChat,
  agentView, onAgentDismiss,
  activeEntity, onActivateEntity, onDeactivateEntity,
  openEntities, onCloseTab,
  role, companies, effectiveCompanyId, setCompanyId, onSignOut, userEmail,
}: Props) {
  const focusMode = !!agentView
  const cockpitMode = !!activeEntity && !focusMode
  const activeOrderId = activeEntity?.type === 'order' ? activeEntity.id : null
  const activeProductId = activeEntity?.type === 'product' ? activeEntity.id : null

  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = useContainerWidth(containerRef)

  const [localRefresh, setLocalRefresh] = useState(0)
  const effectiveRefreshKey = refreshKey + localRefresh

  const saved = loadShellState()
  const [widgets, setWidgets] = useState<WidgetInstance[]>(saved?.widgets || DEFAULT_WIDGETS)
  const [layouts, setLayouts] = useState<any>(saved?.layouts || { ...DEFAULT_LAYOUTS })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [cartItems, setCartItems] = useState<CartItem[]>(loadCart)

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

  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [createOrderOpen, setCreateOrderOpen] = useState(false)
  const [createOrderProduct, setCreateOrderProduct] = useState<{ id: string; name: string } | null>(null)
  const [createOrderKey, setCreateOrderKey] = useState(0)

  const openCreateOrder = useCallback((product?: { id: string; name: string }) => {
    setCreateOrderProduct(product || null)
    setCreateOrderKey(k => k + 1)
    setCreateOrderOpen(true)
  }, [])

  const addWidget = useCallback((type: WidgetType) => {
    const id = `${type}-${Date.now()}`
    const catalog = WIDGET_CATALOG.find(w => w.type === type)
    const size = DEFAULT_SIZES[type]

    setWidgets(prev => {
      const next = [...prev, { id, type, title: catalog?.title || type }]
      setLayouts((prevLayouts: any) => {
        const nextLayouts = { ...prevLayouts, lg: [...(prevLayouts.lg || []), { i: id, x: 0, y: Infinity, ...size }] }
        saveShellState(next, nextLayouts)
        return nextLayouts
      })
      return next
    })
  }, [])

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => {
      const next = prev.filter(w => w.id !== id)
      setLayouts((prevLayouts: any) => {
        const nextLayouts = { ...prevLayouts, lg: (prevLayouts.lg || []).filter((l: any) => l.i !== id) }
        saveShellState(next, nextLayouts)
        return nextLayouts
      })
      return next
    })
  }, [])

  const resetShell = useCallback(() => {
    clearShellState()
    setWidgets([...DEFAULT_WIDGETS])
    setLayouts({ ...DEFAULT_LAYOUTS })
  }, [])

  function onLayoutChange(_layout: any, allLayouts: any) {
    setLayouts(allLayouts)
    saveShellState(widgets, allLayouts)
  }

  function renderWidget(widget: WidgetInstance) {
    switch (widget.type) {
      case 'orders':
        return <OrdersWidget
          companyId={companyId}
          refreshKey={effectiveRefreshKey}
          onSelectOrder={(id, label) => onActivateEntity?.({ type: 'order', id, label })}
          onSendToChat={onSendToChat}
          onCreateOrder={() => openCreateOrder()}
        />
      case 'products':
        return <ProductsWidget
          companyId={companyId}
          refreshKey={effectiveRefreshKey}
          onSelectProduct={(id, label) => onActivateEntity?.({ type: 'product', id, label })}
          onAddToCart={addToCart}
          onCreateProduct={() => setCreateProductOpen(true)}
          cartItems={cartItems}
        />
      case 'docs':
        return <DocsWidget companyId={companyId} />
      case 'reorders':
        return <ReordersWidget companyId={companyId} />
      case 'order-detail':
        return <OrderDetailWidget orderId={widget.props?.orderId} onSendToChat={onSendToChat} />
      case 'inventory':
        return <InventoryWidget companyId={companyId} refreshKey={refreshKey} onSendToChat={onSendToChat} />
      case 'schedules':
        return <SchedulesWidget companyId={companyId} refreshKey={refreshKey} />
      case 'settings':
        return <SettingsWidget companyId={companyId} refreshKey={refreshKey} />
      case 'admin':
        return <AdminWidget />
      case 'order-header':
        return activeOrderId ? <OrderHeaderWidget orderId={activeOrderId} refreshKey={refreshKey} onDelete={() => { if (activeEntity) onCloseTab?.(activeEntity); onDeactivateEntity?.(); setLocalRefresh(k => k + 1) }} /> : null
      case 'order-supplier':
        return activeOrderId ? <OrderSupplierWidget orderId={activeOrderId} refreshKey={refreshKey} /> : null
      case 'order-timeline':
        return activeOrderId ? <OrderTimelineWidget orderId={activeOrderId} refreshKey={refreshKey} /> : null
      case 'order-docs':
        return activeOrderId ? <OrderDocsWidget orderId={activeOrderId} refreshKey={refreshKey} /> : null
      case 'order-contacts':
        return activeOrderId ? <OrderContactsWidget orderId={activeOrderId} refreshKey={refreshKey} /> : null
      case 'order-findings':
        return activeOrderId ? <OrderFindingsWidget orderId={activeOrderId} refreshKey={refreshKey} /> : null
      case 'order-costing':
        return activeOrderId ? <OrderCostingWidget orderId={activeOrderId} refreshKey={refreshKey} /> : null
      case 'product-header':
        return activeProductId ? <ProductHeaderWidget productId={activeProductId} refreshKey={refreshKey} onDelete={() => { if (activeEntity) onCloseTab?.(activeEntity); onDeactivateEntity?.(); setLocalRefresh(k => k + 1) }} /> : null
      case 'product-suppliers':
        return activeProductId ? <ProductSuppliersWidget productId={activeProductId} refreshKey={effectiveRefreshKey} /> : null
      case 'product-orders':
        return activeProductId ? (
          <ProductOrdersWidget
            productId={activeProductId}
            refreshKey={effectiveRefreshKey}
            onSelectOrder={(id, label) => onActivateEntity?.({ type: 'order', id, label })}
          />
        ) : null
      default:
        return null
    }
  }

  const cockpitWidgets = activeEntity?.type === 'product' ? PRODUCT_COCKPIT_WIDGETS : ORDER_COCKPIT_WIDGETS
  const cockpitLayouts = activeEntity?.type === 'product' ? PRODUCT_COCKPIT_LAYOUTS : ORDER_COCKPIT_LAYOUTS

  return (
    <div ref={containerRef} id="shell-root" className="h-full overflow-y-auto scrollbar-thin bg-background dotted-bg relative">
      <Toolbar
        widgetCount={widgets.length}
        cockpitMode={cockpitMode}
        activeEntity={activeEntity}
        onDeactivateEntity={onDeactivateEntity}
        onReset={resetShell}
        onAddWidget={addWidget}
        onOpenCart={() => setCartOpen(true)}
        cartCount={cartItems.length}
        onOpenSettings={() => setSettingsOpen(true)}
        openEntities={openEntities}
        onSelectEntity={(e) => onActivateEntity?.(e)}
        onCloseTab={onCloseTab}
        role={role}
        companies={companies}
        effectiveCompanyId={effectiveCompanyId}
        setCompanyId={setCompanyId}
        onSignOut={onSignOut}
        userEmail={userEmail}
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

      {cockpitMode && (
        <ResponsiveGridLayout
          className="p-2"
          width={containerWidth - 16}
          breakpoints={{ lg: 800, md: 600, sm: 0 }}
          cols={{ lg: 10, md: 6, sm: 4 }}
          rowHeight={60}
          layouts={cockpitLayouts}
          dragConfig={{ enabled: false, bounded: false }}
          resizeConfig={{ enabled: false }}

          margin={[8, 8]}
        >
          {cockpitWidgets.map(widget => (
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
        <EmptyState onAddWidget={addWidget} />
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

      {/* Floating cart button */}
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
        companyId={companyId}
        items={cartItems}
        onUpdateQuantity={updateCartQuantity}
        onRemove={removeFromCart}
        onClear={clearCart}
        onSendToChat={onSendToChat}
        onOrderCreated={(id, label) => onActivateEntity?.({ type: 'order', id, label })}
      />

      <CreateProductDialog
        open={createProductOpen}
        onClose={() => setCreateProductOpen(false)}
        companyId={companyId}
        onCreated={() => setLocalRefresh(k => k + 1)}
      />

      <CreateOrderDialog
        key={createOrderKey}
        open={createOrderOpen}
        onClose={() => { setCreateOrderOpen(false); setCreateOrderProduct(null) }}
        companyId={companyId}
        onSendToChat={onSendToChat}
        onOrderCreated={(id, label) => onActivateEntity?.({ type: 'order', id, label })}
        preselectedProduct={createOrderProduct}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        companyId={companyId}
        refreshKey={refreshKey}
      />
    </div>
  )
}
