import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Insert a deep research iteration from migration
 */
export const insertFromMigration = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    iterationNumber: v.number(),
    coverageScore: v.optional(v.number()),
    feedback: v.optional(v.string()),
    findings: v.optional(v.string()),
    refinedQueries: v.optional(v.any()),
    status: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("deepResearchIterations", args);
  },
});

/**
 * Clear all deep research iterations (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const iterations = await ctx.db.query("deepResearchIterations").collect();
    for (const iteration of iterations) {
      await ctx.db.delete(iteration._id);
    }
    return { deleted: iterations.length };
  },
});
