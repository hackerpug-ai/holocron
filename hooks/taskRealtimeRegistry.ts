/**
 * Realtime Task Registry
 *
 * Maps task types to their realtime data sources.
 * Each task type can specify which tables to watch and how to filter them.
 *
 * @example Registering a new task type
 * ```ts
 * import { registerTaskRealtimeConfig } from './taskRealtimeRegistry'
 *
 * registerTaskRealtimeConfig('my-task', {
 *   tables: [
 *     {
 *       table: 'my_task_sessions',
 *       filter: (conversationId) => `conversation_id=eq.${conversationId}`,
 *     },
 *     {
 *       table: 'my_task_results',
 *       filter: (conversationId, sessionId) => `session_id=eq.${sessionId}`,
 *       requiresIdFrom: 'my_task_sessions',
 *     },
 *   ],
 * })
 * ```
 */

import type { TaskType } from 'supabase/functions/_shared/long-running-task/types'

// ============================================================
// Types
// ============================================================

export interface TableSubscriptionConfig {
  /** Table name to subscribe to */
  table: string
  /** Filter function - returns Supabase filter string */
  filter: (conversationId: string, extractedIds?: Record<string, string>) => string
  /**
   * If this table requires an ID from another table, specify the table name.
   * The extracted ID will be passed to the filter function.
   * For example, iterations might need session_id from sessions table.
   */
  requiresIdFrom?: string
  /**
   * Field name to extract from parent table and store in extractedIds.
   * For example, 'id' or 'session_id'.
   * Defaults to 'id' if not specified.
   */
  idField?: string
  /** Custom event ID for the channel (optional, defaults to auto-generated) */
  eventId?: string
}

export interface TaskRealtimeConfig {
  /** List of tables to subscribe to for this task type */
  tables: TableSubscriptionConfig[]
}

/**
 * Registry of task type -> realtime configurations
 * Task types register their configurations here for the generic hook to consume
 */
export const taskRealtimeRegistry: Record<string, TaskRealtimeConfig> = {}

// ============================================================
// Registry Functions
// ============================================================

/**
 * Register realtime configuration for a task type
 */
export function registerTaskRealtimeConfig(
  taskType: TaskType,
  config: TaskRealtimeConfig
): void {
  taskRealtimeRegistry[taskType] = config
}

/**
 * Get realtime configuration for a task type
 * Returns undefined if task type has no special realtime config
 * (falls back to default long_running_tasks monitoring)
 */
export function getTaskRealtimeConfig(
  taskType: TaskType
): TaskRealtimeConfig | undefined {
  return taskRealtimeRegistry[taskType]
}

/**
 * Check if a task type has custom realtime configuration
 */
export function hasTaskRealtimeConfig(taskType: TaskType): boolean {
  return taskType in taskRealtimeRegistry &&
    taskRealtimeRegistry[taskType].tables.length > 0
}

// ============================================================
// Built-in Task Type Registrations
// ============================================================

/**
 * Deep Research realtime configuration
 * - Watches deep_research_sessions for session status changes
 * - Watches deep_research_iterations for new findings (requires session_id)
 */
registerTaskRealtimeConfig('deep-research', {
  tables: [
    {
      table: 'deep_research_sessions',
      filter: (conversationId) => `conversation_id=eq.${conversationId}`,
    },
    {
      table: 'deep_research_iterations',
      // Requires session_id from the session - will be extracted from session payload
      filter: (_conversationId, extractedIds) => `session_id=eq.${extractedIds?.sessionId}`,
      requiresIdFrom: 'deep_research_sessions',
      idField: 'sessionId', // Field name to store in extractedIds
    },
  ],
})

// Future task types can register here:
// registerTaskRealtimeConfig('shop', { ... })
// registerTaskRealtimeConfig('assimilate', { ... })
// registerTaskRealtimeConfig('deep-research-teamwork', { ... })
