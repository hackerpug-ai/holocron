/**
 * Feed mutations
 *
 * Mutations for managing feed items and sessions
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { markViewedArgs, markAllViewedArgs, createDigestNotificationArgs } from "./validators";

/**
 * Mark feed items as viewed
 *
 * Updates specified feed items with viewed=true and viewedAt timestamp.
 * Supports marking single or multiple items in one operation.
 */
export const markViewed = mutation({
  args: markViewedArgs,
  handler: async (ctx, args) => {
    const { feedItemIds, viewedAt = Date.now() } = args;

    // Update all specified items
    await Promise.all(
      feedItemIds.map((id) =>
        ctx.db.patch(id, {
          viewed: true,
          viewedAt,
        })
      )
    );

    return { marked: feedItemIds.length };
  },
});

/**
 * Mark all feed items as viewed
 *
 * Bulk operation to mark all unviewed items as viewed.
 * Uses by_viewed index for efficient querying.
 */
export const markAllViewed = mutation({
  args: markAllViewedArgs,
  handler: async (ctx, args) => {
    const viewedAt = args.viewedAt ?? Date.now();

    // Query all unviewed items using index
    const unviewedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_viewed", (q) => q.eq("viewed", false))
      .collect();

    // Update all unviewed items
    await Promise.all(
      unviewedItems.map((item) =>
        ctx.db.patch(item._id, {
          viewed: true,
          viewedAt,
        })
      )
    );

    return { marked: unviewedItems.length };
  },
});

/**
 * Create digest notification
 *
 * Generates a daily digest notification summarizing unviewed feed content.
 * Uses getDigestSummary query to gather data and creates notification.
 */
export const createDigestNotification = mutation({
  args: createDigestNotificationArgs,
  handler: async (ctx, _args): Promise<{ created: boolean; notificationId?: string; reason?: string }> => {
    // Get current user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: No user identity found");
    }

    // Get digest summary - directly import and call the query
    // Since we're in a mutation, we need to query directly
    const since = Date.now() - 24 * 60 * 60 * 1000; // Default 24h
    const limit = 100;

    // Fetch recent items
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_created")
      .filter((q) => q.gte(q.field("discoveredAt"), since))
      .order("desc")
      .take(limit);

    // Calculate counts by type
    const counts = {
      video: 0,
      blog: 0,
      social: 0,
      total: items.length,
      unviewed: 0,
    };

    const sampleItems: typeof items = [];

    for (const item of items) {
      // Count by type
      counts[item.contentType] = (counts[item.contentType] || 0) + 1;

      // Count unviewed
      if (!item.viewed) {
        counts.unviewed++;
      }

      // Collect sample items (first 3 unviewed)
      if (sampleItems.length < 3 && !item.viewed) {
        sampleItems.push(item);
      }
    }

    // Generate human-readable summary
    const parts: string[] = [];
    if (counts.video > 0) parts.push(`${counts.video} video${counts.video > 1 ? "s" : ""}`);
    if (counts.blog > 0) parts.push(`${counts.blog} blog${counts.blog > 1 ? "s" : ""}`);
    if (counts.social > 0) parts.push(`${counts.social} social post${counts.social > 1 ? "s" : ""}`);

    const summaryText = parts.length > 0
      ? parts.join(", ")
      : "No new content";

    const summary = {
      counts,
      sampleItems,
      summary: summaryText,
      timestamp: Date.now(),
    };

    // Don't create notification if no unviewed items
    if (summary.counts.total === 0) {
      return { created: false, reason: "No unviewed items" };
    }

    // Build digest message
    const message = buildDigestMessage(summary);

    // Create notification
    const notificationId = await ctx.db.insert("notifications", {
      type: "feed_digest",
      title: `You have ${summary.counts.total} new items to explore`,
      body: message,
      route: "/feed",
      read: false,
      createdAt: Date.now(),
      feedItemIds: summary.sampleItems.map((item: any) => item._id),
      digestCount: summary.counts.total,
      digestSummary: summary.summary,
    });

    return { created: true, notificationId };
  },
});

// Helper function to build digest message
function buildDigestMessage(summary: any): string {
  const { counts } = summary;
  const parts: string[] = [];

  if (counts.video > 0) {
    parts.push(`${counts.video} video${counts.video > 1 ? "s" : ""}`);
  }
  if (counts.blog > 0) {
    parts.push(`${counts.blog} blog${counts.blog > 1 ? "s" : ""}`);
  }
  if (counts.social > 0) {
    parts.push(`${counts.social} social post${counts.social > 1 ? "s" : ""}`);
  }

  const itemList = parts.join(", ");
  return `${counts.total} new feed items: ${itemList}`;
}

/**
 * Update feed settings
 *
 * Updates user's feed preferences. For now, this is a stub that logs the update.
 * In a future epic, these will be persisted to a user preferences table.
 */
export const updateFeedSettings = mutation({
  args: {
    enablePushNotifications: v.optional(v.boolean()),
    enableInAppNotifications: v.optional(v.boolean()),
    showThumbnails: v.optional(v.boolean()),
    autoPlayVideos: v.optional(v.boolean()),
    contentFilter: v.optional(v.union(v.literal("all"), v.literal("videos-only"), v.literal("blogs-only"))),
  },
  handler: async (_ctx, args) => {
    // TODO: In future epic, persist to user preferences table
    // For now, this is a stub that accepts any setting changes
    console.log("Feed settings updated:", args);
    return { success: true, settings: args };
  },
});

/**
 * Open feed item
 *
 * Fetches the URL for a feed item from its linked subscription content.
 * Returns the URL or null if no URL is available.
 * Used by the feed screen to open items in a WebView.
 */
export const openFeedItem = mutation({
  args: {
    feedItemId: v.id("feedItems"),
  },
  handler: async (ctx, args) => {
    // Fetch the feed item
    const feedItem = await ctx.db.get(args.feedItemId);
    if (!feedItem) {
      throw new Error("Feed item not found");
    }

    // Get the first linked content item (which has the URL)
    const firstContentId = feedItem.itemIds[0];
    if (!firstContentId) {
      return null;
    }

    const content = await ctx.db.get(firstContentId);
    return content?.url ?? null;
  },
});
