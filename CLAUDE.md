# Hermes

Agente AI de gestion de importaciones para pymes chilenas. TypeScript monorepo.

## Arquitectura

```
packages/
  gateway/    Hono HTTP+WS, wrappea Claude Code CLI como subprocess (puerto 8092)
  mcp/        MCP server con tools del dominio — stdio (dev) + HTTP (puerto 8093, Docker)
  web/        React SPA (Vite) con chat + shell de widgets (puerto 3001)
  shared/     tipos, schemas Zod, constantes del state machine
skills/       domain knowledge cargable por el agente (YAML frontmatter)
agents/       5 prompts role-based (legacy, no se cargan — solo skills)
supabase/     migraciones SQL con RLS (30 archivos: 10 legacy + 20 timestamp)
prompts/      system prompts del gateway (default.md, whatsapp.md)
project.yaml  config que liga gateway ↔ skills ↔ agents ↔ prompts ↔ MCP
.mcp.json     config del Claude Code CLI (MCP server hermes en localhost:8093)
```

### packages/gateway

`server.ts` (38 líneas) solo hace setup + mount. Orden: CORS → auth middleware en `/chat` y `/upload/*` → rutas → WebSocket inject → `startMailIngester()`.

**Rutas** (`routes/`):
- `chat.ts` — WebSocket `/ws` (primario, handshake `{type:'auth', secret}`), REST `/chat`, `/chat/stream`, `/reset`
- `upload.ts` — `/upload` para attachments (disco local, auto-delete 30 min)
- `gmail.ts` — OAuth `/gmail/auth`, `/gmail/callback` (scopes: gmail.readonly + gmail.send)
- `health.ts` — `/health`
- `cron.ts` — `/cron/tick` (llamado por `pg_cron`), `/cron/trigger`, `/cron/list`, `/cron/recalc`

**Soporte**:
- `claude-runner.ts` — spawn de Claude CLI (`claude -p <msg> --model ... --resume <session_id>`). Dos modos: `runClaude()` bloqueante + `streamClaude()` generator. Sesiones persistidas en `/data/sessions/{company}/{sessionKey}/.claude-session-id` para `--resume` automático. Idle timeout mata el proceso si no hay output.
- `session.ts` — key = `SHA256(name-company_id-session_key).slice(0,32)`. Cada sesión = directorio. MCP config generado dinámico por sesión.
- `scheduler.ts` — cron in-process con `croner` + persistencia DB (`scheduled_tasks.next_run_at` canonical). `tick()` → `scanDueTasks()` → `runClaude()` → escribe `task_runs`.
- `email-sender.ts` — SMTP via `nodemailer`. Genera Message-ID `<hermes-{uuid}@hermes>`, registra en `mail_messages`.
- `mail-ingester.ts` — IMAP polling con `ImapFlow` (default 30s). Dedup por Message-ID, salta auto-replies/bounces. Resuelve sender → company vía `mail-router`, thread lookup via `mail-threads`, luego `runClaude()` con history y auto-reply.
- `mail-router.ts` — `resolveCompanyByEmail()` lookup contra `companies.contact_email` o `profiles.email` vía `company_users`.
- `mail-threads.ts` — agrupación por `In-Reply-To`/`References`. Thread ID `mail-thread-{uuid}` vinculado a session_key del CLI.
- `skills.ts` — parsea YAML frontmatter de `skills/*/SKILL.md`, resuelve dependencias transitivas, filtra por canal. Cacheado al startup.
- `registry.ts` — lee skills + agents al startup.
- `auth.ts` — middleware Hono con header `x-internal-secret` vs `INTERNAL_SECRET` env. **No JWT Supabase** — solo secret compartido.
- `rate-limiter.ts` — **DESACTIVADO**. Retorna `{allowed: true}` incondicional. Reactivar antes de lanzamiento multi-tenant.
- `config.ts` — **UNICO** punto para `process.env`. Exporta: `INTERNAL_SECRET`, `MAX_TURNS`, `TIMEOUT_SECONDS`, `CLAUDE_MODEL`, `PORT`, `DATA_DIR`, etc.

Sin tests en gateway.

### packages/mcp

Dos transportes comparten el mismo set de tools:
- `server.ts` — stdio (`StdioServerTransport`) para dev local con `.mcp.json` → localhost:8093
- `server-http.ts` — HTTP streamable en puerto 8093 con **sesiones múltiples aisladas** (`Map<sessionId, transport>`). Cada POST crea/reutiliza sesión. Usado en Docker (Compose service `hermes-mcp`).

Ambos usan **service role key de Supabase** (bypass RLS) — el `company_id` se valida manualmente en cada query con `.eq('company_id', ...)`.

**Un archivo por dominio en `tools/`** (20 archivos, ~100 tools). Cada uno exporta `register<Dominio>Tools(server)`. Helpers compartidos en `_helpers.ts`: `ok(text)`, `json(obj)`, `err(msg)`, `agent({summary, data, hint})`, `agentErr(summary)`, `isValidStep(phase, step)`.

**State machine & orders**:
- `workflow.ts` (~355L) — core del state machine a nivel item. Tools: `get_item_state`, `list_items_by_phase`, `advance_step`, `block_item`, `unblock_item`, `hold_item`, `resume_item`, `cancel_item`, `request_human_approval`, `detect_tlc_requirement`. `advance_step` valida flags, enforce avance +1 fase, bloquea gates humanos si `actor != 'user'`, registra transición en `phase_transitions`.
- `orders.ts` — CRUD: `create_order`, `update_order_status`, `get_order`, `list_orders`, `update_order`, `delete_order`, `get_order_timeline`. Llama `adjustInventoryForStatusChange()` (helper no-tool de `inventory.ts`).
- `items.ts` — `create_order_item`, `update_order_item` (supplier_id REQUIRED).
- `active-order.ts` — `activate_order`, `deactivate_order`, `get_active_order` (context session-level, pinta cockpit en frontend).

**Catálogo y sourcing**:
- `products.ts` — `create_product`, `update_product`, `get_product`, `list_products`, `link_product_supplier`, `unlink_product_supplier`, `attach_product_image`.
- `suppliers.ts` — `create_supplier`, `list_suppliers`, etc.
- `sourcing.ts` (~320L) — `search_alibaba_by_image_url`, `search_alibaba_by_image_path`, `attach_product_image`. Alibaba OSS integration con cache 24h local.
- `samples.ts` — `create_sample`, `list_samples`, `evaluate_sample`, `update_sample_status`, `promote_sample_to_item`.

**Documentos, pagos, costeo**:
- `documents.ts` (~312L) — `upload_document`, `list_documents`, `validate_document_set`, `attach_document` (workflow-aware), `list_required_docs`, `get_document`, `update_document`.
- `payments.ts` — `record_payment`, `update_payment`, `list_payments`, `delete_payment`.
- `costing.ts` — `upsert_costing` (merge estimated/actual JSONB), `get_costing`, `list_costings`, `get_costing_defaults`.

**Operaciones y relaciones**:
- `inventory.ts` — `get_inventory`, `adjust_inventory`, `get_inventory_history`. Además exporta `adjustInventoryForStatusChange` (helper no-tool).
- `reorders.ts` — `create_reorder_rule`, `check_reorders`, `list_reorder_rules`, `trigger_reorder`.
- `contacts.ts` — `upsert_contact`, `list_contacts`, `delete_contact` (libreta forwarder/customs/supplier por empresa o override por orden).
- `findings.ts` — `record_finding`, `list_findings`, `delete_finding` (hallazgos del agente con dedup por `gmail_message_id`).

**Company & comms**:
- `company.ts` — `get_profile`, `update_profile`, `create_company`, `list_companies`, `add_company_user`.
- `gmail.ts` — `gmail_status`, `read_emails`, `search_emails`, `send_email` (googleapis + auto-refresh).
- `scheduling.ts` — `schedule_task`, `list_scheduled_tasks`, `pause_task`, `resume_task`, `update_task`, `get_task_runs`, `delete_task`, `trigger_task_now`.
- `notifications.ts` — `send_alert`.
- `ui.ts` — `render_ui` (no-op servidor; el frontend intercepta el `tool_use` event con la spec).

**Patterns & deuda**:
- Zod schemas inline en cada tool file (no centralizados) — usa `.describe()` para agent-friendly docs.
- Error handling mixto: algunos usan `agentErr()`, otros `err()`, otros return inline. Falta estandarizar.
- Sin tests. Ni `.test.ts` ni `.spec.ts`.
- Archivos grandes a vigilar: `workflow.ts`, `sourcing.ts`, `documents.ts`, `orders.ts` (~300L cada uno).

### packages/web

SPA React + Vite. **Routing manual basado en `pathname`** en `App.tsx` (NO react-router): `/gmail/callback`, `/reset-password`, `/admin`, `/login`, default → Landing/Chat.

```
src/
  App.tsx                routing manual + useAuth + activeEntity state + WS lifecycle
  pages/                 9 páginas
    Chat.tsx             (553L) hub central: WS streaming, message queue, attachments
    Admin.tsx            (1286L) agentes, tareas cron, config global [refactor pendiente]
    Onboarding.tsx       (356L) create company + profile completion
    Landing.tsx          home pre-login
    Login.tsx, ResetPassword.tsx, GmailCallback.tsx, Files.tsx, Products.tsx
  components/
    Shell.tsx            (399L) orquesta widgets, grid, cockpit vs general, focus/agentView
    shell/
      types.ts           WidgetType, WidgetInstance, ActiveEntity, CartItem
      catalog.ts         WIDGET_CATALOG (7 tipos), DEFAULT_SIZES, DEFAULT_LAYOUTS,
                         ORDER_COCKPIT_WIDGETS (7), PRODUCT_COCKPIT_WIDGETS (3)
      persistence.ts     localStorage 'hermes-shell' load/save/clear
      Toolbar.tsx        Home, tabs, Reset, +Widget, Settings, Cart, User menu
      FocusView.tsx      fullscreen agentView + widget strip minimizada
      EmptyState.tsx     grid de botones "Agrega widgets"
    widgets/             27 archivos
      OrdersWidget, ProductsWidget, DocsWidget, InventoryWidget, ReordersWidget,
      SchedulesWidget, AdminWidget, SettingsWidget, ProfileWidget, OrderDetailWidget
      CartModal, CreateOrderDialog, CreateProductDialog, SettingsModal  (modals)
      cockpit/order/     Header, Supplier, Docs, Timeline, Contacts, Costing, Findings, shared
      cockpit/product/   Header, Orders, Suppliers, shared
      agent/             Generative.tsx, Primitives.tsx, actions.ts (render_ui runtime)
    ui/                  shadcn primitives (kebab-case)
  hooks/                 useAuth, useTheme, useData, useMountEffect
  lib/
    config.ts            GATEWAY_URL, INTERNAL_SECRET, WS_URL (UNICO acceso a import.meta.env)
    api.ts               (224L) HermesSocket (singleton, auto-reconnect 3s, keepalive 25s,
                         message queue, auth via secret), sendChatWs, SSE fallback
    orderSnapshot.ts     (154L) markdown snapshot builder (items, docs, payments, transitions)
                         inyectado en prompt para activeEntity context
    widgetCache.ts       Map cache por widget+id
    drag.ts              DragContext type, setDragData/getDragData/buildAgentPrompt
    supabase.ts          client browser
    utils.ts             cn()
```

**Estado global**: No hay zustand/jotai/redux. `activeEntity` en localStorage + `useState` en App.tsx. Props drilling Shell → widgets. `orderSnapshot` se refresca al cambiar activeEntity y se inyecta en cada chat message como `company_context`.

**Generative UI (render_ui)**:
1. Agent llama `render_ui` con `{spec: UINode, title?}`.
2. Chat.tsx captura el `tool_use` event → setAgentView en App.tsx.
3. Shell.tsx renderiza `FocusView` → `Generative(spec)`.
4. `Primitives.tsx` soporta: Stack, Row, Grid, Heading, Text, Image, Badge, Stat, Rating, GoldSupplier, Card, CardBody, LinkOut, Button, Table. **Sin formularios** (no Input/Select).
5. Button actions: `save_alternative` (guarda Alibaba supplier a `product_alternatives`) o `send` (manda texto al chat).

**Session keys en WebSocket**: `web` (general), `order-{id}` o `product-{id}` (cuando activeEntity está set — el gateway reutiliza Claude `--resume` por session_key).

**Cockpit mode** (al activar order/product):
- No hay mensaje del gateway — el frontend detecta `activeEntity !== null && !focusMode`.
- Shell switchea a `CockpitGrid` con layouts fijos (ORDER_COCKPIT_LAYOUTS / PRODUCT_COCKPIT_LAYOUTS).
- El agente sabe del contexto via `company_context` en el prompt.

### Regla: NO `useEffect` directo en componentes

Prohibido llamar `useEffect` directo en componentes. Solo puede aparecer dentro de hooks reusables (`useMountEffect`, `useData`, etc). Antes de escribir un effect, recorre el checklist:

1. **¿Se puede derivar durante el render?** → inline o `useMemo`. No crear state que solo espeja otro state/prop.
2. **¿Lo dispara una acción del usuario?** → event handler. Si hay lógica compartida, extrae una función — no un effect.
3. **¿Estás fetcheando data?** → usa `useData(fetcher)` que maneja AbortController. Nunca `fetch().then(setState)` en un effect.
4. **¿Te suscribes a un store externo?** → `useSyncExternalStore`.
5. **¿Necesitas resetear estado cuando cambia un id/prop?** → `key={id}` en el componente, no un effect que resetea.
6. **¿Es true mount-time external sync?** (DOM, widget 3rd-party, browser API) → `useMountEffect(() => {...})`.
7. **¿Un ref para controlar cuando corre el effect (`hasRun.current`, callback en ref)?** → el effect mismo es el bug. Elimina la raíz, no le pongas parche. Usa `useEffectEvent` o handler.
8. **¿Side effect DOM al montar un nodo?** → callback ref (`const ref = useCallback(node => {...}, [])`).

Patterns extra:
- **Notificar al parent**: no `useEffect(() => onChange(x), [x])`. Llama `onChange` en el mismo handler que actualiza el state.
- **Cadenas de effects** (effect A → set → effect B → set → ...) están prohibidas. Deriva inline y batchea las actualizaciones en el handler.
- **Init de app**: corre a nivel módulo (`if (typeof window !== 'undefined') {...}`), no en effect.

Única excepción conocida: `components/ui/shell-dialog.tsx` tiene 3 useEffect para portal target / animation frame / escape key listener (legítimo mount-time DOM sync, pero debería migrarse a `useMountEffect` o callback ref cuando se toque).

Regla resumen: si vas a escribir `useEffect` fuera de un custom hook, para y reescribe el flujo.

### packages/shared

Tipos y constantes compartidas entre gateway, mcp y web:
- `phases.ts` — `PHASE_STEPS`, `PHASE_EXECUTION` (qué steps requieren human approval), phase enum (13 fases).
- `schemas.ts` — Zod schemas comunes.
- `costing.ts` — tipos del breakdown de costeo.
- `documents.ts` — `DocumentKind` enum (proforma_invoice, commercial_invoice, packing_list, certificate_of_origin, form_f, bill_of_lading, forwarder_invoice, customs_funds_provision, port_invoice, din, msds, other).
- `incoterms.ts`, `payments.ts`, `samples.ts`, `scheduling.ts`, `tlc.ts`, `constants.ts`.
- Tests: `constants.test.ts`, `workflow.test.ts`.

## Dominio

- **State machine a nivel item** (`order_items`, no order). 13 fases: `sourcing → negotiation → preliminary_costing → forwarder_quotation → final_costing → purchase_order → production → documentation → shipping → customs_cl → last_mile → received → closed`. `orders.current_phase` es derivada por trigger `order_items_phase_sync` + función `recompute_order_phase()` (MIN de items activos, no cancelled).
- **Historial de transiciones**: tabla `phase_transitions` registra cada `advance_step` (from_phase, to_phase, from_step, to_step, actor: `agent|user|subagent`, reason, evidence JSONB, ts).
- **Gates humanos** (enforced en `workflow.ts::advance_step`): si `PHASE_EXECUTION[phase][step].requiresHumanApproval` y `actor != 'user'`, se rechaza. El agente llama `request_human_approval` y espera `advance_step(actor='user')`.
- **Pedidos consolidados multi-proveedor**: un solo `order` + items con `supplier_id` distinto cada uno. `orders.supplier_id` es el supplier principal del BL consolidado. La UI agrupa items por supplier en el cockpit.
- **Ingesta retroactiva**: al cargar un pedido ya avanzado, el agente corre `get_item_state` + `advance_step` repetidamente hasta el primer step sin evidencia (ver `skills/hermes-orders/SKILL.md`).
- **Sin subagents**: toda la lógica se ejecuta en el agente principal usando skills. El directorio `agents/` existe con 5 prompts role-based (customs-researcher, email-processor, inventory-reorder, orders-specialist, sourcing-researcher) pero **NO** se cargan ni usan — legacy. No se usa Agent tool ni Task tool.

## Supabase (schema)

~35 tablas organizadas por dominio. Legacy `001–010` (numérico) + migraciones timestamp desde `20260407*`. **Nunca usar prefix numérico** para nuevas migraciones.

**Dominios clave**:
- **Auth/multi-tenant**: `profiles` (FK auth.users.id), `companies`, `company_users` (role: `admin|client`), `gmail_tokens`. Helper functions `SECURITY DEFINER`: `get_user_company_ids()` y `is_company_admin(cid)` para evitar recursión en RLS.
- **Orders**: `orders`, `order_items` (state machine aquí: `current_phase`, `current_step`, `on_hold`, `blocked_reason`, `cancelled`), `order_events`, `phase_transitions` (audit log del state machine).
- **Catalog**: `products`, `suppliers`, `product_suppliers` (multi-proveedor con `unit_price`, `moq`, `lead_time_days`, `is_preferred`), `product_alternatives` (resultados Alibaba), `samples`.
- **Docs/payments/costing**: `documents` (con `kind` enum y `extracted` JSONB), `payments` (linked_document_id ↔ documents.linked_payment_id circular), `costings` (`estimated`/`actual` JSONB breakdown), `costing_defaults` (tabla de referencia con flete/aranceles/IVA hardcoded para Chile).
- **Ops**: `inventory` (reserved/in_transit/available), `inventory_adjustments`, `reorder_rules`, `contacts` (role: forwarder|customs_agent|supplier|other, override por orden), `order_findings`.
- **Scheduling & mail**: `scheduled_tasks` (cron_expr, timezone, prompt, session_key, `next_run_at` canonical), `task_runs`, `mail_threads`, `mail_messages` (dedup por Message-ID).
- **Agent config**: `agent_definitions`, `skill_definitions` (con `content`, `depends[]`, `fork_agent`).

**RLS**: activado en todas las tablas de dominio. Patrón: `company_id IN (SELECT get_user_company_ids())` para SELECT/INSERT, `is_company_admin(company_id)` para ALL. Excepciones: `profiles` (auto-acceso), `gmail_tokens` (owner only), `skill_definitions`/`costing_defaults` (read autenticado).

**Extensions**: `pg_cron` (tick cada minuto) + `pg_net` (llama gateway `/cron/tick` desde la DB via `hermes_cron_tick()`).

**Deuda conocida**:
- Duplicados legacy: `orders.incoterm` (text) + `orders.incoterm_typed` (enum), `documents.doc_type` + `documents.kind`.
- `orders.supplier_name`/`supplier_contact` legacy coexisten con FK `supplier_id`.
- `costing_defaults` hardcoded para Chile (no multi-país).
- FK circular `documents.linked_payment_id ↔ payments.linked_document_id` sin `DEFERRABLE`.
- Sin storage bucket DDL en migraciones (configurado manual).

## Channels

Hermes tiene **dos** integraciones de mail distintas, no confundir:

1. **Gmail OAuth per-user** (`mcp/tools/gmail.ts` + `gateway/routes/gmail.ts`): cada usuario conecta su Gmail via `/gmail/auth`, tokens en tabla `gmail_tokens`. Tools: `gmail_status`, `read_emails`, `search_emails`, `send_email`. Env: `GMAIL_CLIENT_ID/SECRET/REDIRECT_URI`.

2. **Hermes system mail (SMTP + IMAP poller)** — channel mail-as-chat. Un mailbox único del sistema envía notificaciones outbound (`email-sender.ts`) y un IMAP poller (`mail-ingester.ts`) lee replies para que el agente las procese como mensajes de chat, con threads via `mail-threads.ts` y routing a company via `mail-router.ts`. Env: `HERMES_SMTP_HOST/PORT/USER/PASS/FROM/REPLY_TO` + `HERMES_IMAP_HOST/PORT/POLL_MS` (IMAP user/pass default al SMTP). En dev usa Ethereal (`smtp.ethereal.email`), en prod Gmail SMTP/IMAP. Desactivar inbound unsetting `HERMES_IMAP_HOST`.

Además: **WhatsApp** vía prompt dedicado (`prompts/whatsapp.md`) — el gateway resuelve `request.channel === 'whatsapp' ? 'whatsapp' : 'default'` en `skills.ts`.

## Stack

- TypeScript, npm workspaces
- Hono (gateway), @modelcontextprotocol/sdk (MCP), React + Vite + react-grid-layout (web)
- Supabase (Postgres, Auth, Storage, Realtime) — proyecto linked via `supabase/`
- Claude Code CLI como orquestador (suscripción, no API keys)
- `croner` (cron in-process), `nodemailer` (SMTP), `imapflow` (IMAP), `googleapis` (Gmail)

## Deploy

**Docker Compose** con DOS servicios:
- `hermes-mcp` (`server-http.ts`, puerto **8093**) — MCP server HTTP
- `hermes-agent` (`gateway/server.ts`, puerto **8092**) — wrappea Claude Code CLI, se conecta a hermes-mcp:8093

El web app corre local en dev (`npm run dev:web`), no está dockerizado. Railway usa el mismo `Dockerfile` (builder config en `railway.toml`, healthcheck `/health`).

```bash
docker compose up -d --build   # build + start mcp + agent
docker compose logs -f         # logs combinados
docker compose restart         # restart sin rebuild
```

El compose monta volúmenes para credenciales de Claude (`CLAUDE_CONFIG_DIR`) y `/data/sessions/` persistente. `entrypoint.sh` pre-crea `/data` dirs y verifica auth de Claude antes de arrancar.

## Comandos

```bash
npm test                # Vitest (vitest.config.ts root)
npm run test:watch      # Vitest watch mode
npm run dev:gateway     # Gateway local (puerto 8092 via .env)
npm run dev:web         # Web app (http://localhost:3001)
npm run build           # shared → mcp → gateway → web (sequencial)
supabase db push        # aplicar migraciones al proyecto linked (CLI, no npm script)
```

## Convenciones

- **Naming archivos**:
  - Widgets y componentes React → `PascalCase.tsx`
  - Primitives shadcn (`components/ui/`) → `kebab-case.tsx`
  - Tools MCP → `kebab-case.ts`
  - Skills/agents → `kebab-case`
  - Helpers internos prefijados con `_` (ej: `tools/_helpers.ts`)
- **Migraciones SQL**: nuevas migraciones SIEMPRE con prefix timestamp (`YYYYMMDDHHMMSS_name.sql`). No crear con prefix numérico — existe legacy `001–010` pero ya no se agregan más.
- **Tamaños de archivo**: ningún archivo de tool/componente debería pasar ~400 líneas. Split por sub-dominio. Archivos actualmente por encima: `pages/Admin.tsx` (1286L), `pages/Chat.tsx` (553L), `pages/Onboarding.tsx` (356L), `components/Shell.tsx` (399L), `tools/workflow.ts` (355L) — candidatos a refactor.
- **Config env**: todo lookup de `import.meta.env.VITE_*` pasa por `packages/web/src/lib/config.ts`. Todo lookup de `process.env` del gateway pasa por `packages/gateway/src/config.ts`. MCP lee directo `process.env` (sin capa centralizada).

## Frontend notes

- Chat panel width default 480px (rango 360–640).
- Cola de mensajes (Chat.tsx): si llega un mensaje mientras el agente responde, queda encolado y se envía al terminar el turno. No se bloquea el input.
- Attachments: imágenes y PDFs via `ChatInput`. Se suben a gateway (`/upload`) y a Supabase Storage; el agente los procesa con `Read` tool.
- Cockpit mode: se activa automáticamente cuando `activeEntity` está set. El agente llama `activate_order`/`deactivate_order` para sincronizar sesión + context, y la UI responde al cambio de `activeEntity` en App.tsx (localStorage).
- WebSocket session keys: `web` (general), `order-{id}`, `product-{id}`. El gateway usa cada uno como session_key para persistir `.claude-session-id` y hacer `--resume`.
- Rate limiter del gateway está **DESACTIVADO**. Reactivar antes de lanzamiento multi-tenant.

## Multi-empresa

- **Admin** (owner) ve todas sus empresas (selector en header del chat).
- **Client** ve solo su empresa.
- **RLS en Supabase** enforza aislamiento a nivel query, via `get_user_company_ids()` + `is_company_admin()`.
- **Gateway** aisla sesiones Claude CLI por `company_id` + `session_key` (SHA256 → directorio en `/data/sessions/`).
- **MCP** bypassa RLS con service role key — **cada tool DEBE validar `company_id` manualmente** en la query.
- **Auth del gateway**: header `x-internal-secret` compartido (no JWT). El frontend lo pasa en cada request/WS.

## Skills

Todo el conocimiento del dominio vive en `skills/`. No hay subagents — el agente principal carga los skills que necesita y ejecuta todo directamente con MCP tools. El directorio `agents/` es legacy y no se usa.

Cada skill es un directorio con `SKILL.md` (YAML frontmatter + markdown). Frontmatter declara: `name`, `description`, `mcp-tools[]` (tools que puede invocar), `depends[]` (otros skills). El gateway resuelve dependencias transitivas al cargar.

Skills disponibles:
- `hermes-intake` — recopilación de info para nueva importación (create_order, create_product)
- `hermes-orders` — state machine de pedidos (advance_step, get_item_state, costeo, pagos)
- `hermes-products` — catálogo de productos (CRUD, product_suppliers)
- `hermes-documents` — gestión documental (attach_document, validación por fase)
- `hermes-customs-cl` — aduana Chile (TLC, aranceles, DIN)
- `hermes-deep-research` — investigación exhaustiva (proveedores, normativa)
- `hermes-gmail` — correo del usuario (read_emails, send_email)
- `hermes-inventory` — control de stock por producto
- `hermes-reorders` — reglas de recompra automática
- `hermes-company` — gestión de empresa y onboarding
- `hermes-scheduling` — tareas programadas (cron jobs)
