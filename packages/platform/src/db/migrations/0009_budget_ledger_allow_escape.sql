-- infer-2 / infer-5 AC-2: audit allow_escape on pre-check + escape ledger rows.
-- Pre-check inserts (check_type='pre-check') store role + allow_escape for review.

ALTER TABLE "budget_ledger"
  ADD COLUMN IF NOT EXISTS "allow_escape" boolean;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "budget_ledger_check_type_idx"
  ON "budget_ledger" ("check_type");
--> statement-breakpoint

-- Product role already has INSERT on budget_ledger (0008); re-assert for safety.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE budget_ledger TO holocron_app';
  END IF;
END
$grants$;
