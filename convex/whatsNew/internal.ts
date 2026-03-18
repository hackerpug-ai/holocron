/**
 * What's New Internal Queries and Mutations
 *
 * Internal functions for use by actions and cron jobs.
 */

import { internalQuery } from "../_generated/server";

/**
 * Check if today's report already exists (internal)
 *
 * Used by generateDailyReport to avoid duplicate generation.
 */
export const getTodaysReport = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get today's date at midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    // End of today
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

    // Find report created today
    const report = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created")
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), todayStart),
          q.lte(q.field("createdAt"), todayEnd)
        )
      )
      .first();

    return report;
  },
});

/**
 * Get the most recent report (internal)
 *
 * Used by generateDailyReport to check for existing reports.
 */
export const getMostRecentReport = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created")
      .order("desc")
      .first();
  },
});
