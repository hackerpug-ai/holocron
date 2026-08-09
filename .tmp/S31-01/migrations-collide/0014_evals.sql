-- obs-3: versioned eval score records (immutable longitudinal history)
-- Persists dataset/rubric/scorer/judge model/prompt/baseline versions per score.

CREATE TABLE IF NOT EXISTS "eval_scores" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" text NOT NULL,
  "sample_id" text NOT NULL,
  "scorer_id" text NOT NULL,
  "score" double precision NOT NULL,
  "baseline_threshold" double precision NOT NULL,
  "dataset_version" text NOT NULL,
  "rubric_version" text NOT NULL,
  "scorer_version" text NOT NULL,
  "judge_model_version" text NOT NULL,
  "prompt_version" text NOT NULL,
  "baseline_version" text NOT NULL,
  "tag" text,
  "reason" text,
  "analysis" jsonb,
  "judge_endpoint" text,
  "judge_model_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "eval_scores_score_range"
    CHECK (score >= 0 AND score <= 1),
  CONSTRAINT "eval_scores_baseline_range"
    CHECK (baseline_threshold >= 0 AND baseline_threshold <= 1)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "eval_scores_run_id_idx"
  ON "eval_scores" ("run_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "eval_scores_dataset_version_idx"
  ON "eval_scores" ("dataset_version");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "eval_scores_sample_id_idx"
  ON "eval_scores" ("sample_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "eval_scores_created_at_idx"
  ON "eval_scores" ("created_at");
--> statement-breakpoint

-- Product role operability (read/write scores)
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE eval_scores TO holocron_app';
  END IF;
END
$grants$;
