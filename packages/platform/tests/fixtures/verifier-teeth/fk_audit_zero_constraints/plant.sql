-- S31-08 fk_audit_zero_constraints plant (documentation of the disposable-NS steps).
-- The integration suite implements this against a throwaway database so ambient
-- holocron_nonprod is never mutated:
--
--   1. CREATE DATABASE holocron_s31_08_fk_zero_<pid>_<ts>
--   2. applyMigrations (domain tables present)
--   3. DROP every public FOREIGN KEY  → enforcedForeignKeys = 0
--   4. INSERT etl_runs status=succeeded pointing at fixtures/etl-valid-export
--   5. etl:fk-audit --json  → must exit non-zero with UNENFORCED_EDGES
--   6. DROP DATABASE
--
-- Step 3 (executed on the disposable DB only):

DO $plant$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.chat_messages') IS NULL
     OR to_regclass('public.conversations') IS NULL
     OR to_regclass('public.documents') IS NULL THEN
    RAISE EXCEPTION 'fk_audit_zero_constraints plant: required domain tables missing';
  END IF;

  FOR r IN
    SELECT c.conname, rel.relname AS table_name
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.conname);
  END LOOP;
END
$plant$;

-- Post-condition:
--   SELECT count(*) FROM information_schema.table_constraints
--   WHERE constraint_schema='public' AND constraint_type='FOREIGN KEY';
--   → 0
