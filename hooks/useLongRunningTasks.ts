/**
 * Custom hook for monitoring active long-running tasks across all conversations
 *
 * Subscribes to the long_running_tasks table and provides:
 * - Real-time updates for all active tasks (status: queued, loading, running)
 * - Task counts and active task detection
 * - Live updates via Supabase Realtime
 *
 * @example Usage
 * ```tsx
 * const { activeTasks, hasActiveTasks, isLoading, error } = useLongRunningTasks()
 *
 * if (hasActiveTasks) {
 *   console.log(`${activeTasks.length} tasks running`)
 * }
 * ```
 *
 * @see hooks/useLongRunningTask.ts - Single task management hook
 * @see lib/types/task.ts - Task type definitions
 */

import { useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger-client'
import type { Task, TaskRow, TaskStatus } from '@/lib/types/task'
import { taskRowToTask, isActiveStatus } from '@/lib/types/task'

// ============================================================
// Types
// ============================================================

/**
 * Return type for useLongRunningTasks hook
 */
export interface UseLongRunningTasksReturn {
  /** Array of all active tasks across all conversations */
  activeTasks: Task[]
  /** True if there are any active tasks */
  hasActiveTasks: boolean
  /** True while fetching initial task state */
  isLoading: boolean
  /** Error from fetching or monitoring tasks */
  error: Error | null
  /** Refetch all tasks */
  refetch: () => void
}

// ============================================================
// Query Keys
// ============================================================

/**
 * Query key factory for long-running tasks
 */
const tasksKeys = {
  all: ['long-running-tasks'] as const,
  active: () => [...tasksKeys.all, 'active'] as const,
}

// ============================================================
// Fetcher Functions
// ============================================================

/**
 * Active task statuses to filter by
 */
const ACTIVE_STATUSES: TaskStatus[] = ['queued', 'loading', 'running']

/**
 * Fetch all active tasks across all conversations
 */
async function fetchActiveTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('long_running_tasks')
    .select('*')
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })

  if (error) {
    log('useLongRunningTasks').error('Failed to fetch active tasks', error, {})
    throw new Error(`Failed to fetch active tasks: ${error.message}`)
  }

  if (!data) {
    return []
  }

  // Transform database rows to app-level Task objects
  return (data as TaskRow[]).map(taskRowToTask)
}

// ============================================================
// Hook Implementation
// ============================================================

/**
 * Hook for monitoring active long-running tasks across all conversations
 *
 * @returns Task state and control functions
 */
export function useLongRunningTasks(): UseLongRunningTasksReturn {
  const queryClient = useQueryClient()

  // Query for all active tasks
  const {
    data: activeTasks = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: tasksKeys.active(),
    queryFn: fetchActiveTasks,
    staleTime: 0, // Always refetch for real-time updates
    // Poll every 2 seconds if there are active tasks
    refetchInterval: (query) => {
      const tasks = query.state.data as Task[] | undefined
      return tasks && tasks.length > 0 ? 2000 : false
    },
  })

  // Compute hasActiveTasks
  const hasActiveTasks = activeTasks.length > 0

  // Handle refetch
  const handleRefetch = useCallback(() => {
    refetch()
  }, [refetch])

  // Set up Supabase Realtime subscription for task updates
  useEffect(() => {
    const channel = supabase
      .channel('long-running-tasks-all')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all updates (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'long_running_tasks',
        },
        async (payload) => {
          const taskRow = payload.new as TaskRow | null
          const oldTaskRow = payload.old as TaskRow | null

          // Log the event
          if (payload.eventType === 'INSERT') {
            log('useLongRunningTasks').info('New task created', {
              taskId: taskRow?.id,
              taskType: taskRow?.task_type,
              status: taskRow?.status,
            })
          } else if (payload.eventType === 'UPDATE') {
            const isActive = taskRow ? isActiveStatus(taskRow.status) : false
            const wasActive = oldTaskRow ? isActiveStatus(oldTaskRow.status) : false

            // Only log if active status changed
            if (isActive !== wasActive) {
              log('useLongRunningTasks').info('Task active status changed', {
                taskId: taskRow?.id,
                taskType: taskRow?.task_type,
                oldStatus: oldTaskRow?.status,
                newStatus: taskRow?.status,
                wasActive,
                isActive,
              })
            }
          } else if (payload.eventType === 'DELETE') {
            log('useLongRunningTasks').info('Task deleted', {
              taskId: oldTaskRow?.id,
              taskType: oldTaskRow?.task_type,
            })
          }

          // Invalidate query to trigger refetch
          await queryClient.invalidateQueries({
            queryKey: tasksKeys.active(),
          })
        }
      )
      .subscribe()

    // Cleanup: unsubscribe when component unmounts
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return {
    activeTasks,
    hasActiveTasks,
    isLoading,
    error: error ?? null,
    refetch: handleRefetch,
  }
}

// ============================================================
// Utility Type Guards (re-exported for convenience)
// ============================================================

export { isActiveStatus }
