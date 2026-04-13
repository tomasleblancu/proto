---
name: proto-widget
description: Agregar o modificar un widget del Shell en una app proto via defineWidget. Activa cuando el usuario pide crear, editar, o eliminar un widget del canvas derecho (ej: "agregá un widget para X", "quiero mostrar Y en el shell", "el widget Z debería tener Q").
type: framework
---

# proto-widget — agregar un widget al Shell

El Shell es el canvas derecho que acompaña al chat. Muestra widgets en un grid resizable (modo general) o en un layout fijo de cockpit cuando hay una entity activa (order, product). Cada widget es un componente React declarado via `defineWidget()` y registrado en `widgets-registry.tsx`.

## Cuándo activa este skill

- "agregá un widget para listar clientes"
- "quiero mostrar los pagos pendientes en el shell"
- "el widget de órdenes debería tener un botón de X"
- "creá un widget cockpit para cuando hay una factura activa"
- "mostrame cómo agregar un widget"

## Un solo archivo

Agregar un widget es **un solo paso**: crear un archivo en `web/src/widgets/<Name>Widget.tsx` que exporta `defineWidget()` por default. Se auto-descubre via `import.meta.glob` en `App.tsx` — no hay que registrar nada manualmente.

## Shape del componente

Un widget es un componente React que recibe los props que necesita. **No** reciben el `ShellContext` directo — eso es trabajo del adapter. Mantené el componente lo más puro posible (fácil de testear, fácil de reutilizar).

```tsx
// examples/hermes/app/widgets/OrdersWidget.tsx
// (actualmente en packages/core-web/src/components/widgets/OrdersWidget.tsx, moverá en Phase 3d)
import { useData } from '@/hooks/useData'

interface Props {
  companyId: string
  refreshKey: number
  onSelectOrder: (id: string, label: string) => void
  onSendToChat: (message: string) => void
  onCreateOrder: () => void
}

export default function OrdersWidget({ companyId, refreshKey, onSelectOrder, onSendToChat, onCreateOrder }: Props) {
  const { data: orders } = useData(async (signal) => {
    const res = await fetch(`/api/orders?company=${companyId}`, { signal })
    return res.json()
  }, [companyId, refreshKey])

  return (
    <div className="p-2">
      <button onClick={onCreateOrder}>+ nuevo</button>
      {orders?.map(o => (
        <button key={o.id} onClick={() => onSelectOrder(o.id, o.title)}>{o.title}</button>
      ))}
    </div>
  )
}
```

**Reglas del componente**:
- **No `useEffect` directo**. Usá `useData` (fetching) o `useMountEffect` (mount-time side effects).
- **Props explícitos**. No leas `activeEntity` adentro; recibilo como prop.
- **`refreshKey` en las deps de `useData`**. Así el widget re-fetcha cuando el agente cambia algo.
- **Callbacks en vez de navegación directa**. `onSelectOrder(id)` en vez de `window.location = ...`. El Shell decide qué hacer.

## Shape del registro (defineWidget)

```tsx
// packages/core-web/src/components/shell/widgets-registry.tsx
import { defineWidget } from '@/lib/define-widget'
import OrdersWidget from '@/components/widgets/OrdersWidget'

export const WIDGETS = [
  // ... otros widgets ...

  defineWidget({
    type: 'orders',                         // unique id
    title: 'Pedidos',                       // shown in header + catalog menu
    icon: '📦',                             // emoji for the catalog menu
    category: 'general',                    // 'general' (user-addable) or 'cockpit' (programmatic)
    defaultSize: { w: 3, h: 4, minW: 2, minH: 3 },
    render: (_, ctx) => (
      <OrdersWidget
        companyId={ctx.companyId}
        refreshKey={ctx.refreshKey}
        onSelectOrder={(id, label) => ctx.onActivateEntity?.({ type: 'order', id, label })}
        onSendToChat={ctx.onSendToChat}
        onCreateOrder={() => ctx.openCreateOrder()}
      />
    ),
  }),
]
```

## defineWidget fields

- **`type`** — kebab-case único. Usado en layouts (localStorage) y como key del registry.
- **`title`** — human-readable. Aparece en el header del widget y en el menú "Agregar" del catalog.
- **`icon`** — emoji corto (1 char) para el catalog menu.
- **`category`**:
  - `'general'` → aparece en el menú "Agregar", el user puede instanciarlo libremente.
  - `'cockpit'` → solo se instancia programáticamente (por el cockpit de una entity o por otro widget). NO aparece en el menú.
- **`defaultSize`** — `{ w, h, minW, minH }` en unidades de grid (cols de 10 en lg, 6 en md, 4 en sm).
- **`render(instance, ctx)`** — función que retorna el ReactNode. Recibe:
  - `instance: WidgetInstance` — `{ id, type, title, props? }` de la instancia particular del widget. Para instance-specific data (ej. `orderId` en `order-detail`), leé de `instance.props`.
  - `ctx: ShellContext` — el contexto compartido.
- **`configPanel(props)`** — *(opcional)* función que retorna el ReactNode de configuración. Se renderiza en Admin > Widgets al hacer click en el widget. Recibe `{ companyId, widgetType }`. Ver sección "Widget con configuración" abajo.

## ShellContext

El contexto que reciben todos los render callbacks. Vive en `packages/proto/core-web/src/lib/define-widget.ts`:

```ts
interface ShellContext {
  companyId: string
  refreshKey: number              // re-fetch signal (bump para re-render con data fresca)
  activeEntity: ActiveEntity | null

  onSendToChat: (message: string) => void
  onActivateEntity?: (e: ActiveEntity) => void
  onDeactivateEntity?: () => void
  onCloseTab?: (e: ActiveEntity) => void
  triggerLocalRefresh: () => void
}
```

**Si tu app necesita campos extra** (ej. `cartItems`, `openCreateOrder`), extendé via module augmentation en un archivo `.d.ts`:

```ts
// web/src/shell-context.d.ts
declare module 'proto/web' {
  interface ShellContext {
    cartItems: CartItem[]
    addToCart: (item: CartItem) => void
  }
}
export {}
```

Y pasá los valores en el `useMemo` que arma `shellCtx` en `Shell.tsx`.

## Widgets cockpit

Los widgets `category: 'cockpit'` son parte de la vista focalizada cuando hay una entity activa. Convention: retornan `null` si la entity no es del tipo correcto:

```tsx
defineWidget({
  type: 'order-header',
  title: 'Pedido',
  category: 'cockpit',
  defaultSize: { w: 10, h: 3, minW: 4, minH: 2 },
  render: (_, ctx) => {
    if (ctx.activeEntity?.type !== 'order') return null
    return (
      <OrderHeaderWidget
        orderId={ctx.activeEntity.id}
        refreshKey={ctx.refreshKey}
        onDelete={() => {
          if (ctx.activeEntity) ctx.onCloseTab?.(ctx.activeEntity)
          ctx.onDeactivateEntity?.()
          ctx.triggerLocalRefresh()
        }}
      />
    )
  },
}),
```

**Nota**: qué widgets aparecen en el cockpit y en qué layout viene de `catalog.ts::ORDER_COCKPIT_WIDGETS` + `ORDER_COCKPIT_LAYOUTS`. Esto va a moverse a `defineEntity()` en Phase 3e — por ahora, si agregás un widget cockpit nuevo, también agregalo al array correspondiente de `catalog.ts`.

## Widget con configuración

Si un widget necesita settings configurables por el admin (montos, tasas, opciones), usá `configPanel` + `useWidgetSettings`. Los settings se guardan en la tabla `widget_settings` (por `company_id` + `widget_type`) como JSON.

### 1. Declarar el configPanel en defineWidget

```tsx
import { defineWidget, useWidgetSettings } from '@tleblancureta/proto/web'
import type { ConfigPanelProps, ShellContext } from '@tleblancureta/proto/web'

// Panel de configuración (se renderiza en Admin > Widgets)
function MiConfig({ companyId, widgetType }: ConfigPanelProps) {
  const { settings, saveSettings, loading } = useWidgetSettings(
    widgetType, companyId, { rate: 0, currency: 'CLP' }
  )
  if (loading) return <p>Cargando...</p>
  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">Tarifa por hora</label>
      <input type="number" value={settings.rate}
        onChange={e => saveSettings({ rate: Number(e.target.value) })}
        className="border rounded px-2 py-1" />
    </div>
  )
}

// Widget que usa la configuración
function MiWidget({ companyId, refreshKey }: ShellContext) {
  const { settings } = useWidgetSettings('mi-widget', companyId, { rate: 0, currency: 'CLP' })
  // usar settings.rate en los cálculos...
}

export default defineWidget({
  type: 'mi-widget',
  title: 'Mi Widget',
  icon: '⚙️',
  category: 'general',
  configPanel: (props) => <MiConfig {...props} />,
  render: (_, ctx) => <MiWidget {...ctx} />,
})
```

### 2. useWidgetSettings API

```ts
const { settings, loading, error, saveSettings } = useWidgetSettings<T>(
  widgetType,   // string — el `type` del widget
  companyId,    // string — company actual
  defaults,     // T — valores default (también define el tipo TypeScript)
)
```

- **`settings: T`** — merge de defaults + DB + cambios optimistas. Siempre completo.
- **`saveSettings(patch)`** — upsert parcial. Optimista: actualiza local primero, luego persiste.
- Se re-fetcha automáticamente cuando cambia `companyId` o `widgetType`.

### 3. Tabla widget_settings

Migración ya incluida en el framework (`20260413100000_widget_settings.sql`):

```sql
create table widget_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  widget_type text not null,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (company_id, widget_type)
);
```

**No necesitás crear esta migración** — viene con el scaffold. Si tu app es anterior, aplicá la migración manualmente.

### 4. Admin > Widgets

Los widgets con `configPanel` aparecen con un icono de engranaje en la lista de Admin > Widgets. Al hacer click se abre el panel de configuración. Los que no tienen `configPanel` no son clickeables.

## Después de agregar el widget

1. **Verificá el build**:
   ```bash
   npm run build
   ```
   Si hay errores de TypeScript en el registry o en Shell, es acá.

2. **Smoke test visual**:
   ```bash
   npm run dev:web        # arranca Vite en :3001
   npm run dev:gateway    # arranca gateway en :8092 (otro tab)
   ```
   Abrí `http://localhost:3001`, autenticate, y:
   - Si es `general`: verificá que aparece en el menú "Agregar" del toolbar.
   - Si es `cockpit`: activá una entity y verificá que renderiza.

3. **Layouts** — si el widget es general y agregaste uno nuevo, el user lo posiciona manualmente. Si es cockpit, asegurate de que `catalog.ts::ORDER_COCKPIT_LAYOUTS` (o PRODUCT) tenga la entrada correspondiente con sus coordenadas.

## Reglas

1. **Un widget, una responsabilidad**. Si necesitás mostrar órdenes + productos + pagos en el mismo widget, probablemente son 3 widgets.

2. **No leer estado global desde el componente**. Todo viene por props. Si necesitás auth, pasalo via props; si necesitás activeEntity, leelo del ctx en el registry adapter y pasalo.

3. **No `useEffect` directo**. Solo en hooks reusables (`useData`, `useMountEffect`).

4. **Los widgets son reactivos a `refreshKey`**. Cuando el agente cambia algo, Shell incrementa `refreshKey` → widgets que lo tengan en sus deps de `useData` se re-fetchan automáticamente.

5. **Styling con Tailwind + shadcn primitives** (`components/ui/`). No inline styles.

6. **Drag handle**: los widgets general tienen un header con `.widget-drag-handle` class — ya lo provee Shell, no lo replices.

## Anti-patterns

- ❌ **Widget que hace fetch en `useEffect`** — usá `useData`.
- ❌ **Widget que lee `localStorage` directo** — hay un `persistence.ts` wrap, usalo.
- ❌ **Widget que muta `refreshKey` desde adentro** — solo el Shell o `ctx.triggerLocalRefresh()` puede. Los widgets reaccionan, no manipulan.
- ❌ **Registrar widgets en lugares random** — solo en `web/src/widgets/`. Se auto-descubren.
- ❌ **Acoplar a Hermes concepts específicos** — si estás en proto framework dev, el widget debería ser genérico. Si es Hermes-específico, está OK, pero notá que se va a mover a `examples/hermes/web/widgets/` en Phase 3d.
- ❌ **Widget cockpit que no chequea `activeEntity.type`** — renderiza basura si se usa fuera de contexto.

## Checklist antes de cerrar

- [ ] Componente React en `web/src/widgets/<Name>Widget.tsx`
- [ ] Props explícitos, sin leer context global
- [ ] `useData(fetcher, [deps, refreshKey])` en vez de `useEffect`
- [ ] `export default defineWidget({...})` en el archivo
- [ ] `type` es único (grep para asegurar)
- [ ] `category: 'general'` si el user lo puede agregar, `'cockpit'` si es programático
- [ ] `defaultSize` ajustado al contenido esperado (mirá otros widgets similares)
- [ ] Si es cockpit: referenciado en `defineEntity({ cockpit: { widgets, layouts } })` de la entity correspondiente
- [ ] Si necesitás campos extra en ctx: module augmentation en `web/src/shell-context.d.ts`
- [ ] Si tiene config: `configPanel` declarado + `useWidgetSettings` en el render
- [ ] `npm run build` pasa
- [ ] Smoke test visual en el browser
