import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// ============================================================================
// Feed Building Actions
// ============================================================================

/**
 * Build feed from recent subscription content (public wrapper)
 *
 * This is a public wrapper around internal.feeds.internal.buildFeed
 * that includes authentication checks.
 *
 * Use this for:
 * - Manual testing via dashboard
 * - Admin-triggered feed refresh
 * - On-demand feed building
 *
 * @returns Object with processed count and feed items created
 */
export const buildFeed = action({
  args: {},
  handler: async (ctx): Promise<{
    processed: number;
    items: Array<{ groupKey: string; feedItemId: Id<"feedItems">; itemCount: number }>;
  }> => {
    // Authentication check
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("Unauthorized: User must be logged in to build feed");
    }

    // Call internal action to do the actual work
    const result = await ctx.runAction(internal.feeds.internal.buildFeed, {});

    return result;
  },
});
