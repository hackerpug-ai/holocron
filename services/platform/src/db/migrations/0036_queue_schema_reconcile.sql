-- S31-01: reconcile queue schema TO migration 0010's declared shape.
-- Runtime queue/schema.ts ENSURE_SQL omitted 3 CHECKs, 2 indexes, and holocron_app grants.
-- Idempotent: safe on fresh DBs (already correct after 0010) and on runtime-shaped DBs.

DO $queue_jobs_priority_nonneg$
BEGIN
  IF to_regclass('public.queue_jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'queue_jobs_priority_nonneg'
         AND conrelid = 'public.queue_jobs'::regclass
     ) THEN
    ALTER TABLE queue_jobs
      ADD CONSTRAINT queue_jobs_priority_nonneg CHECK (priority >= 0);
  END IF;
END
$queue_jobs_priority_nonneg$;
--> statement-breakpoint

DO $queue_jobs_attempts_nonneg$
BEGIN
  IF to_regclass('public.queue_jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'queue_jobs_attempts_nonneg'
         AND conrelid = 'public.queue_jobs'::regclass
     ) THEN
    ALTER TABLE queue_jobs
      ADD CONSTRAINT queue_jobs_attempts_nonneg CHECK (attempts >= 0);
  END IF;
END
$queue_jobs_attempts_nonneg$;
--> statement-breakpoint

DO $queue_jobs_max_attempts_pos$
BEGIN
  IF to_regclass('public.queue_jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'queue_jobs_max_attempts_pos'
         AND conrelid = 'public.queue_jobs'::regclass
     ) THEN
    ALTER TABLE queue_jobs
      ADD CONSTRAINT queue_jobs_max_attempts_pos CHECK (max_attempts >= 1);
  END IF;
END
$queue_jobs_max_attempts_pos$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_jobs_lease_expires_idx"
  ON "queue_jobs" ("lease_expires_at")
  WHERE status = 'leased';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_dlq_created_at_idx"
  ON "queue_dlq" ("created_at");
--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    IF to_regclass('public.queue_jobs') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE queue_jobs TO holocron_app';
    END IF;
    IF to_regclass('public.queue_dlq') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE queue_dlq TO holocron_app';
    END IF;
    IF to_regclass('public.queue_backend_meta') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE queue_backend_meta TO holocron_app';
    END IF;
  END IF;
END
$grants$;
