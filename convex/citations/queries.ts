import { query } from "../_generated/server";

/**
 * Get citation count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const citations = await ctx.db.query("citations").collect();
    return citations.length;
  },
});

/**
 * List all citations (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("citations").collect();
  },
});
