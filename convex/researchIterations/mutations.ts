import { mutation } from "../_generated/server";
import { v } from "convex/values";

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
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const iterations = await ctx.db.query("researchIterations").collect();
    for (const iteration of iterations) {
      await ctx.db.delete(iteration._id);
    }
    return { deleted: iterations.length };
  },
});
