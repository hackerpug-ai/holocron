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

// ============================================================================
// Feed Session Tracking
// ============================================================================

/**
 * Start a new feed reading session
 *
 * Call this when user opens the feed screen. Creates a session record
 * with start time for tracking reading behavior.
 *
 * @returns The ID of the created session
 */
export const startFeedSession = internalMutation({
  args: {
    sessionSource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const sessionId = await ctx.db.insert("feedSessions", {
      startTime: now,
      endTime: undefined,
      itemsViewed: 0,
      itemsConsumed: 0,
      sessionSource: args.sessionSource,
    });

    return sessionId;
  },
});

/**
 * End a feed reading session
 *
 * Call this when user closes the feed screen or after a period of inactivity.
 * Updates the session with end time and engagement metrics.
 *
 * Engagement levels:
 * - itemsViewed: Number of items scrolled into view
 * - itemsConsumed: Number of items clicked/opened
 *
 * @param sessionId The session to end
 * @param itemsViewed Number of unique items viewed during session
 * @param itemsConsumed Number of items clicked/opened during session
 */
export const endFeedSession = internalMutation({
  args: {
    sessionId: v.id("feedSessions"),
    itemsViewed: v.number(),
    itemsConsumed: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error(`Session ${args.sessionId} not found`);
    }

    if (session.endTime) {
      // Session already ended - don't update
      return session;
    }

    const now = Date.now();

    // Validate endTime >= startTime
    if (now < session.startTime) {
      throw new Error("endTime cannot be before startTime");
    }

    // Validate counts are non-negative
    if (args.itemsViewed < 0 || args.itemsConsumed < 0) {
      throw new Error("itemsViewed and itemsConsumed must be non-negative");
    }

    // Validate consumed <= viewed
    if (args.itemsConsumed > args.itemsViewed) {
      throw new Error("itemsConsumed cannot exceed itemsViewed");
    }

    await ctx.db.patch(args.sessionId, {
      endTime: now,
      itemsViewed: args.itemsViewed,
      itemsConsumed: args.itemsConsumed,
    });

    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Increment session engagement counters
 *
 * Call this when user views or consumes an item. Updates the session
 * counters in real-time without ending the session.
 *
 * @param sessionId The session to update
 * @param itemsViewedIncrement Number of new items viewed
 * @param itemsConsumedIncrement Number of new items consumed
 */
export const incrementSessionEngagement = internalMutation({
  args: {
    sessionId: v.id("feedSessions"),
    itemsViewedIncrement: v.number(),
    itemsConsumedIncrement: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error(`Session ${args.sessionId} not found`);
    }

    if (session.endTime) {
      // Session already ended - don't update
      return session;
    }

    await ctx.db.patch(args.sessionId, {
      itemsViewed: session.itemsViewed + args.itemsViewedIncrement,
      itemsConsumed: session.itemsConsumed + args.itemsConsumedIncrement,
    });

    return await ctx.db.get(args.sessionId);
  },
});
