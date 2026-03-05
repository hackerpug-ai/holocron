/**
 * Generic hook for monitoring long-running background tasks
 *
 * Provides a unified interface for:
 * - Real-time task progress updates via Supabase Realtime
 * - Task state management with React Query caching
 * - Callbacks for task completion, errors, and progress
 *
 * @important Tasks are ONLY started server-side (e.g., via slash commands).
 * This hook is for monitoring existing tasks only.
 *
 * @example Deep Research
 * ```tsx
 * const { task, isLoading, isRunning, error } = useLongRunningTask({
 *   taskType: 'deep-research',
 *   conversationId,
 *   onSuccess: (result) => console.log('Research complete:', result),
 *   onError: (error) => console.error('Research failed:', error),
 * })
 * ```
 *
 * @template TResult - Task result type
 *
 * @see US-057 - Deep Research Iteration Streaming
 * @see supabase/functions/_shared/long-running-task/types.ts
 */

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger-client'
import type {
  TaskRecord,
  TaskResult,
  TaskStatus,
  TaskType,
} from 'supabase/functions/_shared/long-running-task/types'
import { isActiveStatus } from 'supabase/functions/_shared/long-running-task/types'

// ============================================================
// Types
// ============================================================

/**
 * Configuration options for useLongRunningTask hook
 */
export interface UseLongRunningTaskOptions<
  TResult extends TaskResult = TaskResult,
> {
  /** Task type identifier (must match database task_type enum) */
  taskType: TaskType
  /** Conversation ID for task scoping */
  conversationId: string | null
  /** Optional callback when task completes successfully */
  onSuccess?: (result: TResult) => void
  /** Optional callback when task fails */
  onError?: (error: Error) => void
  /** Optional callback for task progress updates */
  onProgress?: (status: TaskStatus, message: string | null) => void
}

/**
 * Return type for useLongRunningTask hook
 */
export interface UseLongRunningTaskReturn {
  /** Current task record (null if no active task) */
  task: TaskRecord | null
  /** True while fetching initial task state */
  isLoading: boolean
  /** True while task is actively running (queued, loading, running) */
  isRunning: boolean
  /** Error from monitoring task */
  error: Error | null
  /** Refetch the current task state */
  refetch: () => void
}

// ============================================================
// Query Keys
// ============================================================

/**
 * Query key factory for long-running tasks
 */
function getTaskQueryKey(conversationId: string | null, taskType: TaskType) {
  return ['long-running-task', conversationId, taskType] as const
}

// ============================================================
// Fetcher Functions
// ============================================================

/**
 * Fetch the current active task for a conversation and task type
 */
async function fetchActiveTask(
  conversationId: string | null,
  taskType: TaskType
): Promise<TaskRecord | null> {
  if (!conversationId) {
    return null
  }

  const { data, error } = await supabase
    .from('long_running_tasks')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('task_type', taskType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch task: ${error.message}`)
  }

  return data as TaskRecord | null
}

// ============================================================
// Hook Implementation
// ============================================================

/**
 * Generic hook for monitoring long-running background tasks
 *
 * @param options - Hook configuration options
 * @returns Task state and control functions
 */
export function useLongRunningTask<
  TResult extends TaskResult = TaskResult,
>(
  options: UseLongRunningTaskOptions<TResult>
): UseLongRunningTaskReturn {
  const { taskType, conversationId, onSuccess, onError, onProgress } = options

  // Track if we've already called onSuccess for the current task
  const successCalledRef = useRef<Set<string>>(new Set())

  // Query for the current active task
  const {
    data: task,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: getTaskQueryKey(conversationId, taskType),
    queryFn: () => fetchActiveTask(conversationId, taskType),
    enabled: !!conversationId,
    staleTime: 0, // Always refetch for real-time updates
    // TanStack Query v5: function receives Query object, access .state.data
    refetchInterval: (query) => {
      const taskData = query.state.data as TaskRecord | null
      if (!taskData) return false
      return isActiveStatus(taskData.status) ? 2000 : false
    },
  })

  // Compute isRunning based on task status
  const isRunning = task ? isActiveStatus(task.status) : false

  // Handle task completion and callbacks
  useEffect(() => {
    if (!task) return

    const taskId = task.id

    // Call onProgress for any status change
    if (onProgress) {
      onProgress(task.status, task.progress_message)
    }

    // Handle successful completion
    if (task.status === 'completed' && task.result) {
      // Only call onSuccess once per task
      if (!successCalledRef.current.has(taskId)) {
        successCalledRef.current.add(taskId)
        onSuccess?.(task.result as TResult)
        log('useLongRunningTask').info('Task completed successfully', {
          taskId,
          result: task.result,
        })
      }
    }

    // Handle error completion
    if (task.status === 'error') {
      const errorMessage = task.error_message ?? 'Unknown error'
      const error = new Error(errorMessage)
      // Only call onError once per task
      if (!successCalledRef.current.has(taskId)) {
        successCalledRef.current.add(taskId)
        onError?.(error)
        log('useLongRunningTask').error('Task failed', { taskId, errorMessage })
      }
    }

    // Clean up successCalledRef when task changes to a new one
    return () => {
      if (task && !successCalledRef.current.has(task.id)) {
        // Keep entries for current task, clean up old ones
        const currentTaskIds = task ? [task.id] : []
        successCalledRef.current = new Set(
          Array.from(successCalledRef.current).filter((id) =>
            currentTaskIds.includes(id)
          )
        )
      }
    }
  }, [task, onSuccess, onError, onProgress])

  // Set up Supabase Realtime subscription for task updates
  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`long-running-task-${conversationId}-${taskType}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all updates (INSERT, UPDATE)
          schema: 'public',
          table: 'long_running_tasks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const updatedTask = payload.new as TaskRecord

          // Only process updates for our task type
          if (updatedTask.task_type !== taskType) return

          log('useLongRunningTask').info('Task update received via Realtime', {
            taskId: updatedTask.id,
            status: updatedTask.status,
            progressMessage: updatedTask.progress_message,
          })

          // Invalidate query to trigger refetch
          await refetch()
        }
      )
      .subscribe()

    // Cleanup: unsubscribe when conversation changes or component unmounts
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, taskType, refetch])

  return {
    task: task ?? null,
    isLoading,
    isRunning,
    error: queryError ?? null,
    refetch,
  }
}

// ============================================================
// Utility Type Guards (re-exported for convenience)
// ============================================================

export { isActiveStatus }
