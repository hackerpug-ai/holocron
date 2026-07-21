-- Sprint 22 / pipes-1: tags + denormalized research metrics for shared evidence-research template.

CREATE TABLE IF NOT EXISTS public.mission_run_tags (
  run_id uuid NOT NULL REFERENCES public.mission_runs (id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, tag)
);

CREATE INDEX IF NOT EXISTS mission_run_tags_tag_idx
  ON public.mission_run_tags (tag);

ALTER TABLE public.mission_runs
  ADD COLUMN IF NOT EXISTS components_covered integer,
  ADD COLUMN IF NOT EXISTS independent_source_count integer,
  ADD COLUMN IF NOT EXISTS admitted_evidence_ids jsonb,
  ADD COLUMN IF NOT EXISTS executor_version text;

DO $mission_runs_components_covered_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mission_runs_components_covered_nonneg'
  ) THEN
    ALTER TABLE public.mission_runs
      ADD CONSTRAINT mission_runs_components_covered_nonneg
      CHECK (components_covered IS NULL OR components_covered >= 0);
  END IF;
END
$mission_runs_components_covered_check$;

DO $mission_runs_independent_source_count_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mission_runs_independent_source_count_nonneg'
  ) THEN
    ALTER TABLE public.mission_runs
      ADD CONSTRAINT mission_runs_independent_source_count_nonneg
      CHECK (independent_source_count IS NULL OR independent_source_count >= 0);
  END IF;
END
$mission_runs_independent_source_count_check$;
