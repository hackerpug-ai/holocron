import { query } from "../_generated/server";

/**
 * Get deep research session count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("deepResearchSessions").collect();
    return sessions.length;
  },
});

/**
 * List all deep research sessions (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("deepResearchSessions").collect();
  },
});
