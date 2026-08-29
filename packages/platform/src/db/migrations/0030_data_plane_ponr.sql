-- CAP-CUT-01 / D07-04 / UC-SYNC-04 / T-SYNC-014
-- data_plane_ponr: append-only singleton ledger for the data-plane point of no return
-- (first accepted Postgres production write + live Convex escape-hatch snapshot).
-- Runtime CREATE TABLE paths are prohibited; holo db:migrate is the sole bootstrap.
-- Dual-layer immutability: (a) app role SELECT+INSERT only; (b) BEFORE UPDATE/DELETE
-- trigger raises PONR_IMMUTABLE (P0001) so even the table owner cannot mutate.

CREATE TABLE IF NOT EXISTS "data_plane_ponr" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "fence_lifted_at" timestamp with time zone NOT NULL,
  "write_surface" text NOT NULL,
  "write_table" text NOT NULL,
  "write_row_id" text NOT NULL,
  "write_row_digest_sha256" text NOT NULL,
  "write_committed_at" timestamp with time zone NOT NULL,
  "base_url" text NOT NULL,
  "operator" text NOT NULL,
  "run_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "export_watermark_ms" bigint NOT NULL,
  "convex_fence_audit_id" text NOT NULL,
  "convex_fence_env_value" text NOT NULL,
  "convex_documents_total" bigint NOT NULL,
  "convex_newest_document_creation_time" bigint NOT NULL,
  "convex_accepted_writes_since_watermark" bigint NOT NULL,
  "convex_rejected_writes_since_watermark" bigint NOT NULL,
  CONSTRAINT "data_plane_ponr_digest_hex_check"
    CHECK ("write_row_digest_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "data_plane_ponr_accepted_zero_check"
    CHECK ("convex_accepted_writes_since_watermark" = 0)
);
--> statement-breakpoint

-- At most one PONR row may ever exist (singleton expression unique index).
CREATE UNIQUE INDEX IF NOT EXISTS "data_plane_ponr_singleton_uidx"
  ON "data_plane_ponr" ((true));
--> statement-breakpoint

-- Safe replay key (0004 beliefs idempotency-index precedent).
CREATE UNIQUE INDEX IF NOT EXISTS "data_plane_ponr_idempotency_key_uidx"
  ON "data_plane_ponr" ("idempotency_key");
--> statement-breakpoint

-- ── Immutability layer 1: grants (holocron_app SELECT+INSERT only) ───────────
REVOKE ALL ON TABLE "data_plane_ponr" FROM PUBLIC;
--> statement-breakpoint

DO $grants_app$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'REVOKE ALL ON TABLE data_plane_ponr FROM holocron_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE data_plane_ponr TO holocron_app';
  END IF;
END
$grants_app$;
--> statement-breakpoint

-- ── Immutability layer 2: trigger (binds owner; grants cannot) ───────────────
CREATE OR REPLACE FUNCTION public.reject_data_plane_ponr_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'PONR_IMMUTABLE: data_plane_ponr is append-only (UC-SYNC-04 point of no return)'
    USING ERRCODE = 'P0001';
END;
$function$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS data_plane_ponr_reject_mutation ON public.data_plane_ponr;
--> statement-breakpoint

CREATE TRIGGER data_plane_ponr_reject_mutation
  BEFORE UPDATE OR DELETE ON public.data_plane_ponr
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_data_plane_ponr_mutation();
--> statement-breakpoint

-- Function grants: no PUBLIC execute of accidental side-channels (0004 style).
REVOKE ALL ON FUNCTION public.reject_data_plane_ponr_mutation() FROM PUBLIC;
--> statement-breakpoint

DO $fn_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reject_data_plane_ponr_mutation() TO holocron_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reject_data_plane_ponr_mutation() TO holocron_owner';
  END IF;
END
$fn_grants$;
