/**
 * Long Running Task Manager
 *
 * Core task management functions for long-running background tasks.
 * Handles concurrency control, task lifecycle, and progress tracking.
 *
 * @module long-running-task/task-manager
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { log } from '../logging/index.ts'
import type {
  TaskType,
  TaskStatus,
  TaskRecord,
  TaskConfig,
  TaskResult,
  TaskProgress,
  ConcurrencyLimitError,
  TaskExecutor,
} from './types.ts'

// ============================================================
// Constants
// ============================================================

/**
 * Maximum number of tasks that can run concurrently across all conversations
 */
export const MAX_CONCURRENT_TASKS = 3

// ============================================================
// Types
// ============================================================

/**
 * Supabase client type for database operations
 */
export type SupabaseClient = ReturnType<typeof createClient>

/**
 * Task execution options
 */
export interface ExecuteTaskOptions {
  /** Maximum execution time in milliseconds (default: 5 minutes) */
  timeoutMs?: number
}

/**
 * Result of starting a task
 */
export interface StartTaskResult {
  success: boolean
  taskId?: string
  error?: string
}

// ============================================================
// Concurrency Control
// ============================================================

/**
 * Check if a conversation can start a new task of the given type
 * Calls the can_start_task RPC function
 *
 * @param supabase - Supabase client instance
 * @param conversationId - Conversation ID to check
 * @param taskType - Type of task to check
 * @returns True if task can be started, false otherwise
 *
 * @example
 * ```ts
 * const canStart = await checkConcurrencyLimit(supabase, conversationId, 'deep-research')
 * if (!canStart) {
 *   throw new ConcurrencyLimitError('deep-research', conversationId)
 * }
 * ```
 */
export async function checkConcurrencyLimit(
  supabase: SupabaseClient,
  conversationId: string,
  taskType: TaskType
): Promise<boolean> {
  const logger = log('task-manager')

  try {
    // @ts-ignore - Supabase RPC type inference issue
    const { data, error } = await (supabase as any).rpc('can_start_task', {
      p_conversation_id: conversationId,
      p_task_type: taskType,
    })

    if (error) {
      logger.error('Failed to check concurrency limit', {
        error: error.message,
        conversationId,
        taskType,
      })
      // Default to false on error to prevent overloading
      return false
    }

    const canStart = data === true
    logger.debug('Concurrency limit check', {
      conversationId,
      taskType,
      canStart,
    })

    return canStart
  } catch (err) {
    logger.error('Exception checking concurrency limit', {
      error: err,
      conversationId,
      taskType,
    })
    return false
  }
}

/**
 * Get the count of active tasks for a conversation
 *
 * @param supabase - Supabase client instance
 * @param conversationId - Conversation ID to check
 * @param taskType - Optional task type filter (counts all active tasks if not provided)
 * @returns Number of active tasks
 *
 * @example
 * ```ts
 * const activeCount = await getActiveTaskCount(supabase, conversationId)
 * const deepResearchCount = await getActiveTaskCount(supabase, conversationId, 'deep-research')
 * ```
 */
export async function getActiveTaskCount(
  supabase: SupabaseClient,
  conversationId: string,
  taskType?: TaskType
): Promise<number> {
  const logger = log('task-manager')

  try {
    let query = (supabase as any)
      .from('long_running_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .in('status', ['pending', 'queued', 'loading', 'running'] as TaskStatus[])

    if (taskType) {
      query = query.eq('task_type', taskType)
    }

    const { count, error } = await query

    if (error) {
      logger.error('Failed to get active task count', {
        error: error.message,
        conversationId,
        taskType,
      })
      return 0
    }

    logger.debug('Active task count', {
      conversationId,
      taskType,
      count,
    })

    return count || 0
  } catch (err) {
    logger.error('Exception getting active task count', {
      error: err,
      conversationId,
      taskType,
    })
    return 0
  }
}

/**
 * Start a new task with concurrency control
 * Creates the task record and checks if it can start
 *
 * @param supabase - Supabase client instance
 * @param conversationId - Conversation ID for the task
 * @param taskType - Type of task to create
 * @param config - Optional task configuration
 * @returns StartTaskResult with success status
 * @throws ConcurrencyLimitError if limit reached
 *
 * @example
 * ```ts
 * const result = await startTask(supabase, conversationId, 'deep-research', { topic: 'AI' })
 * if (!result.success) {
 *   // Handle error or return 429
 * }
 * ```
 */
export async function startTask(
  supabase: SupabaseClient,
  conversationId: string,
  taskType: TaskType,
  config?: TaskConfig | null
): Promise<StartTaskResult> {
  const logger = log('task-manager')

  try {
    // Check concurrency limit first
    const canStart = await checkConcurrencyLimit(supabase, conversationId, taskType)
    if (!canStart) {
      logger.warn('Concurrency limit reached', {
        conversationId,
        taskType,
      })
      return {
        success: false,
        error: `Cannot start ${taskType} task: an active task already exists for this conversation`,
      }
    }

    // Create the task
    // @ts-ignore - Supabase RPC type inference issue
    const { data, error } = await (supabase as any).rpc('create_long_running_task', {
      p_conversation_id: conversationId,
      p_task_type: taskType,
      p_config: config || null,
    })

    if (error) {
      logger.error('Failed to create task', {
        error: error.message,
        conversationId,
        taskType,
      })
      return {
        success: false,
        error: error.message,
      }
    }

    const taskId = data as string
    logger.info('Task created', {
      taskId,
      conversationId,
      taskType,
    })

    return {
      success: true,
      taskId,
    }
  } catch (err) {
    logger.error('Exception starting task', {
      error: err,
      conversationId,
      taskType,
    })
    return {
      success: false,
      error: String(err),
    }
  }
}

// ============================================================
// Task Lifecycle
// ============================================================

/**
 * Update task status with progress information
 *
 * @param supabase - Supabase client instance
 * @param taskId - Task ID to update
 * @param progress - Progress information to update
 * @returns True if update succeeded
 *
 * @example
 * ```ts
 * await updateTaskStatus(supabase, taskId, {
 *   current_step: 5,
 *   total_steps: 10,
 *   progress_message: 'Processing data...',
 * })
 * ```
 */
export async function updateTaskStatus(
  supabase: SupabaseClient,
  taskId: string,
  progress: TaskProgress
): Promise<boolean> {
  const logger = log('task-manager')

  try {
    // @ts-ignore - Supabase RPC type inference issue
    const { error } = await (supabase as any).rpc('update_task_progress', {
      p_task_id: taskId,
      p_current_step: progress.current_step,
      p_total_steps: progress.total_steps ?? null,
      p_progress_message: progress.progress_message ?? null,
    })

    if (error) {
      logger.error('Failed to update task progress', {
        error: error.message,
        taskId,
        progress,
      })
      return false
    }

    logger.debug('Task progress updated', {
      taskId,
      progress,
    })

    return true
  } catch (err) {
    logger.error('Exception updating task status', {
      error: err,
      taskId,
      progress,
    })
    return false
  }
}

/**
 * Mark a task as completed with optional result
 *
 * @param supabase - Supabase client instance
 * @param taskId - Task ID to complete
 * @param result - Optional task result data
 * @returns True if completion succeeded
 *
 * @example
 * ```ts
 * await completeTask(supabase, taskId, {
 *   findings: 'Research complete',
 *   coverage_score: 4.5,
 * })
 * ```
 */
export async function completeTask(
  supabase: SupabaseClient,
  taskId: string,
  result?: TaskResult | null
): Promise<boolean> {
  const logger = log('task-manager')

  try {
    // @ts-ignore - Supabase RPC type inference issue
    const { error } = await (supabase as any).rpc('complete_task', {
      p_task_id: taskId,
      p_result: result ?? null,
    })

    if (error) {
      logger.error('Failed to complete task', {
        error: error.message,
        taskId,
      })
      return false
    }

    logger.info('Task completed', {
      taskId,
    })

    return true
  } catch (err) {
    logger.error('Exception completing task', {
      error: err,
      taskId,
    })
    return false
  }
}

/**
 * Mark a task as failed with error information
 *
 * @param supabase - Supabase client instance
 * @param taskId - Task ID to fail
 * @param errorMessage - Error message
 * @param errorDetails - Optional additional error details
 * @returns True if update succeeded
 *
 * @example
 * ```ts
 * await failTask(supabase, taskId, 'API rate limit exceeded', {
 *   status: 429,
 *   retry_after: 60,
 * })
 * ```
 */
export async function failTask(
  supabase: SupabaseClient,
  taskId: string,
  errorMessage: string,
  errorDetails?: TaskResult | null
): Promise<boolean> {
  const logger = log('task-manager')

  try {
    // @ts-ignore - Supabase RPC type inference issue
    const { error } = await (supabase as any).rpc('fail_task', {
      p_task_id: taskId,
      p_error_message: errorMessage,
      p_error_details: errorDetails ?? null,
    })

    if (error) {
      logger.error('Failed to mark task as failed', {
        error: error.message,
        taskId,
        errorMessage,
      })
      return false
    }

    logger.error('Task failed', {
      taskId,
      errorMessage,
    })

    return true
  } catch (err) {
    logger.error('Exception failing task', {
      error: err,
      taskId,
      errorMessage,
    })
    return false
  }
}

/**
 * Cancel a task
 *
 * @param supabase - Supabase client instance
 * @param taskId - Task ID to cancel
 * @returns True if cancellation succeeded
 *
 * @example
 * ```ts
 * await cancelTask(supabase, taskId)
 * ```
 */
export async function cancelTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<boolean> {
  const logger = log('task-manager')

  try {
    // @ts-ignore - Supabase RPC type inference issue
    const { error } = await (supabase as any).rpc('cancel_task', {
      p_task_id: taskId,
    })

    if (error) {
      logger.error('Failed to cancel task', {
        error: error.message,
        taskId,
      })
      return false
    }

    logger.info('Task cancelled', {
      taskId,
    })

    return true
  } catch (err) {
    logger.error('Exception cancelling task', {
      error: err,
      taskId,
    })
    return false
  }
}

/**
 * Start a task (transition from pending/queued to running)
 *
 * @param supabase - Supabase client instance
 * @param taskId - Task ID to start
 * @returns True if start succeeded
 *
 * @example
 * ```ts
 * await startTaskExecution(supabase, taskId)
 * ```
 */
export async function startTaskExecution(
  supabase: SupabaseClient,
  taskId: string
): Promise<boolean> {
  const logger = log('task-manager')

  try {
    // @ts-ignore - Supabase RPC type inference issue
    const { error } = await (supabase as any).rpc('start_task', {
      p_task_id: taskId,
    })

    if (error) {
      logger.error('Failed to start task execution', {
        error: error.message,
        taskId,
      })
      return false
    }

    logger.info('Task execution started', {
      taskId,
    })

    return true
  } catch (err) {
    logger.error('Exception starting task execution', {
      error: err,
      taskId,
    })
    return false
  }
}

// ============================================================
// Task Execution
// ============================================================

/**
 * Execute a task in the background with proper lifecycle management
 * Handles starting, executing, progress updates, and completion/failure
 *
 * @param supabase - Supabase client instance
 * @param taskId - Task ID to execute
 * @param executor - Task executor implementation
 * @param config - Task configuration
 * @param options - Execution options (timeout, etc.)
 * @returns Task result or null if failed
 *
 * @example
 * ```ts
 * const result = await executeTaskInBackground(
 *   supabase,
 *   taskId,
 *   deepResearchExecutor,
 *   { topic: 'Quantum computing' },
 *   { timeoutMs: 300000 }
 * )
 * ```
 */
export async function executeTaskInBackground<TConfig extends TaskConfig = TaskConfig, TResult extends TaskResult = TaskResult>(
  supabase: SupabaseClient,
  taskId: string,
  executor: TaskExecutor<TConfig, TResult>,
  config: TConfig,
  options: ExecuteTaskOptions = {}
): Promise<TResult | null> {
  const logger = log('task-manager')
  const { timeoutMs = 300000 } = options // Default 5 minutes

  logger.info('Starting background task execution', {
    taskId,
    executor: executor.constructor.name,
    timeoutMs,
  })

  try {
    // Start the task
    const started = await startTaskExecution(supabase, taskId)
    if (!started) {
      await failTask(supabase, taskId, 'Failed to start task execution')
      return null
    }

    // Create status update callback
    const updateStatus: (progress: TaskProgress) => Promise<void> = async (progress) => {
      await updateTaskStatus(supabase, taskId, progress)
    }

    // Execute with timeout
    const result = await Promise.race([
      executor.execute(config, updateStatus),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Task execution timeout')), timeoutMs)
      ),
    ])

    // Complete the task
    const completed = await completeTask(supabase, taskId, result)
    if (!completed) {
      logger.warn('Failed to mark task as completed', { taskId })
    }

    logger.info('Task execution completed successfully', {
      taskId,
    })

    return result
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error('Task execution failed', {
      error: err,
      taskId,
      errorMessage,
    })

    await failTask(supabase, taskId, errorMessage)
    return null
  }
}

// ============================================================
// Task Queries
// ============================================================

/**
 * Get a task by ID
 *
 * @param supabase - Supabase client instance
 * @param taskId - Task ID to fetch
 * @returns Task record or null if not found
 *
 * @example
 * ```ts
 * const task = await getTask(supabase, taskId)
 * if (task) {
 *   console.log(task.status, task.progress_message)
 * }
 * ```
 */
export async function getTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<TaskRecord | null> {
  const logger = log('task-manager')

  try {
    // @ts-ignore - Supabase type inference issue
    const { data, error } = await (supabase as any)
      .from('long_running_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      logger.error('Failed to get task', {
        error: error.message,
        taskId,
      })
      return null
    }

    return data as TaskRecord
  } catch (err) {
    logger.error('Exception getting task', {
      error: err,
      taskId,
    })
    return null
  }
}

/**
 * Get all active tasks for a conversation
 *
 * @param supabase - Supabase client instance
 * @param conversationId - Conversation ID
 * @param taskType - Optional task type filter
 * @returns Array of active task records
 *
 * @example
 * ```ts
 * const activeTasks = await getActiveTasks(supabase, conversationId)
 * const deepResearchTasks = await getActiveTasks(supabase, conversationId, 'deep-research')
 * ```
 */
export async function getActiveTasks(
  supabase: SupabaseClient,
  conversationId: string,
  taskType?: TaskType
): Promise<TaskRecord[]> {
  const logger = log('task-manager')

  try {
    let query = (supabase as any)
      .from('long_running_tasks')
      .select('*')
      .eq('conversation_id', conversationId)
      .in('status', ['pending', 'queued', 'loading', 'running'] as TaskStatus[])
      .order('created_at', { ascending: false })

    if (taskType) {
      query = query.eq('task_type', taskType)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to get active tasks', {
        error: error.message,
        conversationId,
        taskType,
      })
      return []
    }

    return (data || []) as TaskRecord[]
  } catch (err) {
    logger.error('Exception getting active tasks', {
      error: err,
      conversationId,
      taskType,
    })
    return []
  }
}
