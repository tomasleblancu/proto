-- Notifications now go through the Hermes system mailbox (single set of SMTP
-- credentials in env), not through the user's personal gmail_tokens.
-- The notify_owner_user_id column is no longer used.

ALTER TABLE scheduled_tasks DROP COLUMN IF EXISTS notify_owner_user_id;
