import { query } from "../_generated/server";
import { v } from "convex/values";

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

/**
 * Get a single citation by ID
 */
export const get = query({
  args: {
    id: v.id("citations"),
  },
  handler: async (ctx, { id }) => {
    const citation = await ctx.db.get(id);
    return citation ?? null;
  },
});
