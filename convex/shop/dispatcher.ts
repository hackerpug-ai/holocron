/**
 * Retailer Dispatcher for Shop Plans
 *
 * Task #306: Orchestrates parallel retailer searches based on approved shop plans.
 *
 * Architecture:
 * - Parses approved shop plans into retailer assignments
 * - Dispatches parallel queries to each retailer (Amazon, eBay, etc.)
 * - Aggregates and deduplicates results
 * - Handles retailer API failures gracefully
 * - Returns unified product listings with deal scores
 *
 * @see convex/shop/search.ts - Parallel shop search execution
 * @see convex/shop/index.ts - Shop module entry point
 */

"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  executeParallelShopSearch,
  RETAILERS,
  DEFAULT_RETAILERS,
  type ShopSearchResult,
} from "./search";

// ============================================================================
// Types
// ============================================================================

/**
 * Retailer worker result from a single retailer search
 */
export interface RetailerWorkerResult {
  retailer: string;
  retailerKey: string;
  success: boolean;
  results?: ShopSearchResult[];
  error?: string;
  durationMs: number;
  resultCount: number;
}

/**
 * Aggregated dispatcher results
 */
export interface RetailerDispatcherResult {
  sessionId: Id<"shopSessions">;
  conversationId: Id<"conversations">;
  status: "completed" | "partial" | "failed";
  retailers: {
    total: number;
    completed: number;
    failed: number;
  };
  listings: {
    total: number;
    unique: number;
    bestDeal?: {
      title: string;
      price: number;
      retailer: string;
      dealScore: number;
      url: string;
    };
  };
  durationMs: number;
  errors: Array<{ retailer: string; error: string }>;
}

/**
 * Retailer assignment from plan
 */
export interface RetailerAssignment {
  retailerKey: string;
  priority: number;
  searchQuery?: string; // Optional custom query for this retailer
}

// ============================================================================
// Plan Parsing
// ============================================================================

/**
 * Parse approved shop plan into retailer assignments
 *
 * @param plan - Approved execution plan content
 * @param baseQuery - Base product search query
 * @returns Array of retailer assignments
 */
export function parsePlanIntoRetailers(
  plan: any,
  baseQuery: string
): RetailerAssignment[] {
  // If plan has explicit retailer assignments, use those
  if (plan?.retailers && Array.isArray(plan.retailers)) {
    return plan.retailers.map((r: any) => ({
      retailerKey: r.retailerKey || r.retailer,
      priority: r.priority || 0,
      searchQuery: r.searchQuery || baseQuery,
    }));
  }

  // If plan specifies which retailers to include
  if (plan?.includedRetailers && Array.isArray(plan.includedRetailers)) {
    return plan.includedRetailers.map((retailerKey: string, index: number) => ({
      retailerKey,
      priority: index,
      searchQuery: baseQuery,
    }));
  }

  // Otherwise, use default retailers
  return DEFAULT_RETAILERS.map((retailerKey, index) => ({
    retailerKey,
    priority: index,
    searchQuery: baseQuery,
  }));
}

/**
 * Select optimal retailers based on product category analysis
 *
 * @param query - Product search query
 * @returns Array of recommended retailer keys
 */
export function selectRetailersForQuery(query: string): string[] {
  const words = query.toLowerCase();

  // Detect product type for better retailer selection
  const isElectronics =
    words.includes("laptop") ||
    words.includes("phone") ||
    words.includes("camera") ||
    words.includes("tv") ||
    words.includes("computer") ||
    words.includes("tablet");
  const isPhotoGear =
    words.includes("camera") ||
    words.includes("lens") ||
    words.includes("tripod") ||
    words.includes("lighting");
  const isComputerHardware =
    words.includes("gpu") ||
    words.includes("cpu") ||
    words.includes("ram") ||
    words.includes("motherboard") ||
    words.includes("ssd");

  if (isPhotoGear) {
    return ["bh", "amazon", "ebay", "newegg"];
  }
  if (isComputerHardware) {
    return ["newegg", "amazon", "bestbuy", "ebay"];
  }
  if (isElectronics) {
    return ["bestbuy", "amazon", "newegg", "ebay", "walmart"];
  }

  // Default balanced set
  return DEFAULT_RETAILERS;
}

// ============================================================================
// Worker Execution
// ============================================================================

/**
 * Execute a single retailer worker search
 *
 * @param ctx - Convex action context
 * @param assignment - Retailer assignment with query
 * @returns Worker result
 */
async function executeRetailerWorker(
  ctx: ActionCtx,
  assignment: RetailerAssignment
): Promise<RetailerWorkerResult> {
  const startTime = Date.now();
  const retailer = RETAILERS[assignment.retailerKey];

  if (!retailer) {
    return {
      retailer: assignment.retailerKey,
      retailerKey: assignment.retailerKey,
      success: false,
      error: "Unknown retailer",
      durationMs: 0,
      resultCount: 0,
    };
  }

  

  try {
    const searchResult = await executeParallelShopSearch(
      assignment.searchQuery || assignment.retailerKey,
      [assignment.retailerKey],
      {
        maxRetries: 2,
        timeoutMs: 15000,
        deduplicateResults: true,
      }
    );

    const durationMs = Date.now() - startTime;
    

    return {
      retailer: retailer.name,
      retailerKey: assignment.retailerKey,
      success: true,
      results: searchResult.results,
      durationMs,
      resultCount: searchResult.results.length,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(
      `[executeRetailerWorker] Failed retailer: ${retailer.name}, error: ${errorMessage}`
    );

    return {
      retailer: retailer.name,
      retailerKey: assignment.retailerKey,
      success: false,
      error: errorMessage,
      durationMs,
      resultCount: 0,
    };
  }
}

// ============================================================================
// Result Aggregation
// ============================================================================

/**
 * Aggregate results from all retailer workers
 *
 * @param workerResults - Array of retailer worker results
 * @param query - Original search query
 * @returns Aggregated listings with best deal
 */
export function aggregateRetailerResults(
  workerResults: RetailerWorkerResult[],
  _query: string
): {
  total: number;
  unique: number;
  bestDeal?: {
    title: string;
    price: number;
    retailer: string;
    dealScore: number;
    url: string;
  };
} {
  const successfulWorkers = workerResults.filter((r) => r.success);
  const allResults = successfulWorkers.flatMap((w) => w.results || []);

  // Deduplicate by product hash across all retailers
  const seen = new Set<string>();
  const uniqueResults: ShopSearchResult[] = [];

  for (const result of allResults) {
    if (!seen.has(result.productHash)) {
      seen.add(result.productHash);
      uniqueResults.push(result);
    }
  }

  // Find best deal
  let bestDeal: ShopSearchResult | undefined;
  for (const result of uniqueResults) {
    if (!bestDeal || (result.dealScore || 0) > (bestDeal.dealScore || 0)) {
      bestDeal = result;
    }
  }

  return {
    total: allResults.length,
    unique: uniqueResults.length,
    bestDeal: bestDeal
      ? {
          title: bestDeal.title,
          price: bestDeal.price,
          retailer: bestDeal.retailer,
          dealScore: bestDeal.dealScore || 0,
          url: bestDeal.url,
        }
      : undefined,
  };
}

// ============================================================================
// Dispatcher Actions
// ============================================================================

/**
 * Execute plan-based shop search with retailer dispatcher
 *
 * Main entry point for plan-driven parallel shop searches.
 *
 * @param conversationId - Conversation for posting updates
 * @param sessionId - Shop session
 * @param plan - Approved execution plan
 * @param query - Product search query
 * @returns Aggregated dispatcher results
 */
export const executePlanBasedShopSearch = internalAction({
  args: {
    conversationId: v.id("conversations"),
    sessionId: v.id("shopSessions"),
    plan: v.any(),
    query: v.string(),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { conversationId, sessionId, plan, query, condition, priceMin, priceMax }
  ): Promise<RetailerDispatcherResult> => {
    const startTime = Date.now();
    

    // Step 1: Parse plan into retailer assignments
    const assignments = parsePlanIntoRetailers(plan, query);
    

    // Step 2: Execute all retailer workers in parallel
    const workerPromises = assignments.map((assignment) =>
      executeRetailerWorker(ctx, assignment)
    );

    const workerResults = await Promise.all(workerPromises);

    // Step 3: Aggregate results
    const completedRetailers = workerResults.filter((r) => r.success);
    const failedRetailers = workerResults.filter((r) => !r.success);

    

    const listings = aggregateRetailerResults(workerResults, query);

    // Step 4: Save all listings to database
    let bestDealId: Id<"shopListings"> | undefined;
    for (const workerResult of workerResults) {
      if (workerResult.success && workerResult.results) {
        for (const result of workerResult.results) {
          // Apply filters if specified
          if (condition && result.condition !== condition) {
            continue;
          }
          if (priceMin && result.price < priceMin) {
            continue;
          }
          if (priceMax && result.price > priceMax) {
            continue;
          }

          // Check for duplicates
          const duplicateCheck = await ctx.runQuery(api.shop.queries.checkDuplicateByHash, {
            sessionId,
            productHash: result.productHash,
          });
          const isDuplicate = duplicateCheck !== null;

          const listingId = await ctx.runMutation(api.shop.mutations.createListing, {
            sessionId,
            retailer: result.retailer,
            url: result.url,
            title: result.title,
            price: result.price,
            originalPrice: result.originalPrice,
            currency: result.currency,
            condition: result.condition,
            seller: result.seller,
            sellerRating: result.sellerRating,
            imageUrl: result.imageUrl,
            inStock: result.inStock,
            productHash: result.productHash,
            isDuplicate,
            dealScore: result.dealScore,
          });

          // Track best deal (first non-duplicate occurrence)
          if (
            listings.bestDeal &&
            result.url === listings.bestDeal.url &&
            result.title === listings.bestDeal.title &&
            !bestDealId
          ) {
            bestDealId = listingId;
          }
        }
      }
    }

    // Step 5: Complete session
    await ctx.runMutation(api.shop.mutations.completeShopSession, {
      sessionId,
      status: completedRetailers.length > 0 ? "completed" : "failed",
      totalListings: listings.unique,
      bestDealId,
    });

    const totalTime = Date.now() - startTime;

    // Determine overall status
    const status: "completed" | "partial" | "failed" =
      completedRetailers.length === assignments.length
        ? "completed"
        : completedRetailers.length > 0
        ? "partial"
        : "failed";

    

    return {
      sessionId,
      conversationId,
      status,
      retailers: {
        total: assignments.length,
        completed: completedRetailers.length,
        failed: failedRetailers.length,
      },
      listings: {
        total: listings.total,
        unique: listings.unique,
        bestDeal: listings.bestDeal,
      },
      durationMs: totalTime,
      errors: failedRetailers.map((f) => ({
        retailer: f.retailer,
        error: f.error || "Unknown error",
      })),
    };
  },
});

/**
 * Public action to trigger plan-based shop search
 *
 * Entry point for external callers (e.g., from chat tool execution)
 */
export const runPlanBasedShopSearch = action({
  args: {
    conversationId: v.id("conversations"),
    planId: v.id("executionPlans"),
    query: v.string(),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { conversationId, planId, query, condition, priceMin, priceMax }
  ): Promise<{
    sessionId: Id<"shopSessions">;
    status: string;
    totalListings: number;
    bestDealId?: Id<"shopListings">;
  }> => {
    

    // Fetch the approved plan
    const plan = await ctx.runQuery(api.plans.queries.get, {
      id: planId,
    });

    if (!plan || plan.status !== "approved") {
      throw new Error("Plan not found or not approved");
    }

    // Create shop session
    const sessionId = await ctx.runMutation(api.shop.mutations.createShopSession, {
      conversationId,
      query,
      condition,
      priceMin,
      priceMax,
      retailers: parsePlanIntoRetailers(plan.content, query).map(
        (a) => a.retailerKey
      ),
    });

    // Post loading card
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent",
      content: `Executing shop search plan: ${query}`,
      messageType: "result_card",
      cardData: {
        card_type: "shop_loading",
        status: "in_progress",
        session_id: sessionId,
        query,
      },
    });

    // Execute the dispatcher
    const result = await ctx.runAction(
      internal.shop.dispatcher.executePlanBasedShopSearch,
      {
        conversationId,
        sessionId,
        plan: plan.content,
        query,
        condition,
        priceMin,
        priceMax,
      }
    );

    return {
      sessionId: result.sessionId,
      status: result.status,
      totalListings: result.listings.unique,
      bestDealId: undefined,
    };
  },
});
