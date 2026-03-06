import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Insert a deep research session from migration
 */
export const insertFromMigration = mutation({
  args: {
    conversationId: v.id("conversations"),
    taskId: v.optional(v.id("tasks")),
    topic: v.string(),
    maxIterations: v.optional(v.number()),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("deepResearchSessions", args);
  },
});

/**
 * Clear all deep research sessions (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("deepResearchSessions").collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    return { deleted: sessions.length };
  },
});
