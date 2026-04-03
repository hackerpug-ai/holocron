import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Submit feedback for a feed item
 *
 * Used for "More like this" (positive) and "Less like this" (negative) feedback.
 * This data is used to train content ranking and personalization algorithms.
 *
 * NOTE: This implementation patches the feedItems document which has userFeedback field.
 * In a production app with multiple users, you would create a separate userFeedback
 * table with userId indexing to track feedback per user.
 */
export const submitFeedback = mutation({
  args: {
    feedItemId: v.id("feedItems"),
    feedbackType: v.union(v.literal("positive"), v.literal("negative")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if feed item exists
    const feedItem = await ctx.db.get(args.feedItemId);
    if (!feedItem) {
      throw new Error(`Feed item ${args.feedItemId} not found`);
    }

    // Map positive/negative to up/down for the schema
    const userFeedbackValue = args.feedbackType === "positive" ? "up" : "down";

    // Update the feed item document with feedback
    await ctx.db.patch(args.feedItemId, {
      userFeedback: userFeedbackValue,
      userFeedbackAt: now,
    });

    return await ctx.db.get(args.feedItemId);
  },
});

/**
 * Remove feedback for a feed item
 *
 * Used when user toggles off their feedback selection.
 */
export const removeFeedback = mutation({
  args: {
    feedItemId: v.id("feedItems"),
  },
  handler: async (ctx, args) => {
    // Check if feed item exists
    const feedItem = await ctx.db.get(args.feedItemId);
    if (!feedItem) {
      return { deleted: false };
    }

    // Remove feedback by setting to undefined
    await ctx.db.patch(args.feedItemId, {
      userFeedback: undefined,
      userFeedbackAt: undefined,
    });

    return { deleted: true, feedItem };
  },
});
