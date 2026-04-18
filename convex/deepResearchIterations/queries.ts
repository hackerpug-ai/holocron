import { v } from 'convex/values';
import { query } from '../_generated/server';

/**
 * Get deep research iteration count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const iterations = await ctx.db.query('deepResearchIterations').collect();
    return iterations.length;
  },
});

/**
 * List all deep research iterations (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('deepResearchIterations').collect();
  },
});

/**
 * Get a single deep research iteration by ID
 */
export const get = query({
  args: {
    id: v.id('deepResearchIterations'),
  },
  handler: async (ctx, { id }) => {
    const iteration = await ctx.db.get(id);
    return iteration ?? null;
  },
});
