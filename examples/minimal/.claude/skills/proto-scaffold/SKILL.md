---
name: proto-scaffold
description: Crear una nueva app proto con create-proto-app. Activa cuando el usuario quiere empezar un proyecto nuevo (ej: "creá una app nueva", "quiero empezar de cero", "scaffold un proyecto").
type: framework
---

# proto-scaffold — crear una app nueva

`create-proto-app` genera un proyecto nuevo a partir del template `examples/minimal/`. El resultado es una app funcional con un entity, un workflow, tools, y widgets listos para customizar.

## Cuándo activa este skill

- "creá una app nueva"
- "quiero empezar un proyecto desde cero"
- "scaffold un proyecto proto"
- "cómo arranco una app"

## Crear el proyecto

```bash
# Desde la raíz del monorepo proto
node packages/create-proto-app/dist/cli.js <nombre>

# O si está publicado en npm
npx create-proto-app <nombre>
```

Esto genera:

```
<nombre>/
├── app/
│   ├── entities/          1 entity (item) con cockpit
│   │   ├── item.ts
��   │   └── index.ts
│   ├── tools/             3 tools (create, list, update)
│   │   ├── items.ts
│   │   └── index.ts
��   ├── workflows/         1 workflow (task) con 3 fases
│   │   └── task.ts
│   ├── prompts/           System prompt
│   │   └── default.md
│   ├── skills/            Vacío (para domain skills)
│   ├── mcp.ts             Stdio entry point
│   └── mcp-http.ts        HTTP entry point
├── web/
│   ├── src/
│   │   ├── App.tsx         Shell + auth + entity routing
│   │   ���── main.tsx
│   │   ├── index.css       Tailwind + CSS variables
│   │   └── widgets/
│   ���       ├── ItemsWidget.tsx
│   │       ├── ItemDetailWidget.tsx
│   ��       ├── registry.tsx
│   │       ��── catalog.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── postcss.config.js
├── supabase/
│   └── migrations/
│       └── 20260411000000_initial.sql
├── project.yaml
└── package.json
```

## Primeros 5 pasos de customización

### 1. Renombrar el dominio

El template viene con `items` y `tasks`. Renombralos a tu dominio:

- `app/entities/item.ts` → `app/entities/<tu-entidad>.ts`
- `app/tools/items.ts` → `app/tools/<tu-dominio>.ts`
- `app/workflows/task.ts` → `app/workflows/<tu-workflow>.ts`
- Actualizar `entities/index.ts` y `tools/index.ts`
- Renombrar tabla en la migración SQL

### 2. Agregar campos al schema

Editá la migración SQL para agregar los campos de tu dominio:

```sql
create table if not exists <tu_tabla> (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- tus campos aquí
  name text not null,
  status text default 'active',
  amount numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3. Agregar tools para tu dominio

Usá el skill `proto-tool` para agregar tools nuevos. Cada tool es un `defineTool()` con schema Zod + handler async.

### 4. Crear widgets

Usá el skill `proto-widget` para agregar widgets al Shell. Cada widget es un `defineWidget()` con render function que recibe `ShellContext`.

### 5. Personalizar el workflow

Editá `app/workflows/<nombre>.ts` para definir tus fases y steps:

```ts
export default defineWorkflow({
  name: '<nombre>',
  entityTable: '<tabla>',
  transitionsTable: '<tabla>_transitions',
  phases: [
    { name: 'draft', label: 'Borrador', steps: ['created'] },
    { name: 'active', label: 'Activo', steps: ['processing', 'review'] },
    { name: 'done', label: 'Terminado', steps: ['completed'] },
  ],
})
```

## Setup local

```bash
cd <nombre>
npm install

# Configurar env
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# Aplicar migración
cd supabase && supabase db push && cd ..

# Desarrollo
npm run mcp        # MCP en modo stdio (para Claude Code CLI)
npm run mcp:http   # MCP en modo HTTP (para Docker)
```

El web frontend se corre desde la raíz del monorepo:
```bash
npm run dev:minimal-web   # → http://localhost:3002
```

## Siguiente nivel

Una vez que tenés lo básico andando:

- **Más entities**: `proto-entity` skill
- **Más tools**: `proto-tool` skill
- **Widgets cockpit**: `proto-widget` skill
- **Migraciones**: `proto-migration` skill
- **Deploy**: `proto-deploy` skill
- **Debugging**: `proto-debug` skill
