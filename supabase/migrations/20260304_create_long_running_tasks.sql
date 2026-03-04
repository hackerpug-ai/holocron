-- Migration: Create long_running_tasks table for background job tracking
-- Description: Unified task tracking table for long-running operations including
--              deep-research, assimilate, shop, research, research-loop, and deep-research-teamwork
-- Task: US-XXX - Create long_running_tasks table migration

-- ============================================================
-- Create ENUM types for task type and status (if not exists)
-- ============================================================

DO $$
BEGIN
  -- Create task_type enum if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM (
      'deep-research',
      'assimilate',
      'shop',
      'research',
      'research-loop',
      'deep-research-teamwork'
    );
  END IF;

  -- Create task_status enum if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM (
      'pending',     -- Task created, waiting to start
      'queued',      -- Task queued in background processor
      'loading',     -- Task loading initial data/resources
      'running',     -- Task actively processing
      'completed',   -- Task finished successfully
      'error',       -- Task failed with error
      'cancelled'    -- Task cancelled by user
    );
  END IF;
END
$$;

-- ============================================================
-- Create long_running_tasks table (if not exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS long_running_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

  -- Task identification
  task_type task_type NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',

  -- Task configuration
  config JSONB,

  -- Task progress tracking
  current_step INTEGER,
  total_steps INTEGER,
  progress_message TEXT,

  -- Task results (when complete)
  result JSONB,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  -- Task lifecycle timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- Indexes for long_running_tasks (create if not exists)
-- ============================================================

-- Composite index for user tasks by status (common query pattern)
-- Optimizes: "Get all running/pending tasks for a conversation"
CREATE INDEX IF NOT EXISTS idx_long_running_tasks_user_status
  ON long_running_tasks(conversation_id, status)
  WHERE status IN ('pending', 'queued', 'loading', 'running');

-- Composite index for task type and status
-- Optimizes: "Get all tasks of a specific type by status"
CREATE INDEX IF NOT EXISTS idx_long_running_tasks_type_status
  ON long_running_tasks(task_type, status)
  WHERE status IN ('pending', 'queued', 'loading', 'running');

-- Index for conversation lookups
-- Optimizes: "Get all tasks for a conversation"
CREATE INDEX IF NOT EXISTS idx_long_running_tasks_conversation
  ON long_running_tasks(conversation_id);

-- Index for time-based queries (most recent first)
-- Optimizes: "Get recent tasks", "Get tasks created after X"
CREATE INDEX IF NOT EXISTS idx_long_running_tasks_created_at
  ON long_running_tasks(created_at DESC);

-- Partial index for stuck task detection
-- Optimizes: "Find tasks stuck in running state"
CREATE INDEX IF NOT EXISTS idx_long_running_tasks_stuck
  ON long_running_tasks(updated_at)
  WHERE status = 'running';

-- ============================================================
-- RPC Functions for task management
-- ============================================================

-- Function: Check if a new task can be started (concurrency control)
CREATE OR REPLACE FUNCTION can_start_task(
  p_conversation_id UUID,
  p_task_type task_type
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_count INTEGER;
BEGIN
  -- Count active tasks for this conversation and task type
  SELECT COUNT(*) INTO v_active_count
  FROM long_running_tasks
  WHERE conversation_id = p_conversation_id
    AND task_type = p_task_type
    AND status IN ('pending', 'queued', 'loading', 'running');

  -- Only allow one active task per type per conversation
  RETURN v_active_count = 0;
END;
$$;

-- Function: Create a new long-running task
CREATE OR REPLACE FUNCTION create_long_running_task(
  p_conversation_id UUID,
  p_task_type task_type,
  p_config JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id UUID;
BEGIN
  -- Create the task
  INSERT INTO long_running_tasks (
    conversation_id,
    task_type,
    status,
    config
  ) VALUES (
    p_conversation_id,
    p_task_type,
    'pending',
    p_config
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

-- Function: Update task progress
CREATE OR REPLACE FUNCTION update_task_progress(
  p_task_id UUID,
  p_current_step INTEGER,
  p_total_steps INTEGER DEFAULT NULL,
  p_progress_message TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update task progress
  UPDATE long_running_tasks
  SET
    current_step = p_current_step,
    total_steps = COALESCE(p_total_steps, total_steps),
    progress_message = p_progress_message,
    updated_at = NOW()
  WHERE id = p_task_id;

  RETURN FOUND;
END;
$$;

-- Function: Complete a task
CREATE OR REPLACE FUNCTION complete_task(
  p_task_id UUID,
  p_result JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark task as completed
  UPDATE long_running_tasks
  SET
    status = 'completed',
    result = p_result,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_task_id;

  RETURN FOUND;
END;
$$;

-- Function: Fail a task
CREATE OR REPLACE FUNCTION fail_task(
  p_task_id UUID,
  p_error_message TEXT,
  p_error_details JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark task as failed
  UPDATE long_running_tasks
  SET
    status = 'error',
    error_message = p_error_message,
    error_details = p_error_details,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_task_id;

  RETURN FOUND;
END;
$$;

-- Function: Cancel a task
CREATE OR REPLACE FUNCTION cancel_task(
  p_task_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark task as cancelled
  UPDATE long_running_tasks
  SET
    status = 'cancelled',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_task_id;

  RETURN FOUND;
END;
$$;

-- Function: Start task execution (transition to running)
CREATE OR REPLACE FUNCTION start_task(
  p_task_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Transition task to running state
  UPDATE long_running_tasks
  SET
    status = 'running',
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
  WHERE id = p_task_id
    AND status IN ('pending', 'queued');

  RETURN FOUND;
END;
$$;
