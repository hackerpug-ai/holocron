/**
 * Long Running Task Module
 *
 * Provides a unified API for managing long-running background tasks in Supabase Edge Functions.
 * Includes task type definitions, error handling, agent client for LLM interactions, and
 * task lifecycle management utilities.
 *
 * @module long-running-task
 * @see supabase/migrations/20260304_create_long_running_tasks.sql
 */

// ============================================================
// Task Manager Exports
// ============================================================

export {
  checkConcurrencyLimit,
  getActiveTaskCount,
  startTask,
  updateTaskStatus,
  completeTask,
  failTask,
  cancelTask,
  startTaskExecution,
  executeTaskInBackground,
  getTask,
  getActiveTasks,
  MAX_CONCURRENT_TASKS,
} from './task-manager'

export type {
  SupabaseClient,
  ExecuteTaskOptions,
  StartTaskResult,
} from './task-manager'

// ============================================================
// Agent Client Exports
// ============================================================

export {
  AgentClient,
  createAgentClient,
  hasZaiCredentials,
  ZAI_BASE_URL,
  ZAI_MODEL,
} from './agent-client'

export type {
  MessageRole,
  ChatMessage,
  ChatResponse,
  JSONSchema,
  StructuredChatResponse,
  ChatChunk,
  AgentClientConfig,
} from './agent-client'

export { AgentClientError } from './agent-client'

// ============================================================
// Type Exports
// ============================================================

export type {
  // Enums
  TaskType,
  TaskStatus,

  // Configuration and Result
  TaskConfig,
  TaskResult,

  // Database Record Types
  TaskProgress,
  TaskError,
  TaskRecord,
  CreateTaskInput,
  UpdateProgressInput,
  CompleteTaskInput,
  FailTaskInput,
} from './types'

// ============================================================
// Error Classes
// ============================================================

export {
  ConcurrencyLimitError,
  TaskNotFoundError,
  InvalidTaskTransitionError,
} from './types'

// ============================================================
// Type Guards
// ============================================================

export {
  isTerminalStatus,
  isActiveStatus,
  isValidTransition,
} from './types'

// ============================================================
// Utility Types
// ============================================================

export type {
  ConfigOf,
  ResultOf,
} from './types'

// ============================================================
// Task Executor Interface
// ============================================================

export type {
  StatusUpdateFn,
  TaskExecutor,
} from './types'
