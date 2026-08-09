-- CAP-BAK-01 / D04-03 / REDHAT-FIX-S27-12
-- backup_heartbeat: migrate-owned schema with status CHECK.
-- last_success_at is application-owned (set only after R2 confirmation).
-- Runtime CREATE TABLE paths are prohibited; holo db:migrate is sole bootstrap.

CREATE TABLE IF NOT EXISTS "backup_heartbeat" (
  "job_name" text PRIMARY KEY NOT NULL,
  "last_success_at" timestamp with time zone,
  "last_wal_segment" text,
  "last_snapshot_id" text,
  "object_count" bigint,
  "status" text,
  "trace_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Idempotent column repair for partial tables created by older runtime DDL.
ALTER TABLE "backup_heartbeat"
  ADD COLUMN IF NOT EXISTS "last_success_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "backup_heartbeat"
  ADD COLUMN IF NOT EXISTS "last_wal_segment" text;
--> statement-breakpoint
ALTER TABLE "backup_heartbeat"
  ADD COLUMN IF NOT EXISTS "last_snapshot_id" text;
--> statement-breakpoint
ALTER TABLE "backup_heartbeat"
  ADD COLUMN IF NOT EXISTS "object_count" bigint;
--> statement-breakpoint
ALTER TABLE "backup_heartbeat"
  ADD COLUMN IF NOT EXISTS "status" text;
--> statement-breakpoint
ALTER TABLE "backup_heartbeat"
  ADD COLUMN IF NOT EXISTS "trace_id" text;
--> statement-breakpoint
ALTER TABLE "backup_heartbeat"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint

-- Enforce status vocabulary (matches drizzle schema backup.ts CHECK).
-- CREATE TABLE IF NOT EXISTS skips body when a CHECK-less runtime table exists,
-- so constraint is added separately and idempotently.
DO $backup_heartbeat_status_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'backup_heartbeat_status_check'
      AND conrelid = 'public.backup_heartbeat'::regclass
  ) THEN
    ALTER TABLE "backup_heartbeat"
      ADD CONSTRAINT "backup_heartbeat_status_check"
      CHECK (
        status IS NULL
        OR status IN ('success', 'failed', 'running', 'overdue')
      );
  END IF;
END
$backup_heartbeat_status_check$;
--> statement-breakpoint

-- Product role operability (heartbeat upserts / alerting SELECT)
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE backup_heartbeat TO holocron_app';
  END IF;
END
$grants$;
