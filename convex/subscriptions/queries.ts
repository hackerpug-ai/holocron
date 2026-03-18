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
        v.literal("whats-new")
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
