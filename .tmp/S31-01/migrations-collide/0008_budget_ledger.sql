-- infer-2: budget ledger + singleton ceiling for Claude escape pre-check telemetry
-- Stores every successful escape with reason/tokens/cost/timestamp/run_id/step_id.
-- Ceiling is operator-set (holo budget:set); checkBudget reads spent = SUM(cost).

CREATE TABLE IF NOT EXISTS "budget_ledger" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "reason" text NOT NULL,
  "tokens" integer NOT NULL,
  "cost" double precision NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "run_id" text,
  "step_id" text,
  "role" text,
  "model_id" text,
  "check_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "budget_ledger_tokens_nonneg" CHECK (tokens >= 0),
  CONSTRAINT "budget_ledger_cost_nonneg" CHECK (cost >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "budget_ledger_timestamp_idx" ON "budget_ledger" ("timestamp");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "budget_ledger_run_id_idx" ON "budget_ledger" ("run_id");
--> statement-breakpoint

-- Singleton ceiling row (id must be 1)
CREATE TABLE IF NOT EXISTS "budget_ceiling" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "ceiling" double precision NOT NULL DEFAULT 10,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "budget_ceiling_singleton" CHECK (id = 1),
  CONSTRAINT "budget_ceiling_nonneg" CHECK (ceiling >= 0)
);
--> statement-breakpoint

INSERT INTO "budget_ceiling" ("id", "ceiling")
VALUES (1, 10)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- Product role operability (read/write ledger + update ceiling)
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE budget_ledger TO holocron_app';
    EXECUTE 'GRANT SELECT, UPDATE ON TABLE budget_ceiling TO holocron_app';
  END IF;
END
$grants$;
