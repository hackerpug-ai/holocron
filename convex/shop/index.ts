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
    verifiedOnly?: boolean;
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
    verifiedOnly: args.verifiedOnly,
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

    // Verified-only filter: Tier 1 always, Tier 2 with sellerTrustScore >= 60
    if (args.verifiedOnly) {
      filteredResults = filteredResults.filter((r) => {
        if (r.trustTier === 1) return true;
        if (r.trustTier === 2 && (r.sellerTrustScore ?? 0) >= 60) return true;
        return false;
      });
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
            trustTier: l.trustTier,
            sellerTrustScore: l.sellerTrustScore,
            isVerifiedSeller: l.trustTier === 1 || (l.trustTier === 2 && (l.sellerTrustScore ?? 0) >= 60),
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
 * Start Shop Search (with Planning Phase)
 *
 * Main entry point for product searches across multiple retailers.
 *
 * NEW Workflow (with planId):
 * 1. Validate plan is approved
 * 2. Execute search with approved plan
 * 3. Update plan status during execution
 *
 * LEGACY Workflow (without planId):
 * Direct execution without planning phase (backward compatibility)
 *
 * @param conversationId - Optional conversation to associate results with
 * @param query - Product search query
 * @param retailers - Optional array of retailer keys (defaults to all)
 * @param condition - Filter by condition: "new", "used", or "any"
 * @param priceMin - Minimum price in dollars
 * @param priceMax - Maximum price in dollars
 * @param planId - Optional execution plan ID (new workflow)
 */
export const startShopSearch = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    retailers: v.optional(v.array(v.string())),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    verifiedOnly: v.optional(v.boolean()),
    planId: v.optional(v.id("executionPlans")),
  },
  handler: async (ctx, args): Promise<ShopSearchActionResult> => {
    const { planId } = args;

    // NEW WORKFLOW: With planning phase
    if (planId) {
      return await executeShopSearchWithPlan(ctx, { ...args, planId });
    }

    // LEGACY WORKFLOW: Direct execution (backward compatibility)
    return await executeShopSearchDirect(ctx, args);
  },
});

/**
 * Execute shop search with approved plan (NEW workflow)
 *
 * AC-2: Approved plan -> Execute search -> Update plan status during execution
 */
async function executeShopSearchWithPlan(
  ctx: ActionCtx,
  args: {
    conversationId?: Id<"conversations">;
    query: string;
    retailers?: string[];
    condition?: string;
    priceMin?: number;
    priceMax?: number;
    verifiedOnly?: boolean;
    planId: Id<"executionPlans">;
  }
): Promise<ShopSearchActionResult> {
  const { conversationId, query, planId } = args;

  // Validate plan is approved
  const plan: any = await ctx.runQuery(api.plans.queries.getPlan, { planId });
  if (!plan) {
    throw new Error(`Plan ${planId} not found`);
  }

  if (plan.status !== "approved") {
    throw new Error(`Cannot execute plan in ${plan.status} status. Plan must be approved first.`);
  }

  // Extract retailers from plan content
  const planRetailers = plan.content.retailers
    ?.filter((r: any) => r.enabled)
    .map((r: any) => r.name) || DEFAULT_RETAILERS;

  console.log(
    `[executeShopSearchWithPlan] Entry - planId: ${planId}, query: "${query}", retailers: [${planRetailers.join(", ")}]`
  );

  try {
    // Update plan status to executing
    await ctx.runMutation(api.shop.mutations.updateShopPlanExecutionStatus, {
      planId,
      status: "executing" as const,
      currentStepIndex: 0,
    });

    // Post execution card if we have a conversation
    if (conversationId) {
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Searching for "${query}"...`,
        messageType: "result_card" as const,
        cardData: {
          card_type: "shop_search_loading",
          query,
          planId,
          retailers: planRetailers,
        },
      });
    }

    // Execute the actual search
    const startTime = Date.now();
    const retailers = planRetailers.length ? planRetailers : DEFAULT_RETAILERS;

    // Step 1: Create session
    const sessionId = await ctx.runMutation(api.shop.mutations.createShopSession, {
      conversationId: args.conversationId,
      query: args.query,
      condition: args.condition,
      priceMin: args.priceMin,
      priceMax: args.priceMax,
      retailers,
      planId,
      verifiedOnly: args.verifiedOnly,
    });

    console.log(`[executeShopSearchWithPlan] Created session: ${sessionId}`);

    // Update plan progress
    await ctx.runMutation(api.shop.mutations.updateShopPlanExecutionStatus, {
      planId,
      status: "executing" as const,
      currentStepIndex: 1,
    });

    // Step 2: Update status to searching
    await ctx.runMutation(api.shop.mutations.updateShopSession, {
      sessionId,
      status: "searching",
    });

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
      `[executeShopSearchWithPlan] Search complete - ${searchResult.results.length} results`
    );

    // Update plan progress
    await ctx.runMutation(api.shop.mutations.updateShopPlanExecutionStatus, {
      planId,
      status: "executing" as const,
      currentStepIndex: 2,
    });

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
      );
    }

    if (args.priceMax !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => r.price <= args.priceMax! * 100
      );
    }

    // Verified-only filter: Tier 1 always, Tier 2 with sellerTrustScore >= 60
    if (args.verifiedOnly) {
      filteredResults = filteredResults.filter((r) => {
        if (r.trustTier === 1) return true;
        if (r.trustTier === 2 && (r.sellerTrustScore ?? 0) >= 60) return true;
        return false;
      });
    }

    console.log(
      `[executeShopSearchWithPlan] After filtering: ${filteredResults.length} results`
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
            trustTier: l.trustTier,
            sellerTrustScore: l.sellerTrustScore,
            isVerifiedSeller: l.trustTier === 1 || (l.trustTier === 2 && (l.sellerTrustScore ?? 0) >= 60),
          })),
        }
      );

      console.log(`[executeShopSearchWithPlan] Created ${listingIds.length} listings`);

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
        status: "completed" as const,
        totalListings: listingsWithDuplicates.filter((l) => !l.isDuplicate).length,
        bestDealId,
      });

      // Update plan status to completed
      await ctx.runMutation(api.shop.mutations.updateShopPlanExecutionStatus, {
        planId,
        status: "completed" as const,
      });

      const durationMs = Date.now() - startTime;
      console.log(`[executeShopSearchWithPlan] Exit - completed in ${durationMs}ms`);

      const shopResult = {
        sessionId,
        status: "completed" as const,
        totalListings: listingsWithDuplicates.filter((l) => !l.isDuplicate).length,
        bestDealId,
        durationMs,
      };

      // Post result cards if we have a conversation
      if (conversationId) {
        await postShopResults(ctx, conversationId, query, sessionId, shopResult);
      }

      return shopResult;
    }

    // No results found
    await ctx.runMutation(api.shop.mutations.completeShopSession, {
      sessionId,
      status: "completed" as const,
      totalListings: 0,
    });

    // Update plan status to completed
    await ctx.runMutation(api.shop.mutations.updateShopPlanExecutionStatus, {
      planId,
      status: "completed" as const,
    });

    const durationMs = Date.now() - startTime;
    const shopResult = {
      sessionId,
      status: "completed" as const,
      totalListings: 0,
      durationMs,
    };

    if (conversationId) {
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `No products found for "${query}".`,
        messageType: "text" as const,
      });
    }

    return shopResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[executeShopSearchWithPlan] Error: ${errorMessage}`);

    // Update plan status to failed
    await ctx.runMutation(api.shop.mutations.updateShopPlanExecutionStatus, {
      planId,
      status: "failed" as const,
      errorMessage,
    });

    // Post error card if we have a conversation
    if (conversationId) {
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Shop search failed: ${errorMessage}`,
        messageType: "error" as const,
      });
    }

    throw error;
  }
}

/**
 * Execute shop search directly (LEGACY workflow)
 *
 * Backward compatibility for calls without planning phase.
 */
async function executeShopSearchDirect(
  ctx: ActionCtx,
  args: {
    conversationId?: Id<"conversations">;
    query: string;
    retailers?: string[];
    condition?: string;
    priceMin?: number;
    priceMax?: number;
    verifiedOnly?: boolean;
  }
): Promise<ShopSearchActionResult> {
  const { conversationId, query } = args;

  try {
    // Post loading card if we have a conversation
    if (conversationId) {
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Searching for "${query}"...`,
        messageType: "result_card" as const,
        cardData: { card_type: "shop_search_loading", query },
      });
    }

    // Run the actual search
    const shopResult = await executeShopSearch(ctx, args);

    // Post result/error cards if we have a conversation
    if (conversationId) {
      await postShopResults(ctx, conversationId, query, shopResult.sessionId, shopResult);
    }

    return shopResult;
  } catch (error) {
    // Post error card if we have a conversation
    if (conversationId) {
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Shop search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        messageType: "error" as const,
      });
    }
    throw error;
  }
}

/**
 * Post shop results to conversation
 *
 * Helper function to post search results as a card.
 */
async function postShopResults(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  query: string,
  sessionId: Id<"shopSessions">,
  shopResult: ShopSearchActionResult
): Promise<void> {
  if (shopResult.totalListings > 0) {
    // Query listings from DB and build result card
    const listingsData: any[] = await ctx.runQuery(
      api.shop.queries.getShopListings,
      {
        sessionId,
        limit: 10,
        excludeDuplicates: true,
        sortBy: "dealScore",
      },
    );

    const listings = (listingsData || []).map((l: any) => ({
      card_type: "shop_listing",
      listing_id: l._id,
      title: l.title,
      price: l.price,
      original_price: l.originalPrice,
      currency: l.currency || "USD",
      condition: l.condition,
      retailer: l.retailer,
      seller: l.seller,
      seller_rating: l.sellerRating,
      url: l.url,
      image_url: l.imageUrl,
      in_stock: l.inStock ?? true,
      deal_score: l.dealScore,
    }));

    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent" as const,
      content: `Found ${shopResult.totalListings} product${shopResult.totalListings === 1 ? "" : "s"} for "${query}"`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "shop_results",
        session_id: sessionId,
        query,
        total_listings: shopResult.totalListings,
        best_deal_id: shopResult.bestDealId,
        listings,
        status: shopResult.status,
        duration_ms: shopResult.durationMs,
      },
    });
  } else {
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent" as const,
      content: `No products found for "${query}".`,
      messageType: "text" as const,
    });
  }
}


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
