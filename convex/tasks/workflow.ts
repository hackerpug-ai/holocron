/**
 * Task Workflow Definitions (US-054)
 *
 * Provides Convex Workflow definitions for durable task execution.
 * Supports task types: deep-research, research, assimilate, shop, research-loop
 *
 * @see convex/tasks/mutations.ts - Task starting mutations
 * @see convex/tasks/queries.ts - Task status queries
 */

import { v } from "convex/values";

/**
 * Task type identifiers
 */
export type TaskType =
  | "deep-research"
  | "research"
  | "assimilate"
  | "shop"
  | "research-loop";

/**
 * Task status identifiers
 */
export type TaskStatus =
  | "pending"
  | "queued"
  | "loading"
  | "running"
  | "completed"
  | "error"
  | "cancelled";

/**
 * Task configuration schema
 *
 * Note: Using v.any() for flexible config per task type
 */
export const taskConfigSchema = v.optional(v.any());

/**
 * Task result schema
 */
export const taskResultSchema = v.object({
  success: v.boolean(),
  data: v.optional(v.any()),
  error: v.optional(v.string()),
});

/**
 * Check if a task status is active (still running)
 */
export function isActiveTaskStatus(status: TaskStatus): boolean {
  return ["pending", "queued", "loading", "running"].includes(status);
}

/**
 * Check if a task status is terminal (completed)
 */
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return ["completed", "error", "cancelled"].includes(status);
}
