/**
 * Hermes widget registry.
 *
 * Every widget the shell knows about is declared here via defineWidget().
 * App.tsx builds the registry via buildWidgetRegistry(WIDGETS) and passes it
 * to Shell.
 */
import { defineWidget } from '@tleblancureta/proto/web'
import OrdersWidget from './OrdersWidget'
import ProductsWidget from './ProductsWidget'
import DocsWidget from './DocsWidget'
import ReordersWidget from './ReordersWidget'
import OrderDetailWidget from './OrderDetailWidget'
import AdminWidget from './AdminWidget'
import SettingsWidget from './SettingsWidget'
import InventoryWidget from './InventoryWidget'
import SchedulesWidget from './SchedulesWidget'
import {
  OrderHeaderWidget,
  OrderSupplierWidget,
  OrderTimelineWidget,
  OrderDocsWidget,
  OrderContactsWidget,
  OrderFindingsWidget,
  OrderCostingWidget,
} from './cockpit/order'
import {
  ProductHeaderWidget,
  ProductSuppliersWidget,
  ProductOrdersWidget,
} from './cockpit/product'

export const WIDGETS = [
  // ── General widgets ────────────────────────────────────────────────────

  defineWidget({
    type: 'orders',
    title: 'Pedidos',
    icon: '📦',
    category: 'general',
    defaultSize: { w: 3, h: 4, minW: 2, minH: 3 },
    render: (_, ctx) => (
      <OrdersWidget
        companyId={ctx.companyId}
        refreshKey={ctx.refreshKey}
        onSelectOrder={(id, label) => ctx.onActivateEntity?.({ type: 'order', id, label })}
        onSendToChat={ctx.onSendToChat}
        onCreateOrder={() => ctx.openCreateOrder()}
      />
    ),
  }),

  defineWidget({
    type: 'products',
    title: 'Productos',
    icon: '🏷',
    category: 'general',
    defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
    render: (_, ctx) => (
      <ProductsWidget
        companyId={ctx.companyId}
        refreshKey={ctx.refreshKey}
        onSelectProduct={(id, label) => ctx.onActivateEntity?.({ type: 'product', id, label })}
        onAddToCart={ctx.addToCart}
        onCreateProduct={ctx.openCreateProduct}
        cartItems={ctx.cartItems}
      />
    ),
  }),

  defineWidget({
    type: 'docs',
    title: 'Documentos',
    icon: '📄',
    category: 'general',
    defaultSize: { w: 3, h: 4, minW: 2, minH: 3 },
    render: (_, ctx) => <DocsWidget companyId={ctx.companyId} />,
  }),

  defineWidget({
    type: 'reorders',
    title: 'Recompras',
    icon: '🔄',
    category: 'general',
    defaultSize: { w: 3, h: 4, minW: 2, minH: 3 },
    render: (_, ctx) => <ReordersWidget companyId={ctx.companyId} />,
  }),

  defineWidget({
    type: 'inventory',
    title: 'Inventario',
    icon: '📊',
    category: 'general',
    defaultSize: { w: 5, h: 3, minW: 3, minH: 3 },
    render: (_, ctx) => (
      <InventoryWidget
        companyId={ctx.companyId}
        refreshKey={ctx.refreshKey}
        onSendToChat={ctx.onSendToChat}
      />
    ),
  }),

  defineWidget({
    type: 'schedules',
    title: 'Tareas programadas',
    icon: '⏰',
    category: 'general',
    defaultSize: { w: 5, h: 5, minW: 3, minH: 3 },
    render: (_, ctx) => (
      <SchedulesWidget companyId={ctx.companyId} refreshKey={ctx.refreshKey} />
    ),
  }),

  defineWidget({
    type: 'admin',
    title: 'Agentes',
    icon: '🤖',
    category: 'general',
    defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
    render: () => <AdminWidget />,
  }),

  defineWidget({
    type: 'settings',
    title: 'Ajustes',
    icon: '⚙️',
    category: 'cockpit',
    defaultSize: { w: 3, h: 3, minW: 2, minH: 3 },
    render: (_, ctx) => (
      <SettingsWidget companyId={ctx.companyId} refreshKey={ctx.refreshKey} />
    ),
  }),

  defineWidget({
    type: 'order-detail',
    title: 'Detalle de pedido',
    category: 'cockpit',
    defaultSize: { w: 4, h: 5, minW: 3, minH: 3 },
    render: (instance, ctx) => (
      <OrderDetailWidget
        orderId={instance.props?.orderId}
        onSendToChat={ctx.onSendToChat}
      />
    ),
  }),

  // ── Order cockpit widgets ──────────────────────────────────────────────

  defineWidget({
    type: 'order-header',
    title: 'Pedido',
    category: 'cockpit',
    defaultSize: { w: 10, h: 3, minW: 4, minH: 2 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'order') return null
      return (
        <OrderHeaderWidget
          orderId={ctx.activeEntity.id}
          refreshKey={ctx.refreshKey}
          onDelete={() => {
            if (ctx.activeEntity) ctx.onCloseTab?.(ctx.activeEntity)
            ctx.onDeactivateEntity?.()
            ctx.triggerLocalRefresh()
          }}
        />
      )
    },
  }),

  defineWidget({
    type: 'order-supplier',
    title: 'Proveedores e items',
    category: 'cockpit',
    defaultSize: { w: 5, h: 5, minW: 3, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'order') return null
      return <OrderSupplierWidget orderId={ctx.activeEntity.id} refreshKey={ctx.refreshKey} />
    },
  }),

  defineWidget({
    type: 'order-timeline',
    title: 'Actividad',
    category: 'cockpit',
    defaultSize: { w: 5, h: 5, minW: 3, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'order') return null
      return <OrderTimelineWidget orderId={ctx.activeEntity.id} refreshKey={ctx.refreshKey} />
    },
  }),

  defineWidget({
    type: 'order-docs',
    title: 'Documentos',
    category: 'cockpit',
    defaultSize: { w: 5, h: 4, minW: 3, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'order') return null
      return <OrderDocsWidget orderId={ctx.activeEntity.id} refreshKey={ctx.refreshKey} />
    },
  }),

  defineWidget({
    type: 'order-contacts',
    title: 'Contactos',
    category: 'cockpit',
    defaultSize: { w: 5, h: 4, minW: 3, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'order') return null
      return <OrderContactsWidget orderId={ctx.activeEntity.id} refreshKey={ctx.refreshKey} />
    },
  }),

  defineWidget({
    type: 'order-findings',
    title: 'Hallazgos',
    category: 'cockpit',
    defaultSize: { w: 5, h: 5, minW: 3, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'order') return null
      return <OrderFindingsWidget orderId={ctx.activeEntity.id} refreshKey={ctx.refreshKey} />
    },
  }),

  defineWidget({
    type: 'order-costing',
    title: 'Costeo',
    category: 'cockpit',
    defaultSize: { w: 5, h: 5, minW: 3, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'order') return null
      return <OrderCostingWidget orderId={ctx.activeEntity.id} refreshKey={ctx.refreshKey} />
    },
  }),

  // ── Product cockpit widgets ────────────────────────────────────────────

  defineWidget({
    type: 'product-header',
    title: 'Producto',
    category: 'cockpit',
    defaultSize: { w: 10, h: 4, minW: 4, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'product') return null
      return (
        <ProductHeaderWidget
          productId={ctx.activeEntity.id}
          refreshKey={ctx.refreshKey}
          onDelete={() => {
            if (ctx.activeEntity) ctx.onCloseTab?.(ctx.activeEntity)
            ctx.onDeactivateEntity?.()
            ctx.triggerLocalRefresh()
          }}
        />
      )
    },
  }),

  defineWidget({
    type: 'product-suppliers',
    title: 'Proveedores',
    category: 'cockpit',
    defaultSize: { w: 10, h: 4, minW: 4, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'product') return null
      return (
        <ProductSuppliersWidget
          productId={ctx.activeEntity.id}
          refreshKey={ctx.refreshKey}
        />
      )
    },
  }),

  defineWidget({
    type: 'product-orders',
    title: 'Pedidos del producto',
    category: 'cockpit',
    defaultSize: { w: 10, h: 4, minW: 4, minH: 3 },
    render: (_, ctx) => {
      if (ctx.activeEntity?.type !== 'product') return null
      return (
        <ProductOrdersWidget
          productId={ctx.activeEntity.id}
          refreshKey={ctx.refreshKey}
          onSelectOrder={(id, label) => ctx.onActivateEntity?.({ type: 'order', id, label })}
        />
      )
    },
  }),
] as const
