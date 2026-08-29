-- ledger-1: immutability + canonical-corpus readiness for UC-DATA-02
--
-- GAP-1 (immutability): beliefs_current_idx is a non-unique partial btree; it does
-- not enforce exactly one open belief (tx_to IS NULL) per claim.
CREATE UNIQUE INDEX IF NOT EXISTS "beliefs_one_open_per_claim_uidx"
  ON "beliefs" ("claim_id")
  WHERE "tx_to" IS NULL;
--> statement-breakpoint
-- GAP-2 (canonical corpus / AC-4): passages.source_id is text with no FK while
-- sources.id is uuid. Align type and add referential integrity so the corpus
-- cannot split into orphan passages.
ALTER TABLE "passages"
  ALTER COLUMN "source_id" TYPE uuid USING "source_id"::uuid;
--> statement-breakpoint
ALTER TABLE "passages"
  ADD CONSTRAINT "passages_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("id");
