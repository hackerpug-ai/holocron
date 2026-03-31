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
      // Exact match via by_name index (range scan since name is not unique)
      const results = await ctx.db
        .query("creatorProfiles")
        .withIndex("by_name")
        .take(limit);

      // Filter in-memory for exact match
      const exactMatches = results.filter(c => c.name === args.query);
      return { creators: exactMatches };
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
    // For unique index, scan range and filter in-memory
    const results = await ctx.db
      .query("creatorProfiles")
      .withIndex("by_handle")
      .take(1);

    // Filter in-memory for exact handle match
    const exactMatch = results.find(c => c.handle === args.handle);
    if (!exactMatch) {
      return { creator: null };
    }

    return { creator: exactMatch };
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
    if (profile.platforms.bluesky) {
      platformIdentifiers.push(profile.platforms.bluesky.handle);
    }
    if (profile.platforms.github) {
      platformIdentifiers.push(profile.platforms.github.handle);
    }

    // Query subscriptions by identifiers
    const subscriptions = [];
    for (const identifier of platformIdentifiers) {
      // Scan index range and filter in-memory for exact identifier match
      const results = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_identifier")
        .take(100);

      const exactMatches = results.filter(s => s.identifier === identifier);
      subscriptions.push(...exactMatches);
    }

    return { subscriptions };
  },
});
