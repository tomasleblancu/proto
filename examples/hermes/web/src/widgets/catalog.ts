import type { WidgetInstance } from 'proto/web'

/**
 * Default widgets shown on first visit / after reset. Cockpit layouts moved
 * to `@app/entities/<name>.ts` in phase 3e — each entity declares its own
 * cockpit widgets + layouts.
 */
export const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: 'products-1', type: 'products', title: 'Productos' },
  { id: 'orders-1', type: 'orders', title: 'Pedidos' },
]

export const DEFAULT_LAYOUTS = {
  lg: [
    { i: 'products-1', x: 0, y: 0, w: 6, h: 7, minW: 3, minH: 3 },
    { i: 'orders-1', x: 6, y: 0, w: 4, h: 7, minW: 2, minH: 3 },
  ],
  md: [
    { i: 'products-1', x: 0, y: 0, w: 6, h: 7, minW: 2, minH: 3 },
    { i: 'orders-1', x: 0, y: 7, w: 6, h: 3, minW: 2, minH: 3 },
  ],
  sm: [
    { i: 'products-1', x: 0, y: 0, w: 4, h: 7 },
    { i: 'orders-1', x: 0, y: 7, w: 4, h: 3 },
  ],
}
