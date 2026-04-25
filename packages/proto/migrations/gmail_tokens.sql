-- ============================================================================
-- Gmail OAuth tokens per user (Proto framework base)
-- ============================================================================
-- Stores per-user Gmail OAuth credentials so the agent can read/send mail
-- on behalf of the connected user. Wired up by:
--   - GET  /gmail/auth      (gateway)  → consent URL
--   - POST /gmail/callback  (gateway)  → exchanges code, upserts row here
--   - MCP tools gmail_status, read_emails, send_email, search_emails
--
-- One row per user. Refresh tokens are auto-rotated by the MCP client.

CREATE TABLE gmail_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expiry_date bigint,
  email text,
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manages own gmail" ON gmail_tokens FOR ALL
  USING (user_id = auth.uid());
