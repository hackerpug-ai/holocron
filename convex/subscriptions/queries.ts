import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get a subscription source by ID
 */
export const get = query({
  args: { id: v.id("subscriptionSources") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * List all subscription sources with optional filtering
 */
export const list = query({
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
    autoResearchOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sourceType, autoResearchOnly, limit = 100 } = args;

    let sources;
    if (autoResearchOnly) {
      sources = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_auto_research", (q) => q.eq("autoResearch", true))
        .take(limit);
    } else if (sourceType) {
      sources = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_type", (q) => q.eq("sourceType", sourceType))
        .take(limit);
    } else {
      sources = await ctx.db.query("subscriptionSources").take(limit);
    }

    return sources;
  },
});

/**
 * Get filters for a subscription source
 */
export const getFilters = query({
  args: {
    subscriptionId: v.optional(v.id("subscriptionSources")),
    sourceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { subscriptionId, sourceType } = args;

    const filters = await ctx.db.query("subscriptionFilters").collect();

    // Filter by source ID if provided
    let filtered = filters;
    if (subscriptionId) {
      filtered = filtered.filter((f) => {
        // Include filters specific to this source OR global filters (null sourceId)
        return f.sourceId === subscriptionId || f.sourceId === undefined;
      });
    }

    // Filter by source type if provided
    if (sourceType) {
      filtered = filtered.filter((f) => f.sourceType === sourceType);
    }

    return filtered;
  },
});

/**
 * List content for a subscription source
 */
export const listContent = query({
  args: {
    subscriptionId: v.id("subscriptionSources"),
    researchStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("queued"),
        v.literal("researched"),
        v.literal("skipped")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { subscriptionId, researchStatus, limit = 50 } = args;

    let content;
    if (researchStatus) {
      content = await ctx.db
        .query("subscriptionContent")
        .withIndex("by_status", (q) => q.eq("researchStatus", researchStatus))
        .filter((q) => q.eq(q.field("sourceId"), subscriptionId))
        .take(limit);
    } else {
      content = await ctx.db
        .query("subscriptionContent")
        .withIndex("by_source", (q) => q.eq("sourceId", subscriptionId))
        .take(limit);
    }

    return content;
  },
});

/**
 * Batch fetch all existing subscription content for duplicate checking.
 * Returns a map of sourceId -> Set of contentIds for O(1) lookups.
 * Used by checkAllSubscriptions to avoid per-item database queries.
 */
export const batchGetExistingContent = query({
  args: {},
  handler: async (ctx) => {
    const allContent = await ctx.db.query("subscriptionContent").collect();
    const lookup = new Map<string, Set<string>>();

    for (const content of allContent) {
      const sourceIdStr = content.sourceId.toString();
      if (!lookup.has(sourceIdStr)) {
        lookup.set(sourceIdStr, new Set());
      }
      lookup.get(sourceIdStr)!.add(content.contentId);
    }

    // Convert Map to object for serialization
    const result: Record<string, string[]> = {};
    for (const [sourceId, contentIds] of lookup.entries()) {
      result[sourceId] = Array.from(contentIds);
    }

    return result;
  },
});

/**
 * List subscriptions grouped by creator profile or identifier.
 * Returns CreatorGroup objects with subscription counts and document counts.
 */
export const listGroupedByCreator = query({
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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sourceType, limit = 100 } = args;

    // Fetch subscriptions with optional source type filter
    let subscriptions;
    if (sourceType) {
      subscriptions = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_type", (q) => q.eq("sourceType", sourceType))
        .take(limit);
    } else {
      subscriptions = await ctx.db.query("subscriptionSources").take(limit);
    }

    // Group subscriptions by creatorProfileId or identifier
    const groups = new Map<string, {
      creatorProfileId: string | null;
      name: string;
      subscriptions: typeof subscriptions;
      platformCount: number;
      lastActivityAt: number;
      avatarUrl?: string;
    }>();

    for (const subscription of subscriptions) {
      const creatorProfileId = subscription.configJson?.creatorProfileId as string | null;
      const groupKey = creatorProfileId || `standalone-${subscription._id}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          creatorProfileId,
          name: subscription.name || subscription.identifier,
          subscriptions: [],
          platformCount: 0,
          lastActivityAt: subscription.createdAt,
          avatarUrl: subscription.configJson?.avatarUrl as string | undefined,
        });
      }

      const group = groups.get(groupKey)!;
      group.subscriptions.push(subscription);
      group.platformCount += 1;

      // Update last activity timestamp
      if (subscription.updatedAt > group.lastActivityAt) {
        group.lastActivityAt = subscription.updatedAt;
      }

      // Use creator profile name if available
      if (creatorProfileId && !group.avatarUrl) {
        // Could fetch creator profile here for avatar, but keeping it simple for now
      }
    }

    // Count documents for each group
    const allContent = await ctx.db.query("subscriptionContent").collect();
    const documentCounts = new Map<string, number>();

    for (const content of allContent) {
      // Only count researched content with documents
      if (content.researchStatus === "researched" && content.documentId) {
        const sourceIdStr = content.sourceId.toString();
        documentCounts.set(sourceIdStr, (documentCounts.get(sourceIdStr) || 0) + 1);
      }
    }

    // Build result with document counts
    const result = Array.from(groups.values()).map((group) => {
      // Sum document counts across all subscriptions in the group
      const documentCount = group.subscriptions.reduce((sum, sub) => {
        return sum + (documentCounts.get(sub._id.toString()) || 0);
      }, 0);

      return {
        ...group,
        documentCount,
      };
    });

    // Sort by last activity (newest first)
    result.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    return result;
  },
});

/**
 * List content with documents for multiple subscriptions.
 * Returns content items joined with their associated documents.
 */
export const listContentWithDocuments = query({
  args: {
    subscriptionIds: v.array(v.id("subscriptionSources")),
    researchStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("queued"),
        v.literal("researched"),
        v.literal("skipped")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { subscriptionIds, researchStatus, limit = 50 } = args;

    // Fetch content for the given subscriptions
    let content;
    if (researchStatus) {
      content = await ctx.db
        .query("subscriptionContent")
        .withIndex("by_status", (q) => q.eq("researchStatus", researchStatus))
        .filter((q) =>
          q.and(
            q.eq(q.field("sourceId"), subscriptionIds[0]),
            // Note: filtering by array of IDs requires multiple queries or a different index strategy
            // For now, we'll fetch and filter client-side for multiple IDs
          )
        )
        .take(limit);
    } else {
      content = await ctx.db
        .query("subscriptionContent")
        .take(limit);
    }

    // Filter by subscription IDs on the client side
    const filteredContent = content.filter((c) =>
      subscriptionIds.some((id) => id.toString() === c.sourceId.toString())
    );

    // Join with documents
    const result = await Promise.all(
      filteredContent.map(async (contentItem) => {
        const document = contentItem.documentId
          ? await ctx.db.get(contentItem.documentId)
          : null;
        return {
          content: contentItem,
          document,
        };
      })
    );

    // Sort by discovered date (newest first)
    result.sort((a, b) => b.content.discoveredAt - a.content.discoveredAt);

    return result;
  },
});
