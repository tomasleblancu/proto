import { ProtoApp, loadWidgets } from '@tleblancureta/proto/web'
import type { EntityDefinition } from '@tleblancureta/proto/shared'

const WIDGETS = loadWidgets(
  import.meta.glob('./widgets/*/index.tsx', { eager: true }),
  import.meta.glob('./widgets/*/config.tsx', { eager: true }),
)

const entityMods = import.meta.glob('../../app/entities/*.ts', { eager: true }) as Record<string, { default: EntityDefinition }>
const ENTITIES = Object.values(entityMods)
  .map(m => m.default)
  .filter((e): e is EntityDefinition => !!e && typeof e === 'object' && 'name' in e)

export default function App() {
  return <ProtoApp widgets={WIDGETS} entities={ENTITIES} />
}
