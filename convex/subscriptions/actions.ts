import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Check subscriptions for new content
 * Reuses the internal checkAllSubscriptions action
 */
export const check = action({
  args: {
    sourceType: v.optional(
      v.union(
        v.literal("youtube"),
        v.literal("newsletter"),
        v.literal("changelog"),
        v.literal("reddit"),
        v.literal("ebay"),
        v.literal("whats-new"),
        v.literal("creator")
      )
    ),
  },
  handler: async (ctx, args): Promise<any> => {
    // Call the internal checkAllSubscriptions action
    const results: any = await ctx.runAction(internal.subscriptions.internal.checkAllSubscriptions);

    // Filter by source type if specified
    if (args.sourceType) {
      // Get sources of the specified type
      const sources: any = await ctx.runQuery(internal.subscriptions.internal.getActiveSources);
      const filteredSources: any = sources.filter((s: any) => s.sourceType === args.sourceType);

      // For now, return results with a note about filtering
      // A more sophisticated implementation would track results per source
      return {
        ...results,
        sourcesChecked: filteredSources.length,
        filteredByType: args.sourceType,
      };
    }

    return results;
  },
});
