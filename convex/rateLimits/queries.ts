/**
 * Rate limit queries for synthesis providers
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { providerValidator } from "../synthesis/rateLimits";

/**
 * Get rate limit status for a provider
 * Creates tracker if it doesn't exist
 */
export const getStatus = query({
  args: {
    provider: providerValidator,
  },
  returns: v.object({
    provider: v.string(),
    status: v.union(v.literal("available"), v.literal("throttled"), v.literal("exhausted")),
    quota: v.object({
      limit: v.number(),
      used: v.number(),
      remaining: v.number(),
      resetsAt: v.number(),
    }),
    concurrent: v.object({
      current: v.number(),
      max: v.number(),
    }),
    lastError: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tracker = await ctx.db
      .query("rateLimitTracking")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    if (!tracker) {
      // Return default status for new provider
      return {
        provider: args.provider,
        status: "available" as const,
        quota: {
          limit: -1, // Unknown until initialized
          used: 0,
          remaining: -1,
          resetsAt: Date.now() + 24 * 60 * 60 * 1000,
        },
        concurrent: {
          current: 0,
          max: 5, // Default
        },
      };
    }

    return {
      provider: tracker.provider,
      status: tracker.status,
      quota: {
        limit: tracker.quotaLimit,
        used: tracker.quotaUsed,
        remaining: tracker.quotaLimit === -1 ? -1 : Math.max(0, tracker.quotaLimit - tracker.quotaUsed),
        resetsAt: tracker.quotaResetAt,
      },
      concurrent: {
        current: tracker.concurrentRequests,
        max: tracker.maxConcurrent,
      },
      lastError: tracker.lastError,
    };
  },
});

/**
 * List all rate limit trackers
 */
export const listAll = query({
  args: {},
  returns: v.array(
    v.object({
      provider: v.string(),
      status: v.union(v.literal("available"), v.literal("throttled"), v.literal("exhausted")),
      quotaLimit: v.number(),
      quotaUsed: v.number(),
      concurrentRequests: v.number(),
      maxConcurrent: v.number(),
      lastError: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const trackers = await ctx.db.query("rateLimitTracking").collect();

    return trackers.map((t) => ({
      provider: t.provider,
      status: t.status,
      quotaLimit: t.quotaLimit,
      quotaUsed: t.quotaUsed,
      concurrentRequests: t.concurrentRequests,
      maxConcurrent: t.maxConcurrent,
      lastError: t.lastError,
    }));
  },
});
