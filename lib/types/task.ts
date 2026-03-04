/**
 * Long Running Task Type Definitions
 *
 * Client-side TypeScript types for long-running background tasks.
 * Matches the database schema from migration 20260304_create_long_running_tasks.sql
 * Matches server-side types from supabase/functions/_shared/long-running-task/types.ts
 *
 * @see supabase/migrations/20260304_create_long_running_tasks.sql
 * @see supabase/functions/_shared/long-running-task/types.ts
 */

// ============================================================
// ENUM Types
// ============================================================

/** Task type enumeration - all supported long-running operations */
export type TaskType =
  | 'deep-research'
  | 'assimilate'
  | 'shop'
  | 'research'
  | 'research-loop'
  | 'deep-research-teamwork'

/** Task status enumeration - lifecycle states for all task types */
export type TaskStatus =
  | 'pending'     // Task created, waiting to start
  | 'queued'      // Task queued in background processor
  | 'loading'     // Task loading initial data/resources
  | 'running'     // Task actively processing
  | 'completed'   // Task finished successfully
  | 'error'       // Task failed with error
  | 'cancelled'   // Task cancelled by user

// ============================================================
// Database Row Types (snake_case, string dates)
// ============================================================

/**
 * Raw row type from Supabase long_running_tasks table
 * Uses snake_case naming and string timestamps as returned from database
 */
export interface TaskRow {
  // Primary keys
  id: string
  conversation_id: string | null

  // Task identification
  task_type: TaskType
  status: TaskStatus

  // Task configuration
  config: Record<string, unknown> | null

  // Task progress tracking
  current_step: number | null
  total_steps: number | null
  progress_message: string | null

  // Task results (when complete)
  result: Record<string, unknown> | null

  // Error tracking
  error_message: string | null
  error_details: Record<string, unknown> | null

  // Task lifecycle timestamps
  started_at: string | null
  completed_at: string | null

  // Metadata
  created_at: string
  updated_at: string
}

// ============================================================
// App-Level Types (camelCase, Date objects)
// ============================================================

/**
 * App-level Task type used throughout the UI
 * Transformed from TaskRow with camelCase properties and Date objects
 */
export interface Task {
  // Primary keys
  id: string
  conversationId: string | null

  // Task identification
  taskType: TaskType
  status: TaskStatus

  // Task configuration
  config: Record<string, unknown> | null

  // Task progress tracking
  currentStep: number | null
  totalSteps: number | null
  progressMessage: string | null

  // Task results (when complete)
  result: Record<string, unknown> | null

  // Error tracking
  errorMessage: string | null
  errorDetails: Record<string, unknown> | null

  // Task lifecycle timestamps
  startedAt: Date | null
  completedAt: Date | null

  // Metadata
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Realtime Subscription Types
// ============================================================

/**
 * Realtime subscription event types for task updates
 */
export type TaskSubscriptionEvent = 'INSERT' | 'UPDATE' | 'DELETE'

/**
 * Realtime subscription payload for task changes
 */
export interface TaskSubscription {
  eventType: TaskSubscriptionEvent
  new: Task | null
  old: Task | null
}

// ============================================================
// Helper Types
// ============================================================

/** Progress tracking for active tasks */
export interface TaskProgress {
  currentStep: number | null
  totalSteps: number | null
  progressMessage: string | null
}

/** Error information for failed tasks */
export interface TaskError {
  errorMessage: string | null
  errorDetails: Record<string, unknown> | null
}

/** Task configuration input */
export interface TaskConfigInput {
  [key: string]: unknown
}

/** Task result output */
export interface TaskResultOutput {
  [key: string]: unknown
}

// ============================================================
// Type Guards
// ============================================================

/**
 * Check if a status is a terminal state (completed, error, cancelled)
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'error' || status === 'cancelled'
}

/**
 * Check if a status is an active state (queued, loading, running)
 */
export function isActiveStatus(status: TaskStatus): boolean {
  return status === 'queued' || status === 'loading' || status === 'running'
}

/**
 * Check if a task can transition from current to target status
 */
export function isValidTransition(currentStatus: TaskStatus, targetStatus: TaskStatus): boolean {
  // Terminal states cannot transition
  if (isTerminalStatus(currentStatus)) {
    return false
  }

  // Define valid transitions
  const transitions: Record<TaskStatus, TaskStatus[]> = {
    'pending': ['queued', 'loading', 'running', 'error', 'cancelled'],
    'queued': ['loading', 'running', 'error', 'cancelled'],
    'loading': ['running', 'error', 'cancelled'],
    'running': ['completed', 'error', 'cancelled'],
    'completed': [], // Terminal
    'error': [],     // Terminal
    'cancelled': [], // Terminal
  }

  return transitions[currentStatus]?.includes(targetStatus) ?? false
}

// ============================================================
// Transformation Utilities
// ============================================================

/**
 * Transform a database TaskRow to app-level Task
 * Converts snake_case to camelCase and string dates to Date objects
 */
export function taskRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    taskType: row.task_type,
    status: row.status,
    config: row.config,
    currentStep: row.current_step,
    totalSteps: row.total_steps,
    progressMessage: row.progress_message,
    result: row.result,
    errorMessage: row.error_message,
    errorDetails: row.error_details,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * Transform app-level Task to database TaskRow
 * Converts camelCase to snake_case and Date objects to string dates
 */
export function taskToTaskRow(task: Task): TaskRow {
  return {
    id: task.id,
    conversation_id: task.conversationId,
    task_type: task.taskType,
    status: task.status,
    config: task.config,
    current_step: task.currentStep,
    total_steps: task.totalSteps,
    progress_message: task.progressMessage,
    result: task.result,
    error_message: task.errorMessage,
    error_details: task.errorDetails,
    started_at: task.startedAt?.toISOString() ?? null,
    completed_at: task.completedAt?.toISOString() ?? null,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
  }
}

/**
 * Calculate progress percentage for a task
 * Returns 0-100, or null if progress cannot be determined
 */
export function calculateTaskProgress(task: Task): number | null {
  if (task.currentStep === null || task.totalSteps === null) {
    return null
  }
  if (task.totalSteps === 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (task.currentStep / task.totalSteps) * 100))
}
