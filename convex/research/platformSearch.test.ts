import { describe, expect, it, vi } from 'vitest';
import { JinaError } from '../lib/jina';
import {
  buildPlatformSearchPlan,
  executePlatformSearches,
  MIN_POST_DISCOVERY_HEADROOM_MS,
  PLATFORM_RESULT_LIMIT,
  PLATFORM_SEARCH_TIMEOUT_MS,
  type PlatformSearchPlanItem,
  RECOMMENDATION_TOTAL_TIMEOUT_MS,
} from './platformSearch';

describe('REC-UPG-02: platformSearch', () => {
  describe('buildPlatformSearchPlan', () => {
    it('emits deterministic targeted searches including expert product sources', () => {
      const plan = buildPlatformSearchPlan({
        query: 'plumbers',
        location: 'Salt Lake City',
      });

      expect(plan).toHaveLength(7);
      expect(plan.map((item) => item.kind)).toEqual([
        'generalWeb',
        'review',
        'maps',
        'community',
        'ratings',
        'productExpert',
        'productRatings',
      ]);
      expect(plan.every((item) => item.limit === PLATFORM_RESULT_LIMIT)).toBe(true);
      expect(plan.every((item) => item.timeoutMs === PLATFORM_SEARCH_TIMEOUT_MS)).toBe(true);
      expect(plan[0].query).toContain('plumbers');
      expect(plan[0].query).toContain('Salt Lake City');
      expect(plan[1].site).toBe('yelp.com');
      expect(plan[2].site).toBe('google.com');
      expect(plan[3].site).toBe('reddit.com');
      expect(plan[5].site).toBe('thewirecutter.com');
      expect(plan[6].site).toBe('rtings.com');
    });

    it('builds valid searches without location assumptions', () => {
      const plan = buildPlatformSearchPlan({
        query: 'wireless headphones',
        constraints: ['open-back', 'under $300'],
      });

      expect(plan).toHaveLength(7);
      expect(plan.every((item) => item.query.includes('wireless headphones'))).toBe(true);
      expect(plan.some((item) => item.query.includes('open-back under $300'))).toBe(true);
      expect(plan.every((item) => !item.query.includes('undefined'))).toBe(true);
      expect(plan.every((item) => !item.query.includes(' in '))).toBe(true);
    });

    it('uses bounded limits and timeouts that leave post-discovery headroom', () => {
      const plan = buildPlatformSearchPlan({
        query: 'plumbers',
        location: 'Salt Lake City',
      });

      expect(plan).toHaveLength(7);
      expect(plan.every((item) => item.limit <= PLATFORM_RESULT_LIMIT)).toBe(true);
      expect(plan.every((item) => item.timeoutMs <= PLATFORM_SEARCH_TIMEOUT_MS)).toBe(true);
      expect(RECOMMENDATION_TOTAL_TIMEOUT_MS - PLATFORM_SEARCH_TIMEOUT_MS).toBeGreaterThanOrEqual(
        MIN_POST_DISCOVERY_HEADROOM_MS
      );
    });
  });

  describe('executePlatformSearches', () => {
    it('keeps surviving platform results when one platform fails', async () => {
      const plan = buildPlatformSearchPlan({
        query: 'plumbers',
        location: 'Salt Lake City',
      });

      const executeSearch = vi.fn(async (item: PlatformSearchPlanItem) => {
        if (item.kind === 'review') {
          throw new JinaError('rate limited', 'rate_limit', 429);
        }

        return [
          {
            title: `${item.kind} result`,
            url: `https://example.com/${item.kind}`,
            description: `${item.kind} snippet`,
          },
        ];
      });

      const results = await executePlatformSearches(plan, {
        apiKey: 'test-key',
        executeSearch,
      });

      expect(results).toHaveLength(6);
      expect(results.map((item) => item.sourcePlatform)).toEqual([
        'generalWeb',
        'maps',
        'community',
        'ratings',
        'productExpert',
        'productRatings',
      ]);
    });

    it('deduplicates deterministically while preserving provenance', async () => {
      const plan = buildPlatformSearchPlan({
        query: 'plumbers',
        location: 'Salt Lake City',
      });

      const duplicateUrl = 'https://example.com/shared/?utm_source=test';
      const executeSearch = vi.fn(async (item: PlatformSearchPlanItem) => {
        if (item.kind === 'generalWeb') {
          return [
            {
              title: 'Shared Listing',
              url: duplicateUrl,
              description: 'general listing',
            },
          ];
        }

        if (item.kind === 'ratings') {
          return [
            {
              title: 'Shared Listing Alternate',
              url: 'https://example.com/shared',
              description: 'ratings listing',
            },
          ];
        }

        return [
          {
            title: `${item.kind} result`,
            url: `https://example.com/${item.kind}`,
            description: `${item.kind} snippet`,
          },
        ];
      });

      const results = await executePlatformSearches(plan, {
        apiKey: 'test-key',
        executeSearch,
      });

      // 7 platforms, generalWeb+ratings deduplicate to 1 → 6 distinct results
      expect(results).toHaveLength(6);
      expect(results[0]).toMatchObject({
        title: 'Shared Listing',
        url: duplicateUrl,
        sourcePlatform: 'generalWeb',
        provenance: ['generalWeb', 'ratings'],
      });
    });

    it('keeps successful platform results when a non-Jina platform failure rejects', async () => {
      const plan = buildPlatformSearchPlan({
        query: 'plumbers',
        location: 'Salt Lake City',
      });

      const executeSearch = vi.fn(async (item: PlatformSearchPlanItem) => {
        if (item.kind === 'community') {
          throw new Error('unexpected parser failure');
        }

        return [
          {
            title: `${item.kind} result`,
            url: `https://example.com/${item.kind}`,
            description: `${item.kind} snippet`,
          },
        ];
      });

      const results = await executePlatformSearches(plan, {
        apiKey: 'test-key',
        executeSearch,
      });

      // 7 platforms, community fails → 6 remaining
      expect(results).toHaveLength(6);
      expect(results.some((item) => item.sourcePlatform === 'community')).toBe(false);
    });
  });
});
