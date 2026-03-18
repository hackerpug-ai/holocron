/**
 * Shop Session and Listing Queries
 *
 * Read operations for shop sessions and listings.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Get a shop session by ID
 */
export const getShopSession = query({
  args: {
    sessionId: v.id("shopSessions"),
  },
  handler: async (ctx, args): Promise<Doc<"shopSessions"> | null> => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get shop session by ID (string version for MCP)
 */
export const getShopSessionByStringId = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"shopSessions"> | null> => {
    try {
      const id = args.sessionId as Id<"shopSessions">;
      return await ctx.db.get(id);
    } catch {
      return null;
    }
  },
});

/**
 * Get all listings for a session
 */
export const getShopListings = query({
  args: {
    sessionId: v.id("shopSessions"),
    sortBy: v.optional(v.string()), // "price" | "dealScore" | "createdAt"
    limit: v.optional(v.number()),
    excludeDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Doc<"shopListings">[]> => {
    let query = ctx.db
      .query("shopListings")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId));

    let listings = await query.collect();

    // Filter duplicates if requested
    if (args.excludeDuplicates) {
      listings = listings.filter((l) => !l.isDuplicate);
    }

    // Sort by specified field
    const sortBy = args.sortBy || "dealScore";
    listings.sort((a, b) => {
      switch (sortBy) {
        case "price":
          return a.price - b.price;
        case "dealScore":
          return (b.dealScore || 0) - (a.dealScore || 0);
        case "createdAt":
        default:
          return b.createdAt - a.createdAt;
      }
    });

    // Apply limit
    if (args.limit) {
      listings = listings.slice(0, args.limit);
    }

    return listings;
  },
});

/**
 * Get listings by string session ID (for MCP)
 */
export const getShopListingsByStringId = query({
  args: {
    sessionId: v.string(),
    sortBy: v.optional(v.string()),
    limit: v.optional(v.number()),
    excludeDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Doc<"shopListings">[]> => {
    try {
      const id = args.sessionId as Id<"shopSessions">;

      let query = ctx.db
        .query("shopListings")
        .withIndex("by_session", (q) => q.eq("sessionId", id));

      let listings = await query.collect();

      // Filter duplicates if requested
      if (args.excludeDuplicates) {
        listings = listings.filter((l) => !l.isDuplicate);
      }

      // Sort by specified field
      const sortBy = args.sortBy || "dealScore";
      listings.sort((a, b) => {
        switch (sortBy) {
          case "price":
            return a.price - b.price;
          case "dealScore":
            return (b.dealScore || 0) - (a.dealScore || 0);
          case "createdAt":
          default:
            return b.createdAt - a.createdAt;
        }
      });

      // Apply limit
      if (args.limit) {
        listings = listings.slice(0, args.limit);
      }

      return listings;
    } catch {
      return [];
    }
  },
});

/**
 * Get search progress for a session
 *
 * Returns current status and listing count for progress tracking.
 */
export const getSearchProgress = query({
  args: {
    sessionId: v.id("shopSessions"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    status: string;
    listingCount: number;
    bestDealId: Id<"shopListings"> | undefined;
    errorReason: string | undefined;
  } | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const listings = await ctx.db
      .query("shopListings")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return {
      status: session.status,
      listingCount: listings.length,
      bestDealId: session.bestDealId,
      errorReason: session.errorReason,
    };
  },
});

/**
 * Get recent shop sessions for a conversation
 */
export const getSessionsByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"shopSessions">[]> => {
    const sessions = await ctx.db
      .query("shopSessions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(args.limit || 10);

    return sessions;
  },
});

/**
 * Get recent shop sessions
 */
export const getRecentSessions = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"shopSessions">[]> => {
    let query;

    if (args.status) {
      query = ctx.db
        .query("shopSessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
    } else {
      query = ctx.db
        .query("shopSessions")
        .withIndex("by_created");
    }

    const sessions = await query.order("desc").take(args.limit || 20);
    return sessions;
  },
});

/**
 * Check for duplicate products by hash
 */
export const checkDuplicateByHash = query({
  args: {
    productHash: v.string(),
    sessionId: v.id("shopSessions"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query("shopListings")
      .withIndex("by_product_hash", (q) => q.eq("productHash", args.productHash))
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .first();

    return existing !== null;
  },
});
