-- mission-4: owner-scope auth + HTTP control idempotency

ALTER TABLE public.mission_runs
  ADD COLUMN IF NOT EXISTS owner_scope text;
--> statement-breakpoint
UPDATE public.mission_runs
SET owner_scope = 'runtime'
WHERE owner_scope IS NULL;
--> statement-breakpoint
ALTER TABLE public.mission_runs
  ALTER COLUMN owner_scope SET DEFAULT 'runtime';
--> statement-breakpoint
ALTER TABLE public.mission_runs
  ALTER COLUMN owner_scope SET NOT NULL;
--> statement-breakpoint
DO $mission_runs_owner_scope_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mission_runs_owner_scope_check'
      AND conrelid = 'public.mission_runs'::regclass
  ) THEN
    EXECUTE '
      ALTER TABLE public.mission_runs
      ADD CONSTRAINT mission_runs_owner_scope_check
      CHECK (owner_scope IN (''rn'', ''runtime''))
    ';
  END IF;
END
$mission_runs_owner_scope_check$;
--> statement-breakpoint

UPDATE public.mission_steering
SET request_key = 'steer-migrated:' || id::text
WHERE request_key IS NULL;
--> statement-breakpoint
ALTER TABLE public.mission_steering
  ALTER COLUMN request_key SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mission_steering_run_request_key_uidx
  ON public.mission_steering USING btree (run_id, request_key);
--> statement-breakpoint

ALTER TABLE public.mission_verdicts
  ADD COLUMN IF NOT EXISTS request_key text;
--> statement-breakpoint
UPDATE public.mission_verdicts
SET request_key = 'verdict-migrated:' || id::text
WHERE request_key IS NULL;
--> statement-breakpoint
ALTER TABLE public.mission_verdicts
  ALTER COLUMN request_key SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mission_verdicts_run_request_key_uidx
  ON public.mission_verdicts USING btree (run_id, request_key);
