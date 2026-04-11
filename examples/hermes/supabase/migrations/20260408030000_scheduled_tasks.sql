-- ============================================================================
-- Scheduled tasks: cron-driven agent invocations
-- ============================================================================
-- Architecture: pg_cron ticks every minute → calls gateway /cron/tick via
-- pg_net → gateway scans scheduled_tasks for due rows → dispatches each one
-- by invoking the Claude CLI with the task's prompt, then writes a run row.
--
-- Everything is multi-tenant (company_id scoped) and controllable by the
-- agent itself via MCP tools.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TYPE task_run_status AS ENUM ('running', 'success', 'error', 'cancelled', 'skipped');
CREATE TYPE task_trigger_source AS ENUM ('scheduled', 'manual', 'retry');

-- ---------------------------------------------------------------------------
-- scheduled_tasks: definitions
-- ---------------------------------------------------------------------------
CREATE TABLE scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  name text NOT NULL,                      -- human-readable slug
  description text,
  cron_expr text NOT NULL,                 -- standard 5-field cron
  timezone text NOT NULL DEFAULT 'America/Santiago',
  prompt text NOT NULL,                    -- instruction sent to the agent
  enabled_skills text[] NOT NULL DEFAULT '{}',
  session_key text,                        -- gateway session slug; NULL = one-shot session per run
  user_id text NOT NULL DEFAULT 'cron',    -- actor used for the chat request
  enabled boolean NOT NULL DEFAULT true,
  max_runtime_seconds int NOT NULL DEFAULT 300,

  -- Schedule state (computed + cached by the gateway)
  next_run_at timestamptz,                 -- set on insert/update via cron-parser
  last_run_at timestamptz,
  last_run_status task_run_status,
  last_run_id uuid,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,                         -- optional FK to profiles

  UNIQUE (company_id, name)
);

CREATE INDEX idx_scheduled_tasks_company ON scheduled_tasks(company_id);
CREATE INDEX idx_scheduled_tasks_due
  ON scheduled_tasks(next_run_at)
  WHERE enabled = true AND next_run_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- task_runs: history (one row per execution)
-- ---------------------------------------------------------------------------
CREATE TABLE task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES scheduled_tasks ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES companies NOT NULL,   -- denorm for RLS
  status task_run_status NOT NULL DEFAULT 'running',
  trigger task_trigger_source NOT NULL DEFAULT 'scheduled',
  triggered_by text,                                -- user_id or 'cron'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  response text,                                    -- agent final text
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'              -- cost, session_id, etc.
);

CREATE INDEX idx_task_runs_task ON task_runs(task_id, started_at DESC);
CREATE INDEX idx_task_runs_company ON task_runs(company_id, started_at DESC);

-- FK from scheduled_tasks.last_run_id now that task_runs exists
ALTER TABLE scheduled_tasks
  ADD CONSTRAINT scheduled_tasks_last_run_fk
  FOREIGN KEY (last_run_id) REFERENCES task_runs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own scheduled_tasks" ON scheduled_tasks FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));
CREATE POLICY "Admin manages scheduled_tasks" ON scheduled_tasks FOR ALL
  USING (is_company_admin(company_id));

CREATE POLICY "User reads own task_runs" ON task_runs FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));
CREATE POLICY "Admin manages task_runs" ON task_runs FOR ALL
  USING (is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_scheduled_tasks_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_tasks_updated_at
  BEFORE UPDATE ON scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION trg_scheduled_tasks_updated_at();

-- ---------------------------------------------------------------------------
-- pg_cron → gateway /cron/tick every minute
-- ---------------------------------------------------------------------------
-- The gateway URL + secret are set via Supabase project secrets
-- (supabase secrets set GATEWAY_URL=... GATEWAY_INTERNAL_SECRET=...)
-- and read from vault. For now we read from custom GUCs set at the DB level:
--   ALTER DATABASE postgres SET hermes.gateway_url = 'https://...';
--   ALTER DATABASE postgres SET hermes.gateway_secret = '...';
-- If the GUCs are not set, the job is a no-op.

CREATE OR REPLACE FUNCTION hermes_cron_tick() RETURNS void AS $$
DECLARE
  gw_url text;
  gw_secret text;
BEGIN
  gw_url := current_setting('hermes.gateway_url', true);
  gw_secret := current_setting('hermes.gateway_secret', true);

  IF gw_url IS NULL OR gw_url = '' THEN
    RAISE NOTICE 'hermes.gateway_url not configured, skipping tick';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := gw_url || '/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', COALESCE(gw_secret, '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule: every minute
SELECT cron.schedule('hermes-cron-tick', '* * * * *', $$SELECT hermes_cron_tick()$$);
