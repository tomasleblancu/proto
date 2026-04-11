---
name: proto-entity
description: Agregar o modificar una entity activable en una app proto via defineEntity. Activa cuando el usuario quiere una cosa nueva que se pueda "enfocar" (cockpit mode) desde chat o UI (ej: "agregá un entity para proyectos", "quiero que el agente pueda activar un cliente", "necesito cockpit para facturas").
type: framework
---

# proto-entity — agregar una entity activable

Una entity es un objeto first-class del app que puede ser "enfocado": el agente la activa via MCP tool, la UI entra en cockpit mode, y el chat inyecta un snapshot markdown fresco en cada turno. `defineEntity` colapsa los tres lados (MCP tools + cockpit layouts + snapshot) en una sola declaración.

## Cuándo activa este skill

- "agregá un entity para proyectos"
- "quiero que el agente pueda activar un cliente"
- "necesito cockpit para facturas"
- "creá una entity para pagos"
- "mostrame cómo agregar una entity nueva"

## Dónde va el archivo

Las entities viven en `<app>/app/entities/*.ts` con un archivo por entity + un `index.ts` que las agrupa:

```
examples/hermes/app/entities/
├── order.ts       ← entity principal de Hermes (con snapshotBuilder)
├── product.ts     ← catalog-level entity
└── index.ts       ← export const ENTITIES = [orderEntity, productEntity]
```

## Shape de una entity

```ts
// examples/hermes/app/entities/invoice.ts
import { defineEntity } from '@proto/core-shared'

export default defineEntity({
  name: 'invoice',              // usado como activeEntity.type + sufijo de tool
  displayName: 'factura',       // singular humano ("Activa una factura...")
  table: 'invoices',            // tabla Supabase
  labelField: 'number',         // columna que el generator usa como label default

  activateDescription: `Activa una factura como foco del agente. El cockpit del frontend entra en modo factura y las tools scoped operan sobre esta factura sin repetir el id.`,

  cockpit: {
    widgets: [
      { id: 'cockpit-invoice-header', type: 'invoice-header', title: 'Factura' },
      { id: 'cockpit-invoice-lines', type: 'invoice-lines', title: 'Items' },
      { id: 'cockpit-invoice-payments', type: 'invoice-payments', title: 'Pagos' },
    ],
    layouts: {
      lg: [
        { i: 'cockpit-invoice-header', x: 0, y: 0, w: 10, h: 3 },
        { i: 'cockpit-invoice-lines', x: 0, y: 3, w: 6, h: 5 },
        { i: 'cockpit-invoice-payments', x: 6, y: 3, w: 4, h: 5 },
      ],
      md: [ /* ... */ ],
      sm: [ /* ... */ ],
    },
  },

  snapshotBuilder: async (invoice, { supabase }) => {
    const db = supabase as { from: (t: string) => any }
    const { data } = await db.from('invoices').select('*, lines:invoice_lines(*)').eq('id', invoice.id).maybeSingle()
    if (!data) return null
    const lines: string[] = [`# Factura ${data.number}`, '', `- Total: ${data.currency} ${data.total}`]
    for (const line of data.lines || []) lines.push(`- ${line.description}: ${line.quantity} x ${line.unit_price}`)
    return lines.join('\n')
  },
})
```

## defineEntity fields

- **`name`** — id único (lowercase snake_case). Se convierte en `activeEntity.type` y se usa como sufijo en los tools: `activate_<name>`, `deactivate_<name>`, `get_active_<name>`.
- **`displayName`** — forma singular humana (ej: "pedido", "cliente"). El generator la usa en las descriptions default ("Activa un pedido...").
- **`table`** — tabla Supabase. El activate tool hace `SELECT * FROM <table> WHERE id = ?`.
- **`labelField`** — columna que el activate tool devuelve como label del entity (se muestra en la tab del cockpit).
- **`cockpit`** *(opcional)* — `{ widgets: WidgetInstance[], layouts: Layouts }`. Si existe, el Shell entra en cockpit mode con estas layouts cuando `activeEntity.type === entity.name`. Los `widgets[].type` deben existir en el widget registry (ver `proto-widget` skill).
- **`snapshotBuilder`** *(opcional)* — async function que recibe `(entity, { supabase })` y retorna un markdown string (o `null`). Llamada desde la web en cada chat turn con el supabase cliente del browser. El markdown se inyecta en `companyContext`. Para apps sin snapshot: omitir.
- **`activateDescription`** *(opcional)* — override de la description del tool `activate_<name>`. Usá esto si querés controlar cómo el agente entiende cuándo activar la entity. Default: un template genérico.

## Después de agregar la entity

1. **Sumala al registro** en `<app>/app/entities/index.ts`:
   ```ts
   import invoiceEntity from './invoice.js'
   export const ENTITIES = [orderEntity, productEntity, invoiceEntity] as const
   export { invoiceEntity }
   ```

2. **Widgets del cockpit**: cada `widgets[].type` del cockpit debe estar declarado en `widgets/registry.tsx` via `defineWidget`. Si todavía no existen, creálos con el `proto-widget` skill primero. El `render()` de cada widget cockpit debe empezar con `if (ctx.activeEntity?.type !== '<name>') return null`.

3. **Smoke test** — verificá que los 3 tools auto-generados aparecen:
   ```bash
   npx tsx -e "
   import { createMcpServer } from '@proto/core-mcp'
   import { registerAppTools } from './examples/hermes/app/tools/index.ts'
   const s = createMcpServer({ name: 'hermes', version: '0.1.0' })
   registerAppTools(s)
   const names = Object.keys((s as any)._registeredTools).sort()
   console.log('entity tools:', names.filter(n => /^(activate|deactivate|get_active)_invoice$/.test(n)))
   "
   # expected: [ 'activate_invoice', 'deactivate_invoice', 'get_active_invoice' ]
   ```

4. **Frontend interception**: `Chat.tsx` ya intercepta cualquier `activate_<name>`/`deactivate_<name>` genéricamente (via `parseEntityToolName`). No necesitás tocar el frontend salvo para agregar `type: 'invoice'` al narrowing de `onAgentActivateEntity` si quedó hardcoded en el `App.tsx`.

5. **Migración Supabase**: si la tabla no existe, creá la migración primero. Las RLS policies deben permitir acceso via service role (core-mcp) y via auth'd user (frontend snapshot builder).

## Qué NO va en la entity

- **Lógica de negocio del dominio** — eso vive en los tools (`<app>/app/tools/<domain>.ts`). La entity declara identidad + cockpit + snapshot, nada más.
- **Componentes React** — los widgets del cockpit son archivos React separados. La entity solo referencia sus `type` names.
- **Tool handlers custom** — si necesitás un tool especial para esta entity más allá de activate/deactivate/get_active, agregalo via `proto-tool` skill.
- **Schemas Zod complejos** — el activate tool schema es fijo (`{ <name>_id: z.string() }`). Si necesitás parámetros extra, crealo como tool aparte (ej: `activate_order_with_items`).

## Reglas

1. **`name` siempre singular, snake_case, lowercase**. `order` no `orders`. `invoice_line` no `InvoiceLines`.

2. **El cockpit es opcional**. Entities que el agente usa como contexto puro (sin UI focalizada) pueden omitirlo — los 3 tools siguen generándose igual.

3. **`snapshotBuilder` es isomórfico**. Corre solo en el browser hoy. No uses imports de Node (fs, path, child_process). Usa solo lo que compile en Vite. Supabase es inyectado via ctx — no lo importes directo.

4. **Label field no es opcional en UX** — si la tabla no tiene una columna obvia de label, podés agregar una expression o usar `id` como fallback. El label se muestra en la tab del cockpit.

5. **Una entity = una tabla**. Si necesitás "entity" compuesta (order + items), elegí una tabla principal (order) y el snapshot traé el resto via queries.

## Anti-patterns

- ❌ **React components en el entity file** — no imports de `.tsx`, no JSX. El file debe cargar desde Node (MCP) y Vite (web).
- ❌ **Importar `@proto/core-mcp`** en el entity — sólo `@proto/core-shared` para `defineEntity`.
- ❌ **Hardcodear company_id** en el snapshot builder — usá el supabase cliente que llega por ctx (ya está auth'd con el RLS correcto en el browser).
- ❌ **Side effects en `defineEntity({...})`** — es pura data. No lances queries, no leas env vars.
- ❌ **Entities sin `labelField`** — la UI necesita algo para mostrar en la tab. Aunque sea `id`.

## Checklist antes de cerrar

- [ ] Archivo en `<app>/app/entities/<name>.ts`
- [ ] `export default defineEntity({...})`
- [ ] `name` / `displayName` / `table` / `labelField` presentes
- [ ] Si hay cockpit: los widget `type` names existen en el widget registry
- [ ] Si hay `snapshotBuilder`: es async, usa `{ supabase }` del ctx, retorna `string | null`
- [ ] `entities/index.ts` incluye el nuevo entity en `ENTITIES`
- [ ] Smoke test muestra los 3 tools generados
- [ ] Migración Supabase existe si la tabla es nueva
- [ ] `App.tsx`'s `onAgentActivateEntity` narrowing acepta el nuevo `type` (si aplica)
