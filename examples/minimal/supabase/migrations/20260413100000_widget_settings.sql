-- Widget settings: per-company configuration for each widget type.
-- Used by the Admin > Widgets config panel and read at runtime via useWidgetSettings.

create table if not exists widget_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  widget_type text not null,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (company_id, widget_type)
);

create index if not exists idx_widget_settings_company_type
  on widget_settings(company_id, widget_type);
