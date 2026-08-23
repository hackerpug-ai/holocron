-- Wave 4 T-01: research pipeline columns + research_web_calls (server-internal).
-- Hand-written (do not drizzle-kit generate — would propose DROP of unrelated columns).
-- research_sessions remains a full-table zero_pub member (new columns auto-publish).
-- research_iterations is column-list: DROP + re-ADD with expanded column list (omit embedding).

-- ── research_sessions pipeline columns ───────────────────────────────────────
ALTER TABLE "research_sessions"
  ADD COLUMN IF NOT EXISTS "phase" text;
--> statement-breakpoint

ALTER TABLE "research_sessions"
  ADD COLUMN IF NOT EXISTS "progress" jsonb;
--> statement-breakpoint

ALTER TABLE "research_sessions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint

ALTER TABLE "research_sessions"
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "research_sessions"
  ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "research_sessions"
  ADD COLUMN IF NOT EXISTS "estimated_cost_usd" double precision;
--> statement-breakpoint

DO $phase_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_sessions_phase_check'
      AND conrelid = 'public.research_sessions'::regclass
  ) THEN
    ALTER TABLE "research_sessions"
      ADD CONSTRAINT "research_sessions_phase_check"
      CHECK (
        phase IS NULL OR phase IN (
          'planning',
          'searching',
          'analyzing',
          'synthesizing',
          'reviewing',
          'publishing'
        )
      );
  END IF;
END
$phase_check$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "research_sessions_idempotency_key_uidx"
  ON "research_sessions" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- ── research_iterations pipeline columns ─────────────────────────────────────
ALTER TABLE "research_iterations"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

ALTER TABLE "research_iterations"
  ADD COLUMN IF NOT EXISTS "branch_id" text;
--> statement-breakpoint

ALTER TABLE "research_iterations"
  ADD COLUMN IF NOT EXISTS "duration_ms" integer;
--> statement-breakpoint

ALTER TABLE "research_iterations"
  ADD COLUMN IF NOT EXISTS "estimated_cost_usd" double precision;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "research_iterations_session_iteration_uidx"
  ON "research_iterations" ("session_id", "iteration_number");
--> statement-breakpoint

-- ── research_web_calls (server-internal; NOT in zero_pub) ────────────────────
CREATE TABLE IF NOT EXISTS "research_web_calls" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "session_id" uuid,
  "iteration_id" uuid,
  "branch_id" text,
  "provider" text,
  "call_kind" text,
  "query" text,
  "url" text,
  "http_status" integer,
  "result_count" integer,
  "bytes" integer,
  "wall_ms" integer,
  "estimated_cost_usd" double precision,
  "source_id" text,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "research_web_calls_provider_check"
    CHECK (provider IS NULL OR provider IN ('jina', 'exa')),
  CONSTRAINT "research_web_calls_call_kind_check"
    CHECK (call_kind IS NULL OR call_kind IN ('search', 'fetch', 'read'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "research_web_calls_session_id_idx"
  ON "research_web_calls" ("session_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "research_web_calls_url_idx"
  ON "research_web_calls" ("url");
--> statement-breakpoint

DO $web_call_fks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_web_calls_session_id_fkey'
      AND conrelid = 'public.research_web_calls'::regclass
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'research_sessions'
  ) THEN
    ALTER TABLE "research_web_calls"
      ADD CONSTRAINT "research_web_calls_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_web_calls_iteration_id_fkey'
      AND conrelid = 'public.research_web_calls'::regclass
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'research_iterations'
  ) THEN
    ALTER TABLE "research_web_calls"
      ADD CONSTRAINT "research_web_calls_iteration_id_fkey"
      FOREIGN KEY ("iteration_id") REFERENCES "research_iterations"("id") ON DELETE RESTRICT;
  END IF;
END
$web_call_fks$;
--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE research_web_calls TO holocron_app';
  END IF;
END
$grants$;
--> statement-breakpoint

-- ── zero_pub: refresh research_iterations column list ────────────────────────
DO $drop_iter_pub$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'research_iterations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION zero_pub DROP TABLE research_iterations';
  END IF;
END
$drop_iter_pub$;
--> statement-breakpoint

DO $add_iter_pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'research_iterations'
  ) AND EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'zero_pub'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'research_iterations'
  ) THEN
    EXECUTE $sql$ALTER PUBLICATION zero_pub ADD TABLE research_iterations (
    id,
    legacy_convex_id,
    system,
    session_id,
    iteration_number,
    status,
    findings_summary,
    summary,
    sources,
    findings,
    review_score,
    coverage_score,
    review_feedback,
    feedback,
    review_gaps,
    refined_queries,
    confidence_stats,
    created_at,
    updated_at,
    branch_id,
    duration_ms,
    estimated_cost_usd
)$sql$;
  END IF;
END
$add_iter_pub$;
