/**
 * Shop Search Module
 *
 * Parallel product search across multiple retailers using Jina/Exa.
 * Follows the research/search.ts pattern.
 */

"use node";

import Exa from "exa-js";
import { withRateLimit } from "../research/rateLimiter.js";
import { createHash } from "node:crypto";

/**
 * Minimal ctx shape required for rate limiting (subset of ActionCtx)
 */
type RateLimitCtx = {
  runMutation: (fn: unknown, args: Record<string, unknown>) => Promise<unknown>;
} | null | undefined;

// ============================================================================
// Types
// ============================================================================

/**
 * Trust tier levels
 */
export type TrustTier = 1 | 2 | 3;

/**
 * Warranty types
 */
export type WarrantyType = "manufacturer" | "retailer" | "seller" | "none";

/**
 * Marketplace seller signals extracted from content
 */
export interface MarketplaceSellerSignals {
  feedbackCount?: number;
  positivePercentage?: number;
  isTopRated?: boolean;
  hasReturnPolicy?: boolean;
  hasAuthenticityGuarantee?: boolean;
  isShippedFromAmazon?: boolean;
}

/**
 * Retailer configuration
 */
export interface RetailerConfig {
  name: string;
  domain: string;
  searchPattern?: string; // Optional custom search pattern
  trustTier: TrustTier;
  isAuthorized: boolean;
  warrantyType: WarrantyType;
  maxListingsPerSearch: number;
}

/**
 * Search result from a single retailer
 */
export interface ShopSearchResult {
  retailer: string;
  url: string;
  title: string;
  price: number; // In cents
  originalPrice?: number;
  currency: string;
  condition: string;
  seller?: string;
  sellerRating?: number;
  imageUrl?: string;
  inStock?: boolean;
  productHash: string;
  dealScore?: number;
  rawContent?: string;
  trustTier?: TrustTier;
  sellerTrustScore?: number;
}

/**
 * Options for parallel shop search
 */
export interface ParallelShopSearchOptions {
  maxRetries?: number;
  timeoutMs?: number;
  deduplicateResults?: boolean;
}

/**
 * Result from parallel shop search
 */
export interface ParallelShopSearchResult {
  results: ShopSearchResult[];
  totalFound: number;
  durationMs: number;
  errors: Array<{ retailer: string; error: string }>;
}

// ============================================================================
// Retailer Configuration
// ============================================================================

export const RETAILERS: Record<string, RetailerConfig> = {
  amazon: {
    name: "Amazon",
    domain: "amazon.com",
    trustTier: 2,
    isAuthorized: false,
    warrantyType: "seller",
    maxListingsPerSearch: 5,
  },
  ebay: {
    name: "eBay",
    domain: "ebay.com",
    trustTier: 2,
    isAuthorized: false,
    warrantyType: "seller",
    maxListingsPerSearch: 3,
  },
  newegg: {
    name: "Newegg",
    domain: "newegg.com",
    trustTier: 1,
    isAuthorized: true,
    warrantyType: "retailer",
    maxListingsPerSearch: 5,
  },
  bestbuy: {
    name: "Best Buy",
    domain: "bestbuy.com",
    trustTier: 1,
    isAuthorized: true,
    warrantyType: "manufacturer",
    maxListingsPerSearch: 5,
  },
  bh: {
    name: "B&H Photo",
    domain: "bhphotovideo.com",
    trustTier: 1,
    isAuthorized: true,
    warrantyType: "manufacturer",
    maxListingsPerSearch: 5,
  },
  backmarket: {
    name: "Back Market",
    domain: "backmarket.com",
    trustTier: 2,
    isAuthorized: false,
    warrantyType: "retailer",
    maxListingsPerSearch: 5,
  },
  walmart: {
    name: "Walmart",
    domain: "walmart.com",
    trustTier: 1,
    isAuthorized: true,
    warrantyType: "retailer",
    maxListingsPerSearch: 5,
  },
};

export const DEFAULT_RETAILERS = ["amazon", "ebay", "newegg", "bestbuy"];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a hash for deduplication
 */
export function generateProductHash(title: string, retailer: string): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  return createHash("md5").update(`${normalized}:${retailer}`).digest("hex");
}

/**
 * Parse price from text
 *
 * Handles various price formats: $1,234.56, USD 1234, etc.
 * Returns price in cents.
 */
export function parsePrice(text: string): { price: number; currency: string } | null {
  // Common price patterns
  const patterns = [
    /\$([0-9,]+(?:\.[0-9]{2})?)/,           // $1,234.56
    /USD\s*([0-9,]+(?:\.[0-9]{2})?)/i,      // USD 1234.56
    /([0-9,]+(?:\.[0-9]{2})?)\s*(?:USD|dollars?)/i, // 1234.56 USD
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/,/g, "");
      const price = Math.round(parseFloat(priceStr) * 100);
      if (!isNaN(price) && price > 0) {
        return { price, currency: "USD" };
      }
    }
  }

  return null;
}

/**
 * Parse condition from text
 */
export function parseCondition(text: string): string {
  const lowerText = text.toLowerCase();

  if (lowerText.includes("refurbished") || lowerText.includes("renewed")) {
    return "refurbished";
  }
  if (lowerText.includes("used") || lowerText.includes("pre-owned")) {
    return "used";
  }
  if (lowerText.includes("open box") || lowerText.includes("open-box")) {
    return "open_box";
  }
  if (lowerText.includes("like new")) {
    return "like_new";
  }

  return "new";
}

/**
 * Extract marketplace seller signals from search content
 *
 * For eBay/Amazon results, extracts feedback count, positive %,
 * top rated status, return policy, and authenticity guarantees.
 */
export function extractMarketplaceSellerSignals(
  content: string
): MarketplaceSellerSignals {
  const signals: MarketplaceSellerSignals = {};

  // Feedback count: "1,234 feedback" or "12345 ratings"
  const feedbackMatch = content.match(/(\d[\d,]*)\s*(?:feedback|ratings?)/i);
  if (feedbackMatch) {
    signals.feedbackCount = parseInt(feedbackMatch[1].replace(/,/g, ""), 10);
  }

  // Positive percentage: "99.5% positive" or "98% positive feedback"
  const positiveMatch = content.match(/([\d.]+)%\s*positive/i);
  if (positiveMatch) {
    signals.positivePercentage = parseFloat(positiveMatch[1]);
  }

  // Top Rated badge
  signals.isTopRated = /top\s*rated\s*(seller|plus)?/i.test(content);

  // Return policy
  signals.hasReturnPolicy = /(?:free\s*)?returns?|money\s*back/i.test(content);

  // Authenticity Guarantee
  signals.hasAuthenticityGuarantee = /authenticity\s*guarantee/i.test(content);

  // Shipped from and sold by Amazon (= max trust for Amazon marketplace)
  signals.isShippedFromAmazon = /ships?\s*from\s*and\s*sold\s*by\s*amazon/i.test(content);

  return signals;
}

/**
 * Calculate seller trust score (0-100)
 *
 * Scores marketplace sellers based on extracted signals.
 */
export function calculateSellerTrustScore(
  signals: MarketplaceSellerSignals
): number {
  // Ships from Amazon = max trust
  if (signals.isShippedFromAmazon) {
    return 100;
  }

  let score = 0;
  let hasAnySignal = false;

  // Feedback count: up to 25 points
  if (signals.feedbackCount !== undefined) {
    hasAnySignal = true;
    if (signals.feedbackCount >= 10000) score += 25;
    else if (signals.feedbackCount >= 1000) score += 20;
    else if (signals.feedbackCount >= 500) score += 15;
    else if (signals.feedbackCount >= 100) score += 8;
  }

  // Positive percentage: up to 25 points
  if (signals.positivePercentage !== undefined) {
    hasAnySignal = true;
    if (signals.positivePercentage >= 99.5) score += 25;
    else if (signals.positivePercentage >= 99) score += 20;
    else if (signals.positivePercentage >= 98) score += 15;
    else if (signals.positivePercentage >= 95) score += 8;
  }

  // Top Rated: 20 points
  if (signals.isTopRated) {
    hasAnySignal = true;
    score += 20;
  }

  // Return policy: 15 points
  if (signals.hasReturnPolicy) {
    hasAnySignal = true;
    score += 15;
  }

  // Authenticity guarantee: 15 points
  if (signals.hasAuthenticityGuarantee) {
    hasAnySignal = true;
    score += 15;
  }

  // No signals penalty
  if (!hasAnySignal) {
    score = Math.max(0, score - 10);
  }

  return Math.min(100, score);
}

/**
 * Calculate deal score (0-100)
 *
 * Based on:
 * - Price relative to typical price (if available)
 * - Seller rating
 * - Condition
 * - In stock status
 * - Trust tier (optional)
 * - Warranty type (optional)
 * - Marketplace seller signals (optional, tier 2 only)
 */
export function calculateDealScore(
  result: Partial<ShopSearchResult>,
  retailerKey?: string,
  sellerSignals?: MarketplaceSellerSignals
): number {
  let score = 50; // Base score

  // Price discount bonus
  if (result.originalPrice && result.price) {
    const discount =
      ((result.originalPrice - result.price) / result.originalPrice) * 100;
    score += Math.min(discount, 30); // Up to 30 points for discount
  }

  // Seller rating bonus
  if (result.sellerRating) {
    score += (result.sellerRating / 5) * 10; // Up to 10 points for rating
  }

  // Condition adjustments
  switch (result.condition) {
    case "new":
      score += 5;
      break;
    case "like_new":
      break;
    case "refurbished":
      score -= 5;
      break;
    case "open_box":
      score -= 3;
      break;
    case "used":
      score -= 10;
      break;
  }

  // In stock bonus
  if (result.inStock) {
    score += 5;
  }

  // Trust tier adjustments
  if (retailerKey) {
    const retailer = RETAILERS[retailerKey];
    if (retailer) {
      // Tier 1: +15, Tier 3: -15
      if (retailer.trustTier === 1) score += 15;
      else if (retailer.trustTier === 3) score -= 15;

      // Warranty bonus
      if (retailer.warrantyType === "manufacturer") score += 3;
      else if (retailer.warrantyType === "retailer") score += 1;

      // Marketplace seller trust (tier 2 only): -5 to +5
      if (retailer.trustTier === 2 && sellerSignals) {
        const sellerScore = calculateSellerTrustScore(sellerSignals);
        // Scale 0-100 to -5 to +5
        const trustAdjustment = ((sellerScore / 100) * 10) - 5;
        score += trustAdjustment;
      }
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Extract product info from search result content
 */
function extractProductInfo(
  content: string,
  url: string,
  retailer: string
): Partial<ShopSearchResult> | null {
  const priceInfo = parsePrice(content);
  if (!priceInfo) {
    return null;
  }

  // Extract title from first line or URL
  const lines = content.split("\n").filter((l) => l.trim());
  const title = lines[0]?.slice(0, 200) || url.split("/").pop() || "Unknown Product";

  return {
    retailer,
    url,
    title,
    price: priceInfo.price,
    currency: priceInfo.currency,
    condition: parseCondition(content),
    rawContent: content.slice(0, 1000),
  };
}

// ============================================================================
// Search Execution
// ============================================================================

/**
 * Execute search with retry logic
 */
async function executeSearchWithRetry<T>(
  searchFn: () => Promise<T>,
  maxRetries: number,
  timeoutMs: number
): Promise<T | null> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Search timeout")), timeoutMs);
      });

      const result = await Promise.race([searchFn(), timeoutPromise]);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[ShopSearch] Attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        lastError.message
      );

      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  console.error(`[ShopSearch] All retries exhausted:`, lastError?.message);
  return null;
}

/**
 * Execute Exa search for a retailer
 */
async function executeExaRetailerSearch(
  query: string,
  retailer: RetailerConfig,
  retailerKey: string,
  ctx?: RateLimitCtx
): Promise<ShopSearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn("[ShopSearch] EXA_API_KEY not configured");
    return [];
  }

  const exa = new Exa(apiKey);
  const siteQuery = `${query} site:${retailer.domain}`;

  const searchFn = async () => exa.searchAndContents(siteQuery, {
    numResults: retailer.maxListingsPerSearch,
    useAutoprompt: true,
    text: { maxCharacters: 5000 },
  });
  const searchResults = ctx
    ? await withRateLimit(ctx, "exa", searchFn)
    : await searchFn();

  const results: ShopSearchResult[] = [];

  for (const result of searchResults.results) {
    const content = result.text || "";
    const productInfo = extractProductInfo(content, result.url || "", retailer.name);

    if (productInfo && productInfo.price) {
      const sellerSignals = retailer.trustTier === 2
        ? extractMarketplaceSellerSignals(content)
        : undefined;

      const fullResult: ShopSearchResult = {
        retailer: retailer.name,
        url: result.url || "",
        title: result.title || productInfo.title || "Unknown",
        price: productInfo.price,
        originalPrice: productInfo.originalPrice,
        currency: productInfo.currency || "USD",
        condition: productInfo.condition || "new",
        seller: productInfo.seller,
        sellerRating: productInfo.sellerRating,
        imageUrl: productInfo.imageUrl,
        inStock: productInfo.inStock,
        productHash: generateProductHash(result.title || productInfo.title || "", retailer.name),
        rawContent: productInfo.rawContent,
        dealScore: 0,
        trustTier: retailer.trustTier,
        sellerTrustScore: sellerSignals
          ? calculateSellerTrustScore(sellerSignals)
          : undefined,
      };

      fullResult.dealScore = calculateDealScore(fullResult, retailerKey, sellerSignals);
      results.push(fullResult);
    }
  }

  return results.slice(0, retailer.maxListingsPerSearch);
}

/**
 * Execute Jina search for a retailer
 */
async function executeJinaRetailerSearch(
  query: string,
  retailer: RetailerConfig,
  retailerKey: string,
  ctx?: RateLimitCtx
): Promise<ShopSearchResult[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.warn("[ShopSearch] JINA_API_KEY not configured");
    return [];
  }

  const siteQuery = `${query} site:${retailer.domain}`;
  const encodedQuery = encodeURIComponent(siteQuery);

  const fetchFn = async () => fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const response = ctx
    ? await withRateLimit(ctx, "jina", fetchFn)
    : await fetchFn();

  if (!response.ok) {
    throw new Error(`Jina search failed: ${response.status}`);
  }

  const data = await response.json();
  const results: ShopSearchResult[] = [];

  for (const result of data.data || []) {
    const content = result.description || result.content || "";
    const productInfo = extractProductInfo(content, result.url || result.link || "", retailer.name);

    if (productInfo && productInfo.price) {
      const sellerSignals = retailer.trustTier === 2
        ? extractMarketplaceSellerSignals(content)
        : undefined;

      const fullResult: ShopSearchResult = {
        retailer: retailer.name,
        url: result.url || result.link || "",
        title: result.title || productInfo.title || "Unknown",
        price: productInfo.price,
        originalPrice: productInfo.originalPrice,
        currency: productInfo.currency || "USD",
        condition: productInfo.condition || "new",
        seller: productInfo.seller,
        sellerRating: productInfo.sellerRating,
        imageUrl: productInfo.imageUrl,
        inStock: productInfo.inStock,
        productHash: generateProductHash(result.title || productInfo.title || "", retailer.name),
        rawContent: productInfo.rawContent,
        dealScore: 0,
        trustTier: retailer.trustTier,
        sellerTrustScore: sellerSignals
          ? calculateSellerTrustScore(sellerSignals)
          : undefined,
      };

      fullResult.dealScore = calculateDealScore(fullResult, retailerKey, sellerSignals);
      results.push(fullResult);
    }
  }

  return results.slice(0, retailer.maxListingsPerSearch);
}

/**
 * Deduplicate results by product hash
 */
function deduplicateResults(results: ShopSearchResult[]): ShopSearchResult[] {
  const seen = new Set<string>();
  const deduplicated: ShopSearchResult[] = [];

  for (const result of results) {
    if (!seen.has(result.productHash)) {
      seen.add(result.productHash);
      deduplicated.push(result);
    }
  }

  return deduplicated;
}

/**
 * Sort results by deal score
 */
function sortByDealScore(results: ShopSearchResult[]): ShopSearchResult[] {
  return results.sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0));
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Execute parallel shop search across multiple retailers
 *
 * @param query - Product search query
 * @param retailers - Array of retailer keys to search (defaults to all)
 * @param options - Search options
 * @returns Combined search results from all retailers
 */
export async function executeParallelShopSearch(
  query: string,
  retailers: string[] = DEFAULT_RETAILERS,
  options: ParallelShopSearchOptions = {},
  ctx?: RateLimitCtx
): Promise<ParallelShopSearchResult> {
  const startTime = Date.now();
  const {
    maxRetries = 2,
    timeoutMs = 15000,
    deduplicateResults: dedupe = true,
  } = options;

  console.log(
    `[executeParallelShopSearch] Entry - query: "${query}", retailers: [${retailers.join(", ")}]`
  );

  const errors: Array<{ retailer: string; error: string }> = [];
  const searchPromises: Promise<ShopSearchResult[]>[] = [];

  // Build search promises for each retailer
  for (const retailerKey of retailers) {
    const retailer = RETAILERS[retailerKey];
    if (!retailer) {
      console.warn(`[ShopSearch] Unknown retailer: ${retailerKey}`);
      continue;
    }

    // Add Exa search
    searchPromises.push(
      executeSearchWithRetry(
        () => executeExaRetailerSearch(query, retailer, retailerKey, ctx),
        maxRetries,
        timeoutMs
      ).then((results) => results || [])
        .catch((error) => {
          errors.push({ retailer: retailer.name, error: String(error) });
          return [];
        })
    );

    // Add Jina search
    searchPromises.push(
      executeSearchWithRetry(
        () => executeJinaRetailerSearch(query, retailer, retailerKey, ctx),
        maxRetries,
        timeoutMs
      ).then((results) => results || [])
        .catch((error) => {
          errors.push({ retailer: retailer.name, error: String(error) });
          return [];
        })
    );
  }

  console.log(
    `[executeParallelShopSearch] Executing ${searchPromises.length} parallel searches`
  );

  // Execute all searches in parallel
  const allResults = await Promise.all(searchPromises);
  let results = allResults.flat();

  console.log(
    `[executeParallelShopSearch] Collected ${results.length} raw results`
  );

  // Deduplicate
  if (dedupe) {
    results = deduplicateResults(results);
    console.log(`[executeParallelShopSearch] Deduplicated to ${results.length} unique results`);
  }

  // Sort by deal score
  results = sortByDealScore(results);

  const durationMs = Date.now() - startTime;
  console.log(
    `[executeParallelShopSearch] Exit - ${results.length} results in ${durationMs}ms`
  );

  return {
    results,
    totalFound: results.length,
    durationMs,
    errors,
  };
}
