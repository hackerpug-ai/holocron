-- Sprint 18: durable idempotent chat runs and resumable SSE event log.
CREATE TABLE IF NOT EXISTS "chat_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "owner_scope" text NOT NULL,
  "request_id" text NOT NULL,
  "conversation_id" text,
  "user_message_id" uuid,
  "durable_message_id" uuid NOT NULL DEFAULT uuidv7(),
  "role" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "message" text NOT NULL,
  "final_text" text,
  "trace_id" text,
  "max_steps" integer NOT NULL DEFAULT 8,
  "steps_used" integer NOT NULL DEFAULT 0,
  "last_event_seq" integer NOT NULL DEFAULT 0,
  "error_code" text,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "chat_runs_status_check" CHECK ("status" IN ('pending', 'running', 'completed', 'blocked', 'failed')),
  CONSTRAINT "chat_runs_max_steps_check" CHECK ("max_steps" > 0),
  CONSTRAINT "chat_runs_steps_used_check" CHECK ("steps_used" >= 0 AND "steps_used" <= "max_steps"),
  CONSTRAINT "chat_runs_event_seq_check" CHECK ("last_event_seq" >= 0),
  CONSTRAINT "chat_runs_owner_request_uidx" UNIQUE ("owner_scope", "request_id")
);
CREATE INDEX IF NOT EXISTS "chat_runs_status_idx" ON "chat_runs" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "chat_run_events" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "chat_runs"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "event_type" text NOT NULL,
  "data_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chat_run_events_seq_check" CHECK ("seq" > 0),
  CONSTRAINT "chat_run_events_run_seq_uidx" UNIQUE ("run_id", "seq")
);
CREATE INDEX IF NOT EXISTS "chat_run_events_run_seq_idx" ON "chat_run_events" ("run_id", "seq");

GRANT SELECT, INSERT, UPDATE ON TABLE "chat_runs" TO holocron_app;
GRANT SELECT, INSERT ON TABLE "chat_run_events" TO holocron_app;
