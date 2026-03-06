import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new deep research session
 */
export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    taskId: v.optional(v.id("tasks")),
    topic: v.string(),
    maxIterations: v.optional(v.number()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("deepResearchSessions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a deep research session
 */
export const update = mutation({
  args: {
    id: v.id("deepResearchSessions"),
    taskId: v.optional(v.id("tasks")),
    maxIterations: v.optional(v.number()),
    status: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`DeepResearchSession ${id} not found`);
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

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
