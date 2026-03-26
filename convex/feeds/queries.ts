import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get feed items with pagination and filtering
 * Supports filtering by contentType, viewed status, and creator
 * Uses optimal indexes for performance based on provided filters
 */
export const getFeed = query({
  args: {
    limit: v.optional(v.number()),
    contentType: v.optional(
      v.union(
        v.literal("video"),
        v.literal("blog"),
        v.literal("social")
      )
    ),
    viewed: v.optional(v.boolean()),
    creatorProfileId: v.optional(v.id("creatorProfiles")),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Build index selection based on filters
    if (args.creatorProfileId) {
      // Use by_creator index when filtering by creator
      const items = await ctx.db
        .query("feedItems")
        .withIndex("by_creator", (q) =>
          q.eq("creatorProfileId", args.creatorProfileId!)
        )
        .filter((q) => {
          // Apply additional filters
          if (args.contentType && !q.eq(q.field("contentType"), args.contentType)) {
            return false;
          }
          if (args.viewed !== undefined && !q.eq(q.field("viewed"), args.viewed)) {
            return false;
          }
          return true;
        })
        .order("desc")
        .take(limit);

      return items;
    }

    if (args.viewed !== undefined) {
      // Use by_viewed index for unviewed/viewed filtering
      const items = await ctx.db
        .query("feedItems")
        .withIndex("by_viewed", (q) =>
          q.eq("viewed", args.viewed!)
        )
        .filter((q) => {
          if (args.contentType && !q.eq(q.field("contentType"), args.contentType)) {
            return false;
          }
          return true;
        })
        .order("desc")
        .take(limit);

      return items;
    }

    // Default: use by_created index
    let query = ctx.db.query("feedItems").withIndex("by_created");

    if (args.contentType) {
      query = query.filter((q) => q.eq(q.field("contentType"), args.contentType));
    }

    const items = await query.order("desc").take(limit);
    return items;
  },
});

/**
 * Get feed items for a specific creator
 * Optimized for creator detail views with by_creator index
 * Returns items in descending order (newest first)
 */
export const getByCreator = query({
  args: {
    creatorProfileId: v.id("creatorProfiles"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // Use by_creator index for optimal performance
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_creator", (q) =>
        q.eq("creatorProfileId", args.creatorProfileId)
      )
      .order("desc")
      .take(limit);

    return items;
  },
});

/**
 * Get count of unviewed feed items
 * Returns the number of items where viewed=false
 * Supports optional filtering by creatorProfileId
 */
export const getUnviewedCount = query({
  args: {
    creatorProfileId: v.optional(v.id("creatorProfiles")),
  },
  handler: async (ctx, args) => {
    // Use by_viewed index for counting unviewed items
    if (args.creatorProfileId) {
      // Count unviewed for specific creator using by_creator index
      const items = await ctx.db
        .query("feedItems")
        .withIndex("by_creator", (q) =>
          q.eq("creatorProfileId", args.creatorProfileId)
        )
        .filter((q) => q.eq(q.field("viewed"), false))
        .collect();

      return items.length;
    }

    // Count all unviewed items
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_viewed", (q) =>
        q.eq("viewed", false)
      )
      .collect();

    return items.length;
  },
});

/**
 * Get digest summary for notifications and banners
 * Returns counts by content type, sample items, and summary text
 * Filters items by discoveredAt >= since timestamp (default 24h)
 */
export const getDigestSummary = query({
  args: {
    since: v.optional(v.number()), // Timestamp to filter from
    limit: v.optional(v.number()), // Max items to analyze (default 100)
  },
  handler: async (ctx, args) => {
    const since = args.since ?? (Date.now() - 24 * 60 * 60 * 1000); // Default 24h
    const limit = args.limit ?? 100;

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
    if (counts.video > 0) parts.push(`${counts.video} video${counts.video > 1 ? 's' : ''}`);
    if (counts.blog > 0) parts.push(`${counts.blog} blog${counts.blog > 1 ? 's' : ''}`);
    if (counts.social > 0) parts.push(`${counts.social} social post${counts.social > 1 ? 's' : ''}`);

    const summary = parts.length > 0
      ? parts.join(", ")
      : "No new content";

    return {
      counts,
      sampleItems,
      summary,
      timestamp: Date.now(),
    };
  },
});
