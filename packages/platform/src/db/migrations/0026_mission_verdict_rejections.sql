-- Rejected human-gate requests are durable idempotency results, separate from
-- mission_verdicts and mission_events so an enforcement failure creates neither.
CREATE TABLE IF NOT EXISTS public.mission_verdict_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.mission_runs (id) ON DELETE CASCADE,
  request_key text NOT NULL,
  payload_json jsonb NOT NULL,
  error_code text NOT NULL,
  error_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS mission_verdict_rejections_run_request_key_uidx
  ON public.mission_verdict_rejections (run_id, request_key);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS mission_verdict_rejections_run_idx
  ON public.mission_verdict_rejections (run_id);
--> statement-breakpoint

DO $mission_verdict_rejections_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    GRANT SELECT, INSERT ON TABLE public.mission_verdict_rejections TO holocron_app;
  END IF;
END
$mission_verdict_rejections_grants$;
