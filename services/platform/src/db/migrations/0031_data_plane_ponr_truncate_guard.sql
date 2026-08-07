-- REDHAT-FIX-RH-S30-01 / UC-SYNC-04 / T-SYNC-014
-- PostgreSQL row-level BEFORE UPDATE OR DELETE triggers do NOT fire on TRUNCATE.
-- Add a BEFORE TRUNCATE FOR EACH STATEMENT trigger that reuses the same
-- reject_data_plane_ponr_mutation() function so TRUNCATE fails closed with
-- PONR_IMMUTABLE (P0001). Owner cleanup in tests must DISABLE TRIGGER first.

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

DROP TRIGGER IF EXISTS data_plane_ponr_reject_truncate ON public.data_plane_ponr;
--> statement-breakpoint

CREATE TRIGGER data_plane_ponr_reject_truncate
  BEFORE TRUNCATE ON public.data_plane_ponr
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.reject_data_plane_ponr_mutation();
--> statement-breakpoint

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
