---
name: proto-tool
description: Agregar o modificar un MCP tool en una app proto via defineTool. Activa cuando el usuario pide crear, eliminar, o editar un tool del MCP server (ej: "agregá un tool para X", "necesito que el agente pueda Y", "el tool Z debería Q").
type: framework
---

# proto-tool — agregar un MCP tool

Los MCP tools son la interfaz entre el agente y el dominio del app. Cada tool es una función async con schema Zod + handler. En una app proto viven en `<app>/app/tools/**/*.ts` y se registran declarativamente via `defineTool()`.

## Cuándo activa este skill

- "agregá un tool para listar clientes"
- "necesito que el agente pueda cancelar una factura"
- "el tool X no está validando bien, editalo"
- "eliminá el tool Y"
- "mostrame cómo agregar un tool nuevo"

## Dónde va el archivo

Los tools se agrupan por dominio en archivos, con un archivo por dominio (no un archivo por tool). Ejemplos del Hermes example app:

```
examples/hermes/app/tools/
├── orders.ts         ← tools de pedidos (create_order, list_orders, update_order, delete_order, ...)
├── products.ts       ← tools de productos
├── workflow.ts       ← tools del state machine
├── ... (19 archivos)
└── index.ts          ← aggregator que arma ALL_APP_TOOLS + registerAppTools()
```

**Regla**: si estás agregando un tool a un dominio existente, andá al archivo correspondiente y agregá una entrada al array. Si el dominio es nuevo, creá un archivo nuevo y sumá su import al `index.ts`.

## Shape de un tool file

Cada archivo exporta por default un array de `defineTool` calls:

```ts
// examples/hermes/app/tools/items.ts
import { z } from 'zod'
import { defineTool, getSupabase, err, json } from '@proto/core-mcp'
import { PHASES, type Phase } from '@proto/core-shared'
import { isValidStep } from './_hermes-helpers.js'

export default [
  defineTool({
    name: 'create_order_item',
    description: 'Crea un item dentro de un pedido. Inicia en sourcing.identify_need.',
    schema: {
      order_id: z.string(),
      company_id: z.string(),
      description: z.string(),
      supplier_id: z.string().describe('FK a suppliers. Obligatorio.'),
      quantity: z.number().int().default(1),
      unit_price: z.number().optional(),
      current_phase: z.enum(PHASES).default('sourcing'),
      current_step: z.string().default('identify_need'),
    },
    handler: async (args) => {
      if (!isValidStep(args.current_phase as Phase, args.current_step)) {
        return err(`Step invalido para fase ${args.current_phase}`)
      }
      const db = getSupabase()
      const { data, error } = await db.from('order_items').insert(args).select().single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'update_order_item',
    description: 'Actualiza campos de un item.',
    schema: { item_id: z.string(), quantity: z.number().optional() },
    handler: async ({ item_id, ...patch }) => {
      const db = getSupabase()
      const { data, error } = await db.from('order_items').update(patch).eq('id', item_id).select().single()
      return error ? err(error.message) : json(data)
    },
  }),
]
```

## defineTool fields

- **`name`** — snake_case, único globalmente. Verbo_sustantivo: `create_order`, `list_products`, `advance_step`. Evitá `get_` para listados, usá `list_`.
- **`description`** — prosa orientada al agente. Qué hace + cuándo usarlo + side effects importantes. El agente lee esto para decidir cuándo invocarlo.
- **`schema`** — objeto de Zod raw shape (igual al 3er arg de `server.tool()`). Siempre `.describe()` en cada campo para que el agente entienda qué pasar.
- **`handler`** — `async (args) => ToolResult`. Los tipos de `args` se infieren del schema.

## Return value

El handler retorna un `ToolResult` con shape MCP (`{ content: [{ type: 'text', text: string }] }`). Usá los helpers de `@proto/core-mcp`:

- **`ok(text)`** — plain text response
- **`json(obj)`** — serialize an object as JSON
- **`err(msg)`** — plain error
- **`agent({ summary, data, hint? })`** — structured agent response con summary narrativo + datos + próximo paso sugerido
- **`agentErr(summary, details?)`** — structured error con contexto opcional

**Prefiere `agent()` / `agentErr()` para tools de escritura importantes** — el `hint` guía al agente hacia el próximo tool. Ejemplo:

```ts
return agent({
  summary: `Orden ${data.title} creada con ${data.items.length} items`,
  data: { id: data.id, title: data.title },
  hint: 'Próximo paso: agregar items con create_order_item (supplier_id es obligatorio).',
})
```

## Después de agregar el tool

1. **Actualizar `tools/index.ts`** — SOLO si creaste un archivo nuevo. Si editaste uno existente, no toques el index.
   ```ts
   import newDomainTools from './new-domain.js'
   // ... resto de imports ...
   const ALL_APP_TOOLS = [
     ...newDomainTools,
     // ... resto
   ]
   ```

2. **Smoke test** — verificá que registra sin errores:
   ```bash
   npx tsx -e "
   import { createMcpServer } from '@proto/core-mcp'
   import { registerAppTools } from './examples/hermes/app/tools/index.ts'
   const s = createMcpServer({ name: 'hermes', version: '0.1.0' })
   registerAppTools(s)
   const names = Object.keys((s as any)._registeredTools).sort()
   console.log('total:', names.length)
   console.log('mine:', names.filter(n => n.includes('your_new_tool_prefix')))
   "
   ```

3. **Si tu tool usa una tabla nueva** — asegurate de crear la migración Supabase antes (ver `proto-migration` skill cuando exista). Runtime fallará en `.from('missing_table')` con un 404 de PostgREST.

4. **Actualizar el skill de dominio relevante** — si el tool cambia cómo el agente opera, actualizá el SKILL.md del dominio correspondiente (ej. `hermes-orders/SKILL.md` si agregaste un tool de pedidos). El agente aprende de los skills, no solo de las tool descriptions.

## Reglas

1. **Nunca leas `process.env.COMPANY_ID` ni `process.env.USER_ID` directamente desde un tool new-style**. El framework va a inyectar ctx con esos valores en Phase 4. Por ahora, si realmente lo necesitás, aceptalo como arg del schema.

2. **Siempre filtrá por `company_id`** cuando el tool haga queries multi-tenant: `.eq('company_id', companyId)`. Service role bypassa RLS — la validación es responsabilidad tuya.

3. **Usa `getSupabase()`**, nunca importes `createClient` directo. El singleton es necesario para que el framework inyecte config.

4. **Un tool = una acción**. Si necesitás múltiples operaciones (`create_order_and_items_and_notify`), splitea en tools separados. Reduce costo del schema para el agente y facilita reuse.

5. **Schemas describe fields**. Cada campo del schema debe tener `.describe('...')` — el agente no sabe qué pasar si el schema no lo explica.

6. **Nombres consistentes**: `create_X`, `list_X`, `get_X` (uno específico), `update_X`, `delete_X`, `upsert_X`. Tools especiales del state machine: `advance_X_step`, `block_X`, `hold_X`, `cancel_X`.

## Anti-patterns

- ❌ **Schema sin `.describe()`** — el agente te pasa basura.
- ❌ **Silent try/catch** que retorna `ok('success')` cuando falló. Usá `err(msg)` / `agentErr(summary)` siempre.
- ❌ **Tools que hacen N cosas** (`create_order_and_items_and_payment`). Split.
- ❌ **Handler lee de process.env** — fragil, difícil de test. Usá args o (futuro) ctx.
- ❌ **Hardcodear `company_id` o `user_id`** en el handler.
- ❌ **Lógica de negocio en `_helpers.ts`** — los helpers son solo formatters (ok/json/err/agent). Side effects van en el handler.
- ❌ **Tools nuevos en core-mcp** — core-mcp es framework. App tools viven en `examples/<app>/app/tools/`.

## Checklist antes de cerrar

- [ ] Archivo en `<app>/app/tools/<domain>.ts`
- [ ] `export default` es un array de `defineTool` calls
- [ ] Cada tool tiene `name`, `description`, `schema`, `handler`
- [ ] Todos los campos del schema tienen `.describe()`
- [ ] `company_id` filtrado en queries multi-tenant
- [ ] Error path retorna `err()` / `agentErr()`, no `ok()`
- [ ] Si creaste archivo nuevo: `tools/index.ts` lo importa y agrega al `ALL_APP_TOOLS`
- [ ] Smoke test corre y el nuevo tool aparece en la lista
- [ ] Skill de dominio actualizado si el flujo del agente cambia
