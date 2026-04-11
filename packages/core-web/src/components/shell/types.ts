export type WidgetType =
  | 'orders' | 'products' | 'docs' | 'reorders' | 'order-detail'
  | 'admin' | 'settings' | 'inventory' | 'schedules'
  | 'order-header' | 'order-supplier' | 'order-timeline' | 'order-docs' | 'order-contacts' | 'order-findings' | 'order-costing'
  | 'product-header' | 'product-orders' | 'product-suppliers'

export interface WidgetInstance {
  id: string
  type: WidgetType
  title: string
  props?: Record<string, any>
}

export interface ActiveEntity {
  type: 'order' | 'product'
  id: string
  label: string
}

export interface CartItem {
  productId: string
  name: string
  category?: string
  imageUrl?: string
  quantity: number
}
