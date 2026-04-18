-- ============================================================================
-- Mail channels: bidirectional email ↔ Claude bridge (Proto framework base)
-- ============================================================================
-- The gateway polls IMAP (when MAIL_IMAP_HOST is set) and stores every
-- inbound/outbound email exchange here. Threads map to Claude CLI session
-- keys so replies resume the same conversation context automatically.
--
-- Multi-tenant via company_id. RLS enforced via get_user_company_ids().

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE mail_direction AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- mail_threads: one row per email conversation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mail_threads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL,
  subject          text,                     -- normalized (no "Re:" prefix)
  session_key      text        NOT NULL,     -- Claude CLI --resume key
  initiated_by     mail_direction NOT NULL,  -- 'out' = task notif, 'in' = user-started
  source_task_id   uuid,                     -- scheduled_tasks row if task-initiated
  external_address text        NOT NULL,     -- counterparty email
  closed           boolean     NOT NULL DEFAULT false,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_threads_company
  ON mail_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_mail_threads_external
  ON mail_threads(company_id, external_address);
CREATE INDEX IF NOT EXISTS idx_mail_threads_activity
  ON mail_threads(last_activity_at DESC);

-- RLS
ALTER TABLE mail_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_threads_company ON mail_threads;
CREATE POLICY mail_threads_company ON mail_threads
  USING (company_id IN (SELECT get_user_company_ids()));

-- ---------------------------------------------------------------------------
-- mail_messages: one row per individual email
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mail_messages (
  id           uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid           NOT NULL REFERENCES mail_threads ON DELETE CASCADE,
  company_id   uuid           NOT NULL,   -- denorm for RLS
  direction    mail_direction NOT NULL,
  message_id   text           NOT NULL,   -- RFC 5322 Message-ID (dedup key)
  in_reply_to  text,
  from_address text           NOT NULL,
  to_address   text           NOT NULL,
  subject      text,
  body         text,                       -- plain text, quoted replies stripped
  raw_headers  jsonb,
  run_id       uuid,                       -- task_runs row if triggered an agent run
  created_at   timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_thread
  ON mail_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mail_messages_in_reply_to
  ON mail_messages(in_reply_to) WHERE in_reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mail_messages_company
  ON mail_messages(company_id, created_at DESC);

-- RLS
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_messages_company ON mail_messages;
CREATE POLICY mail_messages_company ON mail_messages
  USING (company_id IN (SELECT get_user_company_ids()));
