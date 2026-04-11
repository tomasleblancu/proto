-- ============================================================================
-- Mail threads + messages — inbound and outbound mail tracking
-- ============================================================================
-- Enables the "mail as a chat channel" pattern:
--   1. Outbound: when Hermes sends a mail (task notification), we record
--      the Message-ID so we can thread replies back to the same session.
--   2. Inbound: when a user replies to a Hermes mail, the ingester looks
--      up the In-Reply-To header to find the parent thread, reuses its
--      session_key for Claude CLI continuity, and routes the message
--      to the agent.
--
-- Every thread is scoped to a company via the sender address allowlist
-- (profiles.email / companies.contact_email), so RLS isolates threads
-- cleanly by company.

CREATE TYPE mail_direction AS ENUM ('in', 'out');

-- ---------------------------------------------------------------------------
-- mail_threads: one per conversation (a user's reply chain to a Hermes mail,
-- or a fresh thread started by a task notification).
-- ---------------------------------------------------------------------------
CREATE TABLE mail_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  subject text,                                  -- normalized subject (no "Re: " prefix)
  session_key text NOT NULL,                     -- Claude CLI session key, reused for continuity
  initiated_by mail_direction NOT NULL,          -- 'out' = task notification, 'in' = user-originated
  source_task_id uuid REFERENCES scheduled_tasks ON DELETE SET NULL, -- if the thread started from a task
  external_address text NOT NULL,                -- the user's email address on the other side
  closed boolean NOT NULL DEFAULT false,         -- reserved for future "close thread" UI
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mail_threads_company ON mail_threads(company_id);
CREATE INDEX idx_mail_threads_external ON mail_threads(company_id, external_address);
CREATE INDEX idx_mail_threads_activity ON mail_threads(last_activity_at DESC);

-- ---------------------------------------------------------------------------
-- mail_messages: one row per mail sent or received.
-- ---------------------------------------------------------------------------
CREATE TABLE mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES mail_threads ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES companies NOT NULL,  -- denorm for RLS
  direction mail_direction NOT NULL,
  message_id text NOT NULL,                        -- RFC 5322 Message-ID; unique per thread for dedup
  in_reply_to text,                                -- parent Message-ID (RFC 5322 References/In-Reply-To)
  from_address text NOT NULL,
  to_address text NOT NULL,
  subject text,
  body text,                                       -- text/plain body (stripped of quoted replies)
  raw_headers jsonb,                               -- any extra headers we care about later
  run_id uuid REFERENCES task_runs ON DELETE SET NULL, -- if inbound triggered an agent run, link it
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (message_id)
);

CREATE INDEX idx_mail_messages_thread ON mail_messages(thread_id, created_at);
CREATE INDEX idx_mail_messages_in_reply_to ON mail_messages(in_reply_to) WHERE in_reply_to IS NOT NULL;
CREATE INDEX idx_mail_messages_company ON mail_messages(company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE mail_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own mail_threads" ON mail_threads FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));
CREATE POLICY "Admin manages mail_threads" ON mail_threads FOR ALL
  USING (is_company_admin(company_id));

CREATE POLICY "User reads own mail_messages" ON mail_messages FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));
CREATE POLICY "Admin manages mail_messages" ON mail_messages FOR ALL
  USING (is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- Bump last_activity_at on new messages
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_mail_threads_bump_activity() RETURNS trigger AS $$
BEGIN
  UPDATE mail_threads
  SET last_activity_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mail_messages_bump_thread_activity
  AFTER INSERT ON mail_messages
  FOR EACH ROW EXECUTE FUNCTION trg_mail_threads_bump_activity();
