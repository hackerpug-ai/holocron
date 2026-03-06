import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Insert a research session from migration
 */
export const insertFromMigration = mutation({
  args: {
    query: v.string(),
    researchType: v.optional(v.string()),
    inputType: v.string(),
    status: v.string(),
    maxIterations: v.optional(v.number()),
    currentIteration: v.optional(v.number()),
    coverageScore: v.optional(v.number()),
    plan: v.optional(v.any()),
    findings: v.optional(v.any()),
    documentId: v.optional(v.id("documents")),
    errorText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("researchSessions", {
      ...args,
      researchType: args.researchType ?? "topic_research",
    });
  },
});

/**
 * Clear all research sessions (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("researchSessions").collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    return { deleted: sessions.length };
  },
});
