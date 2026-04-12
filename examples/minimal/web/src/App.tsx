import { ProtoApp, defineWidget } from '@proto/core-web'
import { ENTITIES } from '@app/entities/index.js'
import ItemsWidget from './widgets/ItemsWidget'
import ItemDetailWidget from './widgets/ItemDetailWidget'

const WIDGETS = [
  defineWidget({
    type: 'items',
    title: 'Items',
    icon: '📋',
    category: 'general',
    defaultSize: { w: 4, h: 5, minW: 2, minH: 3 },
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

export default function App() {
  return <ProtoApp widgets={WIDGETS} entities={[...ENTITIES]} />
}
