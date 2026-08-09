-- Sprint 15 mission-2: allow persisted suspended run status for lease-expired recovery visibility.

DO $mission_runs_status_check$
DECLARE
  existing_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO existing_definition
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'mission_runs'
    AND c.conname = 'mission_runs_status_check';

  IF existing_definition IS NULL THEN
    EXECUTE '
      ALTER TABLE public.mission_runs
      ADD CONSTRAINT mission_runs_status_check
      CHECK (status IN (''pending'', ''running'', ''suspended'', ''completed'', ''failed'', ''blocked'', ''budget_exceeded''))
    ';
  ELSIF position('suspended' IN existing_definition) = 0 THEN
    EXECUTE 'ALTER TABLE public.mission_runs DROP CONSTRAINT mission_runs_status_check';
    EXECUTE '
      ALTER TABLE public.mission_runs
      ADD CONSTRAINT mission_runs_status_check
      CHECK (status IN (''pending'', ''running'', ''suspended'', ''completed'', ''failed'', ''blocked'', ''budget_exceeded''))
    ';
  END IF;
END
$mission_runs_status_check$;
