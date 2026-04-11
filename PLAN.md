# Proto migration — work in progress

> This file is a handoff for an in-flight refactor from "hermes monolith" to
> "proto framework + hermes example app". It's meant to be read cold by a
> future session and picked up without prior conversation context.
>
> **Delete this file** when the migration is complete (end of Phase 3g).
>
> For the architecture and API docs, see `CLAUDE.md`.
> For how to add a tool/widget, see `.claude/skills/proto-*/SKILL.md`.

## Current state (as of commit 37fa4b7)

**9 commits** on `main`. All phases through 3c are done. Build is green, runtime smoke test passes.

```
37fa4b7 docs: rewrite CLAUDE.md as proto framework + add framework skills
1f1a3b9 phase 3c: defineWidget API + widget registry for Shell
b22c1cb phase 3a2: migrate remaining 18 tool files to defineTool
c18238e phase 3a1: defineTool API + items.ts pilot
672d7c5 phase 2c: split core-shared — move Hermes domain types to app
ae8018b phase 2b: carve out MCP tools to examples/hermes/app/
13c9660 phase 2a: move hermes assets to examples/hermes/
35b4a78 phase 1: rename packages/{gateway,mcp,web,shared} → packages/core-*
630c459 baseline: copy of hermes as starting point for proto framework
```

### What works end-to-end

- `npm run build` compiles the 4 core packages cleanly
- The MCP server smoke test registers **89 tools** via `registerAppTools`:
  ```bash
  npx tsx -e "
  import { createMcpServer } from '@proto/core-mcp'
  import { registerAppTools } from './examples/hermes/app/tools/index.ts'
  const s = createMcpServer({ name: 'hermes', version: '0.1.0' })
  registerAppTools(s)
  console.log('tools:', Object.keys((s as any)._registeredTools).length)
  # expected: tools: 89
  "
  ```
- Gateway path resolution loads 11 skills + 5 agents from `examples/hermes/app/`:
  ```bash
  PROTO_APP_ROOT=examples/hermes npx tsx -e "
  import { APP_ROOT, resolveAppPath } from './packages/core-gateway/src/config.ts'
  import { loadSkills, loadAgents } from './packages/core-gateway/src/registry.ts'
  console.log('APP_ROOT:', APP_ROOT)
  console.log('skills:', loadSkills().length, 'agents:', loadAgents().length)
  "
  ```

### What has NOT been verified end-to-end yet

**No real Docker smoke test has been run**. All prior commits verified the TypeScript build + the smoke test scripts above, but nobody has done `docker compose up -d --build` + hit the chat from a browser. Before starting Phase 3d it would be responsible to run a real end-to-end verification — Phase 3d is invasive and we want confidence the baseline actually runs.

Suggested verification sequence:
```bash
cd /Users/tomasleblanc/Dev/proto
# 1. Make sure .env.docker exists (copied from hermes? needs secrets)
cat .env.docker 2>/dev/null || echo "MISSING — copy from hermes .env.docker or create fresh"

# 2. Build and start
docker compose up -d --build
docker compose logs -f agent    # watch for startup errors

# 3. In another tab, start web
npm install                     # first time
npm run dev:web

# 4. Open http://localhost:3001, log in, send a message, verify:
#    - Chat streams
#    - Gateway reads skills from /app/examples/hermes/app/skills/
#    - A tool call works (e.g. "lista mis pedidos")
#    - Cockpit mode triggers when you click a row
```

If something breaks at this stage, it's a path resolution or env var issue, not a framework design issue. Debug checklist:
- Does `examples/hermes/.env.docker` exist and have Supabase + Claude credentials?
- Is `PROTO_APP_ROOT=/app/examples/hermes` actually set inside the container? (`docker exec hermes env | grep PROTO`)
- Does the container have `/app/examples/hermes/project.yaml`? (`docker exec hermes ls /app/examples/hermes`)

---

## Next: Phase 3d — split core-web into library + examples/hermes/web/

**Goal**: make `@proto/core-web` a pure framework library (Shell component, hooks, defineWidget, primitives) with no Hermes-specific code. All Hermes widgets, pages, App.tsx, main.tsx, orderSnapshot move to `examples/hermes/web/`.

This is the most invasive phase because it touches Vite config, the SPA entry point, and the web workspace structure. Expect 1–2h of focused work. If it breaks, the smoke test is visual (open browser).

### Why this phase is blocking other phases

- `phases.ts` and `costing.ts` can't leave `core-shared` until `orderSnapshot.ts` (core-web/lib) and `Costing.tsx` (core-web cockpit widget) move to the app.
- `defineEntity` (Phase 3e) wants to own `cockpitLayouts` + `snapshotBuilder`, which depends on both being movable.
- The `create-proto-app` scaffolder (Phase 3g) needs `examples/hermes/web/` to exist as a template reference.

### Target structure

```
proto/
├── packages/
│   └── core-web/                          ← library only
│       ├── src/
│       │   ├── index.ts                   (new: public exports)
│       │   ├── components/
│       │   │   ├── Shell.tsx
│       │   │   ├── shell/
│       │   │   │   ├── Toolbar.tsx
│       │   │   │   ├── FocusView.tsx
│       │   │   │   ├── EmptyState.tsx
│       │   │   │   ├── types.ts
│       │   │   │   └── persistence.ts
│       │   │   ├── widgets/
│       │   │   │   └── agent/             (render_ui runtime — framework)
│       │   │   └── ui/                    (shadcn primitives — framework)
│       │   ├── hooks/                     (useAuth, useData, useMountEffect, useTheme)
│       │   ├── lib/
│       │   │   ├── define-widget.ts
│       │   │   ├── api.ts                 (HermesSocket → ProtoSocket rename? optional)
│       │   │   ├── config.ts
│       │   │   ├── supabase.ts
│       │   │   ├── drag.ts
│       │   │   ├── widgetCache.ts
│       │   │   └── utils.ts
│       │   └── index.css                  (framework-level styles)
│       ├── package.json                   (change: "main": "src/index.ts", remove vite deps)
│       └── tsconfig.json
└── examples/hermes/
    └── web/                               ← new: Hermes SPA
        ├── index.html
        ├── vite.config.ts
        ├── tsconfig.json
        ├── package.json                   (@proto-app/hermes-web)
        ├── public/                        (favicon, etc.)
        └── src/
            ├── main.tsx                   (moved from core-web)
            ├── App.tsx                    (moved from core-web)
            ├── index.css                  (app-specific Tailwind config)
            ├── pages/
            │   ├── Chat.tsx
            │   ├── Admin.tsx
            │   ├── Onboarding.tsx
            │   ├── Login.tsx
            │   ├── Landing.tsx
            │   ├── ResetPassword.tsx
            │   ├── GmailCallback.tsx
            │   ├── Files.tsx
            │   └── Products.tsx
            ├── widgets/
            │   ├── registry.tsx           (was core-web/shell/widgets-registry.tsx)
            │   ├── OrdersWidget.tsx
            │   ├── ProductsWidget.tsx
            │   ├── ... (14 general widgets)
            │   ├── cockpit/
            │   │   ├── order/             (7 files)
            │   │   └── product/           (3 files)
            │   └── modals/
            │       ├── CartModal.tsx
            │       ├── CreateOrderDialog.tsx
            │       ├── CreateProductDialog.tsx
            │       └── SettingsModal.tsx
            ├── shared/
            │   └── orderSnapshot.ts       (moved from core-web/lib)
            └── catalog.ts                 (was core-web/shell/catalog.ts — DEFAULT_WIDGETS, COCKPIT_LAYOUTS, etc.)
```

### Execution plan

**3d.1 — Library exports from core-web** (2h)

Add `packages/core-web/src/index.ts` with public exports:
```ts
// Framework components
export { default as Shell } from './components/Shell'
export { Toolbar } from './components/shell/Toolbar'
export { FocusView } from './components/shell/FocusView'
export { EmptyState } from './components/shell/EmptyState'
export * from './components/shell/types'
export * from './components/shell/persistence'

// Extension API
export {
  defineWidget,
  buildWidgetRegistry,
  type WidgetDefinition,
  type ShellContext,
  type WidgetCategory,
  type WidgetSize,
  type WidgetRegistry,
} from './lib/define-widget'

// Hooks
export { useAuth } from './hooks/useAuth'
export { useData } from './hooks/useData'
export { useMountEffect } from './hooks/useMountEffect'
export { useTheme } from './hooks/useTheme'

// Lib
export * from './lib/api'
export * from './lib/config'
export * from './lib/supabase'
export { buildDragContext, setDragData, getDragData } from './lib/drag'
export { cn } from './lib/utils'

// UI primitives (shadcn)
// Either re-export or tell apps to import from '@proto/core-web/ui/button' etc.
// Simpler: re-export a curated set
export { Button } from './components/ui/button'
export { Input } from './components/ui/input'
// ... etc
```

Update `packages/core-web/package.json`:
```json
{
  "name": "@proto/core-web",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": { /* strip vite + tailwind to devDependencies */ }
}
```

Note: core-web currently builds the whole Vite SPA. After 3d.1 it stops being a Vite app — the Vite build moves to `examples/hermes/web/`. Shell and friends are compiled as TypeScript only.

**Acceptance**: `npm run build -w packages/core-web` compiles with only tsc (no Vite). `core-web/dist/` contains `.js` + `.d.ts` files for Shell, hooks, lib, define-widget.

**3d.2 — Create examples/hermes/web/ skeleton** (1h)

```bash
mkdir -p examples/hermes/web/{src/{pages,widgets/{cockpit/{order,product},modals},shared},public}
```

Create:
- `examples/hermes/web/package.json` — `@proto-app/hermes-web` workspace, depends on `@proto/core-web`, `@proto/core-shared`, `react`, `vite`, `tailwindcss`, shadcn
- `examples/hermes/web/index.html` — copied from `packages/core-web/index.html`
- `examples/hermes/web/vite.config.ts` — copied, path alias `@/` → `./src/`
- `examples/hermes/web/tsconfig.json` — copied, `baseUrl: "./src"`
- `examples/hermes/web/tailwind.config.js`, `postcss.config.js` — copied

Update root `package.json`:
```json
{
  "scripts": {
    "dev:web": "npm run dev -w examples/hermes/web",
    "build": "... && npm run build -w examples/hermes/web"
  }
}
```

Run `npm install` to set up the new workspace symlinks.

**Acceptance**: `ls node_modules/@proto-app/` shows `hermes` + `hermes-web`. The new directory exists but is empty of source (next step fills it).

**3d.3 — Move Hermes source files** (1.5h)

`git mv` the following. Adjust imports as you go. **This is the risky step** — expect broken builds mid-way until you finish all the import rewrites.

| From | To |
|---|---|
| `packages/core-web/src/main.tsx` | `examples/hermes/web/src/main.tsx` |
| `packages/core-web/src/App.tsx` | `examples/hermes/web/src/App.tsx` |
| `packages/core-web/src/index.css` | `examples/hermes/web/src/index.css` |
| `packages/core-web/src/pages/` | `examples/hermes/web/src/pages/` |
| `packages/core-web/src/components/widgets/OrdersWidget.tsx` (and 13 more general widgets) | `examples/hermes/web/src/widgets/OrdersWidget.tsx` |
| `packages/core-web/src/components/widgets/cockpit/` | `examples/hermes/web/src/widgets/cockpit/` |
| `packages/core-web/src/components/widgets/{CartModal,CreateOrderDialog,CreateProductDialog,SettingsModal}.tsx` | `examples/hermes/web/src/widgets/modals/` |
| `packages/core-web/src/components/shell/widgets-registry.tsx` | `examples/hermes/web/src/widgets/registry.tsx` |
| `packages/core-web/src/components/shell/catalog.ts` | `examples/hermes/web/src/catalog.ts` |
| `packages/core-web/src/lib/orderSnapshot.ts` | `examples/hermes/web/src/shared/orderSnapshot.ts` |

**Stays in core-web**: `Shell.tsx`, `shell/{Toolbar,FocusView,EmptyState,types,persistence}`, `widgets/agent/`, `ui/` (shadcn primitives), `hooks/`, `lib/{api,config,supabase,drag,widgetCache,utils,define-widget}`.

**Import rewrites across moved files**:
- Inside moved files: imports of moved sibling files stay relative
- Inside moved files: imports that used to be `@/components/shell/...` → `@proto/core-web` for anything that's now in the library
- Inside moved files: imports of `@/hooks/useData` → `@proto/core-web` (after library exports exist)
- Inside moved files: `@/lib/supabase`, `@/lib/api`, etc. → `@proto/core-web`

**Imports from core-web into moved files** — none should exist after this phase. Core-web does not import from examples.

**3d.4 — Wire Shell in the new App.tsx**

Shell now receives the widget registry as a prop (instead of importing it hardcoded):

```tsx
// packages/core-web/src/components/Shell.tsx (framework)
interface Props {
  widgets: WidgetRegistry               // NEW: injected by app
  defaultLayout: DefaultLayout          // NEW: injected by app
  cockpitLayouts: CockpitLayouts        // NEW: injected by app
  // ... existing props
}
```

```tsx
// examples/hermes/web/src/App.tsx (app)
import { Shell, buildWidgetRegistry } from '@proto/core-web'
import { WIDGETS } from './widgets/registry'
import { DEFAULT_WIDGETS, DEFAULT_LAYOUTS, ORDER_COCKPIT_WIDGETS, ORDER_COCKPIT_LAYOUTS, PRODUCT_COCKPIT_WIDGETS, PRODUCT_COCKPIT_LAYOUTS } from './catalog'

const WIDGET_REGISTRY = buildWidgetRegistry(WIDGETS)

// inside App:
<Shell
  widgets={WIDGET_REGISTRY}
  defaultWidgets={DEFAULT_WIDGETS}
  defaultLayouts={DEFAULT_LAYOUTS}
  orderCockpit={{ widgets: ORDER_COCKPIT_WIDGETS, layouts: ORDER_COCKPIT_LAYOUTS }}
  productCockpit={{ widgets: PRODUCT_COCKPIT_WIDGETS, layouts: PRODUCT_COCKPIT_LAYOUTS }}
  /* ... rest of props unchanged */
/>
```

Shell.tsx becomes parametrized instead of hardcoded. The top-level `WIDGET_REGISTRY = buildWidgetRegistry(WIDGETS)` constant gets removed from Shell (was the temporary pattern in Phase 3c).

**3d.5 — Move `phases.ts` and `costing.ts` from core-shared to app** (30 min)

Now that `orderSnapshot.ts` and `Costing.tsx` live in the app, they can import from a new local path instead of `@proto/core-shared`:

```bash
git mv packages/core-shared/src/phases.ts examples/hermes/app/shared/phases.ts
git mv packages/core-shared/src/costing.ts examples/hermes/app/shared/costing.ts
```

Update imports:
- `examples/hermes/app/tools/workflow.ts`, `items.ts` — `@proto/core-shared` → `../shared/index.js` (for PHASES, PHASE_STEPS, PHASE_EXECUTION, Phase, requiresHumanApproval)
- `examples/hermes/app/tools/costing.ts` — same for costing imports
- `examples/hermes/app/tools/_hermes-helpers.ts` — same for PHASE_STEPS
- `examples/hermes/web/src/shared/orderSnapshot.ts` — same for phases imports
- `examples/hermes/web/src/widgets/cockpit/order/Costing.tsx` — same for costing types

Update `examples/hermes/app/shared/index.ts` to re-export from the new local phases.ts and costing.ts.

Update `packages/core-shared/src/index.ts` to remove `export * from './phases.js'` and `export * from './costing.js'`.

**Acceptance**: `grep -r 'phases\|costing\|PHASE_STEPS' packages/core-*/src/` returns nothing. core-shared is now 100% framework-pure.

**3d.6 — Build verify + runtime smoke test** (30 min)

```bash
# Typescript build
npm run build

# MCP smoke test (same as before — 89 tools)
npx tsx -e "
import { createMcpServer } from '@proto/core-mcp'
import { registerAppTools } from './examples/hermes/app/tools/index.ts'
const s = createMcpServer({ name: 'hermes', version: '0.1.0' })
registerAppTools(s)
console.log('tools:', Object.keys((s as any)._registeredTools).length)
"

# Vite dev server for the web app
npm run dev:web                # should serve the SPA from examples/hermes/web/

# Docker (optional but recommended)
docker compose up -d --build
docker compose logs -f agent
```

Open http://localhost:3001, log in, send a message, verify widget catalog works, activate an order, verify cockpit renders. **If this works, Phase 3d is done**.

### Phase 3d acceptance criteria

- [ ] `grep -r 'orders\|products\|supplier\|phases\|costing' packages/core-*/src/ | grep -v '// \|test'` returns nothing domain-specific
- [ ] `packages/core-web/package.json` main field is `src/index.ts`, no `vite` dependency in production deps
- [ ] `examples/hermes/web/` exists as a workspace with its own Vite config
- [ ] `examples/hermes/web/src/widgets/registry.tsx` exists with all 20 `defineWidget` entries
- [ ] `npm run build` passes (now builds 5 workspaces: 4 core + hermes-web)
- [ ] MCP smoke test still reports 89 tools
- [ ] Visual smoke test: browser can log in and see widgets
- [ ] `docker compose up` + web dev both work
- [ ] Single commit with message `phase 3d: split core-web into library + examples/hermes/web/`

### Risks for Phase 3d

1. **Circular imports after file moves** — core-web/Shell.tsx imports ShellContext type from define-widget.ts, which is fine, but if something in Shell accidentally imports from a moved widget, it creates a broken cycle. Grep check: `grep -r 'examples/hermes' packages/core-*/src/` should return nothing.

2. **Tailwind config duplication** — `packages/core-web/tailwind.config.js` currently scans `./src/**/*.tsx`. After 3d.3, the app scans its own src. If shadcn primitives in core-web need Tailwind generation, either (a) core-web keeps its own Tailwind with just `components/ui/`, (b) the app's Tailwind also scans `node_modules/@proto/core-web/src/**`, or (c) core-web ships pre-compiled CSS.
   - Simplest: option (b) — add `"./node_modules/@proto/core-web/src/**/*.{ts,tsx}"` to the app's Tailwind content glob.

3. **`@/` path alias confusion** — core-web's imports use `@/components/...` (Vite-aware alias). After 3d.1, core-web is tsc-only and doesn't process `@/` — tsc will choke on the alias. Fix: either rewrite all `@/` imports in core-web to relative paths, or keep the alias in `tsconfig.json` paths field (tsc respects paths with `paths: { "@/*": ["./src/*"] }`).

4. **Shell.tsx temporarily broken during moves** — while you're moving widgets, `widgets-registry.tsx` imports will break. Strategy: move files in topological order (leaves first) and do import rewrites in the same commit. If you can't keep it green, make it a WIP branch commit that explicitly says "phase 3d WIP — broken build" and squash at the end.

5. **Vercel.json** — `packages/core-web/vercel.json` references `packages/core-web` build paths. After 3d, update it to point at `examples/hermes/web`.

### Files to double-check for forgotten imports

Before closing 3d, grep for leftover references:
```bash
grep -rn '@proto/core-shared' packages/core-web/src/       # should be empty
grep -rn '@/components/widgets' packages/core-web/src/    # should be empty
grep -rn 'orderSnapshot\|Costing' packages/core-web/src/  # should be empty
grep -rn 'PHASE_STEPS\|PHASE_EXECUTION' packages/          # should only be in _hermes-helpers.ts references if any
grep -rn 'from.*hermes' packages/core-*/src/              # should only be in mail Message-ID comments
```

---

## Phase 3e — `defineEntity`

**Goal**: collapse the `activate_order`/`deactivate_order`/`get_active_order` MCP tools + the cockpit layouts + the `orderSnapshot` markdown builder into a single declarative `defineEntity()` call.

### API sketch

```ts
// @proto/core-shared
export function defineEntity<T = unknown>(config: {
  name: string                       // 'order', 'product', 'project'...
  table: string                      // Supabase table name
  labelField: keyof T
  snapshotBuilder: (entity: T, ctx: { supabase: SupabaseClient }) => Promise<string>
  cockpitLayouts: Record<Breakpoint, Array<{
    widgetType: string
    x: number; y: number; w: number; h: number
    minW?: number; minH?: number
  }>>
}): EntityDefinition
```

### What the core does with it

- **On the MCP side**: auto-generate `activate_<name>`, `deactivate_<name>`, `get_active_<name>` tools
- **On the web side**: Shell reads the entity's `cockpitLayouts` when `activeEntity?.type === name`
- **On the chat side**: when `activeEntity` is set, run `snapshotBuilder(entity, ctx)` and inject the markdown into `company_context` on every message

### Files that change

- New: `packages/core-shared/src/define-entity.ts` (types + identity helper)
- New: `packages/core-mcp/src/generate-entity-tools.ts` (auto-generation)
- Deleted: `examples/hermes/app/tools/active-order.ts` (auto-generated now)
- Deleted: `examples/hermes/app/activeOrder.ts` (the state lives in ctx now, not module-level)
- New: `examples/hermes/app/entities/order.ts` + `product.ts`
- Deleted: `ORDER_COCKPIT_WIDGETS`, `ORDER_COCKPIT_LAYOUTS` etc from `catalog.ts` (moves into entity definitions)
- Modified: `Shell.tsx` reads cockpit layouts from the active entity definition
- Modified: `Chat.tsx` and/or `App.tsx` calls `snapshotBuilder` when activeEntity changes
- Deleted: `examples/hermes/web/src/shared/orderSnapshot.ts` (its code moves inside `entities/order.ts::snapshotBuilder`)

### Acceptance

- Entity definitions live in `examples/hermes/app/entities/`
- `activate_order` is not hand-written anywhere — it's auto-generated from the entity definition
- `cockpitLayouts` exists in exactly one place (the entity def), not duplicated between Shell + catalog + MCP tool
- Adding a new activatable entity (say `project`) is one file: `examples/hermes/app/entities/project.ts`

---

## Phase 3f — `defineWorkflow`

**Goal**: replace the 13 hardcoded Hermes phases in `phases.ts` with a declarative YAML file that auto-generates the workflow tools.

### Files

- New: `packages/core-mcp/src/define-workflow.ts` (YAML parser + tool generator)
- New: `packages/core-workflow/` — optional dedicated package if this grows
- New: `examples/hermes/app/workflows/import.yaml` — 13 phases declared as data
- Deleted: `examples/hermes/app/shared/phases.ts` (moved here from core-shared in 3d)
- Deleted: `examples/hermes/app/tools/workflow.ts` (auto-generated now)
- Deleted: `examples/hermes/app/tools/_hermes-helpers.ts::isValidStep` (auto-generated)

### YAML shape

```yaml
# examples/hermes/app/workflows/import.yaml
name: import
entity: order_item
phase_column: current_phase
step_column: current_step
transitions_table: phase_transitions

phases:
  - name: sourcing
    steps: [identify_need, research_suppliers, receive_quotes]
  - name: negotiation
    steps: [negotiate_price, negotiate_terms, select_supplier]
  - name: final_costing
    steps:
      - review_pricing
      - { name: approve_costing, requires_human_approval: true }
  # ... rest of 13 phases
```

Auto-generates:
- `get_import_state(item_id)`
- `advance_import_step(item_id, step, actor, evidence)`
- `block_import_item`, `hold_import_item`, `cancel_import_item`, `list_import_items_by_phase`
- `request_human_approval`

### Acceptance

- `examples/hermes/app/tools/workflow.ts` is gone
- `phases.ts` is gone
- A new workflow is 1 YAML file + 1 registration line, no code

---

## Phase 3g — scaffolder + more framework skills

**Goal**: ship `create-proto-app` so new projects can start from a clean template.

### Files

- New: `packages/create-proto-app/` — a new workspace, published to npm
- New: `examples/minimal/` — minimal example app (1 entity, 3 tools, 2 widgets, no workflow) used as the scaffolding template
- New framework skills: `proto-entity`, `proto-workflow`, `proto-migration`, `proto-channel`, `proto-scaffold`, `proto-debug`, `proto-deploy`

### create-proto-app behavior

```bash
npx create-proto-app my-new-project
```

Should:
1. Clone `examples/minimal/` → `./my-new-project/`
2. Rename `@proto-app/minimal` → `@proto-app/my-new-project` in package.json
3. Copy `.claude/skills/proto-*` into the new repo
4. Run `git init` + first commit
5. Print next-steps URL (quickstart in README)

---

## Blockers and known issues

### Hard blockers (must fix before declaring migration done)

1. **`mail-threads.ts` string branding** (`packages/core-gateway/src/mail-threads.ts:39`): `<hermes-{uuid}@hermes>` hardcoded in Message-ID generator. Should become `<{appName}-{uuid}@{appName}>` read from `config.name`. Low risk — fix when touching mail code.

2. **`entrypoint.sh` branding**: echoes `[hermes]` and references the `hermes` container name. Cosmetic, could become `[proto]` or read from env. Low priority.

3. **Shell.tsx still hardcodes some Hermes-specific things**:
   - `const CART_KEY = 'hermes-cart'` → should come from app config
   - `loadCart()` / `saveCart()` helpers → could move to app-space via a ctx extension

4. **Rate limiter still disabled**: `packages/core-gateway/src/rate-limiter.ts` is a no-op. Must be reactivated before any real multi-tenant launch.

5. **No end-to-end Docker verification yet**. The 9 commits are built + smoke-tested but nobody has run the full Docker stack since Phase 1. See "Suggested verification sequence" above.

### Soft blockers (cleanup we'll eventually want)

1. **`.claude/settings.local.json`** copied from Hermes — has stale path references like `/Users/tomasleblanc/Dev/hermes/packages/web/...` that no longer exist. Doesn't break anything (local permissions file) but should be cleaned.

2. **`.data/` directory** — 4 empty subdirs copied from Hermes (claude, claude-config, sessions). Cosmetic.

3. **Tool `company_id` args**: every tool still accepts `company_id` as an explicit arg (legacy). Phase 4 or later: move to ctx injection so the agent doesn't need to remember it.

4. **Admin.tsx (1286L) and Chat.tsx (553L)** are oversized — both need splits. Not blocking the migration but should happen before adding more features.

5. **core-mcp HTTP server state isolation**: `createMcpServer()` is called per-session, but `getSupabase()` returns a singleton that's shared. Multi-tenant session isolation has a hole here. Fix with proper ctx injection in Phase 4.

---

## How to resume this work in a fresh session

1. Open `/Users/tomasleblanc/Dev/proto` in a new Claude Code session.
2. Read in order: this file (`PLAN.md`), `CLAUDE.md`, `.claude/skills/README.md`.
3. Run the smoke tests in "What works end-to-end" above to confirm the baseline is still green.
4. **If Phase 3d hasn't started**: run the "Suggested verification sequence" Docker test first, then start Phase 3d.
5. **If Phase 3d is in progress**: check `git status` and `git log --oneline -5`; resume from wherever you left off. Expect a possibly-broken intermediate state.

### Conventions for continuing

- Each phase is **one atomic commit** with message `phase <n>: <description>`.
- Never break the build for more than one commit at a time. If a phase requires WIP, use a branch and squash before merging.
- Keep `PLAN.md` updated: cross off acceptance criteria, mark phases completed, update "current state".
- Delete `PLAN.md` at the end of Phase 3g, when everything is done and proto can be published.

### Handy commands

```bash
# Status + log
git status && git log --oneline -10

# Full build (should pass)
npm run build

# MCP tool smoke test (should say 89)
npx tsx -e "
import { createMcpServer } from '@proto/core-mcp'
import { registerAppTools } from './examples/hermes/app/tools/index.ts'
const s = createMcpServer({ name: 'hermes', version: '0.1.0' })
registerAppTools(s)
console.log('tools:', Object.keys((s as any)._registeredTools).length)
"

# Gateway path resolution smoke test
PROTO_APP_ROOT=examples/hermes npx tsx -e "
import { APP_ROOT } from './packages/core-gateway/src/config.ts'
import { loadSkills, loadAgents } from './packages/core-gateway/src/registry.ts'
console.log('APP_ROOT:', APP_ROOT, 'skills:', loadSkills().length, 'agents:', loadAgents().length)
"

# Grep domain leaks (should be ~empty after 3d)
grep -rn 'orders\|products\|supplier\|phases\|costing\|hermes' packages/core-*/src/ | grep -v '// \|/\*\|node_modules'
```
