import { defineWidget } from '@proto/core-web'
import ItemsWidget from './ItemsWidget'
import ItemDetailWidget from './ItemDetailWidget'

export const WIDGETS = [
  defineWidget({
    type: 'items',
    title: 'Items',
    icon: '📋',
    category: 'general',
    defaultSize: { w: 3, h: 4, minW: 2, minH: 3 },
    render: (_, ctx) => <ItemsWidget {...ctx} />,
  }),

  defineWidget({
    type: 'item-detail',
    title: 'Item Detail',
    icon: '🔍',
    category: 'cockpit',
    defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
    render: (_, ctx) => <ItemDetailWidget {...ctx} />,
  }),
]
