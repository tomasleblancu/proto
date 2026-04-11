-- Output channels for scheduled tasks: email delivery of agent responses.
-- A task run that completes with a meaningful response can be mailed to a
-- recipient. Defaults to 'silent' (response stays in task_runs only).

CREATE TYPE task_output_channel AS ENUM ('silent', 'email');
CREATE TYPE task_notify_trigger AS ENUM ('always', 'on_change', 'on_error', 'never');

ALTER TABLE scheduled_tasks
  ADD COLUMN output_channel task_output_channel NOT NULL DEFAULT 'silent',
  ADD COLUMN output_recipient text,                                    -- email address (for channel='email')
  ADD COLUMN notify_on task_notify_trigger NOT NULL DEFAULT 'always',  -- when to actually send
  ADD COLUMN notify_owner_user_id uuid REFERENCES auth.users;          -- whose gmail_tokens to use for sending

-- For task_runs: track delivery attempts so we don't double-send.
ALTER TABLE task_runs
  ADD COLUMN notified_at timestamptz,
  ADD COLUMN notify_error text;
