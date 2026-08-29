-- Sprint 14 — ETL staging / runs / authoritative uploads / CAS file-object uniqueness

CREATE TABLE IF NOT EXISTS "etl_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "export_root" text NOT NULL,
  "export_hash" text NOT NULL,
  "catalog_path" text NOT NULL,
  "catalog_version" text NOT NULL,
  "checkpoint" text DEFAULT 'created' NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "error_reason" text,
  "manifest_json" jsonb,
  "summary_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "etl_runs_export_hash_idx" ON "etl_runs" USING btree ("export_hash");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "etl_stage" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "etl_runs"("id") ON DELETE CASCADE,
  "source_table" text NOT NULL,
  "legacy_id" text NOT NULL,
  "creation_time_ms" text,
  "row_hash" text NOT NULL,
  "row_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "etl_stage_run_id_idx" ON "etl_stage" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "etl_stage_source_table_idx" ON "etl_stage" USING btree ("source_table");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "etl_stage_run_table_legacy_uidx"
  ON "etl_stage" USING btree ("run_id", "source_table", "legacy_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "upload_intents" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "idempotency_key" text NOT NULL,
  "kind" text NOT NULL,
  "target_id" uuid NOT NULL,
  "declared_sha256" text NOT NULL,
  "declared_byte_length" integer NOT NULL,
  "declared_mime_type" text NOT NULL,
  "original_name" text,
  "status" text DEFAULT 'initiated' NOT NULL,
  "staged_path" text,
  "staged_byte_length" integer,
  "actual_sha256" text,
  "actual_mime_type" text,
  "actual_byte_length" integer,
  "result_blob_id" text,
  "result_file_object_id" text,
  "result_json" jsonb,
  "error_reason" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upload_intents_idempotency_uidx"
  ON "upload_intents" USING btree ("idempotency_key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "file_objects_content_hash_uidx"
  ON "file_objects" USING btree ("content_hash");
