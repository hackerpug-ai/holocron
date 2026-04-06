import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new deep research iteration
 */
const deepResearchIterationStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("in_progress"),
  v.literal("in-progress"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("error")
);

export const create = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    iterationNumber: v.number(),
    coverageScore: v.optional(v.number()),
    feedback: v.optional(v.string()),
    findings: v.optional(v.string()),
    refinedQueries: v.optional(v.any()),
    status: deepResearchIterationStatus,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("deepResearchIterations", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update a deep research iteration
 */
export const update = mutation({
  args: {
    id: v.id("deepResearchIterations"),
    coverageScore: v.optional(v.number()),
    feedback: v.optional(v.string()),
    findings: v.optional(v.string()),
    refinedQueries: v.optional(v.any()),
    status: v.optional(deepResearchIterationStatus),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`DeepResearchIteration ${id} not found`);
    }

    await ctx.db.patch(id, updates);

    return await ctx.db.get(id);
  },
});

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
    status: deepResearchIterationStatus,
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
