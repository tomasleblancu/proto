import { defineEntity } from 'proto/shared'

export default defineEntity({
  name: 'item',
  displayName: 'item',
  table: 'items',
  labelField: 'name',

  cockpit: {
    widgets: [
      { id: 'cockpit-item-detail', type: 'item-detail', title: 'Item Detail' },
    ],
    layouts: {
      lg: [
        { i: 'cockpit-item-detail', x: 0, y: 0, w: 10, h: 6, minW: 4, minH: 3 },
      ],
      md: [
        { i: 'cockpit-item-detail', x: 0, y: 0, w: 6, h: 6 },
      ],
      sm: [
        { i: 'cockpit-item-detail', x: 0, y: 0, w: 4, h: 6 },
      ],
    },
  },
})
