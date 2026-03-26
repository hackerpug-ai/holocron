/**
 * Rate limit configuration for synthesis providers
 *
 * Provider quotas and limits:
 * - Z.ai: Token-based (no fixed quota), 5 concurrent max
 * - YouTube: 10,000 units/day, 100 concurrent max
 * - Jina Reader: 100 RPM free tier, 5 concurrent max
 */

import { v } from "convex/values";

/**
 * Rate limit configuration per provider
 */
export const RATE_LIMITS = {
  zai: {
    quotaLimit: -1, // -1 indicates token-based (no fixed quota)
    maxConcurrent: 5,
    quotaResetWindow: 24 * 60 * 60 * 1000, // 24 hours in ms (not used for token-based)
    throttleWindow: 60 * 1000, // 1 minute throttle window on 429
    defaultTokenBudget: 1000000, // 1M tokens default budget
  },
  youtube: {
    quotaLimit: 10000, // 10,000 units per day
    maxConcurrent: 100,
    quotaResetWindow: 24 * 60 * 60 * 1000, // 24 hours in ms
    throttleWindow: 60 * 60 * 1000, // 1 hour throttle window on 429
  },
  jina: {
    quotaLimit: -1, // -1 indicates token-based (no fixed quota)
    maxConcurrent: 5,
    quotaResetWindow: 60 * 1000, // 1 minute sliding window
    throttleWindow: 2 * 60 * 1000, // 2 minute throttle window on 429
  },
} as const;

/**
 * Provider type validator
 */
export const providerValidator = v.union(
  v.literal("zai"),
  v.literal("youtube"),
  v.literal("jina")
);

/**
 * Rate limit status type
 */
export type RateLimitProvider = keyof typeof RATE_LIMITS;
export type RateLimitStatus = "available" | "throttled" | "exhausted";
