/**
 * Shop Session and Listing Mutations
 *
 * Handles CRUD operations for shop sessions and listings.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Create a new shop session
 */
export const createShopSession = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    retailers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"shopSessions">> => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("shopSessions", {
      conversationId: args.conversationId,
      query: args.query,
      condition: args.condition,
      priceMin: args.priceMin,
      priceMax: args.priceMax,
      retailers: args.retailers,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

/**
 * Update shop session status and metadata
 */
export const updateShopSession = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    status: v.optional(v.string()),
    totalListings: v.optional(v.number()),
    bestDealId: v.optional(v.id("shopListings")),
    errorReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { sessionId, ...updates } = args;

    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(sessionId, filteredUpdates);
  },
});

/**
 * Complete a shop session
 */
export const completeShopSession = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    status: v.string(),
    totalListings: v.optional(v.number()),
    bestDealId: v.optional(v.id("shopListings")),
    errorReason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      status: args.status,
      totalListings: args.totalListings,
      bestDealId: args.bestDealId,
      errorReason: args.errorReason,
      completedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Batch create shop listings
 *
 * Efficiently inserts multiple listings in a single transaction.
 */
export const batchCreateListings = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    listings: v.array(
      v.object({
        title: v.string(),
        price: v.number(),
        originalPrice: v.optional(v.number()),
        currency: v.string(),
        condition: v.string(),
        retailer: v.string(),
        seller: v.optional(v.string()),
        sellerRating: v.optional(v.number()),
        url: v.string(),
        imageUrl: v.optional(v.string()),
        inStock: v.optional(v.boolean()),
        productHash: v.string(),
        isDuplicate: v.boolean(),
        dealScore: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args): Promise<Id<"shopListings">[]> => {
    const now = Date.now();
    const listingIds: Id<"shopListings">[] = [];

    for (const listing of args.listings) {
      const id = await ctx.db.insert("shopListings", {
        sessionId: args.sessionId,
        ...listing,
        createdAt: now,
      });
      listingIds.push(id);
    }

    return listingIds;
  },
});

/**
 * Create a single shop listing
 */
export const createListing = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    title: v.string(),
    price: v.number(),
    originalPrice: v.optional(v.number()),
    currency: v.string(),
    condition: v.string(),
    retailer: v.string(),
    seller: v.optional(v.string()),
    sellerRating: v.optional(v.number()),
    url: v.string(),
    imageUrl: v.optional(v.string()),
    inStock: v.optional(v.boolean()),
    productHash: v.string(),
    isDuplicate: v.boolean(),
    dealScore: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"shopListings">> => {
    const now = Date.now();
    const { sessionId, ...listingData } = args;

    const listingId = await ctx.db.insert("shopListings", {
      sessionId,
      ...listingData,
      createdAt: now,
    });

    return listingId;
  },
});

/**
 * Delete a shop session and all its listings
 */
export const deleteShopSession = mutation({
  args: {
    sessionId: v.id("shopSessions"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Delete all listings for this session
    const listings = await ctx.db
      .query("shopListings")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const listing of listings) {
      await ctx.db.delete(listing._id);
    }

    // Delete the session
    await ctx.db.delete(args.sessionId);
  },
});
