import { query } from "../_generated/server";
import { v } from "convex/values";

const STATUS_VALUES = v.union(v.literal("open"), v.literal("closed"));

/**
 * List improvement requests, excluding merged ones.
 * When status is provided, uses by_status index.
 * When no status, uses by_created index.
 * Default limit: 20.
 */
export const list = query({
  args: {
    status: v.optional(STATUS_VALUES),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { status, limit = 20 } = args;

    let results;

    if (status !== undefined) {
      results = await ctx.db
        .query("improvementRequests")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(limit);
    } else {
      results = await ctx.db
        .query("improvementRequests")
        .withIndex("by_created")
        .order("desc")
        .take(limit);
    }

    // Post-filter out merged requests (where mergedIntoId is defined)
    return results.filter((r) => r.mergedIntoId === undefined);
  },
});

/**
 * Get a single improvement request by ID, including associated images with resolved URLs.
 */
export const get = query({
  args: { id: v.id("improvementRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) return null;

    const images = await ctx.db
      .query("improvementImages")
      .withIndex("by_request", (q) => q.eq("requestId", args.id))
      .collect();

    const imagesWithUrls = await Promise.all(
      images.map(async (image) => {
        const url = await ctx.storage.getUrl(image.storageId);
        return { ...image, url };
      })
    );

    return { ...request, images: imagesWithUrls };
  },
});

/**
 * Get all images for a given improvement request, with resolved storage URLs.
 */
export const getImages = query({
  args: { requestId: v.id("improvementRequests") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("improvementImages")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();

    return Promise.all(
      images.map(async (image) => {
        const url = await ctx.storage.getUrl(image.storageId);
        return { ...image, url };
      })
    );
  },
});

/**
 * Full-text search across improvement request titles using the by_title_search index.
 * Default limit: 10.
 */
export const fullTextSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { query: searchQuery, limit = 10 } = args;

    return ctx.db
      .query("improvementRequests")
      .withSearchIndex("by_title_search", (q) => q.search("title", searchQuery))
      .take(limit);
  },
});
