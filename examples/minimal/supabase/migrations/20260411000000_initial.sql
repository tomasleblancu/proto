-- Items table
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_company on items(company_id);

-- Tasks table (workflow entity)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  item_id uuid references items(id),
  title text not null,
  current_phase text not null default 'todo',
  current_step text not null default 'created',
  on_hold boolean not null default false,
  blocked_reason text,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_company on tasks(company_id);
create index if not exists idx_tasks_phase on tasks(current_phase);

-- Task transitions (workflow history)
create table if not exists task_transitions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references tasks(id),
  from_phase text,
  from_step text,
  to_phase text not null,
  to_step text not null,
  triggered_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_transitions_item on task_transitions(item_id);
