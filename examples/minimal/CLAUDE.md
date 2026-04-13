# Proto App

AI-agent-driven app built with [Proto](https://github.com/tomasleblancu/proto). The developer writes **SQL** (data models), **tools** (agent capabilities), and **widgets** (UI). The framework provides chat, auth, dashboard, admin panel, WebSocket, and MCP server.

## Stack

- **Runtime**: Node.js 22, TypeScript, tsx
- **Backend**: Hono gateway + MCP server + Claude Code CLI
- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui, react-grid-layout
- **Database**: Supabase (Postgres + Auth + RLS)
- **Package**: `@tleblancureta/proto` — one package, four subpath exports

## Project structure

```
app/                        Backend (MCP server + gateway)
  tools/*.ts                Agent tools — auto-discovered
  entities/*.ts             Activatable entities — auto-discovered
  workflows/*.ts            State machines — auto-discovered
  skills/*/SKILL.md         Agent instructions — auto-discovered
  prompts/*.md              System prompts (ref'd in project.yaml)
  mcp.ts                    MCP entry (stdio) — framework file
  mcp-http.ts               MCP entry (HTTP) — framework file
  gateway.ts                Gateway entry — framework file

web/                        Frontend (React + Vite)
  src/
    App.tsx                 Auto-discovers widgets, renders ProtoApp
    main.tsx                React root
    index.css               Tailwind + CSS design tokens
    widgets/*.tsx            Dashboard widgets — auto-discovered

supabase/
  migrations/*.sql          Database schema (timestamp-prefixed)

project.yaml                Gateway config (MCP servers, prompts, skills)
.env.example                All required env vars
```

## What you write (3 file types)

### 1. SQL migrations

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_name.sql
create table things (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  created_at timestamptz default now()
);
```

### 2. Tools (what the agent can do)

```ts
// app/tools/things.ts
import { defineTool, getSupabase, err, json } from '@tleblancureta/proto/mcp'
import { z } from 'zod'

export default [
  defineTool({
    name: 'create_thing',
    description: 'Create a new thing.',
    schema: { name: z.string() },
    handler: async (args, ctx) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('things')
        .insert({ ...args, company_id: ctx.company_id })
        .select().single()
      return error ? err(error.message) : json(data)
    },
  }),
]
```

### 3. Widgets (what the user sees)

```tsx
// web/src/widgets/ThingsWidget.tsx
import { defineWidget, useData, supabase } from '@tleblancureta/proto/web'
import type { ShellContext } from '@tleblancureta/proto/web'

export default defineWidget({
  type: 'things',
  title: 'Things',
  icon: '📋',
  category: 'general',
  render: (_, ctx) => <Things {...ctx} />,
})

function Things({ companyId, refreshKey }: ShellContext) {
  const { data } = useData(async () => {
    const { data } = await supabase.from('things').select('*').eq('company_id', companyId)
    return data || []
  }, [companyId, refreshKey], [])

  return <div className="p-3">{data.map(t => <p key={t.id}>{t.name}</p>)}</div>
}
```

All three are auto-discovered. Drop files, they load.

## Imports

```ts
// Backend (tools, entities, workflows)
import { defineTool, getSupabase, err, json } from '@tleblancureta/proto/mcp'
import { defineEntity, defineWorkflow } from '@tleblancureta/proto/shared'

// Frontend (widgets, hooks, UI)
import { defineWidget, useData, supabase, ProtoApp } from '@tleblancureta/proto/web'
import type { ShellContext } from '@tleblancureta/proto/web'

// shadcn/ui components (pre-installed, ready to use)
import { Button } from '@tleblancureta/proto/web'
import { Card, CardContent, CardHeader } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import { Separator } from '@tleblancureta/proto/web'
import { Textarea } from '@tleblancureta/proto/web'
import { Avatar, AvatarFallback } from '@tleblancureta/proto/web'
import { ScrollArea } from '@tleblancureta/proto/web'
```

## Built-in features

- **Dashboard** (`/`): Grid of widgets with drag-and-drop layout, persisted to localStorage
- **Chat**: WebSocket chat with Claude, accessible from the Shell sidebar
- **Admin panel** (`/admin`): Built-in at `/admin` — shows users, companies, widgets, system info
- **Auth**: Login/signup/reset via Supabase Auth, wrapped in `useAuth()` hook
- **Entity cockpit**: Click an entity to enter focused view with entity-specific widgets
- **Dark mode**: Toggle via `useTheme()` hook
- **shadcn/ui**: All components available from `@tleblancureta/proto/web` — no extra install

## Commands

```bash
npm run dev              # gateway + mcp + web (all at once)
npm run dev:web          # frontend only (port 3002)
npm run mcp              # MCP server (stdio, for Claude CLI)
npm run mcp:http         # MCP server (HTTP, for Docker)
npm run gateway          # Hono gateway (port 8092)
```

## Key APIs

### Tool handler: `(args, ctx) => ToolResult`
- `args` — validated from Zod schema
- `ctx.company_id` — session company (from env vars, injected by framework)
- `ctx.user_id` — session user
- `getSupabase()` — service-role Supabase client
- `ok(text)`, `json(obj)`, `err(msg)` — response helpers

### Widget render: `(def, ctx) => JSX`
- `ctx.companyId` — current company
- `ctx.refreshKey` — changes when agent modifies data (re-fetch signal)
- `ctx.activeEntity` — current entity in cockpit mode
- `ctx.onActivateEntity({ type, id, label })` — enter cockpit mode

### Hooks
- `useData(fetcher, deps, initial)` — data fetching (replaces useEffect)
- `useAuth()` — user, role, companies, profile
- `useTheme()` — dark/light toggle

## Rules

- **No direct useEffect** in components — use `useData` or `useMountEffect`
- **company_id via ctx**, not args — tools read `ctx.company_id` from the handler's second parameter
- **No file over ~400 lines** — split into smaller modules
- **Auto-discovery** — drop files in the right directory, they load. No manual registration.
- **UUIDs everywhere** — `gen_random_uuid()` for all primary keys
- **Multi-tenant** — every domain table has `company_id`

## Supabase conventions

- Timestamp prefix for migrations: `YYYYMMDDHHMMSS_name.sql`
- RLS enforced: `company_id IN (SELECT get_user_company_ids())`
- Workflow columns: `current_phase`, `current_step`, `on_hold`, `blocked_reason`, `cancelled`

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
