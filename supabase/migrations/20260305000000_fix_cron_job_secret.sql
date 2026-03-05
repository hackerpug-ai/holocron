-- Fix pg_cron job to use CRON_SECRET instead of jwt_secret
-- This migration updates the existing cron job to use the correct secret configuration
--
-- Root Cause: Production cron job is using app.settings.jwt_secret which doesn't exist,
-- causing "invalid input syntax for type json" errors
--
-- Fix: Unschedule old job and reschedule with CRON_SECRET

-- Unschedule the existing job (if it exists)
SELECT cron.unschedule('task-timeout-worker-every-minute');

-- Reschedule with correct secret configuration
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

-- Verify the cron job was rescheduled correctly
SELECT * FROM cron.job WHERE jobname = 'task-timeout-worker-every-minute';
