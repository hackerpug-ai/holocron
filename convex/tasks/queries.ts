import { query } from "../_generated/server";
import { v } from "convex/values";

// ============================================================
// Task Management Queries (US-054)
// ============================================================

/**
 * Get task by ID
 *
 * AC-2: Running task -> Query status -> Returns current progress
 */
export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Get the most recent task for a conversation
 *
 * Returns the latest task for a given conversation, ordered by creation time.
 * This is useful for monitoring the current active task.
 *
 * AC-2: Running task -> Query status -> Returns current progress
 */
export const getByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .order("desc")
      .first();
  },
});

/**
 * Get all active tasks for a conversation
 *
 * Returns tasks with non-terminal status (pending, queued, loading, running).
 */
export const getActiveByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .collect();

    return tasks.filter(
      (task) =>
        task.status === "pending" ||
        task.status === "queued" ||
        task.status === "loading" ||
        task.status === "running"
    );
  },
});

/**
 * Get all tasks by status
 */
export const getByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, { status }) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
  },
});

/**
 * List all tasks (for validation/testing)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});

/**
 * Get task count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks.length;
  },
});
