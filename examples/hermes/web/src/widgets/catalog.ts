import type { WidgetInstance } from '@proto/core-web'

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

export const ORDER_COCKPIT_WIDGETS: WidgetInstance[] = [
  { id: 'cockpit-header', type: 'order-header', title: 'Pedido' },
  { id: 'cockpit-supplier', type: 'order-supplier', title: 'Proveedores e items' },
  { id: 'cockpit-docs', type: 'order-docs', title: 'Documentos' },
  { id: 'cockpit-costing', type: 'order-costing', title: 'Costeo' },
  { id: 'cockpit-contacts', type: 'order-contacts', title: 'Contactos' },
  { id: 'cockpit-findings', type: 'order-findings', title: 'Hallazgos' },
  { id: 'cockpit-timeline', type: 'order-timeline', title: 'Actividad' },
]

export const ORDER_COCKPIT_LAYOUTS = {
  lg: [
    { i: 'cockpit-header', x: 0, y: 0, w: 10, h: 3, minW: 4, minH: 2 },
    { i: 'cockpit-supplier', x: 0, y: 3, w: 6, h: 5, minW: 4, minH: 3 },
    { i: 'cockpit-docs', x: 6, y: 3, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'cockpit-costing', x: 0, y: 8, w: 6, h: 5, minW: 4, minH: 3 },
    { i: 'cockpit-contacts', x: 6, y: 8, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'cockpit-findings', x: 0, y: 13, w: 6, h: 6, minW: 4, minH: 3 },
    { i: 'cockpit-timeline', x: 6, y: 13, w: 4, h: 6, minW: 4, minH: 3 },
  ],
  md: [
    { i: 'cockpit-header', x: 0, y: 0, w: 6, h: 3 },
    { i: 'cockpit-supplier', x: 0, y: 3, w: 6, h: 5 },
    { i: 'cockpit-docs', x: 0, y: 8, w: 6, h: 4 },
    { i: 'cockpit-costing', x: 0, y: 12, w: 6, h: 5 },
    { i: 'cockpit-contacts', x: 0, y: 17, w: 6, h: 4 },
    { i: 'cockpit-findings', x: 0, y: 21, w: 6, h: 5 },
    { i: 'cockpit-timeline', x: 0, y: 26, w: 6, h: 4 },
  ],
  sm: [
    { i: 'cockpit-header', x: 0, y: 0, w: 4, h: 3 },
    { i: 'cockpit-supplier', x: 0, y: 3, w: 4, h: 5 },
    { i: 'cockpit-docs', x: 0, y: 8, w: 4, h: 4 },
    { i: 'cockpit-costing', x: 0, y: 12, w: 4, h: 5 },
    { i: 'cockpit-contacts', x: 0, y: 17, w: 4, h: 4 },
    { i: 'cockpit-findings', x: 0, y: 21, w: 4, h: 5 },
    { i: 'cockpit-timeline', x: 0, y: 26, w: 4, h: 4 },
  ],
}

export const PRODUCT_COCKPIT_WIDGETS: WidgetInstance[] = [
  { id: 'cockpit-product-header', type: 'product-header', title: 'Producto' },
  { id: 'cockpit-product-suppliers', type: 'product-suppliers', title: 'Proveedores' },
  { id: 'cockpit-product-orders', type: 'product-orders', title: 'Pedidos del producto' },
]

export const PRODUCT_COCKPIT_LAYOUTS = {
  lg: [
    { i: 'cockpit-product-header', x: 0, y: 0, w: 10, h: 4, minW: 4, minH: 3 },
    { i: 'cockpit-product-suppliers', x: 0, y: 4, w: 5, h: 4, minW: 3, minH: 3 },
    { i: 'cockpit-product-orders', x: 5, y: 4, w: 5, h: 4, minW: 4, minH: 3 },
  ],
  md: [
    { i: 'cockpit-product-header', x: 0, y: 0, w: 6, h: 4 },
    { i: 'cockpit-product-suppliers', x: 0, y: 4, w: 6, h: 4 },
    { i: 'cockpit-product-orders', x: 0, y: 8, w: 6, h: 4 },
  ],
  sm: [
    { i: 'cockpit-product-header', x: 0, y: 0, w: 4, h: 4 },
    { i: 'cockpit-product-suppliers', x: 0, y: 4, w: 4, h: 4 },
    { i: 'cockpit-product-orders', x: 0, y: 8, w: 4, h: 4 },
  ],
}
