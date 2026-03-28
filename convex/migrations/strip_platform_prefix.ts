/**
 * Migration: Strip [PLATFORM] prefix from subscriptionContent titles
 *
 * Finds all subscriptionContent records whose title starts with a platform
 * prefix ([TWITTER], [YOUTUBE], [GITHUB], [BLUESKY]) and removes the prefix.
 *
 * Run with: npx convex run migrations/strip_platform_prefix:stripPlatformPrefixFromTitles
 */

import { internalMutation } from "../_generated/server";

const PLATFORM_PREFIX = /^\[(TWITTER|YOUTUBE|GITHUB|BLUESKY)\]\s*/;

/**
 * One-time migration to strip [PLATFORM] prefixes from subscriptionContent titles.
 * Returns the count of updated records.
 */
export const stripPlatformPrefixFromTitles = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ updated: number }> => {
    const allContent = await ctx.db.query("subscriptionContent").collect();

    let updated = 0;

    for (const record of allContent) {
      const strippedTitle = record.title.replace(PLATFORM_PREFIX, "");
      if (strippedTitle !== record.title) {
        await ctx.db.patch(record._id, { title: strippedTitle });
        updated++;
      }
    }

    console.log(
      `[stripPlatformPrefixFromTitles] Completed. Updated ${updated} records.`
    );

    return { updated };
  },
});
