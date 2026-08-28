-- 0041_fulcrum_ledger.sql
-- FUL-PLAT-001 — Install the append-only Fulcrum ledger contract.
-- Hand-written (do not drizzle-kit generate — the append-only barrier is
-- Postgres-enforced, which a generated push would silently omit).
--
-- (a) Nine new Fulcrum tables (PRD 03-data-schema §C): candidates, belief_scores,
--     weight_versions, weight_components, domain_tier_versions, domain_tiers,
--     touches, probes, claim_evidence_bindings. NOT a Prospector port: the names
--     `prospects`, `cycles`, `scores`, and `fulcrumCycles` must never exist.
-- (b) STRICTLY additive columns on sources (fetch artifact) and claims (admission):
--     no existing column type or index is changed.
-- (c) Append-only barrier (mirrors 0004_beliefs_immutability_revise.sql):
--     holocron_app keeps SELECT/INSERT only (catalog layer, REVOKE first), and a
--     BEFORE UPDATE OR DELETE trigger named per table raises an error naming the
--     table as append-only for ANY role holding DML grants (data layer).

-- ── Roles ────────────────────────────────────────────────────────────────
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    CREATE ROLE holocron_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_owner') THEN
    CREATE ROLE holocron_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;
--> statement-breakpoint

-- Migration runner (table owner / superuser) may assume owner for admin ops.
GRANT holocron_owner TO CURRENT_USER;
--> statement-breakpoint

DO $dbconn$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO holocron_app', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO holocron_owner', current_database());
END
$dbconn$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO holocron_app;
GRANT USAGE ON SCHEMA public TO holocron_owner;
--> statement-breakpoint

-- ── candidates — the work items Fulcrum scores (NOT "prospects") ─────────
CREATE TABLE IF NOT EXISTS "candidates" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "mission_id" text NOT NULL,
  "stage" text NOT NULL,
  "niche_key" text,
  "current_score_id" text,
  "closeout_claim_id" text,
  "title" text,
  "question" text,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "candidates_stage_check"
    CHECK ("stage" IN ('raw', 'developing', 'contender', 'validated', 'retired', 'killed'))
);
--> statement-breakpoint

-- ── belief_scores — append-only score history (NOT "scores" / "fulcrumScores") ──
-- Every row references exactly one weight_version and one domain_tier_version.
CREATE TABLE IF NOT EXISTS "belief_scores" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "candidate_id" text NOT NULL,
  "run_id" uuid,
  "weight_version" integer NOT NULL,
  "domain_tier_version" integer NOT NULL,
  "score" double precision,
  "disconfirmation_total" double precision,
  "components_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "belief_scores_score_range_check"
    CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 1))
);
--> statement-breakpoint

-- ── weight_versions + weight_components — versioned fitness contract ─────
CREATE TABLE IF NOT EXISTS "weight_versions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "mission_id" text NOT NULL,
  "version" integer NOT NULL,
  "disconfirmation_multiplier" double precision DEFAULT 2 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "weight_components" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "weight_version_id" text NOT NULL,
  "component" text NOT NULL,
  "kind" text NOT NULL,
  "weight" double precision NOT NULL,
  "grade_floor" double precision,
  "recency_window_days" integer,
  "half_life_days" integer,
  "rubric_json" jsonb,
  CONSTRAINT "weight_components_kind_check"
    CHECK ("kind" IN ('evidence', 'judgment')),
  CONSTRAINT "weight_components_weight_range_check"
    CHECK ("weight" >= 0 AND "weight" <= 1),
  CONSTRAINT "weight_components_grade_floor_range_check"
    CHECK ("grade_floor" IS NULL OR ("grade_floor" >= 0 AND "grade_floor" <= 1))
);
--> statement-breakpoint

-- ── domain_tier_versions + domain_tiers — deterministic grading ladder ───
CREATE TABLE IF NOT EXISTS "domain_tier_versions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "mission_id" text NOT NULL,
  "version" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "domain_tiers" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "domain_tier_version_id" text NOT NULL,
  "registrable_domain" text NOT NULL,
  "tier" text NOT NULL,
  "tier_value" double precision NOT NULL,
  CONSTRAINT "domain_tiers_tier_value_range_check"
    CHECK ("tier_value" >= 0 AND "tier_value" <= 1)
);
--> statement-breakpoint

-- ── touches — explicit operator ack (drives degradation ceiling) ──────────
CREATE TABLE IF NOT EXISTS "touches" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "mission_id" text NOT NULL,
  "run_id" uuid,
  "touch_type" text NOT NULL,
  "source" text NOT NULL,
  "ref_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "touches_touch_type_check"
    CHECK ("touch_type" IN ('verdict', 'brief_ack'))
);
--> statement-breakpoint

-- ── probes — recorded reality-probe results (tooling out of scope; row is in) ──
CREATE TABLE IF NOT EXISTS "probes" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "candidate_id" text NOT NULL,
  "kind" text NOT NULL,
  "result" text NOT NULL,
  "recorded_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "probes_kind_check"
    CHECK ("kind" IN ('calls', 'smoke_test', 'pilot'))
);
--> statement-breakpoint

-- ── claim_evidence_bindings — n:m with denormalized provenance ───────────
CREATE TABLE IF NOT EXISTS "claim_evidence_bindings" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "claim_id" text NOT NULL,
  "source_id" text NOT NULL,
  "source_domain" text,
  "provenance_group" text,
  "self_sourced" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── STRICTLY additive fetch-artifact columns on sources ──────────────────
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "normalized_text" text;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "retrieved_at" timestamp with time zone;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "source_domain" text;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "provenance_group" text;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "self_sourced" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- ── STRICTLY additive admission columns on claims ────────────────────────
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "candidate_id" text;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "component" text;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "polarity" text;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'provisional' NOT NULL;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "quote_text" text;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "passes_gate" boolean;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "qualifying_grade" double precision;
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "target_claim_id" text;
--> statement-breakpoint

-- Named CHECK constraints for the additive claims columns (guard: Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS). Constraint name claims_status_check is contract.
DO $claims_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_status_check') THEN
    ALTER TABLE "claims" ADD CONSTRAINT "claims_status_check"
      CHECK ("status" IN ('admitted', 'provisional', 'contested', 'refuted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_polarity_check') THEN
    ALTER TABLE "claims" ADD CONSTRAINT "claims_polarity_check"
      CHECK ("polarity" IN ('support', 'refute'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_qualifying_grade_range_check') THEN
    ALTER TABLE "claims" ADD CONSTRAINT "claims_qualifying_grade_range_check"
      CHECK ("qualifying_grade" IS NULL OR ("qualifying_grade" >= 0 AND "qualifying_grade" <= 1));
  END IF;
END
$claims_checks$;
--> statement-breakpoint

-- ── Append-only barrier: data layer ───────────────────────────────────────
-- ANY role holding UPDATE/DELETE (including holocron_owner) hits this trigger;
-- the message names the table as append-only. TRUNCATE is intentionally NOT
-- guarded: it is the sanctioned owner-only ledger reset.
CREATE OR REPLACE FUNCTION enforce_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'TABLE_APPEND_ONLY: % is append-only (INSERT-only Fulcrum ledger table)', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$fn$;
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "belief_scores_append_only_guard"
  BEFORE UPDATE OR DELETE ON "belief_scores"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "weight_versions_append_only_guard"
  BEFORE UPDATE OR DELETE ON "weight_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "weight_components_append_only_guard"
  BEFORE UPDATE OR DELETE ON "weight_components"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "domain_tier_versions_append_only_guard"
  BEFORE UPDATE OR DELETE ON "domain_tier_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "domain_tiers_append_only_guard"
  BEFORE UPDATE OR DELETE ON "domain_tiers"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "touches_append_only_guard"
  BEFORE UPDATE OR DELETE ON "touches"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "probes_append_only_guard"
  BEFORE UPDATE OR DELETE ON "probes"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE TRIGGER "claim_evidence_bindings_append_only_guard"
  BEFORE UPDATE OR DELETE ON "claim_evidence_bindings"
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

-- ── Append-only barrier: catalog layer (mirrors 0004 grant shape) ─────────
-- The 8 append-only tables: holocron_app gets SELECT, INSERT only.
REVOKE ALL ON TABLE "belief_scores" FROM PUBLIC;
REVOKE ALL ON TABLE "belief_scores" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "belief_scores" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "belief_scores" TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON TABLE "weight_versions" FROM PUBLIC;
REVOKE ALL ON TABLE "weight_versions" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "weight_versions" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "weight_versions" TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON TABLE "weight_components" FROM PUBLIC;
REVOKE ALL ON TABLE "weight_components" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "weight_components" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "weight_components" TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON TABLE "domain_tier_versions" FROM PUBLIC;
REVOKE ALL ON TABLE "domain_tier_versions" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "domain_tier_versions" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "domain_tier_versions" TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON TABLE "domain_tiers" FROM PUBLIC;
REVOKE ALL ON TABLE "domain_tiers" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "domain_tiers" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "domain_tiers" TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON TABLE "touches" FROM PUBLIC;
REVOKE ALL ON TABLE "touches" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "touches" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "touches" TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON TABLE "probes" FROM PUBLIC;
REVOKE ALL ON TABLE "probes" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "probes" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "probes" TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON TABLE "claim_evidence_bindings" FROM PUBLIC;
REVOKE ALL ON TABLE "claim_evidence_bindings" FROM holocron_app;
GRANT SELECT, INSERT ON TABLE "claim_evidence_bindings" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "claim_evidence_bindings" TO holocron_owner;
--> statement-breakpoint

-- candidates is the mutable work-item table (stage transitions), but rows are
-- never deleted: holocron_app gets SELECT, INSERT, UPDATE — no DELETE.
REVOKE ALL ON TABLE "candidates" FROM PUBLIC;
REVOKE ALL ON TABLE "candidates" FROM holocron_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "candidates" TO holocron_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "candidates" TO holocron_owner;
--> statement-breakpoint

-- Re-assert the table owner retains DML (ownership implies this; 0004 parity).
-- The append-only triggers above still reject any UPDATE/DELETE the owner attempts.
DO $owner_grant$
DECLARE
  t text;
  v_owner text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'candidates', 'belief_scores', 'weight_versions', 'weight_components',
    'domain_tier_versions', 'domain_tiers', 'touches', 'probes',
    'claim_evidence_bindings'
  ] LOOP
    SELECT pg_catalog.pg_get_userbyid(c.relowner) INTO v_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r';
    IF v_owner IS NOT NULL AND v_owner NOT IN ('holocron_app') THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I',
        t, v_owner
      );
    END IF;
  END LOOP;
END
$owner_grant$;
