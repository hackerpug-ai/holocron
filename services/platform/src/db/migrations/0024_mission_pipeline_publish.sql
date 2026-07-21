-- Sprint 22 / pipes-3: document publish provenance + sub-workflow tracking.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_run_id uuid,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_idempotency_key text;

-- Unique when set; Postgres UNIQUE allows multiple NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS documents_source_run_id_uidx
  ON public.documents (source_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS documents_publish_idempotency_key_uidx
  ON public.documents (publish_idempotency_key);

ALTER TABLE public.mission_runs
  ADD COLUMN IF NOT EXISTS subworkflow_calls jsonb,
  ADD COLUMN IF NOT EXISTS document_id text;

-- Operator-facing alias used by AC verify strings (output->>'…').
DO $mission_runs_output_alias$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mission_runs'
      AND column_name = 'output'
  ) THEN
    ALTER TABLE public.mission_runs
      ADD COLUMN output jsonb GENERATED ALWAYS AS (typed_output_json) STORED;
  END IF;
END
$mission_runs_output_alias$;
