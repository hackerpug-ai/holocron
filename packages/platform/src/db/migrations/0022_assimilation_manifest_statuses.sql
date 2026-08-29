-- Sprint 19: preserve the frozen assimilation manifest state machine.
ALTER TABLE assimilation_sessions
  DROP CONSTRAINT IF EXISTS assimilation_sessions_status_check;
ALTER TABLE assimilation_sessions
  ADD CONSTRAINT assimilation_sessions_status_check
  CHECK (status IN ('pending', 'planning', 'pending_approval', 'rejected', 'running', 'in_progress', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'));
