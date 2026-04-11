/**
 * Product entity — catalog-level object. Activating a product opens the
 * product cockpit (header, suppliers, orders history). Used mostly from the
 * web side (user clicks a product row) but the agent can activate it too to
 * scope conversations.
 */
import { defineEntity } from '@proto/core-shared'

export default defineEntity({
  name: 'product',
  displayName: 'producto',
  table: 'products',
  labelField: 'name',

  cockpit: {
    widgets: [
      { id: 'cockpit-product-header', type: 'product-header', title: 'Producto' },
      { id: 'cockpit-product-suppliers', type: 'product-suppliers', title: 'Proveedores' },
      { id: 'cockpit-product-orders', type: 'product-orders', title: 'Pedidos del producto' },
    ],
    layouts: {
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
    },
  },
})
