/**
 * Long Running Task Types
 *
 * Shared types for long-running background tasks across all Supabase Edge Functions.
 * Matches the long_running_tasks table schema from migration 20260304_create_long_running_tasks.sql
 *
 * @see supabase/migrations/20260304_create_long_running_tasks.sql
 */

// ============================================================
// Enums matching database types
// ============================================================

/**
 * Task type enumeration - all supported long-running operations
 * Matches database type: task_type
 */
export type TaskType =
  | 'deep-research'
  | 'assimilate'
  | 'shop'
  | 'research'
  | 'research-loop'
  | 'deep-research-teamwork'

/**
 * Task status enumeration - lifecycle states for all task types
 * Matches database type: task_status
 */
export type TaskStatus =
  | 'pending'     // Task created, waiting to start
  | 'queued'      // Task queued in background processor
  | 'loading'     // Task loading initial data/resources
  | 'running'     // Task actively processing
  | 'completed'   // Task finished successfully
  | 'error'       // Task failed with error
  | 'cancelled'   // Task cancelled by user

// ============================================================
// Task Configuration and Result Types
// ============================================================

/**
 * Task configuration - extensible JSON config for task-specific parameters
 * Each task type can define its own config structure
 */
export interface TaskConfig {
  [key: string]: unknown
}

/**
 * Task result - extensible JSON result for task-specific output
 * Each task type can define its own result structure
 */
export interface TaskResult {
  [key: string]: unknown
}

// ============================================================
// Database Record Types
// ============================================================

/**
 * Progress tracking information for a task
 */
export interface TaskProgress {
  current_step: number | null
  total_steps: number | null
  progress_message: string | null
}

/**
 * Error information for a failed task
 */
export interface TaskError {
  error_message: string | null
  error_details: TaskResult | null
}

/**
 * Task record matching the long_running_tasks table schema
 */
export interface TaskRecord {
  // Primary keys
  id: string
  conversation_id: string | null

  // Task identification
  task_type: TaskType
  status: TaskStatus

  // Task configuration
  config: TaskConfig | null

  // Task progress tracking
  current_step: number | null
  total_steps: number | null
  progress_message: string | null

  // Task results (when complete)
  result: TaskResult | null

  // Error tracking
  error_message: string | null
  error_details: TaskResult | null

  // Task lifecycle timestamps
  started_at: string | null
  completed_at: string | null

  // Metadata
  created_at: string
  updated_at: string
}

/**
 * Input for creating a new task record
 */
export interface CreateTaskInput {
  conversation_id: string | null
  task_type: TaskType
  config?: TaskConfig | null
}

/**
 * Input for updating task progress
 */
export interface UpdateProgressInput {
  current_step: number
  total_steps?: number | null
  progress_message?: string | null
}

/**
 * Input for completing a task
 */
export interface CompleteTaskInput {
  result?: TaskResult | null
}

/**
 * Input for failing a task
 */
export interface FailTaskInput {
  error_message: string
  error_details?: TaskResult | null
}

// ============================================================
// Error Types
// ============================================================

/**
 * Concurrency limit error - thrown when a task cannot start due to active tasks
 * HTTP status code: 429 (Too Many Requests)
 */
export class ConcurrencyLimitError extends Error {
  public readonly statusCode = 429
  public readonly taskType: TaskType
  public readonly conversationId: string

  constructor(
    taskType: TaskType,
    conversationId: string,
    message = `Cannot start ${taskType} task: an active task already exists for this conversation`
  ) {
    super(message)
    this.name = 'ConcurrencyLimitError'
    this.taskType = taskType
    this.conversationId = conversationId
  }
}

/**
 * Task not found error
 * HTTP status code: 404 (Not Found)
 */
export class TaskNotFoundError extends Error {
  public readonly statusCode = 404
  public readonly taskId: string

  constructor(taskId: string, message = `Task not found: ${taskId}`) {
    super(message)
    this.name = 'TaskNotFoundError'
    this.taskId = taskId
  }
}

/**
 * Invalid task transition error
 * HTTP status code: 400 (Bad Request)
 */
export class InvalidTaskTransitionError extends Error {
  public readonly statusCode = 400
  public readonly currentStatus: TaskStatus
  public readonly requestedStatus: TaskStatus

  constructor(
    currentStatus: TaskStatus,
    requestedStatus: TaskStatus,
    message = `Invalid task transition from ${currentStatus} to ${requestedStatus}`
  ) {
    super(message)
    this.name = 'InvalidTaskTransitionError'
    this.currentStatus = currentStatus
    this.requestedStatus = requestedStatus
  }
}

// ============================================================
// Task Executor Interface
// ============================================================

/**
 * Status update callback function for progress reporting
 * Called during task execution to report progress updates
 */
export interface StatusUpdateFn {
  (progress: TaskProgress): Promise<void> | void
}

/**
 * Task executor interface for implementing long-running tasks
 * All task executors must implement this interface
 */
export interface TaskExecutor<TConfig extends TaskConfig = TaskConfig, TResult extends TaskResult = TaskResult> {
  /**
   * Execute the task with the given configuration
   * @param config - Task configuration
   * @param updateStatus - Optional callback for progress updates
   * @returns Task result when complete
   * @throws Error if task fails
   */
  execute(
    config: TConfig,
    updateStatus?: StatusUpdateFn
  ): Promise<TResult>
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
// Utility Types
// ============================================================

/**
 * Extract config type for a specific task executor
 */
export type ConfigOf<T> = T extends TaskExecutor<infer C, any> ? C : never

/**
 * Extract result type for a specific task executor
 */
export type ResultOf<T> = T extends TaskExecutor<any, infer R> ? R : never
