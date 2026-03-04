-- Schedule task-timeout-worker to run every minute via pg_cron
-- This ensures tasks that timeout are properly marked as failed
--
-- IMPORTANT: This migration creates a cron job that calls the task-timeout-worker function.
-- You must set the CRON_SECRET environment variable before this will work:
--   supabase secrets set CRON_SECRET=$(openssl rand -base64 32)

-- Create the pg_cron extension if it doesn't exist
-- Note: The cron schema may already exist, so we use IF NOT EXISTS
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Now schedule the job
-- Note: The CRON_SECRET must be set in your Edge Function environment for the request to succeed
SELECT cron.schedule(
  'task-timeout-worker-every-minute',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://kpturmpneieyzbzgtosl.functions.supabase.co/task-timeout-worker',
      headers := '{"Content-Type": "application/json", "CRON_SECRET": "' || current_setting('app.settings.cron_secret', true) || '"}'::jsonb,
      body := '{"timeout_minutes": 60}'::jsonb,
      timeout_milliseconds := 10000
    )
  $$
);

-- Verify the cron job was scheduled
SELECT * FROM cron.job WHERE jobname = 'task-timeout-worker-every-minute';
