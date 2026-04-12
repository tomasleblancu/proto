/**
 * defineWidget — declarative shell widget definition.
 *
 * App code declares widgets as data instead of hardcoding a switch in Shell.
 * Each widget provides a `render(instance, ctx)` function that returns the
 * React node, pulling whatever it needs from the shared ShellContext.
 *
 * The `ShellContext` interface below contains the framework-level fields every
 * widget receives. Apps extend it via TypeScript module augmentation to add
 * their own fields (cart state, app-specific callbacks, etc).
 *
 * Example augmentation in an app:
 *
 *   declare module 'proto/web' {
 *     interface ShellContext {
 *       cartItems: CartItem[]
 *       addToCart: (item: CartItem) => void
 *     }
 *   }
 */
import type { ReactNode } from 'react'
import type { ActiveEntity, WidgetInstance } from '../components/shell/types'

export interface ShellContext {
  companyId: string
  refreshKey: number
  activeEntity: ActiveEntity | null

  onSendToChat: (message: string) => void
  onActivateEntity?: (e: ActiveEntity) => void
  onDeactivateEntity?: () => void
  onCloseTab?: (e: ActiveEntity) => void

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

export interface WidgetDefinition {
  type: string
  title: string
  icon?: string
  category: WidgetCategory
  defaultSize?: WidgetSize
  render: (instance: WidgetInstance, ctx: ShellContext) => ReactNode
}

export function defineWidget(def: WidgetDefinition): WidgetDefinition {
  return def
}

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
