-- ledger-2: DB-enforced immutability on beliefs + temporal-revision SECURITY DEFINER
--
-- (a) Application role holocron_app may SELECT/INSERT but NOT UPDATE/DELETE beliefs.
--     Privileged role holocron_owner retains UPDATE/DELETE for the definer function.
-- (b) revise_belief(...) atomically closes the open predecessor (tx_to) and inserts
--     exactly one successor (supersedes_id, actor, run_id, idempotency_key).
-- (c) Partial unique index on idempotency_key enables safe replay.

-- ── Roles ────────────────────────────────────────────────────────────────────
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

-- ── Table privileges: immutability for the app role ──────────────────────────
REVOKE ALL ON TABLE beliefs FROM PUBLIC;
--> statement-breakpoint

-- Drop any inherited/default UPDATE/DELETE the app role might have had.
REVOKE ALL ON TABLE beliefs FROM holocron_app;
--> statement-breakpoint

GRANT SELECT, INSERT ON TABLE beliefs TO holocron_app;
--> statement-breakpoint

-- Privileged role only: UPDATE + DELETE (owner path for SECURITY DEFINER).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE beliefs TO holocron_owner;
--> statement-breakpoint

-- Ensure the current table owner still has DML (ownership implies this; re-assert).
DO $owner_grant$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)
    INTO v_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'beliefs' AND c.relkind = 'r';

  IF v_owner IS NOT NULL AND v_owner NOT IN ('holocron_app') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE beliefs TO %I', v_owner);
  END IF;
END
$owner_grant$;
--> statement-breakpoint

-- Idempotency uniqueness (replay must not insert a second row).
CREATE UNIQUE INDEX IF NOT EXISTS "beliefs_idempotency_key_uidx"
  ON "beliefs" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- ── revise_belief: atomic temporal supersession ──────────────────────────────
CREATE OR REPLACE FUNCTION revise_belief(
  p_belief_id uuid,
  p_actor text,
  p_run_id text,
  p_idempotency_key text,
  p_new_statement text,
  p_new_confidence double precision,
  p_valid_from timestamptz,
  p_valid_to timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pred RECORD;
  v_existing_id uuid;
  v_new_id uuid;
  v_now timestamptz := clock_timestamp();
  v_close_count int;
BEGIN
  IF p_belief_id IS NULL THEN
    RAISE EXCEPTION 'REVISE_INVALID: p_belief_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_new_statement IS NULL OR length(btrim(p_new_statement)) = 0 THEN
    RAISE EXCEPTION 'REVISE_INVALID: p_new_statement is required'
      USING ERRCODE = '22023';
  END IF;

  -- Fast-path idempotent replay (no lock needed if key already committed).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM beliefs
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Lock predecessor row for the duration of this transaction.
  SELECT id, claim_id, statement, confidence, supersedes_id,
         valid_from, valid_to, tx_from, tx_to, actor, run_id, idempotency_key
    INTO v_pred
  FROM beliefs
  WHERE id = p_belief_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISE_NOT_FOUND: belief % does not exist', p_belief_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Re-check idempotency after lock (concurrent same-key race).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM beliefs
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF v_pred.tx_to IS NOT NULL THEN
    RAISE EXCEPTION
      'REVISE_STALE_CONCURRENT: belief % is already closed (tx_to set)',
      p_belief_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE beliefs
  SET tx_to = v_now
  WHERE id = p_belief_id
    AND tx_to IS NULL;
  GET DIAGNOSTICS v_close_count = ROW_COUNT;

  IF v_close_count <> 1 THEN
    RAISE EXCEPTION
      'REVISE_STALE_CONCURRENT: belief % closed concurrently',
      p_belief_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO beliefs (
    claim_id,
    statement,
    confidence,
    supersedes_id,
    valid_from,
    valid_to,
    tx_from,
    tx_to,
    actor,
    run_id,
    idempotency_key
  ) VALUES (
    v_pred.claim_id,
    p_new_statement,
    p_new_confidence,
    p_belief_id::text,
    COALESCE(p_valid_from, v_now),
    p_valid_to,
    v_now,
    NULL,
    p_actor,
    p_run_id,
    p_idempotency_key
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;
--> statement-breakpoint

-- Function runs with privileges of holocron_owner (has UPDATE/DELETE on beliefs).
ALTER FUNCTION revise_belief(
  uuid, text, text, text, text, double precision, timestamptz, timestamptz
) OWNER TO holocron_owner;
--> statement-breakpoint

-- holocron_owner needs table privileges already granted; also grant usage of own fn.
REVOKE ALL ON FUNCTION revise_belief(
  uuid, text, text, text, text, double precision, timestamptz, timestamptz
) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION revise_belief(
  uuid, text, text, text, text, double precision, timestamptz, timestamptz
) TO holocron_app;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION revise_belief(
  uuid, text, text, text, text, double precision, timestamptz, timestamptz
) TO holocron_owner;
--> statement-breakpoint

-- Table owner / migration role (typically superuser or schema owner) can call too.
DO $exec_grant$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)
    INTO v_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'beliefs' AND c.relkind = 'r';
  IF v_owner IS NOT NULL THEN
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION revise_belief(uuid, text, text, text, text, double precision, timestamptz, timestamptz) TO %I',
      v_owner
    );
  END IF;
END
$exec_grant$;
--> statement-breakpoint

-- App role needs SELECT on claims/sources for seed/read paths used by operators.
-- (beliefs immutability only; broader grants stay least-privilege for this table.)
GRANT SELECT ON TABLE claims TO holocron_app;
GRANT SELECT ON TABLE sources TO holocron_app;
GRANT SELECT ON TABLE passages TO holocron_app;
GRANT SELECT ON TABLE relations TO holocron_app;
