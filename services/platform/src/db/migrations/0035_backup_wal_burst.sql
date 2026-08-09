-- S31-01: migrate-owned backup_wal_burst (WAL write-burst probe table).
-- Runtime CREATE TABLE in wal-archive.ts is prohibited after this migration.

CREATE TABLE IF NOT EXISTS "backup_wal_burst" (
  "id" bigserial PRIMARY KEY,
  "payload" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE backup_wal_burst TO holocron_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE backup_wal_burst_id_seq TO holocron_app';
  END IF;
END
$grants$;
