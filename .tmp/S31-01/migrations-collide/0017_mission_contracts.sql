-- Sprint 15 mission-1 — versioned mission contracts, closed DSL registry, durable mission tables

CREATE TABLE IF NOT EXISTS "mission_templates" (
  "template_key" text PRIMARY KEY NOT NULL,
  "latest_version" text NOT NULL,
  "latest_definition_hash" text NOT NULL,
  "description" text NOT NULL,
  "latest_registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_templates_latest_registered_at_idx"
  ON "mission_templates" USING btree ("latest_registered_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_template_versions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "template_key" text NOT NULL REFERENCES "mission_templates"("template_key") ON DELETE CASCADE,
  "version" text NOT NULL,
  "dsl_version" text NOT NULL,
  "description" text NOT NULL,
  "definition_hash" text NOT NULL,
  "definition_json" jsonb NOT NULL,
  "compiled_plan_json" jsonb NOT NULL,
  "compiler_version" text NOT NULL,
  "registry_snapshot_hash" text NOT NULL,
  "registry_snapshot_json" jsonb NOT NULL,
  "output_schema_ref" text NOT NULL,
  "output_schema_version" integer NOT NULL,
  "executor_ref" text NOT NULL,
  "schema_ref" text NOT NULL,
  "schema_version" integer NOT NULL,
  "budget_policy_json" jsonb NOT NULL,
  "no_cloud_fallback" boolean DEFAULT true NOT NULL,
  "fleet_manifest_version" text NOT NULL,
  "fleet_manifest_path" text NOT NULL,
  "fleet_manifest_hash" text NOT NULL,
  "fleet_manifest_json" jsonb NOT NULL,
  "role_resolution_json" jsonb NOT NULL,
  "model_revisions_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_template_versions_output_schema_version_check"
    CHECK ("output_schema_version" > 0),
  CONSTRAINT "mission_template_versions_schema_version_check"
    CHECK ("schema_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_template_versions_template_version_uidx"
  ON "mission_template_versions" USING btree ("template_key", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_template_versions_template_key_idx"
  ON "mission_template_versions" USING btree ("template_key");
--> statement-breakpoint
ALTER TABLE "mission_template_versions"
  ADD COLUMN IF NOT EXISTS "dsl_version" text;
--> statement-breakpoint
UPDATE "mission_template_versions"
SET "dsl_version" = 'mission_template_v1'
WHERE "dsl_version" IS NULL;
--> statement-breakpoint
ALTER TABLE "mission_template_versions"
  ALTER COLUMN "dsl_version" SET NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "template_key" text NOT NULL,
  "template_version" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "goal" text,
  "args_json" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "checkpoint_stage_index" integer,
  "lease_owner" text,
  "lease_token" text,
  "lease_expires_at" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "trace_id" text,
  "definition_hash" text NOT NULL,
  "compiler_version" text NOT NULL,
  "registry_snapshot_hash" text NOT NULL,
  "output_schema_ref" text NOT NULL,
  "output_schema_version" integer NOT NULL,
  "executor_ref" text NOT NULL,
  "schema_ref" text NOT NULL,
  "schema_version" integer NOT NULL,
  "compiled_plan_json" jsonb NOT NULL,
  "budget_policy_json" jsonb NOT NULL,
  "usage_json" jsonb,
  "typed_output_json" jsonb,
  "no_cloud_fallback" boolean DEFAULT true NOT NULL,
  "fleet_manifest_version" text NOT NULL,
  "fleet_manifest_path" text NOT NULL,
  "fleet_manifest_hash" text NOT NULL,
  "fleet_manifest_json" jsonb NOT NULL,
  "role_resolution_json" jsonb NOT NULL,
  "model_revisions_json" jsonb NOT NULL,
  "error_code" text,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_runs_checkpoint_stage_index_nonneg"
    CHECK ("checkpoint_stage_index" IS NULL OR "checkpoint_stage_index" >= 0),
  CONSTRAINT "mission_runs_attempt_count_nonneg"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "mission_runs_output_schema_version_check"
    CHECK ("output_schema_version" > 0),
  CONSTRAINT "mission_runs_schema_version_check"
    CHECK ("schema_version" > 0),
  CONSTRAINT "mission_runs_status_check"
    CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'blocked', 'budget_exceeded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_runs_template_idempotency_uidx"
  ON "mission_runs" USING btree ("template_key", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_runs_status_idx"
  ON "mission_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_runs_template_key_idx"
  ON "mission_runs" USING btree ("template_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_runs_trace_id_idx"
  ON "mission_runs" USING btree ("trace_id");
--> statement-breakpoint
DO $mission_runs_checkpoint_stage_index_nonneg$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mission_runs_checkpoint_stage_index_nonneg'
  ) THEN
    EXECUTE '
      ALTER TABLE "mission_runs"
      ADD CONSTRAINT "mission_runs_checkpoint_stage_index_nonneg"
      CHECK ("checkpoint_stage_index" IS NULL OR "checkpoint_stage_index" >= 0)
    ';
  END IF;
END
$mission_runs_checkpoint_stage_index_nonneg$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_stage_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "mission_runs"("id") ON DELETE CASCADE,
  "stage_index" integer NOT NULL,
  "stage_key" text NOT NULL,
  "stage_kind" text NOT NULL,
  "executor_ref" text NOT NULL,
  "input_schema_ref" text NOT NULL,
  "input_schema_version" integer NOT NULL,
  "output_schema_ref" text NOT NULL,
  "output_schema_version" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt" integer DEFAULT 0 NOT NULL,
  "checkpoint_key" text,
  "fence_token" text,
  "input_json" jsonb,
  "output_json" jsonb,
  "role" text,
  "model_revision" text,
  "endpoint" text,
  "trace_id" text,
  "error_code" text,
  "error_message" text,
  "committed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_stage_runs_stage_index_nonneg"
    CHECK ("stage_index" >= 0),
  CONSTRAINT "mission_stage_runs_attempt_nonneg"
    CHECK ("attempt" >= 0),
  CONSTRAINT "mission_stage_runs_input_schema_version_check"
    CHECK ("input_schema_version" > 0),
  CONSTRAINT "mission_stage_runs_output_schema_version_check"
    CHECK ("output_schema_version" > 0),
  CONSTRAINT "mission_stage_runs_status_check"
    CHECK ("status" IN ('pending', 'running', 'committed', 'failed', 'blocked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_stage_runs_run_stage_attempt_uidx"
  ON "mission_stage_runs" USING btree ("run_id", "stage_index", "attempt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_stage_runs_run_stage_idx"
  ON "mission_stage_runs" USING btree ("run_id", "stage_index");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "mission_runs"("id") ON DELETE CASCADE,
  "stage_run_id" uuid REFERENCES "mission_stage_runs"("id") ON DELETE CASCADE,
  "stage_index" integer NOT NULL,
  "checkpoint_key" text NOT NULL,
  "checkpoint_json" jsonb NOT NULL,
  "provenance_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_checkpoints_stage_index_nonneg"
    CHECK ("stage_index" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_checkpoints_run_stage_checkpoint_uidx"
  ON "mission_checkpoints" USING btree ("run_id", "stage_index", "checkpoint_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_checkpoints_run_idx"
  ON "mission_checkpoints" USING btree ("run_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_commits" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "mission_runs"("id") ON DELETE CASCADE,
  "commit_name" text NOT NULL,
  "output_schema_ref" text NOT NULL,
  "output_schema_version" integer NOT NULL,
  "schema_ref" text NOT NULL,
  "schema_version" integer NOT NULL,
  "executor_ref" text NOT NULL,
  "definition_hash" text NOT NULL,
  "compiler_version" text NOT NULL,
  "registry_snapshot_hash" text NOT NULL,
  "typed_output_json" jsonb NOT NULL,
  "usage_json" jsonb,
  "no_cloud_fallback" boolean DEFAULT true NOT NULL,
  "fleet_manifest_version" text NOT NULL,
  "fleet_manifest_path" text NOT NULL,
  "fleet_manifest_hash" text NOT NULL,
  "role_resolution_json" jsonb NOT NULL,
  "model_revisions_json" jsonb NOT NULL,
  "checkpoint_id" uuid REFERENCES "mission_checkpoints"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_commits_output_schema_version_check"
    CHECK ("output_schema_version" > 0),
  CONSTRAINT "mission_commits_schema_version_check"
    CHECK ("schema_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_commits_run_uidx"
  ON "mission_commits" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_commits_created_at_idx"
  ON "mission_commits" USING btree ("created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_events" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "mission_runs"("id") ON DELETE CASCADE,
  "event_index" integer NOT NULL,
  "event_type" text NOT NULL,
  "stage_index" integer,
  "checkpoint_key" text,
  "payload_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_events_event_index_nonneg"
    CHECK ("event_index" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_events_run_event_idx_uidx"
  ON "mission_events" USING btree ("run_id", "event_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_events_run_event_type_idx"
  ON "mission_events" USING btree ("run_id", "event_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_steering" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "mission_runs"("id") ON DELETE CASCADE,
  "actor" text,
  "request_key" text,
  "instruction" text,
  "payload_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_steering_run_request_key_uidx"
  ON "mission_steering" USING btree ("run_id", "request_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_steering_run_idx"
  ON "mission_steering" USING btree ("run_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mission_verdicts" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "mission_runs"("id") ON DELETE CASCADE,
  "actor" text,
  "verdict" text NOT NULL,
  "rationale" text,
  "payload_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_verdicts_run_idx"
  ON "mission_verdicts" USING btree ("run_id");
--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_templates TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE mission_template_versions TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_runs TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_stage_runs TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_checkpoints TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_commits TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_events TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_steering TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE mission_verdicts TO holocron_app';
  END IF;
END
$grants$;
