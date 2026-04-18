---
name: proto-migration
description: Crear o modificar migraciones SQL de Supabase. Activa cuando el usuario pide crear tablas, índices, RLS policies, triggers, o funciones SQL (ej: "creá una tabla para X", "agregá RLS a Y", "necesito un trigger").
type: framework
---

# proto-migration — SQL migration conventions

Las migraciones SQL viven en `<app>/supabase/migrations/` y se aplican con `supabase db push`. Cada migración es un archivo `.sql` con prefix de timestamp.

## Cuándo activa este skill

- "creá una tabla para clientes"
- "agregá una migración para el nuevo campo"
- "necesito RLS en la tabla X"
- "creá un trigger que Y"
- "cómo agrego un índice"

## Naming convention

**Siempre timestamp prefix**: `YYYYMMDDHHMMSS_nombre.sql`

```
supabase/migrations/
├── 20260407000000_initial.sql
├── 20260408120000_add_contacts.sql
└── 20260411000000_initial.sql   ← minimal example
```

Nunca usar numeric prefix (001_, 002_) — eso es legacy del Hermes original.

## Template: tabla nueva

```sql
-- <table_name> table
create table if not exists <table_name> (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- domain fields here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_<table_name>_company on <table_name>(company_id);
```

Convenciones:
- `id uuid primary key default gen_random_uuid()` — siempre UUID, nunca serial
- `company_id uuid not null` — multi-tenant, toda tabla de dominio lo tiene
- `created_at` / `updated_at` — timestamptz, not null, default now()
- Índice en `company_id` siempre

## RLS (Row Level Security)

Multi-tenant se enforce via RLS. Patrón estándar:

```sql
alter table <table_name> enable row level security;

create policy "<table_name>_company_access"
  on <table_name>
  for all
  using (company_id in (select get_user_company_ids()));
```

Helper functions (ya existen en Hermes, deben crearse en apps nuevas):

```sql
-- Returns company IDs the authenticated user belongs to
create or replace function get_user_company_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select company_id from company_members
  where user_id = auth.uid()
$$;

-- Checks if user is admin of a specific company
create or replace function is_company_admin(cid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from company_members
    where user_id = auth.uid()
      and company_id = cid
      and role = 'admin'
  )
$$;
```

## Workflow tables

Si la app usa `defineWorkflow`, necesitás estas tablas (ver `examples/minimal` para referencia):

1. **Entity table** — la tabla con items que avanzan por el workflow:
   ```sql
   current_phase text not null default '<first_phase>',
   current_step text not null default '<first_step>',
   on_hold boolean not null default false,
   blocked_reason text,
   cancelled boolean not null default false,
   ```

2. **Transitions table** — historial de cambios de estado:
   ```sql
   create table if not exists <transitions_table> (
     id uuid primary key default gen_random_uuid(),
     item_id uuid not null references <entity_table>(id),
     from_phase text,
     from_step text,
     to_phase text not null,
     to_step text not null,
     triggered_by text,
     notes text,
     created_at timestamptz not null default now()
   );
   ```

Los nombres de columnas (`current_phase`, `current_step`, etc.) son configurables via `columns` en `defineWorkflow`, pero los defaults matchean este schema.

## Triggers útiles

Auto-update `updated_at`:
```sql
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger <table_name>_updated_at
  before update on <table_name>
  for each row execute function update_updated_at();
```

## pg_cron (scheduling)

Si la app necesita scheduled tasks, Hermes usa `pg_cron` + `pg_net`:

```sql
select cron.schedule(
  'app-cron-tick',
  '* * * * *',
  $$select net.http_post(
    url := 'http://gateway:8092/cron/tick',
    headers := jsonb_build_object('x-internal-secret', current_setting('app.internal_secret')),
    body := '{}'::jsonb
  )$$
);
```

## Checklist antes de crear una migración

1. ¿El timestamp es único y mayor al último? `ls supabase/migrations/ | tail -1`
2. ¿La tabla tiene `company_id`? (si es multi-tenant)
3. ¿RLS está activado? (si es accesible via API)
4. ¿Hay índice en `company_id`?
5. ¿Las foreign keys referencian la tabla correcta?
6. ¿`if not exists` en create table/index? (idempotencia)

## Cómo aplicar

```bash
cd <app-dir>
supabase db push       # aplica migraciones pendientes
supabase db reset      # reset completo (dev only)
```
