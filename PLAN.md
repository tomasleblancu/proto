# Proto migration — work in progress

> This file is a handoff for an in-flight refactor from "hermes monolith" to
> "proto framework + hermes example app". It's meant to be read cold by a
> future session and picked up without prior conversation context.
>
> **Delete this file** when the migration is complete (end of Phase 3g).
>
> For architecture and API docs, see `CLAUDE.md`.
> For how to add tools/widgets/entities/workflows, see `.claude/skills/proto-*/SKILL.md`.

## Current state (as of phase 3g.1)

**13 commits** on `main`. Phases 1, 2a, 2b, 2c, 3a1, 3a2, 3c, 3d, 3e, 3f, 3g.1(skills+minimal) all
done. Build is green, vitest passes 41/41, MCP smoke test reports 92 tools.

```
cf6106d phase 3e: defineEntity API + entity tool generator
54a2c11 phase 3f: defineWorkflow API + state-machine tool generator
e48bacf phase 3d: split core-web into library + examples/hermes/web/
4839d69 docs: add PLAN.md for migration handoff
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

- `npm run build` compiles the 5 workspaces cleanly (core-shared, core-mcp,
  core-gateway, core-web as library, @proto-app/hermes-web as Vite SPA)
- `npm test` → **41/41 vitest passing**
- MCP smoke test registers **92 tools** (previous 89 minus 3 hand-written
  active-order tools, plus 6 generated entity tools for order+product, plus
  the 9 workflow tools still come from the generator):
  ```bash
  npx tsx -e "
  import { createMcpServer } from '@proto/core-mcp'
  import { registerAppTools } from './examples/hermes/app/tools/index.ts'
  const s = createMcpServer({ name: 'hermes', version: '0.1.0' })
  registerAppTools(s)
  console.log('tools:', Object.keys((s as any)._registeredTools).length)
  # expected: tools: 92
  "
  ```

### What the framework ships today

- **`defineTool`** (Phase 3a) — declarative MCP tool in `@proto/core-mcp`
- **`defineWidget`** (Phase 3c) — declarative shell widget in `@proto/core-web`
- **`defineEntity`** (Phase 3e) — declarative activatable entity in
  `@proto/core-shared`, with `registerEntityTools` in `@proto/core-mcp` that
  auto-generates `activate_<name>` / `deactivate_<name>` / `get_active_<name>`
- **`defineWorkflow`** (Phase 3f) — declarative state machine in
  `@proto/core-shared`, with `registerWorkflowTools` in `@proto/core-mcp` that
  auto-generates the 9 state machine tools from a single data file
- **`Shell`** (Phase 3d) — generic library component taking `widgets`,
  `defaultWidgets`, `defaultLayouts`, `cockpits` map, plus `contextExtras`,
  `toolbarExtras`, `overlays` slots. App owns cart state + modals.

### core-shared is framework-pure

`packages/core-shared/src/` now has only framework types:
- `schemas.ts` — ChatRequest, SSEEvent
- `scheduling.ts` — cron/task types
- `define-entity.ts` — defineEntity + helpers
- `define-workflow.ts` — defineWorkflow + helpers
- `index.ts` — barrel

`phases.ts` and `costing.ts` moved to `examples/hermes/app/shared/` in 3d.
The 13-phase data lives in `examples/hermes/app/workflows/import.ts` and is
re-exported as PHASES/PHASE_LABELS/PHASE_STEPS/PHASE_EXECUTION/... for
legacy consumers.

### What has NOT been verified end-to-end yet

**No real Docker smoke test has been run since Phase 1**. All phases verified
the TypeScript build + MCP registration + vitest, but nobody has done
`docker compose up -d --build` + hit the chat from a browser end-to-end.
Before declaring the migration fully done it would be responsible to run:

```bash
cd /Users/tomasleblanc/Dev/proto
# 1. Make sure .env.docker exists (copy from hermes .env.docker or create fresh)
cat .env.docker 2>/dev/null || echo "MISSING"

# 2. Build and start
docker compose up -d --build
docker compose logs -f agent

# 3. In another tab, start web
npm install                     # first time
npm run dev:web                 # → http://localhost:3001

# 4. Log in, send a message, verify:
#    - Chat streams
#    - Tool call works (e.g. "lista mis pedidos") → hits list_orders
#    - Click an order → cockpit opens with 7 order widgets
#    - Agent calls activate_order → Chat.tsx intercepts → cockpit switches
#    - Agent calls advance_step → workflow tool runs, state persists
```

If something breaks at this stage, it's a path resolution / env var issue,
not a framework design issue. Debug checklist:
- Does `examples/hermes/.env.docker` exist and have Supabase + Claude creds?
- Is `PROTO_APP_ROOT=/app/examples/hermes` set inside the container?
  (`docker exec hermes env | grep PROTO`)
- Does the container have `/app/examples/hermes/project.yaml`?
  (`docker exec hermes ls /app/examples/hermes`)

---

## Next: Phase 3g — scaffolder + remaining framework skills

**Goal**: ship `create-proto-app` so new projects can start from a clean
template, plus the last handful of framework skills. After 3g, the migration
is done and this PLAN.md can be deleted.

**What's already landed for 3g (commit after 3f)**:
- `proto-entity` framework skill — matches the 3e API
- `proto-workflow` framework skill — matches the 3f API
- `.claude/skills/README.md` updated, proto-tool stale example fixed

**What's left**:

### 3g.1 — `examples/minimal/` (template for scaffolder) ✅ DONE

24 files, ~700 lines. Demonstrates all extension points:
- 1 entity (`item`) with cockpit via defineEntity
- 1 workflow (`task`) with 3 phases via defineWorkflow
- 3 tools (create_item, list_items, update_item) via defineTool
- 2 widgets (ItemsWidget, ItemDetailWidget) via defineWidget
- 1 Supabase migration (items + tasks + task_transitions)
- MCP entry points (stdio + HTTP)
- Web SPA with Shell, widget registry, cockpit support
- `project.yaml` with skill loader pointing at empty `skills/`
- Builds clean alongside hermes (`npm run build` includes minimal-web)

### 3g.2 — `packages/create-proto-app/` (scaffolder CLI)

```bash
npx create-proto-app my-new-project
```

Behavior:
1. Clone `examples/minimal/` → `./my-new-project/`
2. Rename `@proto-app/minimal` → `@proto-app/my-new-project` in all
   package.json files (app + web workspace)
3. Update `PROTO_APP_ROOT` references + `.env.example`
4. Copy `.claude/skills/proto-*` into `./my-new-project/.claude/skills/`
5. Run `git init && git add . && git commit -m "initial commit from create-proto-app"`
6. Print next-steps URL (quickstart in README)

Files:
- `packages/create-proto-app/package.json` — `"bin": { "create-proto-app": "./dist/cli.js" }`
- `packages/create-proto-app/src/cli.ts` — arg parsing + orchestration
- `packages/create-proto-app/src/copy-template.ts` — recursive copy with rename
- `packages/create-proto-app/src/rename-package.ts` — package.json patcher
- `packages/create-proto-app/tsconfig.json` + build script

Keep it small: ~200 lines total. No prompts UI, no templates engine. Just
copy + rename + git init.

### 3g.3 — remaining framework skills

| Skill | Content |
|---|---|
| `proto-migration` | SQL migration conventions, timestamp prefix, RLS pattern, helper functions (`get_user_company_ids`), pg_cron setup, triggers |
| `proto-debug` | Troubleshooting: path resolution issues, session key debugging, auth middleware, Claude CLI `--resume` behavior, mail ingester logs |
| `proto-deploy` | Docker compose structure, Railway deploy, env vars, health checks, zero-downtime re-deploy |
| `proto-scaffold` | How to use `create-proto-app`, what the template gives you, first 5 customization steps |

Each skill is ~150-250 lines of markdown. Low risk, high value for onboarding
new projects.

### 3g.4 — end-to-end Docker verification

After 3g.1 + 3g.2, run a full `docker compose up -d --build` + browser smoke
test against the current Hermes app. If it works, the migration baseline is
proven and we can ship. If not, debug path resolution / env vars.

### Acceptance for phase 3g

- [x] `examples/minimal/` exists and builds clean
- [x] `packages/create-proto-app/` publishes (or at least runs via `npx tsx`)
      and successfully scaffolds a new app from `examples/minimal`
- [x] 4 new framework skills land (proto-migration, proto-debug, proto-deploy, proto-scaffold)
- [ ] Docker compose up + browser smoke test passes (manual — needs .env.docker with Supabase + Anthropic creds)
- [x] README.md at repo root tells the user how to scaffold a new app
- [ ] This PLAN.md is deleted (delete after Docker smoke test passes)

---

## Blockers and known issues

### Soft blockers (cleanup we'll eventually want)

1. **Branding leaks in core-web** (non-breaking):
   - `lib/api.ts` — `HermesSocket` class, `hermesSocket` singleton
   - `lib/drag.ts` — `application/hermes` MIME type
   - `hooks/useTheme.ts` — `localStorage.getItem('hermes-theme')`
   - `components/shell/persistence.ts` — `const KEY = 'hermes-shell'`
   - `components/widgets/agent/actions.ts` — `save_alternative` action writes to
     `product_alternatives` (Hermes-specific domain)
   - `components/widgets/agent/Primitives.tsx` — `GoldSupplier` Alibaba primitive
   These should become configurable / app-injectable. Low priority — works fine
   for the hermes example today.

2. **Branding leaks in core-gateway**:
   - `mail-threads.ts` — Message-ID format `<hermes-{uuid}@hermes>`
   - `mail-ingester.ts` / `email-sender.ts` — `HermesSocket`, `sendFromHermes`,
     `isHermesMailConfigured`, `HERMES_SMTP_*`, `HERMES_IMAP_*` env vars
   - `scheduler.ts` — `[Hermes] ...` subject prefix in task notifications
   - `config.ts` — default app name fallback is 'hermes'
   Fix when touching mail code or when we add `defineChannel`.

3. **Rate limiter disabled**: `packages/core-gateway/src/rate-limiter.ts` is a
   no-op (returns `allowed=true`). Must be reactivated before any real
   multi-tenant launch.

4. **Tool `company_id` args**: every hand-written tool still accepts
   `company_id` as an explicit arg (legacy). Phase 4 or later: move to ctx
   injection so the agent doesn't need to remember it.

5. **Admin.tsx (1286L) and Chat.tsx (553L)** are oversized. Not blocking but
   should happen before adding more features.

6. **core-mcp HTTP session isolation**: `createMcpServer()` is called per-session
   but `getSupabase()` returns a singleton shared across sessions. Fix with
   proper ctx injection in Phase 4.

7. **`.claude/settings.local.json`** still has stale `/Users/tomasleblanc/Dev/hermes/...`
   paths. Cosmetic.

---

## How to resume this work in a fresh session

1. Open `/Users/tomasleblanc/Dev/proto` in a new Claude Code session.
2. Read in order: this file (`PLAN.md`), `CLAUDE.md`, `.claude/skills/README.md`.
3. Run the smoke tests in "What works end-to-end" above to confirm the baseline
   is still green.
4. **If Phase 3g hasn't started**: decide between 3g.1 (minimal example),
   3g.2 (CLI), 3g.3 (skills). They're independent. 3g.1 blocks 3g.2.
5. **If Phase 3g is in progress**: check `git status` and `git log --oneline -5`;
   resume from wherever you left off.

### Conventions for continuing

- Each sub-phase is **one atomic commit** with message
  `phase 3g.N: <description>`.
- Never break the build for more than one commit at a time. If WIP, use a
  branch and squash before merging.
- Keep `PLAN.md` updated: cross off acceptance criteria, mark phases
  completed, update "current state".
- Delete `PLAN.md` at the end of 3g when everything is done and proto can
  be published.

### Handy commands

```bash
# Status + log
git status && git log --oneline -10

# Full build (should pass all 5 workspaces)
npm run build

# Vitest (should say 41/41)
npm test

# MCP tool smoke test (should say 92)
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

# Grep domain leaks (branding-level only after 3d/3e/3f)
grep -rn 'orders\|products\|supplier\|phases\|costing' packages/core-*/src/ \
  | grep -v '// \|/\*\|node_modules'
```
