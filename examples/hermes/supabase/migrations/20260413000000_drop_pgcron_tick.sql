-- Remove pg_cron tick — the gateway now ticks internally via croner.
-- pg_cron + pg_net extensions are left in place (other uses may exist).
SELECT cron.unschedule('hermes-cron-tick');
DROP FUNCTION IF EXISTS hermes_cron_tick();
