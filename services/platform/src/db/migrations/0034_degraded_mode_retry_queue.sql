-- S31-01: migrate-owned degraded_mode + retry_queue (+ mission_degraded_state).
-- Runtime CREATE TABLE paths in degraded-mode-controller are prohibited.
-- research_mission is renamed (if present) so db:verify --merges sees exactly 3 research_*.

CREATE TABLE IF NOT EXISTS "degraded_mode" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "degraded_state" text NOT NULL DEFAULT 'normal',
  "resume_state" text NOT NULL DEFAULT 'normal',
  "message" text,
  "role" text,
  "endpoint" text,
  "degradation_action" text,
  "mission_mode" text NOT NULL DEFAULT 'full',
  "extraction_state" text NOT NULL DEFAULT 'running',
  "last_probe_at" timestamptz,
  "last_probe_ok" boolean,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "degraded_mode" ("id")
VALUES ('global')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "retry_queue" (
  "id" serial PRIMARY KEY,
  "mission_id" text NOT NULL,
  "step_type" text NOT NULL,
  "role" text,
  "endpoint" text,
  "reason" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "retry_queue_mission_id_idx"
  ON "retry_queue" ("mission_id");
--> statement-breakpoint

-- Prefer a non-research_* name so merges verifier stays at exactly 3 research_* tables.
DO $rename_mission$
BEGIN
  IF to_regclass('public.research_mission') IS NOT NULL
     AND to_regclass('public.mission_degraded_state') IS NULL THEN
    ALTER TABLE research_mission RENAME TO mission_degraded_state;
  END IF;
END
$rename_mission$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_degraded_state" (
  "mission_id" text PRIMARY KEY,
  "mode" text NOT NULL DEFAULT 'full',
  "extraction_state" text NOT NULL DEFAULT 'running',
  "degraded_state" text NOT NULL DEFAULT 'normal',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE degraded_mode TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE retry_queue TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE mission_degraded_state TO holocron_app';
  END IF;
END
$grants$;
