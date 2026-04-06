import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new research iteration
 */
export const create = mutation({
  args: {
    sessionId: v.id("researchSessions"),
    iterationNumber: v.number(),
    findingsSummary: v.optional(v.string()),
    sources: v.optional(v.any()),
    reviewScore: v.optional(v.number()),
    reviewFeedback: v.optional(v.string()),
    reviewGaps: v.optional(v.any()),
    refinedQueries: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("researchIterations", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update a research iteration
 */
export const update = mutation({
  args: {
    id: v.id("researchIterations"),
    findingsSummary: v.optional(v.string()),
    sources: v.optional(v.any()),
    reviewScore: v.optional(v.number()),
    reviewFeedback: v.optional(v.string()),
    reviewGaps: v.optional(v.any()),
    refinedQueries: v.optional(v.any()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`ResearchIteration ${id} not found`);
    }

    await ctx.db.patch(id, updates);

    return await ctx.db.get(id);
  },
});

/**
 * Insert a research iteration from migration
 */
export const insertFromMigration = mutation({
  args: {
    sessionId: v.id("researchSessions"),
    iterationNumber: v.number(),
    findingsSummary: v.optional(v.string()),
    sources: v.optional(v.any()),
    reviewScore: v.optional(v.number()),
    reviewFeedback: v.optional(v.string()),
    reviewGaps: v.optional(v.any()),
    refinedQueries: v.optional(v.any()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("researchIterations", args);
  },
});

/**
 * Clear all research iterations (for testing only - use with caution)
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
    const iterations = await ctx.db.query("researchIterations").collect();
    for (const iteration of iterations) {
      await ctx.db.delete(iteration._id);
    }
    return { deleted: iterations.length };
  },
});
