export type WidgetType = string

export interface WidgetInstance {
  id: string
  type: WidgetType
  title: string
  props?: Record<string, any>
}

export interface ActiveEntity {
  type: string
  id: string
  label: string
}
