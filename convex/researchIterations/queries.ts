import { query } from "../_generated/server";

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
