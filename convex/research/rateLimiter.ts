/**
 * Database-backed Rate Limiter for API calls to Exa and Jina
 *
 * Implements sliding-window rate limiting using the `rateLimits` table in Convex.
 * State is persisted in the database and survives serverless function restarts.
 *
 * Endpoints tracked:
 * - Exa: 10 QPS (queries per second)
 * - Jina: 100 RPM for free tier (~1.5 per second)
 * - Jina Reader: 30 RPM (~0.5 per second)
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// ============================================================================
// Rate limit configurations (requests per windowMs)
// ============================================================================

type RateLimitEndpoint = "exa" | "jina" | "jina-reader";

const RATE_LIMIT_CONFIGS: Record<
  RateLimitEndpoint,
  { maxRequests: number; windowMs: number }
> = {
  exa: {
    maxRequests: 10,
    windowMs: 1000, // 10 per second
  },
  jina: {
    maxRequests: 90,
    windowMs: 60_000, // 90 per minute (conservative for 100 RPM free tier)
  },
  "jina-reader": {
    maxRequests: 30,
    windowMs: 60_000, // 30 per minute
  },
};

// ============================================================================
// Internal mutation: check-and-record rate limit event
// Returns true if request is allowed, false if rate limit exceeded
// ============================================================================

export const checkAndRecord = internalMutation({
  args: {
    endpoint: v.union(
      v.literal("exa"),
      v.literal("jina"),
      v.literal("jina-reader")
    ),
  },
  returns: v.object({
    allowed: v.boolean(),
    retryAfterMs: v.number(), // ms to wait before retrying (0 if allowed)
  }),
  handler: async (ctx, args) => {
    const config = RATE_LIMIT_CONFIGS[args.endpoint];
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Clean up old entries outside the sliding window
    const oldEntries = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_timestamp", (q) =>
        q.eq("key", args.endpoint).lt("timestamp", windowStart)
      )
      .collect();

    for (const entry of oldEntries) {
      await ctx.db.delete(entry._id);
    }

    // Count requests in current window
    const currentEntries = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.endpoint))
      .collect();

    if (currentEntries.length >= config.maxRequests) {
      // Find the oldest entry to calculate how long to wait
      const oldest = currentEntries.reduce((min, e) =>
        e.timestamp < min.timestamp ? e : min
      );
      const retryAfterMs = Math.max(
        0,
        oldest.timestamp + config.windowMs - now
      );
      return { allowed: false, retryAfterMs };
    }

    // Record this request
    await ctx.db.insert("rateLimits", {
      key: args.endpoint,
      timestamp: now,
    });

    return { allowed: true, retryAfterMs: 0 };
  },
});

// ============================================================================
// withRateLimit: wrap an API call with database-backed rate limiting
//
// ctx must be an ActionCtx (has runMutation). Callers (Node.js actions)
// should pass ctx from their action handler.
// ============================================================================

type ActionCtxLike = {
  runMutation: (
    fn: unknown,
    args: Record<string, unknown>
  ) => Promise<unknown>;
};

/**
 * Wrap an API call with database-backed rate limiting.
 *
 * Rate limit state is stored in the `rateLimits` Convex table and persists
 * across serverless function invocations. If the rate limit is exceeded,
 * the function waits and retries up to maxRetries times.
 *
 * @example
 * const results = await withRateLimit(ctx, 'exa', async () => {
 *   return await exa.searchAndContents(query, options);
 * });
 */
export async function withRateLimit<T>(
  ctx: ActionCtxLike,
  endpoint: RateLimitEndpoint,
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = (await ctx.runMutation(
      internal.research.rateLimiter.checkAndRecord,
      { endpoint }
    )) as { allowed: boolean; retryAfterMs: number };

    if (result.allowed) {
      return fn();
    }

    if (attempt === maxRetries) {
      console.warn(
        `[RateLimiter] Rate limit exceeded for ${endpoint} after ${maxRetries} retries`
      );
      // Fall through and execute anyway to avoid blocking indefinitely
      return fn();
    }

    const waitMs = Math.max(result.retryAfterMs, 100);
    console.log(
      `[RateLimiter] Rate limit hit for ${endpoint}, waiting ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${maxRetries})`
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // TypeScript requires a return here; the loop always returns or throws above
  return fn();
}
