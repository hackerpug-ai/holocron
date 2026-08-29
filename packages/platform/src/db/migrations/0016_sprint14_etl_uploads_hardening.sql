-- Sprint 14 hardening follow-up — tighten ETL/upload control-surface types on existing DBs

ALTER TABLE IF EXISTS "etl_stage"
  ALTER COLUMN "run_id" TYPE uuid USING "run_id"::uuid;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'etl_stage_run_id_fkey'
      AND conrelid = 'etl_stage'::regclass
  ) THEN
    ALTER TABLE "etl_stage"
      ADD CONSTRAINT "etl_stage_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "etl_runs"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE IF EXISTS "upload_intents"
  ALTER COLUMN "target_id" TYPE uuid USING "target_id"::uuid;
