/**
 * TS-008: Replace in-memory rate limiter with database-backed
 *
 * Tests verify that rateLimiter.ts no longer uses in-memory state and
 * instead uses ctx.db for persistent rate limit tracking.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const RATE_LIMITER_PATH = path.resolve(
  __dirname,
  '../../convex/research/rateLimiter.ts'
);

function readRateLimiter(): string {
  return fs.readFileSync(RATE_LIMITER_PATH, 'utf-8');
}

/**
 * AC-1: No in-memory Map/Set in rateLimiter.ts
 */
describe('AC-1: No in-memory Map/Set', () => {
  it('should not use new Map() for rate limiting', () => {
    const source = readRateLimiter();
    expect(source).not.toMatch(/new Map\s*\(/);
  });

  it('should not use new Set() for rate limiting', () => {
    const source = readRateLimiter();
    expect(source).not.toMatch(/new Set\s*\(/);
  });

  it('should not use in-memory TokenBucket class', () => {
    const source = readRateLimiter();
    expect(source).not.toMatch(/class TokenBucket/);
  });

  it('should not use in-memory ApiRateLimiter class', () => {
    const source = readRateLimiter();
    expect(source).not.toMatch(/class ApiRateLimiter/);
  });
});

/**
 * AC-2: Uses ctx.db for tracking rate limits
 */
describe('AC-2: Uses ctx.db for persistent tracking', () => {
  it('should reference ctx.db in the implementation', () => {
    const source = readRateLimiter();
    expect(source).toMatch(/ctx\.db/);
  });

  it('should use ctx.db.insert or ctx.db.query', () => {
    const source = readRateLimiter();
    const hasInsert = /ctx\.db\.insert/.test(source);
    const hasQuery = /ctx\.db\.query/.test(source);
    expect(hasInsert || hasQuery).toBe(true);
  });
});

/**
 * AC-3: Follows pattern from convex/synthesis/rateLimits.ts
 */
describe('AC-3: Follows database-backed pattern', () => {
  it('should export withRateLimit function', async () => {
    // The function signature must accept ctx as a parameter
    const source = readRateLimiter();
    expect(source).toMatch(/export.*function.*withRateLimit|export const withRateLimit/);
  });

  it('should have a rateLimits table reference in schema', async () => {
    const schemaPath = path.resolve(__dirname, '../../convex/schema.ts');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    // Either rateLimits or rateLimitTracking table should exist
    const hasRateLimits = /rateLimits\s*:|rateLimitTracking\s*:/.test(schema);
    expect(hasRateLimits).toBe(true);
  });

  it('should not use singleton instance pattern', () => {
    const source = readRateLimiter();
    // No singleton that persists across function invocations
    expect(source).not.toMatch(/let rateLimiterInstance/);
  });
});
