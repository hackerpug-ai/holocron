-- REDHAT-FIX-RH-S30-03 / UC-SYNC-04 / T-SYNC-013
-- Production-bound post-export accepted-write oracle.
-- Authoritative ledger for accepted production writes after the export watermark.
-- Written from real production write surfaces (Hono POST /api/documents, MCP
-- store_document) when an export watermark is active. File mirrors under .tmp
-- are optional operator reports only — never the sole success oracle.

CREATE TABLE IF NOT EXISTS "post_export_write_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "committed_at_ms" bigint NOT NULL,
  "surface" text NOT NULL,
  "write_row_id" text,
  "export_watermark_ms" bigint NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "post_export_write_audit_wm_committed_idx"
  ON "post_export_write_audit" ("export_watermark_ms", "committed_at_ms");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "post_export_write_audit_committed_idx"
  ON "post_export_write_audit" ("committed_at_ms");
--> statement-breakpoint

REVOKE ALL ON TABLE "post_export_write_audit" FROM PUBLIC;
--> statement-breakpoint

DO $grants_app$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'REVOKE ALL ON TABLE post_export_write_audit FROM holocron_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE post_export_write_audit TO holocron_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_owner') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE post_export_write_audit TO holocron_owner';
  END IF;
END
$grants_app$;
