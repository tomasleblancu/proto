-- ============================================================================
-- Scheduled tasks: cron-driven agent invocations (Proto framework base)
-- ============================================================================
-- The gateway runs a croner tick every minute, scans this table for due rows,
-- and dispatches each one by invoking the Claude CLI with the task's prompt.
-- Results are stored in task_runs.
--
-- Multi-tenant via company_id. RLS is NOT enforced here — add policies in
-- your app migration if your project uses Supabase Auth + RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE task_run_status AS ENUM ('running', 'success', 'error', 'cancelled', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_trigger_source AS ENUM ('scheduled', 'manual', 'retry');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_output_channel AS ENUM ('silent', 'email');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_notify_trigger AS ENUM ('always', 'on_change', 'on_error', 'never');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- scheduled_tasks: definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  cron_expr text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Santiago',
  prompt text NOT NULL,
  enabled_skills text[] NOT NULL DEFAULT '{}',
  session_key text,
  user_id text NOT NULL DEFAULT 'cron',
  enabled boolean NOT NULL DEFAULT true,
  max_runtime_seconds int NOT NULL DEFAULT 300,

  -- Output / notifications
  output_channel task_output_channel NOT NULL DEFAULT 'silent',
  output_recipient text,
  notify_on task_notify_trigger NOT NULL DEFAULT 'always',

  -- Schedule state (computed by the gateway)
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_status task_run_status,
  last_run_id uuid,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_company
  ON scheduled_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due
  ON scheduled_tasks(next_run_at)
  WHERE enabled = true AND next_run_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- task_runs: execution history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES scheduled_tasks ON DELETE CASCADE NOT NULL,
  company_id uuid NOT NULL,
  status task_run_status NOT NULL DEFAULT 'running',
  trigger task_trigger_source NOT NULL DEFAULT 'scheduled',
  triggered_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  response text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}',
  notified_at timestamptz,
  notify_error text
);

CREATE INDEX IF NOT EXISTS idx_task_runs_task
  ON task_runs(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_runs_company
  ON task_runs(company_id, started_at DESC);

-- FK from scheduled_tasks.last_run_id
ALTER TABLE scheduled_tasks
  ADD CONSTRAINT IF NOT EXISTS scheduled_tasks_last_run_fk
  FOREIGN KEY (last_run_id) REFERENCES task_runs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_scheduled_tasks_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_tasks_updated_at ON scheduled_tasks;
CREATE TRIGGER scheduled_tasks_updated_at
  BEFORE UPDATE ON scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION trg_scheduled_tasks_updated_at();
