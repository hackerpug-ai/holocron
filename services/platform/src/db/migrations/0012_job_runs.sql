-- queue-3: job_runs — observable side-effect ledger for the 16 migrated crons.
-- Each jobs:run-all execution writes one row per job (the former Convex
-- side-effect), linked to its durable outbox/effect trail (queue-2).
CREATE TABLE IF NOT EXISTS "job_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "job_name" text NOT NULL,
  "run_key" text NOT NULL,
  "category" text NOT NULL,
  "lane" text NOT NULL,
  "effect_id" uuid,
  "fence_token" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "job_runs_lane_check" CHECK (lane IN ('interactive', 'background')),
  CONSTRAINT "job_runs_category_check" CHECK (
    category IN ('janitor', 'workflow', 'consumer', 'backfill', 'digest')
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "job_runs_run_key_uidx" ON "job_runs" ("run_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "job_runs_job_name_idx" ON "job_runs" ("job_name");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "job_runs_created_at_idx" ON "job_runs" ("created_at");

--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE job_runs TO holocron_app';
  END IF;
END
$grants$;
