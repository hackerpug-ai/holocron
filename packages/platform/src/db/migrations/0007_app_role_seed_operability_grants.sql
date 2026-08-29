-- REDHAT-FIX-H2: operability GRANTs so holocron_app can run product seed/register-doc
-- after the default product pool is bound to the least-privilege app role.
--
-- (a) GRANT SELECT/INSERT on sources, passages, claims, relations to holocron_app.
-- (b) GRANT UPDATE on sources/passages for register-doc (ON CONFLICT DO UPDATE + link).
-- (c) Re-assert EXECUTE on revise_belief; grant seed_open_belief EXECUTE when present (H1).
-- (d) NEVER grant UPDATE/DELETE on beliefs to holocron_app.

-- ── Seed-table operability (non-belief) ──────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON TABLE sources TO holocron_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE passages TO holocron_app;
--> statement-breakpoint

GRANT SELECT, INSERT ON TABLE claims TO holocron_app;
--> statement-breakpoint

GRANT SELECT, INSERT ON TABLE relations TO holocron_app;
--> statement-breakpoint

-- ── Belief revision path remains DEFINER-only for mutations ──────────────────
GRANT EXECUTE ON FUNCTION revise_belief(
  uuid, text, text, text, text, double precision, timestamptz, timestamptz
) TO holocron_app;
--> statement-breakpoint

-- H1 may add seed_open_belief; grant EXECUTE when present so product open-seed works.
DO $seed_fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'seed_open_belief'
      AND pg_get_function_identity_arguments(p.oid)
        = 'text, text, double precision, text, text, timestamp with time zone, timestamp with time zone'
  ) THEN
    EXECUTE $g$
      GRANT EXECUTE ON FUNCTION seed_open_belief(
        text, text, double precision, text, text, timestamptz, timestamptz
      ) TO holocron_app
    $g$;
  END IF;
END
$seed_fn$;
--> statement-breakpoint

-- Explicit least-privilege re-assert: app role must NOT UPDATE/DELETE beliefs.
REVOKE UPDATE, DELETE ON TABLE beliefs FROM holocron_app;
--> statement-breakpoint

REVOKE UPDATE, DELETE ON TABLE beliefs FROM PUBLIC;
--> statement-breakpoint
