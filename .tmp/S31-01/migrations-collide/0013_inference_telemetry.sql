-- obs-2: per-model-call inference telemetry (tokens/wall-ms/endpoint/role/provider/run/trace/status)
-- Distinct from legacy agent_telemetry (classification events). Redacted — no prompt/response bodies.

CREATE TABLE IF NOT EXISTS "inference_telemetry" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "run_id" text,
  "step_id" text,
  "trace_id" text,
  "role" text NOT NULL,
  "provider" text NOT NULL,
  "endpoint" text NOT NULL,
  "model_id" text,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "wall_ms" integer NOT NULL,
  "status" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "budget_ledger_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inference_telemetry_tokens_nonneg"
    CHECK (input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0),
  CONSTRAINT "inference_telemetry_wall_ms_nonneg"
    CHECK (wall_ms >= 0),
  CONSTRAINT "inference_telemetry_status_check"
    CHECK (status IN ('success', 'error', 'degraded')),
  CONSTRAINT "inference_telemetry_provider_check"
    CHECK (provider IN ('fleet', 'anthropic'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inference_telemetry_run_id_idx"
  ON "inference_telemetry" ("run_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inference_telemetry_trace_id_idx"
  ON "inference_telemetry" ("trace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inference_telemetry_created_at_idx"
  ON "inference_telemetry" ("created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inference_telemetry_provider_idx"
  ON "inference_telemetry" ("provider");
--> statement-breakpoint

-- Product role operability (read/write telemetry)
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE inference_telemetry TO holocron_app';
  END IF;
END
$grants$;
