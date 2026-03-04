/**
 * Generic hook for managing long-running background tasks
 *
 * Provides a unified interface for:
 * - Starting long-running tasks via Supabase Edge Functions
 * - Real-time task progress updates via Supabase Realtime
 * - Task state management with React Query caching
 *
 * @example Deep Research
 * ```tsx
 * const { startTask, task, isLoading, isRunning, error } = useLongRunningTask({
 *   taskType: 'deep-research',
 *   functionName: 'deep-research-start',
 *   conversationId,
 *   onSuccess: (result) => console.log('Research complete:', result),
 *   onError: (error) => console.error('Research failed:', error),
 * })
 * ```
 *
 * @template TConfig - Task configuration type
 * @template TResult - Task result type
 *
 * @see US-057 - Deep Research Iteration Streaming
 * @see supabase/functions/_shared/long-running-task/types.ts
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger-client'
import type {
  TaskRecord,
  TaskConfig,
  TaskResult,
  TaskStatus,
  TaskType,
} from 'supabase/functions/_shared/long-running-task/types'
import { isActiveStatus, isTerminalStatus } from 'supabase/functions/_shared/long-running-task/types'

// ============================================================
// Types
// ============================================================

/**
 * Configuration options for useLongRunningTask hook
 */
export interface UseLongRunningTaskOptions<
  TConfig extends TaskConfig = TaskConfig,
  TResult extends TaskResult = TaskResult,
> {
  /** Task type identifier (must match database task_type enum) */
  taskType: TaskType
  /** Name of the Supabase Edge Function to call (without 'functions/v1/' prefix) */
  functionName: string
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
export interface UseLongRunningTaskReturn<
  TConfig extends TaskConfig = TaskConfig,
  TResult extends TaskResult = TaskResult,
> {
  /** Start a new task with the given configuration */
  startTask: (config: TConfig) => Promise<void>
  /** Current task record (null if no active task) */
  task: TaskRecord | null
  /** True while fetching initial task state */
  isLoading: boolean
  /** True while task is actively running (queued, loading, running) */
  isRunning: boolean
  /** Error from starting or monitoring task */
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
 * Generic hook for managing long-running background tasks
 *
 * @param options - Hook configuration options
 * @returns Task state and control functions
 */
export function useLongRunningTask<
  TConfig extends TaskConfig = TaskConfig,
  TResult extends TaskResult = TaskResult,
>(
  options: UseLongRunningTaskOptions<TConfig, TResult>
): UseLongRunningTaskReturn<TConfig, TResult> {
  const {
    taskType,
    functionName,
    conversationId,
    onSuccess,
    onError,
    onProgress,
  } = options

  const queryClient = useQueryClient()
  const [startError, setStartError] = useState<Error | null>(null)
  const [isStarting, setIsStarting] = useState(false)

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

  // Combined error from query and start operation
  const error = startError ?? queryError ?? null

  // Reset start error when starting a new task
  const resetStartError = useCallback(() => {
    setStartError(null)
  }, [])

  // Start a new task by calling the Edge Function
  const startTask = useCallback(
    async (config: TConfig): Promise<void> => {
      if (!conversationId) {
        const error = new Error('Cannot start task: no conversation ID provided')
        setStartError(error)
        onError?.(error)
        return
      }

      setIsStarting(true)
      resetStartError()

      try {
        log('useLongRunningTask').info('Starting task', {
          taskType,
          conversationId,
          functionName,
        })

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !anonKey) {
          throw new Error('Missing Supabase configuration')
        }

        // Prepare request body with conversation_id
        const requestBody = {
          ...config,
          conversation_id: conversationId,
        }

        // Call the Edge Function
        const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const errorText = await response.text()

          // Handle 429 Concurrency Limit Error
          if (response.status === 429) {
            const concurrencyError = new Error(
              `Another ${taskType} task is already running for this conversation`
            )
            setStartError(concurrencyError)
            onError?.(concurrencyError)
            return
          }

          throw new Error(`Edge Function error: ${response.status} - ${errorText}`)
        }

        const result = await response.json()

        log('useLongRunningTask').info('Task started successfully', {
          taskType,
          conversationId,
          result,
        })

        // Invalidate query to fetch the new task
        await queryClient.invalidateQueries({
          queryKey: getTaskQueryKey(conversationId, taskType),
        })
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to start task')
        setStartError(error)
        onError?.(error)

        log('useLongRunningTask').error('Failed to start task', err, {
          taskType,
          conversationId,
        })
      } finally {
        setIsStarting(false)
      }
    },
    [conversationId, taskType, functionName, queryClient, onError, resetStartError]
  )

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
          await queryClient.invalidateQueries({
            queryKey: getTaskQueryKey(conversationId, taskType),
          })
        }
      )
      .subscribe()

    // Cleanup: unsubscribe when conversation changes or component unmounts
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, taskType, queryClient])

  // Handle refetch
  const handleRefetch = useCallback(() => {
    refetch()
  }, [refetch])

  return {
    startTask,
    task: task ?? null,
    isLoading: isLoading || isStarting,
    isRunning,
    error,
    refetch: handleRefetch,
  }
}

// ============================================================
// Utility Type Guards (re-exported for convenience)
// ============================================================

export { isActiveStatus, isTerminalStatus }
