# Proto

TypeScript monorepo framework for building AI-agent-driven apps. The developer defines **data models** (SQL), **tools** (what the agent can do), and **widgets** (what the user sees). The framework provides the chat interface, Shell dashboard, auth, WebSocket, MCP server, and Claude CLI integration.

## Stack

- **Runtime**: Node.js 22, TypeScript, tsx
- **Backend**: Hono (HTTP+WS gateway), MCP SDK (tool server), Claude Code CLI (agent)
- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui, react-grid-layout
- **Database**: Supabase (Postgres + Auth + RLS)
- **Deploy**: Docker Compose (2 services: MCP + Gateway), Railway optional

## Architecture

```
proto/
├── packages/
│   ├── proto/                          Framework (single publishable package)
│   │   ├── mcp.ts                      Barrel: export * from './core-mcp/src'
│   │   ├── web.ts                      Barrel: export * from './core-web/src'
│   │   ├── shared.ts                   Barrel: export * from './core-shared/src'
│   │   ├── core-mcp/                   MCP server, defineTool, createProtoMcp
│   │   ├── core-web/                   React Shell, ProtoApp, defineWidget, hooks, shadcn
│   │   └── core-shared/                Types, defineEntity, defineWorkflow
│   ├── core-gateway/                   Hono HTTP+WS, Claude CLI runner, scheduler, mail
│   └── create-proto-app/               CLI scaffolder
├── examples/
│   ├── hermes/                         Production app (89 tools, 20 widgets, 2 entities)
│   │   ├── app/
│   │   │   ├── tools/*.ts              Auto-discovered by createProtoMcp
│   │   │   ├── entities/*.ts           Auto-discovered
│   │   │   ├── workflows/*.ts          Auto-discovered
│   │   │   ├── skills/*/SKILL.md       Auto-discovered by gateway
│   │   │   ├── prompts/*.md            Via project.yaml
│   │   │   ├── mcp.ts                  2 lines: createProtoMcp + stdio
│   │   │   └── mcp-http.ts            2 lines: createProtoMcp + http
│   │   ├── web/                        Hermes frontend (custom App.tsx, Chat, modals)
│   │   └── supabase/migrations/        30 SQL files
│   └── minimal/                        Template for new apps
│       ├── app/
│       │   ├── tools/items.ts          3 example tools
│       │   ├── entities/item.ts        1 example entity
│       │   ├── workflows/task.ts       1 example workflow (3 phases)
│       │   ├── skills/items/           1 example domain skill
│       │   └── prompts/default.md      System prompt
│       ├── web/src/
│       │   ├── App.tsx                 8 lines: glob widgets + ProtoApp
│       │   └── widgets/*.tsx           Self-registering via defineWidget
│       ├── supabase/migrations/        1 SQL file
│       └── .env.example
├── .claude/skills/                     8 framework skills for Claude Code
├── Dockerfile                          Generic, APP_NAME build arg
├── docker-compose.yml                  Generic, APP_NAME env var
└── entrypoint.sh                       CLAUDE_SETUP_TOKEN auth
```

## Imports

One package, three subpath exports:

```ts
import { defineTool, getSupabase, err, json } from '@tleblancureta/proto/mcp'
import { defineWidget, useData, supabase, ProtoApp } from '@tleblancureta/proto/web'
import { defineEntity, defineWorkflow } from '@tleblancureta/proto/shared'
```

## What the app developer writes

Only 3 types of files — everything else is framework:

### 1. Data models (SQL migrations)
```sql
-- supabase/migrations/20260411000000_items.sql
create table items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 2. Tools (what the agent can do)
```ts
// app/tools/items.ts
import { defineTool, getSupabase, err, json } from '@tleblancureta/proto/mcp'
import { z } from 'zod'

export default [
  defineTool({
    name: 'create_item',
    description: 'Create a new item.',
    schema: { company_id: z.string(), name: z.string() },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('items').insert(args).select().single()
      return error ? err(error.message) : json(data)
    },
  }),
]
```
Tools are auto-discovered from `app/tools/*.ts`. Each file exports `default [defineTool(...), ...]`. The handler can contain any business logic — validation, API calls, multi-table operations.

### 3. Widgets (what the user sees)
```tsx
// web/src/widgets/ItemsWidget.tsx
import { defineWidget, useData, supabase } from '@tleblancureta/proto/web'
import type { ShellContext } from '@tleblancureta/proto/web'

export default defineWidget({
  type: 'items',
  title: 'Items',
  icon: '📋',
  category: 'general',
  render: (_, ctx) => <Items {...ctx} />,
})

function Items({ companyId, refreshKey, onActivateEntity }: ShellContext) {
  const { data } = useData(async () => {
    const { data } = await supabase.from('items').select('*').eq('company_id', companyId)
    return data || []
  }, [companyId, refreshKey], [])

  return (
    <div className="p-3">
      {data.map(item => (
        <p key={item.id} onClick={() => onActivateEntity?.({ type: 'item', id: item.id, label: item.name })}>
          {item.name}
        </p>
      ))}
    </div>
  )
}
```
Widgets are auto-discovered from `web/src/widgets/*.tsx` via `import.meta.glob`. Each file exports a `defineWidget()` default — self-registering, no manual registry needed.

### Optional: entities, workflows, skills, prompts

```ts
// app/entities/item.ts — activatable entity with cockpit mode
import { defineEntity } from '@tleblancureta/proto/shared'
export default defineEntity({ name: 'item', table: 'items', labelField: 'name', cockpit: { widgets, layouts } })

// app/workflows/task.ts — state machine with auto-generated tools
import { defineWorkflow } from '@tleblancureta/proto/shared'
export default defineWorkflow({ name: 'task', entityTable: 'tasks', phases: [...] })
```

```md
<!-- app/skills/items/SKILL.md — agent instructions -->
---
name: items
description: Manage items
mcp-tools: [create_item, list_items, update_item]
---
Rules for using item tools...
```

All auto-discovered. Drop files, they load.

## Framework-provided files (don't touch)

```ts
// app/mcp.ts — 2 lines
import { createProtoMcp } from '@tleblancureta/proto/mcp'
const app = await createProtoMcp({ name: 'my-app' })
await app.stdio()

// app/mcp-http.ts — 2 lines
import { createProtoMcp } from '@tleblancureta/proto/mcp'
const app = await createProtoMcp({ name: 'my-app' })
await app.http()

// web/src/App.tsx — auto-discovers widgets + entities
import { ProtoApp } from '@tleblancureta/proto/web'
const mods = import.meta.glob('./widgets/*.tsx', { eager: true })
const WIDGETS = Object.values(mods).map(m => m.default).filter(Boolean)
export default function App() { return <ProtoApp widgets={WIDGETS} /> }
```

## Runtime flow

```
Browser (Shell + Chat)
    ↓ WebSocket
Gateway (Hono + Claude CLI --resume)
    ↓ MCP protocol
MCP Server (auto-discovered tools + entities + workflows)
    ↓ SQL
Supabase (data + RLS + auth)
```

User chats → gateway passes to Claude CLI → Claude calls MCP tools → tools read/write Supabase → frontend refreshes widgets via WebSocket `shell_refresh`.

## Key APIs

### proto/mcp
- `createProtoMcp({ name })` — auto-discovers tools/, entities/, workflows/, builds MCP server
- `defineTool({ name, schema, handler })` — declarative tool
- `getSupabase()` — service-role Supabase client
- `ok(text)`, `json(obj)`, `err(msg)` — tool response helpers

### proto/web
- `ProtoApp` — zero-config React app (Shell + auth + entity management)
- `defineWidget({ type, title, category, render })` — declarative widget
- `Shell` — lower-level component if ProtoApp is too opinionated
- `useData(fetcher, deps, initial)` — data-fetching hook (replaces useEffect)
- `useAuth()` — Supabase auth hook
- `supabase` — anon-key Supabase client (browser-side)

### proto/shared
- `defineEntity({ name, table, cockpit })` — activatable entity
- `defineWorkflow({ name, entityTable, phases })` — state machine

### core-gateway
- Hono HTTP server with WebSocket chat
- Claude CLI runner with `--resume` session management
- Skill loader with YAML frontmatter + transitive deps
- Mail channel (SMTP + IMAP)
- Scheduler (croner + Supabase `scheduled_tasks`)
- Config via `project.yaml` + `PROTO_APP_ROOT` env var

## Commands

```bash
npm install              # install all workspaces
npm run build            # build all packages + apps
npm test                 # vitest (41 tests)
npm run dev:gateway      # gateway on :8092 (PROTO_APP_ROOT=examples/hermes)
npm run dev:web          # hermes frontend on :3001
npm run dev:minimal-web  # minimal frontend on :3002
```

### MCP smoke test
```bash
cd examples/hermes && npx tsx --eval "
async function main() {
  const { createProtoMcp } = await import('@tleblancureta/proto/mcp')
  const app = await createProtoMcp({ name: 'hermes' })
  console.log('tools:', app.toolCount)
}
main().then(() => process.exit(0))
"
# expected: tools: 92
```

## Deploy

```bash
# 1. Configure
cp examples/my-app/.env.example .env.docker
# Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLAUDE_SETUP_TOKEN

# 2. Get Claude auth token (run locally, once)
claude setup-token

# 3. Apply migrations
cd examples/my-app && supabase db push

# 4. Deploy (2 services: MCP + Gateway)
APP_NAME=my-app docker compose up -d --build

# 5. Build + serve frontend (Vercel/Netlify/nginx)
npm run build -w @proto-app/my-app-web
```

Docker Compose uses `APP_NAME` env var to select which app to deploy. The Dockerfile copies framework packages + the selected app.

## Rules

### No direct useEffect in components
Only inside reusable hooks (`useData`, `useMountEffect`). See checklist in code.

### Domain-agnostic core
Core packages must not import from apps. `grep -r 'orders\|products\|supplier' packages/proto/core-*/src/` should return only generic mentions.

### Tool context via ctx, not args
New tools should read `company_id` from session context, not as an agent parameter (legacy: 89 hermes tools still use args).

### File size limits
No file over ~400 lines. Pending splits: `Admin.tsx` (1286L), `Chat.tsx` (553L).

### Naming conventions
- React components → `PascalCase.tsx`
- shadcn primitives → `kebab-case.tsx`
- Tool files → `kebab-case.ts`
- Skills → `kebab-case/SKILL.md`

### Env vars
- Gateway: all via `packages/core-gateway/src/config.ts`
- Web: all via `packages/proto/core-web/src/lib/config.ts` (`VITE_*`)
- MCP: reads `process.env` directly

## Supabase conventions

- UUIDs everywhere (`gen_random_uuid()`)
- `company_id` on every domain table (multi-tenant)
- RLS enforced: `company_id IN (SELECT get_user_company_ids())`
- Timestamp prefix for migrations: `YYYYMMDDHHMMSS_name.sql`
- Workflow columns: `current_phase`, `current_step`, `on_hold`, `blocked_reason`, `cancelled`

## Framework skills (for Claude Code dev)

Located in `.claude/skills/proto-*/SKILL.md`. Loaded by Claude Code when working in this repo:

| Skill | When to use |
|---|---|
| `proto-tool` | Add/modify MCP tools |
| `proto-widget` | Add/modify shell widgets |
| `proto-entity` | Add/modify activatable entities |
| `proto-workflow` | Add/modify state machine workflows |
| `proto-migration` | SQL migration conventions |
| `proto-scaffold` | Create a new app |
| `proto-debug` | Troubleshooting guide |
| `proto-deploy` | Deployment guide |
