-- OBS-03 — durable first-party service-event ledger (redacted, immutable).
-- Hand-written (do not drizzle-kit generate — would propose DROP of unrelated columns).
--
-- service_events is the single durable sink for operational signals. Writers are
-- validated in TypeScript (observability/service-events.ts) and the DB enforces the
-- redaction invariant independently: a non-redacted row is a CHECK violation, so a
-- rogue INSERT of redacted=false cannot survive even if it reaches the database.

CREATE TABLE IF NOT EXISTS "service_events" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source" text NOT NULL,
  "category" text,
  "type" text NOT NULL,
  "severity" text,
  "status" text,
  "trace_id" text,
  "run_id" text,
  "entity_id" text,
  "duration_ms" integer,
  "summary" text NOT NULL,
  "metadata" jsonb,
  "redacted" boolean DEFAULT true NOT NULL,
  "release_sha" text,
  "image_digest" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "service_events_redacted_check" CHECK ("redacted" = true),
  CONSTRAINT "service_events_duration_nonnegative_check"
    CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  CONSTRAINT "service_events_source_check"
    CHECK ("source" IN ('deployment', 'health', 'observability')),
  CONSTRAINT "service_events_summary_bounded_check" CHECK (char_length("summary") <= 4000)
);
--> statement-breakpoint

-- Observed time/id, source/time, trace/time, run/time, and open-state indexes
-- (spec index contract).
CREATE INDEX IF NOT EXISTS "service_events_occurred_at_id_idx"
  ON "service_events" ("occurred_at" DESC, "id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_events_source_time_idx"
  ON "service_events" ("source", "occurred_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_events_trace_time_idx"
  ON "service_events" ("trace_id", "occurred_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_events_run_time_idx"
  ON "service_events" ("run_id", "occurred_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_events_status_idx"
  ON "service_events" ("status")
  WHERE "status" IS NOT NULL;
--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE service_events TO holocron_app';
  END IF;
END
$grants$;
