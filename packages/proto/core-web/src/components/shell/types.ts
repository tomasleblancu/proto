export type WidgetType = string

export interface WidgetInstance {
  id: string
  type: WidgetType
  title: string
  props?: Record<string, unknown>
}

export interface ActiveEntity {
  type: string
  id: string
  label: string
}

/** Layout item for a single widget in one breakpoint. */
export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  static?: boolean
}

/** Grid layouts keyed by breakpoint (lg, md, sm). Compatible with react-grid-layout's ResponsiveLayouts. */
export type GridLayouts = Partial<Record<string, readonly LayoutItem[]>>
