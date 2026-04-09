import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Feed Building Action
// ============================================================================

/**
 * Derive feed content type from contentCategory field.
 * Maps stored category strings to the feedItems contentType union.
 */
function deriveFeedContentType(contentCategory: string | undefined): "video" | "blog" | "social" {
  switch (contentCategory) {
    case 'video':
      return 'video';
    case 'social':
    case 'bluesky':
      return 'social';
    case 'article':
    case 'blog':
      return 'blog';
    default:
      return 'blog';
  }
}

/**
 * Build feed from recent subscription content.
 *
 * Creates one feedItem per subscriptionContent item (1:1 mapping).
 * This gives users individual content cards rather than grouped creator cards.
 * This action is called by cron job every 2 hours.
 *
 * Idempotent: Safe to run multiple times - skips content already in feed.
 */
export const buildFeed = internalAction({
  args: {
    timeoutMinutes: v.optional(v.number()),
  },
  handler: async (ctx, _args): Promise<{
    processed: number;
    items: Array<{ groupKey: string; feedItemId: Id<"feedItems">; itemCount: number }>;
  }> => {
    const now = Date.now();

    // Step 1: Query recent unprocessed content (last 7 days, not in feed)
    const recentContent = await ctx.runQuery(internal.feeds.internal.getUnprocessedContent, {
      since: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    });

    // Step 2: Fetch all unique subscription sources to get creatorProfileId
    const uniqueSourceIds = new Set(recentContent.map((c: { sourceId: Id<"subscriptionSources"> }) => c.sourceId));
    const sources = await Promise.all(
      Array.from(uniqueSourceIds).map((sourceId) =>
        ctx.runQuery(internal.feeds.internal.getSubscriptionSource, { sourceId })
      )
    ) as Array<Doc<"subscriptionSources"> | null>;
    const sourceMap = new Map(
      sources.filter((s): s is Doc<"subscriptionSources"> => s !== null).map((s) => [s._id, s])
    );

    // Step 3: Create one feed item per content item (1:1 mapping)
    const results: Array<{ groupKey: string; feedItemId: Id<"feedItems">; itemCount: number }> = [];

    for (const content of recentContent) {
      const source = sourceMap.get(content.sourceId);
      if (!source) continue; // Skip if source not found

      // Defense-in-depth: skip already-ingested unavailable tweet placeholders
      if (isUnavailableContent(content.title)) continue;

      // Use creatorProfileId if available, otherwise fall back to sourceId for grouping key
      const creatorId = source.creatorProfileId;
      const groupKey = creatorId ? `creator:${creatorId}` : `source:${content.sourceId}`;

      // Derive content type from stored category
      const contentType = deriveFeedContentType(content.contentCategory);

      // Extract summary from metadataJson if available
      const metaJson = content.metadataJson as Record<string, unknown> | undefined;
      const summary = (metaJson?.summary as string | undefined)
        ?? (metaJson?.description as string | undefined)
        ?? undefined;

      // Create one feed item for this individual content item
      const feedItemId = await ctx.runMutation(internal.feeds.internal.createFeedItem, {
        groupKey,
        title: content.title,
        summary,
        contentType,
        itemCount: 1,
        itemIds: [content._id],
        creatorProfileId: source.creatorProfileId,
        subscriptionIds: [source._id],
        thumbnailUrl: content.thumbnailUrl,
        authorHandle: content.authorHandle ?? source.identifier,
        creatorName: source.name ?? source.identifier,
        publishedAt: content.discoveredAt || now,
        discoveredAt: content.discoveredAt || now,
        createdAt: now,
      });

      // Mark content as in feed
      await ctx.runMutation(internal.feeds.internal.markContentInFeed, {
        contentIds: [content._id],
        feedItemId,
      });

      results.push({ groupKey, feedItemId, itemCount: 1 });
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

export const getSubscriptionSource = internalQuery({
  args: {
    sourceId: v.id("subscriptionSources"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sourceId);
  },
});

export const getUnprocessedContent = internalQuery({
  args: {
    since: v.number(),
  },
  handler: async (ctx, args) => {
    // Use by_inFeed_discoveredAt index for efficient querying
    return await ctx.db
      .query("subscriptionContent")
      .withIndex("by_inFeed_discoveredAt", (q) =>
        q.eq("inFeed", false).gte("discoveredAt", args.since)
      )
      .collect();
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
    authorHandle: v.optional(v.string()),
    creatorName: v.optional(v.string()),
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
      authorHandle: args.authorHandle,
      creatorName: args.creatorName,
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

// ============================================================================
// Morning Digest Notification
// ============================================================================

/**
 * Create morning digest notifications for all users
 *
 * This internal action is called by the morning digest cron job.
 * It creates a digest notification summarizing unviewed feed content.
 * Unlike the client-facing createDigestNotification mutation, this version
 * runs without user authentication and can be called from a cron job.
 *
 * Note: Currently this is a placeholder that logs the digest creation.
 * In a multi-tenant system, this would iterate over all users and create
 * notifications for each one. For this single-user app, the cron job
 * serves as a trigger for the notification system.
 */
export const createMorningDigest = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; message: string }> => {
    // For a single-user app, we trigger the digest creation
    // In a multi-tenant system, we would query all users and create notifications for each

    // Since we can't call a mutation from an action, we need to implement
    // the digest logic here or use an internal mutation
    // For now, this serves as the cron entry point

    const now = Date.now();
    const since = now - 24 * 60 * 60 * 1000; // Last 24 hours

    // Get recent feed items
    const recentItems = await ctx.runQuery(internal.feeds.internal.getRecentFeedItemsForDigest, { since });

    // Calculate digest statistics
    const stats = {
      total: recentItems.length,
      unviewed: recentItems.filter((item: any) => !item.viewed).length,
      video: recentItems.filter((item: any) => item.contentType === "video").length,
      blog: recentItems.filter((item: any) => item.contentType === "blog").length,
      social: recentItems.filter((item: any) => item.contentType === "social").length,
    };

    return {
      success: true,
      message: `Morning digest: ${stats.unviewed} unviewed items of ${stats.total} total (${stats.video} videos, ${stats.blog} blogs, ${stats.social} social)`,
    };
  },
});

/**
 * Get recent feed items for digest
 *
 * Internal query to fetch feed items from the last 24 hours.
 */
export const getRecentFeedItemsForDigest = internalQuery({
  args: {
    since: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("feedItems")
      .withIndex("by_created")
      .filter((q) => q.gte(q.field("discoveredAt"), args.since))
      .order("desc")
      .take(100);
  },
});

/**
 * Get recent user feedback for feed items
 *
 * Internal query to fetch recent feedback (up/down votes) for feed items.
 * Used to improve AI scoring by incorporating user preferences.
 */
export const getRecentFeedback = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Query recent feedItems by creation time, then filter for feedback
    // We fetch more than needed to account for items without feedback
    const fetchLimit = limit * 3;
    const allItems = await ctx.db
      .query("feedItems")
      .withIndex("by_created")
      .order("desc")
      .take(fetchLimit);

    // Filter and return only items with userFeedback
    return allItems
      .filter((item) => item.userFeedback !== undefined)
      .slice(0, limit)
      .map((item) => ({
        title: item.title,
        feedback: item.userFeedback as "up" | "down",
        feedbackAt: item.userFeedbackAt,
      }));
  },
});

// ============================================================================
// Backfill Migrations
// ============================================================================

/**
 * Backfill contentCategory and authorHandle on existing subscriptionContent records.
 *
 * For each record, looks up the source and derives metadata from sourceType.
 * Safe to run multiple times - only patches records missing contentCategory.
 *
 * NOTE: Intentional full table scan - this is a backfill operation that must
 * process all records to ensure metadata completeness.
 */
export const backfillContentMetadata = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Full scan is intentional for backfill - must process all records
    const allContent = await ctx.db.query("subscriptionContent").collect();

    let patched = 0;
    for (const content of allContent) {
      const source = await ctx.db.get(content.sourceId);
      if (!source) continue;

      const contentCategory = deriveBackfillCategoryFromUrl(content.url ?? "", source.sourceType);
      const authorHandle = content.authorHandle ?? source.name ?? source.identifier;

      // Always re-derive to fix misclassified records
      if (content.contentCategory !== contentCategory || !content.authorHandle) {
        await ctx.db.patch(content._id, {
          contentCategory,
          authorHandle,
        });
        patched++;
      }
    }

    return { patched };
  },
});

/**
 * Rebuild the feed by deleting all existing feedItems and resetting inFeed flags.
 *
 * After running this, trigger buildFeed to regenerate the feed with 1:1 mapping.
 * WARNING: This deletes all existing feedItems. Run backfillContentMetadata first.
 *
 * NOTE: Intentional full table scans - this is a rebuild operation that must
 * process all records to reset the feed state.
 */
export const rebuildFeed = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Full scan is intentional for rebuild - must delete all feed items
    const allFeedItems = await ctx.db.query("feedItems").collect();
    for (const item of allFeedItems) {
      await ctx.db.delete(item._id);
    }

    // Full scan is intentional for rebuild - must reset all content flags
    const allContent = await ctx.db.query("subscriptionContent").collect();
    const contentWithFeedFlag = allContent.filter((c) => c.inFeed);
    for (const content of contentWithFeedFlag) {
      await ctx.db.patch(content._id, {
        inFeed: false,
        feedItemId: undefined,
      });
    }

    return {
      feedItemsDeleted: allFeedItems.length,
      contentReset: contentWithFeedFlag.length,
    };
  },
});

/**
 * Derive content category from URL and source type for backfill purposes.
 * Uses URL domain detection as primary signal for "creator" source types
 * since most creator subscriptions are Twitter/X accounts.
 */
function deriveBackfillCategoryFromUrl(url: string, sourceType: string): string {
  // Direct source type mapping for known types
  switch (sourceType) {
    case 'youtube':
      return 'video';
    case 'reddit':
    case 'bluesky':
      return 'social';
    case 'newsletter':
    case 'changelog':
    case 'blog':
      return 'article';
    case 'whats-new':
      return 'article';
  }
  // For "creator" and other generic types, detect from URL
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "video";
  if (url.includes("reddit.com")) return "social";
  if (url.includes("bsky.app") || url.includes("bluesky")) return "social";
  if (sourceType === "creator") return "social"; // Default for creators
  return 'article';
}

/**
 * Returns true if the given title matches known "unavailable" content placeholder patterns.
 * Defense-in-depth filter applied during feed building to skip any placeholders
 * that slipped through ingestion.
 */
function isUnavailableContent(title: string | undefined): boolean {
  if (!title) return false;
  return (
    /this post is unavailable/i.test(title) ||
    /this tweet is unavailable/i.test(title) ||
    /content is not available/i.test(title)
  );
}
