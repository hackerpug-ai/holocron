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
 * Update a subscription source (e.g., toggle auto-research)
 */
export const update = mutation({
  args: {
    id: v.id("subscriptionSources"),
    autoResearch: v.optional(v.boolean()),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    feedUrl: v.optional(v.string()),
    fetchMethod: v.optional(v.string()),
    configJson: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const subscription = await ctx.db.get(id);
    if (!subscription) {
      throw new Error(`Subscription ${id} not found`);
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
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

/**
 * Batch subscribe to multiple platforms for a creator
 * Creates subscriptions transactionally with detailed error handling
 */
export const batchSubscribe = mutation({
  args: {
    creatorProfileId: v.id("creatorProfiles"),
    platforms: v.array(
      v.union(
        v.literal("youtube"),
        v.literal("twitter"),
        v.literal("bluesky"),
        v.literal("github"),
        v.literal("website")
      )
    ),
    autoResearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get the creator profile
    const profile = await ctx.db.get(args.creatorProfileId);
    if (!profile) {
      throw new Error("Creator profile not found");
    }

    const created: Array<{ subscriptionId: string; platform: string; identifier: string }> = [];
    const failed: Array<{ platform: string; error: string }> = [];
    const now = Date.now();
    const autoResearch = args.autoResearch ?? true;

    // Helper function to get platform URL
    const getPlatformUrl = (platform: string, handle: string): string => {
      switch (platform) {
        case "youtube":
          return `https://youtube.com/@${handle}`;
        case "twitter":
          return `https://x.com/${handle}`;
        case "bluesky":
          return handle.includes(".") ? `https://bsky.app/profile/${handle}` : `https://bsky.app/profile/${handle}.bsky.social`;
        case "github":
          return `https://github.com/${handle}`;
        case "website":
          return handle.startsWith("http") ? handle : `https://${handle}`;
        default:
          return "";
      }
    };

    // Subscribe to each platform
    for (const platform of args.platforms) {
      try {
        const platformData = profile.platforms[platform as keyof typeof profile.platforms];
        if (!platformData) {
          failed.push({ platform, error: "Platform not found in profile" });
          continue;
        }

        // Only subscribe to verified platforms
        if ("verified" in platformData && !platformData.verified) {
          failed.push({ platform, error: "Platform not verified" });
          continue;
        }

        const handle = "handle" in platformData ? platformData.handle : platformData.url;

        // Check if subscription already exists
        // Scan index range and filter in-memory for exact identifier match
        const results = await ctx.db
          .query("subscriptionSources")
          .withIndex("by_identifier")
          .take(1);

        const existing = results.find(s => s.identifier === handle);

        if (existing) {
          failed.push({ platform, error: "Subscription already exists" });
          continue;
        }

        // Create subscription — batch subscribe always creates "creator" source type
        const subscriptionId = await ctx.db.insert("subscriptionSources", {
          sourceType: "creator" as const,
          identifier: handle,
          name: `${profile.name} (${platform})`,
          url: getPlatformUrl(platform, handle),
          fetchMethod: "rss",
          configJson: { creatorProfileId: args.creatorProfileId, platform },
          autoResearch,
          createdAt: now,
          updatedAt: now,
        });

        created.push({
          subscriptionId,
          platform,
          identifier: handle,
        });
      } catch (error) {
        failed.push({
          platform,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { created, failed };
  },
});
