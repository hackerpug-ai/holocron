/**
 * Rate limit mutations for synthesis providers
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { providerValidator, RATE_LIMITS } from "../synthesis/rateLimits";
import type { RateLimitProvider } from "../synthesis/rateLimits";

/**
 * Initialize rate limit tracker for a provider
 */
export const initializeTracker = mutation({
  args: {
    provider: providerValidator,
  },
  returns: v.id("rateLimitTracking"),
  handler: async (ctx, args) => {
    // Check if tracker already exists
    const existing = await ctx.db
      .query("rateLimitTracking")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    if (existing) {
      return existing._id;
    }

    // Get configuration for provider
    const config = RATE_LIMITS[args.provider as RateLimitProvider];

    // Create new tracker
    const now = Date.now();
    const trackerData: {
      provider: string;
      quotaLimit: number;
      quotaUsed: number;
      quotaResetAt: number;
      concurrentRequests: number;
      maxConcurrent: number;
      status: "available" | "throttled" | "exhausted";
      tokenBudget?: number;
      tokensUsed: number;
      createdAt: number;
      updatedAt: number;
    } = {
      provider: args.provider,
      quotaLimit: config.quotaLimit,
      quotaUsed: 0,
      quotaResetAt: now + config.quotaResetWindow,
      concurrentRequests: 0,
      maxConcurrent: config.maxConcurrent,
      status: "available",
      tokensUsed: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Add tokenBudget only for zai provider
    if (args.provider === "zai") {
      trackerData.tokenBudget = RATE_LIMITS.zai.defaultTokenBudget;
    }

    const id = await ctx.db.insert("rateLimitTracking", trackerData);

    return id;
  },
});

/**
 * Record a rate limit error (429) for a provider
 */
export const recordError = mutation({
  args: {
    provider: providerValidator,
    error: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const tracker = await ctx.db
      .query("rateLimitTracking")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    if (!tracker) {
      return false;
    }

    const now = Date.now();
    await ctx.db.patch(tracker._id, {
      lastError: args.error,
      lastErrorTime: now,
      status: "throttled",
      updatedAt: now,
    });

    return true;
  },
});
