/**
 * Internal improvement queries for backfill and maintenance
 */

import { internalQuery } from "../_generated/server";

/**
 * List all improvement requests (for backfill/maintenance use only)
 */
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("improvementRequests")
      .collect();
  },
});
