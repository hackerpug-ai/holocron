import { query } from "../_generated/server";

/**
 * Get deep research iteration count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const iterations = await ctx.db.query("deepResearchIterations").collect();
    return iterations.length;
  },
});

/**
 * List all deep research iterations (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("deepResearchIterations").collect();
  },
});
