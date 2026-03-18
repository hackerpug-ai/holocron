/**
 * Shop tools for Holocron MCP
 * Implements product search across multiple retailers
 */

import type { HolocronConvexClient } from "../convex/client.ts";
import type { ShopSession, ShopListing } from "../convex/types.ts";

// ============================================================================
// Types
// ============================================================================

export interface ShopProductsInput {
  query: string;
  retailers?: string[];
  condition?: "new" | "used" | "any";
  priceMin?: number;
  priceMax?: number;
}

export interface GetShopSessionInput {
  sessionId: string;
}

export interface GetShopListingsInput {
  sessionId: string;
  limit?: number;
  excludeDuplicates?: boolean;
  sortBy?: "price" | "dealScore" | "createdAt";
}

export interface ShopProductsOutput {
  sessionId: string;
  status: string;
  totalListings: number;
  bestDeal?: {
    title: string;
    price: number;
    retailer: string;
    url: string;
    dealScore?: number;
  };
  listings: Array<{
    title: string;
    price: number; // In cents
    priceFormatted: string;
    retailer: string;
    condition: string;
    url: string;
    dealScore?: number;
  }>;
  durationMs: number;
  error?: string;
}

export interface GetShopSessionOutput {
  session: ShopSession | null;
}

export interface GetShopListingsOutput {
  listings: ShopListing[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format price from cents to dollars string
 */
function formatPrice(cents: number, currency = "USD"): string {
  const dollars = cents / 100;
  if (currency === "USD") {
    return `$${dollars.toFixed(2)}`;
  }
  return `${dollars.toFixed(2)} ${currency}`;
}

/**
 * Poll for session completion with timeout
 */
async function pollForCompletion(
  client: HolocronConvexClient,
  sessionId: string,
  maxWaitMs = 60000,
  pollIntervalMs = 2000
): Promise<ShopSession | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    const session = await client.query<ShopSession | null>("shop/queries:getShopSessionByStringId" as any, {
      sessionId,
    });

    if (!session) {
      return null;
    }

    if (session.status === "completed" || session.status === "failed") {
      return session;
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout - return last known state
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  return client.query<ShopSession | null>("shop/queries:getShopSessionByStringId" as any, {
    sessionId,
  });
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Search for products across multiple retailers
 *
 * Starts a shop search session and polls for completion.
 * Returns aggregated results from all retailers.
 */
export async function shopProducts(
  client: HolocronConvexClient,
  input: ShopProductsInput
): Promise<ShopProductsOutput> {
  const startTime = Date.now();

  // Start the search
  const result = await client.action<{
    sessionId: string;
    status: string;
    totalListings: number;
    bestDealId?: string;
    durationMs: number;
    error?: string;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("shop/index:startShopSearch" as any, {
    query: input.query,
    retailers: input.retailers,
    condition: input.condition,
    priceMin: input.priceMin,
    priceMax: input.priceMax,
  });

  // Get the listings
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  const listings = await client.query<ShopListing[]>("shop/queries:getShopListingsByStringId" as any, {
    sessionId: result.sessionId,
    excludeDuplicates: true,
    sortBy: "dealScore",
    limit: 20,
  });

  // Find the best deal
  const bestDealListing = listings.find((l) => !l.isDuplicate);

  const durationMs = Date.now() - startTime;

  return {
    sessionId: result.sessionId,
    status: result.status,
    totalListings: result.totalListings,
    bestDeal: bestDealListing
      ? {
          title: bestDealListing.title,
          price: bestDealListing.price,
          retailer: bestDealListing.retailer,
          url: bestDealListing.url,
          dealScore: bestDealListing.dealScore,
        }
      : undefined,
    listings: listings.map((l) => ({
      title: l.title,
      price: l.price,
      priceFormatted: formatPrice(l.price, l.currency),
      retailer: l.retailer,
      condition: l.condition,
      url: l.url,
      dealScore: l.dealScore,
    })),
    durationMs,
    error: result.error,
  };
}

/**
 * Get a shop session by ID
 */
export async function getShopSession(
  client: HolocronConvexClient,
  input: GetShopSessionInput
): Promise<GetShopSessionOutput> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  const session = await client.query<ShopSession | null>("shop/queries:getShopSessionByStringId" as any, {
    sessionId: input.sessionId,
  });

  return { session };
}

/**
 * Get listings for a shop session
 */
export async function getShopListings(
  client: HolocronConvexClient,
  input: GetShopListingsInput
): Promise<GetShopListingsOutput> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  const listings = await client.query<ShopListing[]>("shop/queries:getShopListingsByStringId" as any, {
    sessionId: input.sessionId,
    limit: input.limit,
    excludeDuplicates: input.excludeDuplicates ?? true,
    sortBy: input.sortBy ?? "dealScore",
  });

  return { listings };
}
