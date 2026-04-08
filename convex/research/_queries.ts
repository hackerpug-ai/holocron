/**
 * Internal research queries for backfill and maintenance
 */

import { internalQuery } from "../_generated/server";

/**
 * List all research sessions (for backfill/maintenance use only)
 */
export const listAllSessions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("deepResearchSessions")
      .collect();
  },
});
