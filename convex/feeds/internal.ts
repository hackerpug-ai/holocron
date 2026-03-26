import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Feed Building Action
// ============================================================================

/**
 * Build feed from recent subscription content
 *
 * Groups content by sourceId (subscription source) and creates feed items.
 * This action is called by cron job every 2 hours.
 *
 * Idempotent: Safe to run multiple times - skips content already in feed.
 */
export const buildFeed = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    processed: number;
    items: Array<{ groupKey: string; feedItemId: Id<"feedItems">; itemCount: number }>;
  }> => {
    const now = Date.now();

    // Step 1: Query recent unprocessed content (last 7 days, not in feed)
    const recentContent = await ctx.runQuery(internal.feeds.internal.getUnprocessedContent, {
      since: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    });

    // Step 2: Group by source (subscription source)
    const groupedBySource = new Map<Id<"subscriptionSources">, Doc<"subscriptionContent">[]>();

    for (const content of recentContent) {
      if (!groupedBySource.has(content.sourceId)) {
        groupedBySource.set(content.sourceId, []);
      }
      groupedBySource.get(content.sourceId)!.push(content);
    }

    // Step 3: Create feed items for each group
    const results: Array<{ groupKey: string; feedItemId: Id<"feedItems">; itemCount: number }> = [];
    for (const [sourceId, contents] of groupedBySource.entries()) {
      const firstContent = contents[0];

      // Determine content type (majority wins)
      const typeCounts = { video: 0, blog: 0, social: 0 };
      contents.forEach((c) => {
        const category = c.contentCategory as string;
        if (category === 'video') typeCounts.video++;
        else if (category === 'blog' || category === 'article') typeCounts.blog++;
        else if (category === 'social' || category === 'twitter' || category === 'bluesky') typeCounts.social++;
      });
      const dominantType = (Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])[0][0]) as "video" | "blog" | "social";

      // Create group key from source ID (this is our "creator" grouping)
      const groupKey = `source:${sourceId}`;

      // Use authorHandle if available, otherwise use a generic name
      const displayName = firstContent.authorHandle || `Source ${sourceId}`;

      // Create feed item
      const feedItemId = await ctx.runMutation(internal.feeds.internal.createFeedItem, {
        groupKey,
        title: displayName,
        summary: contents.length === 1
          ? firstContent.title
          : `${contents.length} new items from ${displayName}`,
        contentType: dominantType,
        itemCount: contents.length,
        itemIds: contents.map((c) => c._id),
        creatorProfileId: undefined, // Will be linked later when creator profiles exist
        subscriptionIds: [sourceId],
        thumbnailUrl: contents.find((c) => c.thumbnailUrl)?.thumbnailUrl,
        publishedAt: Math.max(...contents.map((c) => c.discoveredAt || 0)),
        discoveredAt: Math.min(...contents.map((c) => c.discoveredAt || now)),
        createdAt: now,
      });

      // Mark content as in feed
      await ctx.runMutation(internal.feeds.internal.markContentInFeed, {
        contentIds: contents.map((c) => c._id),
        feedItemId,
      });

      results.push({ groupKey, feedItemId, itemCount: contents.length });
    }

    return {
      processed: results.length,
      items: results,
    };
  },
});

// ============================================================================
// Internal Queries (Helper Functions)
// ============================================================================

export const getUnprocessedContent = internalQuery({
  args: {
    since: v.number(),
  },
  handler: async (ctx, args) => {
    // Get all content and filter in-memory
    // Note: This is not ideal but we don't have a by_discoveredAt index
    const allContent = await ctx.db
      .query("subscriptionContent")
      .filter((q) => q.eq(q.field("inFeed"), false))
      .collect();

    // Filter by discoveredAt in-memory
    return allContent.filter(c => c.discoveredAt >= args.since);
  },
});

// ============================================================================
// Internal Mutations (Helper Functions)
// ============================================================================

export const createFeedItem = internalMutation({
  args: {
    groupKey: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    contentType: v.union(
      v.literal("video"),
      v.literal("blog"),
      v.literal("social")
    ),
    itemCount: v.number(),
    itemIds: v.array(v.id("subscriptionContent")),
    creatorProfileId: v.optional(v.id("creatorProfiles")),
    subscriptionIds: v.array(v.id("subscriptionSources")),
    thumbnailUrl: v.optional(v.string()),
    publishedAt: v.number(),
    discoveredAt: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const feedItemId = await ctx.db.insert("feedItems", {
      groupKey: args.groupKey,
      title: args.title,
      summary: args.summary,
      contentType: args.contentType,
      itemCount: args.itemCount,
      itemIds: args.itemIds,
      creatorProfileId: args.creatorProfileId,
      subscriptionIds: args.subscriptionIds,
      thumbnailUrl: args.thumbnailUrl,
      viewed: false,
      viewedAt: undefined,
      publishedAt: args.publishedAt,
      discoveredAt: args.discoveredAt,
      createdAt: args.createdAt,
    });

    return feedItemId;
  },
});

export const markContentInFeed = internalMutation({
  args: {
    contentIds: v.array(v.id("subscriptionContent")),
    feedItemId: v.id("feedItems"),
  },
  handler: async (ctx, args) => {
    for (const contentId of args.contentIds) {
      const content = await ctx.db.get(contentId);
      if (content) {
        await ctx.db.patch(contentId, {
          feedItemId: args.feedItemId,
          inFeed: true,
        });
      }
    }
  },
});
