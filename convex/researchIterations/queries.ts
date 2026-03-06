import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get research iteration count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const iterations = await ctx.db.query("researchIterations").collect();
    return iterations.length;
  },
});

/**
 * List all research iterations (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("researchIterations").collect();
  },
});

/**
 * Get a single research iteration by ID
 */
export const get = query({
  args: {
    id: v.id("researchIterations"),
  },
  handler: async (ctx, { id }) => {
    const iteration = await ctx.db.get(id);
    return iteration ?? null;
  },
});
