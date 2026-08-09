-- REDHAT-FIX-H1: belief INSERT authenticity — app role cannot forge closed history
--
-- (a) REVOKE INSERT ON beliefs FROM holocron_app (and PUBLIC). App retains SELECT.
-- (b) seed_open_belief(...) SECURITY DEFINER owned by holocron_owner inserts ONLY
--     open rows (tx_to forced NULL). GRANT EXECUTE TO holocron_app.
-- (c) revise_belief remains the sole app-callable path for supersession successors.
-- (d) holocron_owner retains INSERT/UPDATE/DELETE for DEFINER bodies.

-- ── Drop table INSERT for the application role ───────────────────────────────
REVOKE INSERT ON TABLE beliefs FROM holocron_app;
--> statement-breakpoint

REVOKE INSERT ON TABLE beliefs FROM PUBLIC;
--> statement-breakpoint

-- Re-assert least-privilege posture (SELECT only for app; full DML for owner).
GRANT SELECT ON TABLE beliefs TO holocron_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE beliefs TO holocron_owner;
--> statement-breakpoint

-- Ensure table owner still has DML (migration role / superuser path).
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

-- ── seed_open_belief: authorized open-row insert only ────────────────────────
CREATE OR REPLACE FUNCTION seed_open_belief(
  p_claim_id text,
  p_statement text,
  p_confidence double precision DEFAULT NULL,
  p_actor text DEFAULT NULL,
  p_run_id text DEFAULT NULL,
  p_valid_from timestamptz DEFAULT NULL,
  p_valid_to timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_new_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_claim_id IS NULL OR length(btrim(p_claim_id)) = 0 THEN
    RAISE EXCEPTION 'SEED_INVALID: p_claim_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) = 0 THEN
    RAISE EXCEPTION 'SEED_INVALID: p_statement is required'
      USING ERRCODE = '22023';
  END IF;

  -- Authenticity: open rows only. tx_to is forced NULL (no closed-history path).
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
    p_claim_id,
    p_statement,
    p_confidence,
    NULL,
    p_valid_from,
    p_valid_to,
    v_now,
    NULL,
    p_actor,
    p_run_id,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;
--> statement-breakpoint

ALTER FUNCTION seed_open_belief(
  text, text, double precision, text, text, timestamptz, timestamptz
) OWNER TO holocron_owner;
--> statement-breakpoint

REVOKE ALL ON FUNCTION seed_open_belief(
  text, text, double precision, text, text, timestamptz, timestamptz
) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION seed_open_belief(
  text, text, double precision, text, text, timestamptz, timestamptz
) TO holocron_app;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION seed_open_belief(
  text, text, double precision, text, text, timestamptz, timestamptz
) TO holocron_owner;
--> statement-breakpoint

-- Table owner / migration role can call seed_open_belief too.
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
      'GRANT EXECUTE ON FUNCTION seed_open_belief(text, text, double precision, text, text, timestamptz, timestamptz) TO %I',
      v_owner
    );
  END IF;
END
$exec_grant$;
--> statement-breakpoint

-- Re-assert revise_belief EXECUTE for holocron_app (must remain operable after INSERT revoke).
GRANT EXECUTE ON FUNCTION revise_belief(
  uuid, text, text, text, text, double precision, timestamptz, timestamptz
) TO holocron_app;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION revise_belief(
  uuid, text, text, text, text, double precision, timestamptz, timestamptz
) TO holocron_owner;
