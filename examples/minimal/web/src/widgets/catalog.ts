import type { WidgetInstance } from '@proto/core-web'

export const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: 'items-1', type: 'items', title: 'Items' },
]

export const DEFAULT_LAYOUTS = {
  lg: [
    { i: 'items-1', x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 3 },
  ],
  md: [
    { i: 'items-1', x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 3 },
  ],
  sm: [
    { i: 'items-1', x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 3 },
  ],
}
