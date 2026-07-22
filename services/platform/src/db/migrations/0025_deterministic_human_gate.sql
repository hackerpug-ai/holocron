-- Sprint 23 gate-1: database-enforced human gate invariants.
-- CHECK / SECURITY DEFINER enforcement is intentionally in Postgres, not HTTP handlers.

CREATE UNIQUE INDEX IF NOT EXISTS mission_runs_active_subject_wip_one_uidx
  ON public.mission_runs (template_key, goal)
  WHERE status IN ('pending', 'running', 'suspended')
    AND goal IS NOT NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.enforce_mission_human_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_citation text := NULLIF(btrim(COALESCE(NEW.payload_json->>'citation', '')), '');
BEGIN
  IF NEW.verdict = 'kill' AND (
    v_citation IS NULL OR
    NOT EXISTS (
      SELECT 1
      FROM public.beliefs AS belief
      WHERE belief.id::text = v_citation
        AND belief.tx_to IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'UNCITED_KILL_REJECTED: kill verdict requires a current belief citation'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.verdict = 'advance'
    AND NEW.payload_json->>'targetStatus' = 'validated'
    AND NOT EXISTS (
      SELECT 1
      FROM public.mission_stage_runs AS stage_run
      WHERE stage_run.run_id = NEW.run_id
        AND stage_run.stage_kind = 'research.plan@1'
        AND stage_run.status = 'committed'
    )
  THEN
    RAISE EXCEPTION 'PROBE_REQUIRED_FOR_VALIDATED: validated advance requires a committed research.plan@1 probe'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS mission_verdicts_human_gate_before_insert ON public.mission_verdicts;
--> statement-breakpoint

CREATE TRIGGER mission_verdicts_human_gate_before_insert
  BEFORE INSERT ON public.mission_verdicts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_mission_human_gate();
