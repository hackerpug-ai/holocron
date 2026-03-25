import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Search creators by name with fuzzy matching
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    exactMatch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    if (args.exactMatch) {
      // Exact match via by_name index
      const results = await ctx.db
        .query("creatorProfiles")
        .withIndex("by_name")
        .filter((q) => q.eq(q.field("name"), args.query))
        .take(limit);

      return { creators: results };
    }

    // Fuzzy search via searchIndex
    const results = await ctx.db
      .query("creatorProfiles")
      .withSearchIndex("by_name_search", (q) =>
        q.search("name", args.query)
      )
      .take(limit);

    return { creators: results };
  },
});

/**
 * Get creator profile by ID
 */
export const get = query({
  args: {
    profileId: v.id("creatorProfiles"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) {
      throw new Error("Creator profile not found");
    }
    return { creator: profile };
  },
});

/**
 * Get creator profile by handle
 */
export const getByHandle = query({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("creatorProfiles")
      .withIndex("by_handle")
      .filter((q) => q.eq(q.field("handle"), args.handle))
      .take(1);

    if (results.length === 0) {
      return { creator: null };
    }

    return { creator: results[0] };
  },
});

/**
 * Get subscriptions for a creator profile
 */
export const getSubscriptions = query({
  args: {
    profileId: v.id("creatorProfiles"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) {
      throw new Error("Creator profile not found");
    }

    // Find all subscriptions that match this creator's platforms
    const platformIdentifiers: string[] = [];

    if (profile.platforms.youtube) {
      platformIdentifiers.push(profile.platforms.youtube.handle);
    }
    if (profile.platforms.twitter) {
      platformIdentifiers.push(profile.platforms.twitter.handle);
    }
    if (profile.platforms.bluesky) {
      platformIdentifiers.push(profile.platforms.bluesky.handle);
    }
    if (profile.platforms.github) {
      platformIdentifiers.push(profile.platforms.github.handle);
    }

    // Query subscriptions by identifiers
    const subscriptions = [];
    for (const identifier of platformIdentifiers) {
      const results = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_identifier")
        .filter((q) => q.eq(q.field("identifier"), identifier))
        .collect();

      subscriptions.push(...results);
    }

    return { subscriptions };
  },
});
