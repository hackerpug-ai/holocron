import { describe, expect, it, vi } from 'vitest';
import {
  buildSelectiveEnrichmentPlan,
  type RecommendationItemForEnrichment,
  selectivelyEnrichRecommendations,
  shouldEnrichItem,
} from './enrichment';

describe('enrichment', () => {
  it('TC-1: enriches incomplete items with direct platform URLs when evidence exists', async () => {
    const items: RecommendationItemForEnrichment[] = [
      {
        name: 'Coach Alpha',
        description: 'Needs platform evidence',
        whyRecommended: 'Strong fit',
        rank: 1,
      },
    ];

    const executeSearch = vi.fn(async () => [
      {
        title: 'Coach Alpha on Google',
        url: 'https://www.google.com/maps/place/coach-alpha',
        description: 'Rated 4.8 stars with 112 reviews',
      },
    ]);

    const result = await selectivelyEnrichRecommendations(
      items,
      {
        query: 'career coach',
        location: 'San Francisco',
        apiKey: 'test-key',
      },
      {
        executeSearch,
        readUrls: vi.fn(async () => new Map<string, string>()),
      }
    );

    expect(result[0].platformLinks).toEqual([
      {
        platform: 'google',
        url: 'https://www.google.com/maps/place/coach-alpha',
        rating: 4.8,
        reviewCount: 112,
      },
    ]);
    expect(result[0].sourcePlatform).toBe('google');
    expect(result[0].reviewCount).toBe(112);
  });

  it('TC-2: skips already-rich items and avoids re-search', async () => {
    const items: RecommendationItemForEnrichment[] = [
      {
        name: 'Coach Rich',
        description: 'Already rich',
        whyRecommended: 'Has full trust data',
        rank: 1,
        reviewCount: 77,
        sourcePlatform: 'yelp',
        platformLinks: [
          {
            platform: 'yelp',
            url: 'https://www.yelp.com/biz/coach-rich',
            rating: 4.7,
            reviewCount: 77,
          },
        ],
      },
    ];

    expect(shouldEnrichItem(items[0])).toBe(false);
    expect(buildSelectiveEnrichmentPlan(items)).toEqual([]);

    const executeSearch = vi.fn();

    const result = await selectivelyEnrichRecommendations(
      items,
      { query: 'career coach', apiKey: 'test-key' },
      {
        executeSearch,
        readUrls: vi.fn(async () => new Map<string, string>()),
      }
    );

    expect(executeSearch).not.toHaveBeenCalled();
    expect(result).toEqual(items);
  });

  it('TC-3: one failed enrichment search does not collapse successful items', async () => {
    const items: RecommendationItemForEnrichment[] = [
      {
        name: 'Coach Success',
        description: 'Missing links',
        whyRecommended: 'Likely good',
        rank: 1,
      },
      {
        name: 'Coach Failure',
        description: 'Missing links',
        whyRecommended: 'Fallback expected',
        rank: 2,
      },
    ];

    const executeSearch = vi.fn(async ({ query }: { query: string }) => {
      if (query.includes('Coach Failure')) {
        throw new Error('search failed');
      }
      return [
        {
          title: 'Coach Success Yelp',
          url: 'https://www.yelp.com/biz/coach-success',
          description: '4.9 stars with 219 reviews',
        },
      ];
    });

    const result = await selectivelyEnrichRecommendations(
      items,
      { query: 'career coach', location: 'SF', apiKey: 'test-key' },
      {
        executeSearch,
        readUrls: vi.fn(async () => new Map<string, string>()),
      }
    );

    expect(result).toHaveLength(2);
    expect(result[0].platformLinks?.[0].url).toBe('https://www.yelp.com/biz/coach-success');
    expect(result[1]).toEqual(items[1]);
  });

  it('propagates abort-like failures instead of silently returning partial enrichment', async () => {
    const items: RecommendationItemForEnrichment[] = [
      {
        name: 'Coach Abort',
        description: 'Missing links',
        whyRecommended: 'Should abort pipeline',
        rank: 1,
      },
    ];

    await expect(
      selectivelyEnrichRecommendations(
        items,
        { query: 'career coach', apiKey: 'test-key' },
        {
          executeSearch: vi.fn(async () => {
            throw new DOMException('The operation was aborted', 'AbortError');
          }),
          readUrls: vi.fn(async () => new Map<string, string>()),
        }
      )
    ).rejects.toThrow(/aborted|AbortError/i);
  });
});
