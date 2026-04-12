import { ProtoApp } from '@tleblancureta/proto/web'
import type { WidgetDefinition } from '@tleblancureta/proto/web'
import type { EntityDefinition } from '@tleblancureta/proto/shared'

const widgetMods = import.meta.glob('./widgets/*.tsx', { eager: true }) as Record<string, { default: WidgetDefinition }>
const WIDGETS = Object.values(widgetMods).map(m => m.default).filter(Boolean)

const entityMods = import.meta.glob('../../app/entities/*.ts', { eager: true }) as Record<string, { default: EntityDefinition }>
const ENTITIES = Object.values(entityMods)
  .map(m => m.default)
  .filter((e): e is EntityDefinition => !!e && typeof e === 'object' && 'name' in e)

export default function App() {
  return <ProtoApp widgets={WIDGETS} entities={ENTITIES} />
}
