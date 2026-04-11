# Proto

TypeScript monorepo framework for building AI-agent-driven apps. Provides a gateway (wraps Claude Code CLI), MCP tool server, React shell with widget registry, and Supabase integration. Apps extend via declarative APIs: `defineTool`, `defineWidget`, and (coming) `defineEntity`, `defineWorkflow`.

**Hermes** — the original app this was extracted from — lives at `examples/hermes/` as the reference consumer and is still under active development.

## Arquitectura

```
proto/
├── packages/                   Framework libraries
│   ├── core-gateway/           Hono HTTP+WS, Claude CLI runner, scheduler, mail
│   ├── core-mcp/               MCP server factory, defineTool, helpers, UI tools
│   ├── core-shared/            Framework types (ChatRequest, SSEEvent, scheduling)
│   └── core-web/               React shell, defineWidget, hooks, agent primitives
├── examples/
│   └── hermes/                 Reference app (@proto-app/hermes workspace)
│       ├── app/
│       │   ├── mcp.ts          stdio entry point
│       │   ├── mcp-http.ts     HTTP entry point (runs in Docker)
│       │   ├── activeOrder.ts  per-session active order state
│       │   ├── tools/          89 MCP tools via defineTool
│       │   │   ├── index.ts    aggregates arrays → registerAppTools()
│       │   │   └── *.ts
│       │   ├── shared/         Hermes-specific types (docs, payments, etc.)
│       │   ├── skills/         11 domain skills (hermes-orders, etc.)
│       │   ├── agents/         legacy, not loaded
│       │   └── prompts/        channel system prompts
│       ├── supabase/
│       │   └── migrations/     30 SQL files
│       ├── project.yaml        app config (MCP, skills dir, prompts, timezone)
│       ├── .mcp.json           local Claude Code CLI config
│       └── package.json        @proto-app/hermes
├── .claude/skills/             framework skills for Claude Code (proto-tool, proto-widget)
├── docker-compose.yml          2 services: hermes-mcp (8093) + hermes (8092)
├── Dockerfile                  copies packages + examples/hermes, sets PROTO_APP_ROOT
└── package.json                workspaces: packages/* + examples/*
```

## Mental model

**Framework** (`packages/core-*`) provides runtime + extension points, nothing domain-specific.
**App** (`examples/hermes/`) consumes the framework as a library and plugs in tools, widgets, entities, workflows, skills, migrations.

Apps are never referenced from core. The dependency direction is always `app → core`.

## packages/core-gateway

`server.ts` mounts Hono + CORS + auth middleware + routes + WebSocket + optional mail ingester. Cada dominio de rutas vive en `routes/`:

- `chat.ts` — WebSocket `/ws` (primario), REST `/chat`, `/chat/stream`, `/reset`
- `upload.ts` — `/upload` attachments (disco local, auto-delete 30 min)
- `gmail.ts` — OAuth flow for per-user Gmail connection
- `cron.ts` — `/cron/tick`, `/cron/trigger`, `/cron/list`, `/cron/recalc`
- `health.ts` — `/health`

**Support modules**:
- `claude-runner.ts` — spawn Claude CLI (`--resume` automático via `.claude-session-id`), stream or block
- `session.ts` — SHA256 session keys → `/data/sessions/{company}/{sessionKey}/`
- `scheduler.ts` — in-process cron (`croner`) backed by `scheduled_tasks.next_run_at`
- `email-sender.ts` / `mail-ingester.ts` / `mail-router.ts` / `mail-threads.ts` — SMTP + IMAP mail-as-chat channel
- `skills.ts` / `registry.ts` — YAML frontmatter skill loader with transitive deps
- `auth.ts` — `x-internal-secret` header middleware (no JWT Supabase)
- `rate-limiter.ts` — **DESACTIVADO** (retorna allowed=true). Reactivar pre lanzamiento multi-tenant.
- `config.ts` — **único** acceso a `process.env`. Exporta `APP_ROOT`, `resolveAppPath()`, `config`, `INTERNAL_SECRET`, `MAX_TURNS`, etc.

### Path resolution: `PROTO_APP_ROOT`

Every app path (project.yaml, skills/, prompts/, etc.) resolves via `resolveAppPath()` in `config.ts`:

```ts
function resolveAppRoot(): string {
  const envRoot = process.env.PROTO_APP_ROOT
  if (envRoot) return isAbsolute(envRoot) ? envRoot : resolve(process.cwd(), envRoot)
  if (existsSync(resolve(process.cwd(), 'project.yaml'))) return process.cwd()
  return resolve(__dirname, '..', '..', '..')  // legacy fallback
}
```

Set in:
- Root `package.json`: `"dev:gateway": "PROTO_APP_ROOT=examples/hermes ..."`
- `docker-compose.yml`: `environment: - PROTO_APP_ROOT=/app/examples/hermes`
- `Dockerfile`: `ENV PROTO_APP_ROOT=/app/examples/hermes`

All of `registry.ts`, `skills.ts`, `config.ts` call `resolveAppPath(relative)` instead of hardcoding `repoRoot`.

## packages/core-mcp

**Library, not executable.** No `src/server.ts` entry — apps create their own entry and import the framework.

`src/index.ts` exports:
- `createMcpServer({ name, version })` — factory wrapping `McpServer` from MCP SDK
- `runStdio(server)` — blocks on stdio transport (for CLI subprocess)
- `runHttp({ port, buildServer, displayName })` — session-isolated HTTP transport with per-session `buildServer()` factory
- `defineTool({ name, description, schema, handler })` — declarative tool definition
- `registerTools(server, defs[])` — iterate + wrap in try/catch + call `server.tool()`
- `getSupabase()` — service-role client singleton
- `ok(text)`, `json(obj)`, `err(msg)` — content helpers
- `agent({summary, data, hint?})`, `agentErr(summary, details?)` — structured agent responses
- `registerUiTools(server)` — registers the framework's `render_ui` tool

Remaining sources:
- `src/define-tool.ts` — the defineTool / registerTools / ToolDefinition types
- `src/supabase.ts` — Supabase client factory
- `src/tools/_helpers.ts` — ok/json/err/agent/agentErr (framework, no domain imports)
- `src/tools/ui.ts` — `render_ui` tool (generative UI hook for frontend)

**No `isValidStep`, no `PHASE_STEPS` import, no Hermes-specific symbols**. Domain helpers live in the app.

## packages/core-shared

Framework-level types only:
- `schemas.ts` — `chatRequestSchema` (Zod) + `ChatRequest`, `ChatResponse`, `SSEEvent` types
- `scheduling.ts` — `TaskRunStatus`, `scheduledTaskSchema`, `isValidCronExpr()`

**Still temporarily here** (blocked by core-web cockpit widgets until Phase 3d):
- `phases.ts` — 13 import phases (`PHASES`, `PHASE_STEPS`, `PHASE_EXECUTION`, `requiresHumanApproval`)
- `costing.ts` — `COSTING_FIELDS`, `CostingBreakdown`, `computeEstimated`, `computeActualFromPayments`, `mergeActual`

These move to `examples/hermes/app/shared/` once `orderSnapshot.ts` and `Costing.tsx` migrate.

## packages/core-web

React SPA. Still monolithic — not yet split into library + app (Phase 3d pending).

**Library-like modules that will become public exports**:
- `lib/define-widget.ts` — `defineWidget`, `WidgetDefinition`, `ShellContext`, `buildWidgetRegistry`
- `components/Shell.tsx` — the shell component (342 lines, reads from widget registry)
- `components/shell/{Toolbar,FocusView,EmptyState,types,persistence,catalog}.tsx|ts` — shell internals
- `hooks/` — `useAuth`, `useData`, `useMountEffect`, `useTheme`
- `lib/` — `api.ts`, `config.ts`, `supabase.ts`, `drag.ts`, `widgetCache.ts`, `utils.ts`

**Hermes-specific (will move to `examples/hermes/web/` in Phase 3d)**:
- `components/widgets/*` — 27 widget files (9 general + 10 order cockpit + 3 product cockpit + modals)
- `components/shell/widgets-registry.tsx` — 20 `defineWidget` entries wiring Hermes widgets
- `components/widgets/agent/` — render_ui runtime (could arguably be framework, keep for now)
- `pages/` — 9 pages (Chat, Admin, Onboarding, Login, etc.)
- `App.tsx`, `main.tsx`, `index.css`, `index.html`
- `lib/orderSnapshot.ts` — Hermes order markdown builder

## Extension points

### defineTool (MCP tools)

```ts
// examples/hermes/app/tools/items.ts
import { defineTool, getSupabase, err, json } from '@proto/core-mcp'
import { z } from 'zod'

export default [
  defineTool({
    name: 'create_order_item',
    description: 'Crea un item dentro de un pedido.',
    schema: {
      order_id: z.string(),
      company_id: z.string(),
      description: z.string(),
      // ...
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('order_items').insert(args).select().single()
      return error ? err(error.message) : json(data)
    },
  }),
]
```

**All 89 Hermes tools use this shape** across 19 files in `examples/hermes/app/tools/`. Each file exports `default [defineTool(...), ...]` (array of definitions). `tools/index.ts` concatenates all arrays into `ALL_APP_TOOLS` and calls `registerTools(server, ALL_APP_TOOLS)`.

**Adding a new tool**: see `.claude/skills/proto-tool/SKILL.md`.

### defineWidget (Shell widgets)

```ts
// packages/core-web/src/components/shell/widgets-registry.tsx
import { defineWidget } from '@/lib/define-widget'

export const WIDGETS = [
  defineWidget({
    type: 'orders',
    title: 'Pedidos',
    icon: '📦',
    category: 'general',
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
  // ... 19 more
]
```

**`ShellContext`** (from `lib/define-widget.ts`) is the shared context every widget receives:
```ts
interface ShellContext {
  companyId: string
  refreshKey: number
  activeEntity: ActiveEntity | null
  onSendToChat: (msg: string) => void
  onActivateEntity?: (e: ActiveEntity) => void
  onDeactivateEntity?: () => void
  onCloseTab?: (e: ActiveEntity) => void
  cartItems: CartItem[]
  addToCart: (item: CartItem) => void
  openCreateOrder: (product?: { id: string; name: string }) => void
  openCreateProduct: () => void
  triggerLocalRefresh: () => void
}
```

Shell builds `shellCtx` once per render via `useMemo` and loops: `WIDGET_REGISTRY.get(widget.type)?.render(widget, shellCtx)`. No hardcoded switch.

**Adding a new widget**: see `.claude/skills/proto-widget/SKILL.md`.

### Future: defineEntity, defineWorkflow, defineChannel

Phase 3e–3f will add these. `defineEntity` collapses the `activate_X` / cockpit layout / snapshot builder triad into a single declaration. `defineWorkflow` generates state machine tools from a YAML declaration. Not yet implemented.

## Rules

### NO `useEffect` directo en componentes

Prohibido llamar `useEffect` directo en componentes de React. Solo puede aparecer dentro de hooks reusables (`useMountEffect`, `useData`, etc). Checklist antes de escribir un effect:

1. **¿Se puede derivar durante el render?** → inline o `useMemo`.
2. **¿Lo dispara una acción del usuario?** → event handler.
3. **¿Fetch de data?** → `useData(fetcher)` con AbortController.
4. **¿Store externo?** → `useSyncExternalStore`.
5. **¿Reset on prop change?** → `key={id}`, no effect.
6. **¿True mount-time external sync?** → `useMountEffect(() => {...})`.
7. **¿Ref para controlar cuándo corre?** → el effect es el bug, reescribí el flujo.
8. **¿DOM side effect on mount?** → callback ref.

Única excepción conocida: `components/ui/shell-dialog.tsx` tiene 3 useEffect (portal + escape key + animation frame). Se migra a `useMountEffect` cuando se toque.

### Domain-agnostic core

Core packages NO deben importar del app. Grep check: `grep -r 'orders\|products\|supplier\|phases' packages/core-*/src/` debe retornar solo menciones genéricas (variables, comentarios). Cuando hagas un refactor en core, chequeá que no filtre concepts del dominio.

### Tool context via ctx, not args

Tools que necesiten `company_id`, `user_id`, `active_order` deben leerlo del contexto de la sesión, **no como parámetro del agente**. Hoy los 89 tools de Hermes aún reciben `company_id` como arg (legacy). Al agregar un tool nuevo, preferí leer de env o del estado de la sesión, no de args.

### File size limits

Ningún archivo de tool/componente debería pasar ~400 líneas. Splits actuales pendientes:
- `examples/hermes/app/pages/Admin.tsx` (1286L) — agentes + tareas + config
- `examples/hermes/app/pages/Chat.tsx` (553L) — WS + queue + attachments
- `packages/core-web/src/components/shell/widgets-registry.tsx` (280L) — OK por ahora, se divide en Phase 3d

### Naming conventions

- React widgets y components → `PascalCase.tsx`
- shadcn primitives (`components/ui/`) → `kebab-case.tsx`
- MCP tool files → `kebab-case.ts`
- Skills/agents dirs → `kebab-case`
- Helpers internos prefijados `_` (ej. `_helpers.ts`, `_hermes-helpers.ts`)

### Config env vars

- Gateway: todo `process.env` pasa por `packages/core-gateway/src/config.ts`
- Web: todo `import.meta.env.VITE_*` pasa por `packages/core-web/src/lib/config.ts`
- MCP: lee `process.env` directo (sin capa centralizada por ahora)

## Supabase

30 migraciones en `examples/hermes/supabase/migrations/`:
- 10 legacy numeric (`001_*.sql` a `010_*.sql`)
- 20 timestamp (`20260407*` en adelante)

**Nuevas migraciones siempre con prefix timestamp** (`YYYYMMDDHHMMSS_name.sql`). No crear con numeric prefix.

**Multi-tenant** enforced via RLS: `company_id IN (SELECT get_user_company_ids())`. Helper functions `SECURITY DEFINER`: `get_user_company_ids()`, `is_company_admin(cid)`. Todas las tablas de dominio tienen RLS activado.

**State machine** en `order_items` table (`current_phase`, `current_step`, flags). Historial en `phase_transitions`. Trigger `order_items_phase_sync` + función `recompute_order_phase()` derivan `orders.current_phase`.

**Pg extensions**: `pg_cron` + `pg_net` para que la DB llame `hermes_cron_tick()` → gateway `/cron/tick` cada minuto.

## Channels

Hermes usa **dos** integraciones de mail:

1. **Gmail OAuth per-user** (`tools/gmail.ts` + `routes/gmail.ts`): cada user conecta su Gmail. Tokens en `gmail_tokens` table. Tools: `gmail_status`, `read_emails`, `search_emails`, `send_email`.

2. **Hermes system mail (SMTP + IMAP)**: mailbox único del sistema envía notificaciones y un IMAP poller lee replies para que el agente las procese como mensajes de chat. Code en `core-gateway/src/{email-sender,mail-ingester,mail-router,mail-threads}.ts`. Env: `HERMES_SMTP_*` + `HERMES_IMAP_*`.

Plus **WhatsApp** via prompt dedicado (`prompts/whatsapp.md`), switchable via `request.channel === 'whatsapp'` en `skills.ts::buildSystemPrompt`.

## Deploy

Docker Compose con 2 servicios:
- `hermes-mcp` (puerto 8093) — corre `examples/hermes/app/mcp-http.ts` con tsx
- `hermes` / agent (puerto 8092) — corre `packages/core-gateway/src/server.ts` con tsx, depende de hermes-mcp

Ambos leen `PROTO_APP_ROOT=/app/examples/hermes`. El web app corre local en dev (`npm run dev:web`) y se conecta via `VITE_GATEWAY_URL`.

```bash
docker compose up -d --build    # build + start ambos servicios
docker compose logs -f agent    # logs del gateway
docker compose restart
```

Railway deploya via `Dockerfile` (healthcheck `/health`, config en `railway.toml`).

## Comandos

```bash
npm test                # Vitest (root vitest.config.ts)
npm run dev:gateway     # PROTO_APP_ROOT=examples/hermes + tsx watch
npm run dev:web         # Vite http://localhost:3001
npm run build           # core-shared → core-mcp → core-gateway → core-web
cd examples/hermes && supabase db push    # aplicar migraciones
```

**Smoke test local del MCP** (útil cuando tocás tools):
```bash
npx tsx -e "
import { createMcpServer } from '@proto/core-mcp'
import { registerAppTools } from './examples/hermes/app/tools/index.ts'
const s = createMcpServer({ name: 'hermes', version: '0.1.0' })
registerAppTools(s)
console.log('tools:', Object.keys((s as any)._registeredTools).length)
"
# debería imprimir: tools: 89
```

## Migration status

El repo está en medio de una migración desde la forma monolítica "hermes-el-producto" a "proto framework + hermes example app". 8 fases terminadas, 4 pendientes:

| Fase | Estado | Qué hizo / hace |
|---|---|---|
| baseline | ✅ | Copia de hermes |
| 1 | ✅ | Rename packages → core-* |
| 2a | ✅ | Move skills/agents/prompts/supabase/project.yaml → examples/hermes/, agregar `PROTO_APP_ROOT` |
| 2b | ✅ | MCP tools → examples/hermes/app/tools/, core-mcp se vuelve library |
| 2c | ✅ | Split core-shared: tipos Hermes → app/shared/, isValidStep → app |
| 3a1 | ✅ | `defineTool` API + pilot en items.ts |
| 3a2 | ✅ | Batch migrate 89 tools al nuevo shape |
| 3c | ✅ | `defineWidget` API + widget registry, Shell refactor |
| **3d** | ⏳ | **Split core-web** en library + `examples/hermes/web/`. Mueve widgets, pages, App.tsx, main.tsx, orderSnapshot, Costing widget. Desbloquea mover `phases.ts` y `costing.ts` fuera de core-shared. |
| 3e | ⏳ | `defineEntity` API — colapsa active-order tool + cockpit layouts + snapshot builder en una sola declaración |
| 3f | ⏳ | `defineWorkflow` / `phases.yaml` — state machine parametrizable |
| 3g | ⏳ | `create-proto-app` scaffolder + más framework skills |

**Historia Git**:
```
1f1a3b9 phase 3c: defineWidget API + widget registry for Shell
b22c1cb phase 3a2: migrate remaining 18 tool files to defineTool
c18238e phase 3a1: defineTool API + items.ts pilot
672d7c5 phase 2c: split core-shared — move Hermes domain types to app
ae8018b phase 2b: carve out MCP tools to examples/hermes/app/
13c9660 phase 2a: move hermes assets to examples/hermes/
35b4a78 phase 1: rename packages/{gateway,mcp,web,shared} → packages/core-*
630c459 baseline: copy of hermes as starting point for proto framework
```

**Known blockers** (resolverán en Phase 3d):
- `packages/core-shared/src/phases.ts` aún importado por `core-web/src/lib/orderSnapshot.ts`
- `packages/core-shared/src/costing.ts` aún importado por `core-web/src/components/widgets/cockpit/order/Costing.tsx`
- `packages/core-web/` aún tiene widgets + pages Hermes-específicos

## Framework skills (para Claude Code local)

Viven en `.claude/skills/proto-*/SKILL.md`. Cargan cuando Claude Code CLI trabaja en este repo. **No** son domain skills del agente en runtime — esos viven en `examples/hermes/app/skills/`.

- `proto-tool` — cómo agregar un MCP tool nuevo via `defineTool`
- `proto-widget` — cómo agregar un widget al Shell via `defineWidget`
- (coming) `proto-entity`, `proto-workflow`, `proto-migration`, `proto-scaffold`, `proto-debug`, `proto-deploy`

Cuando `create-proto-app` scaffolder exista (Phase 3g), copiará estos skills al repo nuevo de cada app como starting point editable.
