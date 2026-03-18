import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Add a new subscription source
 */
export const add = mutation({
  args: {
    sourceType: v.union(
      v.literal("youtube"),
      v.literal("newsletter"),
      v.literal("changelog"),
      v.literal("reddit"),
      v.literal("ebay"),
      v.literal("whats-new"),
      v.literal("creator")
    ),
    identifier: v.string(),
    name: v.string(),
    url: v.optional(v.string()),
    feedUrl: v.optional(v.string()),
    fetchMethod: v.optional(v.string()),
    configJson: v.optional(v.any()),
    autoResearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if subscription already exists
    const existing = await ctx.db
      .query("subscriptionSources")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .first();

    if (existing) {
      throw new Error(`Subscription with identifier "${args.identifier}" already exists`);
    }

    const id = await ctx.db.insert("subscriptionSources", {
      ...args,
      fetchMethod: args.fetchMethod ?? "rss",
      autoResearch: args.autoResearch ?? true,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(id);
  },
});

/**
 * Remove a subscription source by ID
 */
export const remove = mutation({
  args: {
    subscriptionId: v.id("subscriptionSources"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${args.subscriptionId} not found`);
    }

    // Delete all associated content
    const content = await ctx.db
      .query("subscriptionContent")
      .withIndex("by_source", (q) => q.eq("sourceId", args.subscriptionId))
      .collect();

    for (const item of content) {
      await ctx.db.delete(item._id);
    }

    // Delete all associated filters
    const filters = await ctx.db
      .query("subscriptionFilters")
      .withIndex("by_source", (q) => q.eq("sourceId", args.subscriptionId))
      .collect();

    for (const filter of filters) {
      await ctx.db.delete(filter._id);
    }

    // Delete the subscription
    await ctx.db.delete(args.subscriptionId);

    return { deleted: true, subscription };
  },
});

/**
 * Set a filter for a subscription source
 */
export const setFilter = mutation({
  args: {
    sourceId: v.optional(v.id("subscriptionSources")),
    sourceType: v.optional(v.string()),
    ruleName: v.string(),
    ruleType: v.string(),
    ruleValue: v.any(),
    weight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { sourceId, sourceType, ruleName, ruleType, ruleValue, weight = 1.0 } = args;

    // Check if filter already exists
    const existingFilters = await ctx.db.query("subscriptionFilters").collect();

    const existing = existingFilters.find(
      (f) =>
        f.ruleName === ruleName &&
        f.sourceType === sourceType &&
        (sourceId ? f.sourceId?.toString() === sourceId.toString() : f.sourceId === undefined)
    );

    if (existing) {
      // Update existing filter
      await ctx.db.patch(existing._id, {
        ruleType,
        ruleValue,
        weight,
      });
      return await ctx.db.get(existing._id);
    }

    // Create new filter
    const id = await ctx.db.insert("subscriptionFilters", {
      sourceId,
      sourceType,
      ruleName,
      ruleType,
      ruleValue,
      weight,
      createdAt: now,
    });

    return await ctx.db.get(id);
  },
});
