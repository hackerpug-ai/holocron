-- queue-1: Postgres-backed leased queue — priority lanes, retries/backoff, DLQ, fencing.
-- Real durable tables (not process-local). Backend runtime is pg-boss (graphile-worker fallback).

CREATE TABLE IF NOT EXISTS "queue_jobs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "key" text,
  "name" text NOT NULL,
  "lane" text NOT NULL,
  "priority" integer NOT NULL DEFAULT 0,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "fence_token" text,
  "lease_owner" text,
  "lease_expires_at" timestamptz,
  "available_at" timestamptz NOT NULL DEFAULT now(),
  "last_error" text,
  "poison" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "queue_jobs_lane_check" CHECK (lane IN ('interactive', 'background')),
  CONSTRAINT "queue_jobs_status_check" CHECK (
    status IN (
      'pending',
      'leased',
      'completed',
      'failed',
      'dead_letter',
      'cancelled'
    )
  ),
  CONSTRAINT "queue_jobs_priority_nonneg" CHECK (priority >= 0),
  CONSTRAINT "queue_jobs_attempts_nonneg" CHECK (attempts >= 0),
  CONSTRAINT "queue_jobs_max_attempts_pos" CHECK (max_attempts >= 1)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "queue_jobs_key_uidx"
  ON "queue_jobs" ("key")
  WHERE "key" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_jobs_dequeue_idx"
  ON "queue_jobs" ("status", "priority" DESC, "available_at", "created_at")
  WHERE status = 'pending';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_jobs_lane_status_idx"
  ON "queue_jobs" ("lane", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_jobs_lease_expires_idx"
  ON "queue_jobs" ("lease_expires_at")
  WHERE status = 'leased';
--> statement-breakpoint

-- Dead-letter path — poison / exhausted retries land here (never silent drop).
CREATE TABLE IF NOT EXISTS "queue_dlq" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "queue_jobs" ("id") ON DELETE CASCADE,
  "key" text,
  "name" text NOT NULL,
  "lane" text,
  "priority" integer,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "last_error" text,
  "fence_token" text,
  "reason" text NOT NULL DEFAULT 'retry_exhausted',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_dlq_key_idx" ON "queue_dlq" ("key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_dlq_job_id_idx" ON "queue_dlq" ("job_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_dlq_created_at_idx" ON "queue_dlq" ("created_at");
--> statement-breakpoint

-- Queue backend meta (which runtime is active: pg-boss | graphile-worker).
CREATE TABLE IF NOT EXISTS "queue_backend_meta" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "backend" text NOT NULL DEFAULT 'pg-boss',
  "ready" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "queue_backend_meta_singleton" CHECK (id = 1),
  CONSTRAINT "queue_backend_meta_backend_check" CHECK (
    backend IN ('pg-boss', 'graphile-worker')
  )
);
--> statement-breakpoint

INSERT INTO "queue_backend_meta" ("id", "backend", "ready")
VALUES (1, 'pg-boss', false)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE queue_jobs TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE queue_dlq TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE queue_backend_meta TO holocron_app';
  END IF;
END
$grants$;
