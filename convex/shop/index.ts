/**
 * Shop Module Entry Point
 *
 * Main action for starting shop searches.
 */

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  executeParallelShopSearch,
  DEFAULT_RETAILERS,
  type ShopSearchResult,
} from "./search";

// ============================================================================
// Types
// ============================================================================

export interface ShopSearchActionResult {
  sessionId: Id<"shopSessions">;
  status: string;
  totalListings: number;
  bestDealId?: Id<"shopListings">;
  durationMs: number;
  error?: string;
}

// ============================================================================
// Internal Helper
// ============================================================================

/**
 * Execute shop search (internal helper)
 *
 * Can be called directly from other actions.
 */
export async function executeShopSearch(
  ctx: ActionCtx,
  args: {
    conversationId?: Id<"conversations">;
    query: string;
    retailers?: string[];
    condition?: string;
    priceMin?: number;
    priceMax?: number;
  }
): Promise<ShopSearchActionResult> {
  const startTime = Date.now();
  const retailers = args.retailers?.length ? args.retailers : DEFAULT_RETAILERS;

  console.log(
    `[executeShopSearch] Entry - query: "${args.query}", retailers: [${retailers.join(", ")}]`
  );

  // Step 1: Create session
  const sessionId = await ctx.runMutation(api.shop.mutations.createShopSession, {
    conversationId: args.conversationId,
    query: args.query,
    condition: args.condition,
    priceMin: args.priceMin,
    priceMax: args.priceMax,
    retailers,
  });

  console.log(`[executeShopSearch] Created session: ${sessionId}`);

  // Step 2: Update status to searching
  await ctx.runMutation(api.shop.mutations.updateShopSession, {
    sessionId,
    status: "searching",
  });

  try {
    // Step 3: Execute parallel search
    const searchResult = await executeParallelShopSearch(
      args.query,
      retailers,
      {
        maxRetries: 2,
        timeoutMs: 15000,
        deduplicateResults: true,
      }
    );

    console.log(
      `[executeShopSearch] Search complete - ${searchResult.results.length} results`
    );

    // Step 4: Filter results by condition and price if specified
    let filteredResults = searchResult.results;

    if (args.condition && args.condition !== "any") {
      filteredResults = filteredResults.filter((r) => {
        if (args.condition === "new") {
          return r.condition === "new";
        }
        if (args.condition === "used") {
          return ["used", "refurbished", "open_box", "like_new"].includes(
            r.condition
          );
        }
        return true;
      });
    }

    if (args.priceMin !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => r.price >= args.priceMin! * 100
      ); // Convert to cents
    }

    if (args.priceMax !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => r.price <= args.priceMax! * 100
      ); // Convert to cents
    }

    console.log(
      `[executeShopSearch] After filtering: ${filteredResults.length} results`
    );

    // Step 5: Mark duplicates within session
    const seenHashes = new Set<string>();
    const listingsWithDuplicates: Array<ShopSearchResult & { isDuplicate: boolean }> = [];

    for (const result of filteredResults) {
      const isDuplicate = seenHashes.has(result.productHash);
      seenHashes.add(result.productHash);
      listingsWithDuplicates.push({ ...result, isDuplicate });
    }

    // Step 6: Batch create listings
    if (listingsWithDuplicates.length > 0) {
      const listingIds = await ctx.runMutation(
        api.shop.mutations.batchCreateListings,
        {
          sessionId,
          listings: listingsWithDuplicates.map((l) => ({
            title: l.title,
            price: l.price,
            originalPrice: l.originalPrice,
            currency: l.currency,
            condition: l.condition,
            retailer: l.retailer,
            seller: l.seller,
            sellerRating: l.sellerRating,
            url: l.url,
            imageUrl: l.imageUrl,
            inStock: l.inStock,
            productHash: l.productHash,
            isDuplicate: l.isDuplicate,
            dealScore: l.dealScore,
          })),
        }
      );

      console.log(`[executeShopSearch] Created ${listingIds.length} listings`);

      // Find best deal (highest deal score, non-duplicate)
      const nonDuplicates = listingsWithDuplicates.filter((l) => !l.isDuplicate);
      const bestDeal = nonDuplicates.sort(
        (a, b) => (b.dealScore || 0) - (a.dealScore || 0)
      )[0];

      const bestDealId = bestDeal
        ? listingIds[listingsWithDuplicates.indexOf(
            listingsWithDuplicates.find(
              (l) => l.productHash === bestDeal.productHash && !l.isDuplicate
            )!
          )]
        : undefined;

      // Step 7: Complete session
      await ctx.runMutation(api.shop.mutations.completeShopSession, {
        sessionId,
        status: "completed",
        totalListings: listingsWithDuplicates.filter((l) => !l.isDuplicate).length,
        bestDealId,
      });

      const durationMs = Date.now() - startTime;
      console.log(`[executeShopSearch] Exit - completed in ${durationMs}ms`);

      return {
        sessionId,
        status: "completed",
        totalListings: listingsWithDuplicates.filter((l) => !l.isDuplicate).length,
        bestDealId,
        durationMs,
      };
    }

    // No results found
    await ctx.runMutation(api.shop.mutations.completeShopSession, {
      sessionId,
      status: "completed",
      totalListings: 0,
    });

    const durationMs = Date.now() - startTime;
    return {
      sessionId,
      status: "completed",
      totalListings: 0,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[executeShopSearch] Error: ${errorMessage}`);

    await ctx.runMutation(api.shop.mutations.completeShopSession, {
      sessionId,
      status: "failed",
      errorReason: errorMessage,
    });

    return {
      sessionId,
      status: "failed",
      totalListings: 0,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Exported Action
// ============================================================================

/**
 * Start Shop Search
 *
 * Main entry point for product searches across multiple retailers.
 *
 * @param conversationId - Optional conversation to associate results with
 * @param query - Product search query
 * @param retailers - Optional array of retailer keys (defaults to all)
 * @param condition - Filter by condition: "new", "used", or "any"
 * @param priceMin - Minimum price in dollars
 * @param priceMax - Maximum price in dollars
 */
export const startShopSearch = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    retailers: v.optional(v.array(v.string())),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ShopSearchActionResult> => {
    return executeShopSearch(ctx, args);
  },
});

/**
 * Get Shop Session with Listings
 *
 * Retrieves a complete shop session with all listings.
 */
export const getShopSessionWithListings = action({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
    excludeDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ session: any; listings: any } | null> => {
    const session: any = await ctx.runQuery(api.shop.queries.getShopSessionByStringId, {
      sessionId: args.sessionId,
    });

    if (!session) {
      return null;
    }

    const listings: any = await ctx.runQuery(api.shop.queries.getShopListingsByStringId, {
      sessionId: args.sessionId,
      limit: args.limit,
      excludeDuplicates: args.excludeDuplicates ?? true,
      sortBy: "dealScore",
    });

    return {
      session,
      listings,
    };
  },
});
