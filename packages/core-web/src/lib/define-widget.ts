/**
 * defineWidget — declarative shell widget definition.
 *
 * App code declares widgets as data instead of hardcoding a switch in Shell.
 * Each widget provides a `render(instance, ctx)` function that returns the
 * React node, pulling whatever it needs from the shared ShellContext. This
 * keeps widget components themselves untouched — only the wiring is declared
 * in one place.
 *
 * Example (app-space):
 *
 *   import { defineWidget } from '@proto/core-web'
 *
 *   export default defineWidget({
 *     type: 'orders',
 *     title: 'Pedidos',
 *     icon: '📦',
 *     category: 'general',
 *     defaultSize: { w: 3, h: 4, minW: 2, minH: 3 },
 *     render: (_, ctx) => (
 *       <OrdersWidget
 *         companyId={ctx.companyId}
 *         refreshKey={ctx.refreshKey}
 *         onSelectOrder={(id, label) =>
 *           ctx.onActivateEntity?.({ type: 'order', id, label })
 *         }
 *       />
 *     ),
 *   })
 */
import type { ReactNode } from 'react'
import type { ActiveEntity, CartItem, WidgetInstance } from '@/components/shell/types'

/**
 * Shared context passed to every widget's `render` function. Contains the
 * state and callbacks every widget might need — widgets pick what they use.
 *
 * Instance-level data (like which specific order a detail widget points to)
 * lives in `WidgetInstance.props` and is passed to render() alongside ctx.
 */
export interface ShellContext {
  companyId: string
  refreshKey: number
  activeEntity: ActiveEntity | null

  onSendToChat: (message: string) => void
  onActivateEntity?: (e: ActiveEntity) => void
  onDeactivateEntity?: () => void
  onCloseTab?: (e: ActiveEntity) => void

  cartItems: CartItem[]
  addToCart: (item: CartItem) => void

  openCreateOrder: (product?: { id: string; name: string }) => void
  openCreateProduct: () => void

  /** Force widgets to re-fetch without a full shell reload. */
  triggerLocalRefresh: () => void
}

export type WidgetCategory = 'general' | 'cockpit'

export interface WidgetSize {
  w: number
  h: number
  minW: number
  minH: number
}

/**
 * Declarative widget definition. `render` is the only non-metadata field —
 * everything else powers catalog UI (title + icon in the "Agregar" menu)
 * and default layout positioning.
 */
export interface WidgetDefinition {
  /** Unique id, used in layouts and persistence. */
  type: string
  /** Human-readable title shown in headers and the catalog menu. */
  title: string
  /** Emoji or short string rendered in the catalog menu. */
  icon?: string
  /**
   * `general` widgets are user-addable via the catalog menu.
   * `cockpit` widgets are rendered only in cockpit mode for a specific entity.
   */
  category: WidgetCategory
  /** Default grid size when added via the catalog menu. */
  defaultSize?: WidgetSize
  /** Build the widget's React node for a given instance + shell context. */
  render: (instance: WidgetInstance, ctx: ShellContext) => ReactNode
}

/**
 * Identity helper with type inference. Use in widget files:
 *
 *   export default defineWidget({ ... })
 */
export function defineWidget(def: WidgetDefinition): WidgetDefinition {
  return def
}

/** Map of widget type -> definition, built from an array of definitions. */
export type WidgetRegistry = Map<string, WidgetDefinition>

export function buildWidgetRegistry(defs: readonly WidgetDefinition[]): WidgetRegistry {
  const map: WidgetRegistry = new Map()
  for (const def of defs) {
    if (map.has(def.type)) {
      console.warn(`[defineWidget] duplicate widget type: ${def.type}`)
    }
    map.set(def.type, def)
  }
  return map
}
