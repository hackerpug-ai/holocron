import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Insert a task from migration
 */
export const insertFromMigration = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    taskType: v.string(),
    status: v.string(),
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
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }
    return { deleted: tasks.length };
  },
});
