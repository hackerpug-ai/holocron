/**
 * Rate Limiter for API calls to Exa and Jina
 *
 * Implements token bucket algorithm to respect API rate limits:
 * - Exa: 10 QPS (queries per second) for search endpoint
 * - Jina: 10,000 requests per 60 seconds (IP-based), Free tier: 100 RPM
 *
 * This prevents 429 rate limit errors and ensures smooth operation.
 */

interface RateLimitConfig {
  maxTokens: number;      // Maximum requests per interval
  refillRate: number;     // Tokens refilled per second
  refillInterval: number; // How often to refill (ms)
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.config.refillInterval) * this.config.refillRate;

    this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Wait until a token is available, then consume it
   */
  async consume(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time until next token
    const tokensNeeded = 1 - this.tokens;
    const waitMs = (tokensNeeded / this.config.refillRate) * this.config.refillInterval;

    console.log(`[RateLimiter] Waiting ${Math.round(waitMs)}ms for token...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));

    // Refill and consume after waiting
    this.refill();
    this.tokens -= 1;
  }
}

/**
 * Rate limiter for all API endpoints
 */
class ApiRateLimiter {
  private buckets: Map<string, TokenBucket>;

  constructor() {
    this.buckets = new Map();

    // Exa search - 10 QPS (conservative)
    this.buckets.set('exa', new TokenBucket({
      maxTokens: 10,
      refillRate: 10,
      refillInterval: 1000, // 1 second
    }));

    // Jina search - 100 RPM for free tier (conservative)
    // Using 100 per minute = 1.67 per second, round down to 1.5 for safety
    this.buckets.set('jina', new TokenBucket({
      maxTokens: 30,      // Allow burst of 30 requests
      refillRate: 1.5,    // Refill 1.5 tokens per second (90 per minute)
      refillInterval: 1000, // 1 second
    }));

    // Jina Reader - for full URL content reading
    // More conservative: 5 concurrent, 30/min (0.5 per second)
    this.buckets.set('jina-reader', new TokenBucket({
      maxTokens: 5,       // Allow 5 concurrent requests
      refillRate: 0.5,    // Refill 0.5 tokens per second (30 per minute)
      refillInterval: 1000, // 1 second
    }));
  }

  /**
   * Wait for rate limit before making request to endpoint
   */
  async waitForEndpoint(endpoint: 'exa' | 'jina' | 'jina-reader'): Promise<void> {
    const bucket = this.buckets.get(endpoint);
    if (!bucket) {
      console.warn(`[ApiRateLimiter] Unknown endpoint: ${endpoint}`);
      return;
    }

    await bucket.consume();
  }
}

// Singleton instance
let rateLimiterInstance: ApiRateLimiter | null = null;

export function getApiRateLimiter(): ApiRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new ApiRateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Wrap an API call with rate limiting
 *
 * @example
 * const results = await withRateLimit('exa', async () => {
 *   return await exa.searchAndContents(query, options);
 * });
 */
export async function withRateLimit<T>(
  endpoint: 'exa' | 'jina' | 'jina-reader',
  fn: () => Promise<T>
): Promise<T> {
  const limiter = getApiRateLimiter();
  await limiter.waitForEndpoint(endpoint);
  return fn();
}
