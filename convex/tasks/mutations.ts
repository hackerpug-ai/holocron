import { mutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================================
// Task Management Mutations (US-054)
// ============================================================

/**
 * Start a new task
 *
 * Creates a task with pending status. The task will be picked up by
 * a workflow that updates its status as it progresses.
 *
 * AC-1: No running task -> Start task -> Task created with pending status
 */
export const start = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    taskType: v.union(
      v.literal("deep-research"),
      v.literal("research"),
      v.literal("assimilate"),
      v.literal("shop"),
      v.literal("research-loop")
    ),
    config: v.optional(v.any()),
  },
  handler: async (ctx, { conversationId, taskType, config }) => {
    const now = Date.now();

    const taskId = await ctx.db.insert("tasks", {
      conversationId,
      taskType,
      status: "pending",
      config,
      createdAt: now,
      updatedAt: now,
    });

    return taskId;
  },
});

/**
 * Cancel a running task
 *
 * Updates task status to cancelled. Cannot cancel tasks that are
 * already completed or in error state.
 *
 * AC-4: Running task -> Cancel task -> Status becomes cancelled
 */
export const cancel = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status === "completed" || task.status === "error") {
      throw new Error(`Cannot cancel task in ${task.status} state`);
    }

    await ctx.db.patch(id, {
      status: "cancelled",
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Update task progress
 *
 * Updates the current step, total steps, and progress message.
 * Subscribers watching the task will automatically receive updates.
 *
 * AC-3: Running task -> Update progress -> Progress persisted, subscribers notified
 */
export const updateProgress = mutation({
  args: {
    id: v.id("tasks"),
    currentStep: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
    progressMessage: v.optional(v.string()),
  },
  handler: async (ctx, { id, currentStep, totalSteps, progressMessage }) => {
    await ctx.db.patch(id, {
      ...(currentStep !== undefined && { currentStep }),
      ...(totalSteps !== undefined && { totalSteps }),
      ...(progressMessage !== undefined && { progressMessage }),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update task status
 *
 * Updates the task status. Used by workflows to transition tasks
 * between states (pending -> queued -> loading -> running -> completed/error)
 */
export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("loading"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("error"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, { id, status }) => {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: Date.now(),
    };

    // Set timestamps for status transitions
    if (status === "running") {
      updates.startedAt = Date.now();
    }
    if (status === "completed" || status === "error" || status === "cancelled") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(id, updates);
  },
});

/**
 * Complete a task with result
 *
 * Marks task as completed and stores the result.
 */
export const complete = mutation({
  args: {
    id: v.id("tasks"),
    result: v.any(),
  },
  handler: async (ctx, { id, result }) => {
    await ctx.db.patch(id, {
      status: "completed",
      result,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Fail a task with error
 *
 * Marks task as error and stores error details.
 */
export const fail = mutation({
  args: {
    id: v.id("tasks"),
    errorMessage: v.string(),
    errorDetails: v.optional(v.any()),
  },
  handler: async (ctx, { id, errorMessage, errorDetails }) => {
    await ctx.db.patch(id, {
      status: "error",
      errorMessage,
      errorDetails,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ============================================================
// Migration and Testing Mutations
// ============================================================

/**
 * Insert a task from migration
 */
export const insertFromMigration = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    taskType: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("loading"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("error"),
      v.literal("cancelled")
    ),
    config: v.optional(v.any()),
    currentStep: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
    progressMessage: v.optional(v.string()),
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    errorDetails: v.optional(v.any()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", args);
  },
});

/**
 * Clear all tasks (for testing only - use with caution)
 * Requires ALLOW_CLEAR_ALL=true environment variable to be set.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_CLEAR_ALL !== "true") {
      throw new Error(
        "clearAll is disabled. Set ALLOW_CLEAR_ALL=true to enable."
      );
    }
    const tasks = await ctx.db.query("tasks").collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }
    return { deleted: tasks.length };
  },
});
