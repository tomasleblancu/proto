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
cp .env.example .env
```

### Variables de entorno que el usuario debe configurar

Después de copiar `.env.example`, el usuario necesita completar estas variables. **Indicale al usuario exactamente qué tiene que hacer:**

#### 1. Crear un proyecto en Supabase (si no tiene uno)

Ir a [supabase.com](https://supabase.com) → New Project. Una vez creado, ir a **Settings → API** y copiar 3 valores:

| Variable en `.env` | Qué copiar desde Supabase |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (secret, solo backend) |
| `SUPABASE_ANON_KEY` | `anon` key (pública, para frontend) |

Estas mismas se duplican para el frontend de Vite:

| Variable frontend | Mismo valor que |
|---|---|
| `VITE_SUPABASE_URL` | `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY` |

#### 2. Generar el token de Claude

```bash
claude setup-token
```

Copiar el token resultante en `CLAUDE_SETUP_TOKEN`.

#### 3. Generar un secret interno

```bash
openssl rand -hex 32
```

Pegar el resultado en **ambas** variables:
- `INTERNAL_API_SECRET`
- `VITE_INTERNAL_SECRET`

Este secret autentica la comunicación entre el frontend y el gateway.

#### 4. Variables que se pueden dejar con el default

| Variable | Default | Cuándo cambiar |
|---|---|---|
| `PORT` | `8092` | Si el puerto está ocupado |
| `MCP_PORT` | `8093` | Si el puerto está ocupado |
| `VITE_GATEWAY_URL` | `http://localhost:8092` | Solo en producción |

#### 5. Variables opcionales (mail)

Solo si la app necesita enviar/recibir email:
- `MAIL_SMTP_HOST`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_SMTP_FROM`

### Resumen: lo mínimo que se necesita

| Recurso | Valores | Cómo obtener |
|---|---|---|
| Proyecto Supabase | 3 (URL + service key + anon key) | [supabase.com](https://supabase.com) → Settings → API |
| Claude token | 1 | `claude setup-token` |
| Secret random | 1 | `openssl rand -hex 32` |

**Total: 5 valores reales.** El resto son duplicados o defaults.

### Aplicar migraciones y arrancar

```bash
# Aplicar migración a Supabase
cd supabase && supabase db push && cd ..

# Desarrollo
npm run dev          # gateway + mcp + web (todo junto)
npm run mcp          # MCP en modo stdio (para Claude Code CLI)
npm run mcp:http     # MCP en modo HTTP (para Docker)
```

El web frontend también se puede correr por separado:
```bash
npm run dev:web      # → http://localhost:3002
```

## Siguiente nivel

Una vez que tenés lo básico andando:

- **Más entities**: `proto-entity` skill
- **Más tools**: `proto-tool` skill
- **Widgets cockpit**: `proto-widget` skill
- **Widget config**: `configPanel` + `useWidgetSettings` — ver sección "Widget con configuración" en `proto-widget` skill
- **Migraciones**: `proto-migration` skill
- **Deploy**: `proto-deploy` skill
- **Debugging**: `proto-debug` skill
