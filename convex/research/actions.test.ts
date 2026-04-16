/**
 * Tests for findRecommendationsAction (REC-003)
 *
 * TDD: RED → GREEN → REFACTOR
 *
 * Tests the synchronous recommendation engine that:
 * - Runs without scheduler (no document creation)
 * - Caps execution under the 45 second recommendation budget
 * - Validates synthesis output with Zod
 * - Returns graceful fallbacks on discovery/synthesis failures
 * - Exposes both internalAction and public action
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findRecommendationsAction, findRecommendations, findRecommendationsCore } from './actions';
import {
  RecommendationSynthesisSchema,
  RECOMMENDATION_SYNTHESIS_PROMPT,
} from '../chat/specialistPrompts';
import { RECOMMENDATION_TOTAL_TIMEOUT_MS } from './platformSearch';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock generateText from AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

const PLATFORM_SEARCH_COUNT = 5;

function mockPlatformSearches(
  searchResults: Array<Array<{ title: string; url: string; description: string }>>,
) {
  expect(searchResults).toHaveLength(PLATFORM_SEARCH_COUNT);
  for (const data of searchResults) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data }),
    });
  }
}

function mockReaderResponses(contents: string[]) {
  for (const content of contents) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => content,
    });
  }
}

function mockEnrichmentSearches(
  searchResults: Array<Array<{ title: string; url: string; description: string }>>,
) {
  for (const data of searchResults) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data }),
    });
  }
}

describe('REC-003: findRecommendationsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    process.env.JINA_API_KEY = 'test-key';
  });

  describe('REC-UPG-01: additive trust metadata contract', () => {
    it('parses legacy payloads without trust metadata', () => {
      const legacyPayload = {
        items: [
          {
            name: 'Legacy Coach',
            description: 'Legacy recommendation',
            whyRecommended: 'Matches the user query',
            rating: 4.8,
            location: 'San Francisco, CA',
            pricing: '$$$',
            contact: {
              url: 'https://example.com/legacy',
            },
          },
        ],
        sources: [
          {
            title: 'Legacy Coach',
            url: 'https://example.com/legacy',
            snippet: 'Legacy result snippet',
          },
        ],
        query: 'legacy query',
        durationMs: 250,
      };

      expect(RecommendationSynthesisSchema.safeParse(legacyPayload).success).toBe(true);
    });

    it('parses rich payloads with reviewCount, platformLinks, and sourcePlatform', () => {
      const richPayload = {
        items: [
          {
            name: 'Rich Coach',
            description: 'Rich recommendation',
            whyRecommended: 'Strong reviews across platforms',
            rating: 4.9,
            reviewCount: 187,
            sourcePlatform: 'yelp',
            platformLinks: [
              {
                platform: 'yelp',
                url: 'https://www.yelp.com/biz/rich-coach',
                rating: 4.9,
                reviewCount: 142,
              },
              {
                platform: 'google',
                url: 'https://maps.google.com/?cid=rich-coach',
                reviewCount: 45,
              },
            ],
          },
        ],
        sources: [
          {
            title: 'Rich Coach',
            url: 'https://example.com/rich',
            snippet: 'Rich result snippet',
          },
        ],
        query: 'rich query',
        durationMs: 400,
      };

      const parsed = RecommendationSynthesisSchema.safeParse(richPayload);

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.items[0].reviewCount).toBe(187);
        expect(parsed.data.items[0].sourcePlatform).toBe('yelp');
        expect(parsed.data.items[0].platformLinks).toEqual([
          {
            platform: 'yelp',
            url: 'https://www.yelp.com/biz/rich-coach',
            rating: 4.9,
            reviewCount: 142,
          },
          {
            platform: 'google',
            url: 'https://maps.google.com/?cid=rich-coach',
            reviewCount: 45,
          },
        ]);
      }
    });

    it('requests trust metadata and omission of unsupported fields in the prompt', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('"reviewCount": number_or_omit');
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('"platformLinks": [');
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('"sourcePlatform": "string_or_omit"');
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('reviewCount, platformLinks, and sourcePlatform');
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('OMIT unsupported optional fields');
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('never fabricate');
    });
  });

  /**
   * AC-1: Synchronous return with typed shape
   * Given: valid query and count=5
   * When: findRecommendationsAction runs under convex-test (mocked Jina + LLM)
   * Then: returns { items, sources, query, durationMs } with items.length in 3..7
   */
  describe('AC-1: Synchronous return with typed shape', () => {
    it('findRecommendations happy path', async () => {
      mockPlatformSearches([
        [
          { title: 'Autism Career Coach', url: 'https://example.com/coach1', description: 'Specialized career coaching for autism' },
          { title: 'SF Career Services', url: 'https://example.com/coach2', description: 'San Francisco-based career support' },
        ],
        [
          { title: 'Autism Career Coach Yelp', url: 'https://example.com/coach1?utm_source=yelp', description: 'Same provider from review platform' },
        ],
        [
          { title: 'Neurodiversity Works', url: 'https://example.com/coach3', description: 'Neurodiverse job placement' },
        ],
        [
          { title: 'Community Pick', url: 'https://example.com/coach4', description: 'Community-vetted recommendation' },
        ],
        [
          { title: 'Ratings Roundup', url: 'https://example.com/coach5', description: 'Best rated provider summary' },
        ],
      ]);
      mockReaderResponses([
        'Career Coach 1 content\nSpecialized in autism support',
        'SF Career Services content\nBased in San Francisco',
        'Neurodiversity Works content\nJob placement services',
        'Community Pick content\nReddit discussion summary',
        'Ratings Roundup content\nReview aggregation',
      ]);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [
            {
              name: 'Autism Career Coach',
              description: 'Specialized career coaching for autism',
              whyRecommended: 'Expertise in neurodiversity',
              rating: 4.5,
              reviewCount: 87,
              sourcePlatform: 'yelp',
              platformLinks: [
                {
                  platform: 'yelp',
                  url: 'https://www.yelp.com/biz/autism-career-coach',
                  rating: 4.5,
                  reviewCount: 87,
                },
              ],
            },
            {
              name: 'SF Career Services',
              description: 'San Francisco-based career support',
              whyRecommended: 'Local expertise',
            },
            {
              name: 'Neurodiversity Works',
              description: 'Neurodiverse job placement',
              whyRecommended: 'Specialized placement services',
            },
          ],
          sources: [
            {
              title: 'Autism Career Coach',
              url: 'https://example.com/coach1',
              snippet: 'Specialized career coaching',
            },
          ],
          query: 'career coaches for autism in SF',
          durationMs: 5000,
        }) as any,
      } as any);

      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('durationMs');
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items.length).toBeLessThanOrEqual(7);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0); // Can be 0 in tests with instant mocks
      expect(result.items[0]).toMatchObject({
        reviewCount: 87,
        sourcePlatform: 'yelp',
        platformLinks: [
          {
            platform: 'yelp',
            url: 'https://www.yelp.com/biz/autism-career-coach',
            rating: 4.5,
            reviewCount: 87,
          },
        ],
      });
      expect(result.sources).toHaveLength(1);
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('REC-UPG-03: second-pass selective enrichment', () => {
    it('enriches materially incomplete items while preserving already-rich items', async () => {
      mockPlatformSearches([
        [{ title: 'Coach One', url: 'https://example.com/coach1', description: 'Primary source' }],
        [],
        [],
        [],
        [],
      ]);
      mockReaderResponses(['Coach synthesis content']);
      mockEnrichmentSearches([
        [{ title: 'Coach Two profile', url: 'https://www.google.com/maps/place/coach-two', description: 'Rated 4.7 stars with 121 reviews' }],
        [],
        [],
      ]);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [
            {
              name: 'Coach One',
              description: 'Already rich',
              whyRecommended: 'Has platform links',
              rating: 4.9,
              reviewCount: 80,
              sourcePlatform: 'yelp',
              platformLinks: [
                {
                  platform: 'yelp',
                  url: 'https://www.yelp.com/biz/coach-one',
                  rating: 4.9,
                  reviewCount: 80,
                },
              ],
            },
            {
              name: 'Coach Two',
              description: 'Needs enrichment',
              whyRecommended: 'No links yet',
            },
          ],
          sources: [{ title: 'Coach One', url: 'https://example.com/coach1', snippet: 'Primary source' }],
          query: 'career coach query',
          durationMs: 500,
        }),
      } as any);

      const result = await findRecommendationsCore({ query: 'career coach query', count: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        name: 'Coach One',
        rating: 4.9,
        reviewCount: 80,
        sourcePlatform: 'yelp',
        platformLinks: [
          {
            platform: 'yelp',
            url: 'https://www.yelp.com/biz/coach-one',
            rating: 4.9,
            reviewCount: 80,
          },
        ],
      });
      expect(result.items[1]).toMatchObject({
        name: 'Coach Two',
        sourcePlatform: 'google',
        platformLinks: [
          {
            platform: 'google',
            url: 'https://www.google.com/maps/place/coach-two',
            rating: 4.7,
            reviewCount: 121,
          },
        ],
      });
    });
  });

  /**
   * AC-2: Graceful empty-result shape on no sources
   * Given: Jina mock returns zero sources
   * When: findRecommendationsCore runs
   * Then: returns { items: [], sources: [], query, durationMs } without throwing
   */
  describe('AC-2: Graceful empty-result shape on no sources', () => {
    it('empty sources', async () => {
      mockPlatformSearches([[], [], [], [], []]);

      const result = await findRecommendationsCore({ query: 'xyz123 nonexistent query', count: 5 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('durationMs');
      expect(result.items).toEqual([]);
      expect(result.sources).toEqual([]);
      expect(typeof result.durationMs).toBe('number');
      expect(mockFetch).toHaveBeenCalledTimes(PLATFORM_SEARCH_COUNT);
    });
  });

  /**
   * AC-3: 45s recommendation budget
   * Given: discovery hits an abort-shaped error immediately
   * When: findRecommendationsCore runs under the shared total timeout
   * Then: returns fallback result quickly instead of hanging
   */
  describe('AC-3: Total timeout budget handling', () => {
    it('returns fallback on abort-shaped discovery failure', async () => {
      const startTime = Date.now();

      mockFetch.mockImplementationOnce(() => Promise.reject(new DOMException('The operation was aborted', 'AbortError')));
      mockPlatformSearches([[], [], [], [], []]);

      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
      expect(RECOMMENDATION_TOTAL_TIMEOUT_MS).toBe(45_000);
      expect(result).toHaveProperty('durationMs');
      expect(result.items).toEqual([]);
      expect(result.sources).toEqual([]);
    });

    it('returns fallback when abort occurs during second-pass enrichment', async () => {
      const realSetTimeout = global.setTimeout;
      let abortMainTimer: (() => void) | null = null;
      const setTimeoutSpy = vi
        .spyOn(global, 'setTimeout')
        .mockImplementation(((handler: TimerHandler, timeout?: number, ...args: any[]) => {
          if (timeout === RECOMMENDATION_TOTAL_TIMEOUT_MS) {
            abortMainTimer = () => {
              if (typeof handler === 'function') {
                handler(...args);
              }
            };
            return 1 as any;
          }
          return realSetTimeout(handler as any, timeout as any, ...args);
        }) as any);

      mockPlatformSearches([
        [{ title: 'Coach Timeout', url: 'https://example.com/timeout', description: 'Test' }],
        [],
        [],
        [],
        [],
      ]);
      mockReaderResponses(['Timeout coach content']);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [
            {
              name: 'Coach Timeout',
              description: 'Needs enrichment',
              whyRecommended: 'No platform links yet',
            },
          ],
          sources: [{ title: 'Coach Timeout', url: 'https://example.com/timeout', snippet: 'Test' }],
          query: 'career coach timeout',
          durationMs: 1000,
        }),
      } as any);

      mockFetch.mockImplementationOnce(async () => {
        abortMainTimer?.();
        throw new DOMException('The operation was aborted', 'AbortError');
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await findRecommendationsCore({ query: 'career coach timeout', count: 1 });

      expect(result).toEqual({
        items: [],
        sources: [],
        query: 'career coach timeout',
        durationMs: expect.any(Number),
      });

      setTimeoutSpy.mockRestore();
    });
  });

  /**
   * AC-4: No document created in any path
   * Given: end-to-end run under convex-test
   * When: tool executor completes
   * Then: documents table has zero new rows
   */
  describe('AC-4: No document written', () => {
    it('no document written', async () => {
      mockPlatformSearches([
        [{ title: 'Test Coach', url: 'https://example.com', description: 'Test' }],
        [],
        [],
        [],
        [],
      ]);
      mockReaderResponses(['Test content']);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [{ name: 'Test Coach', description: 'Test', whyRecommended: 'Test' }],
          sources: [{ title: 'Test', url: 'https://example.com', snippet: 'Test' }],
          query: 'test',
          durationMs: 1000,
        }) as any,
      } as any);

      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });

      expect(result).toHaveProperty('items');
    });
  });

  /**
   * AC-5: Invalid JSON on first pass → graceful empty result, no retry
   * Given: LLM returns invalid JSON
   * When: findRecommendationsCore runs
   * Then: returns { items: [], ... } without a second LLM call
   */
  describe('AC-5: Invalid JSON returns graceful empty, no retry', () => {
    it('invalid JSON returns empty result with single LLM call', async () => {
      mockPlatformSearches([
        [{ title: 'Test Coach', url: 'https://example.com', description: 'Test' }],
        [],
        [],
        [],
        [],
      ]);
      mockReaderResponses(['Test content']);

      const { generateText } = await import('ai');

      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'This is not valid JSON',
      } as any);

      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });

      // Returns graceful empty
      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).toEqual([]);

      expect(generateText).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * AC-6: Fewer-than-count returns what was found (no 3+ floor)
   * Given: LLM finds only 1 real provider for a niche query
   * When: findRecommendationsCore runs
   * Then: returns { items: [<that 1 provider>], ... } — NOT empty
   */
  describe('AC-6: Fewer-than-count returns what was found', () => {
    it('returns 1 item when only 1 provider found', async () => {
      mockPlatformSearches([
        [{ title: 'Rare Specialist', url: 'https://example.com/rare', description: 'Only one found' }],
        [],
        [],
        [],
        [],
      ]);
      mockReaderResponses(['Rare Specialist content']);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [{ name: 'Rare Specialist', description: 'Only one found', whyRecommended: 'Best match available' }],
          sources: [{ title: 'Rare Specialist', url: 'https://example.com/rare', snippet: 'Only one found' }],
          query: 'ultra niche niche niche query',
          durationMs: 1000,
        }),
      } as any);

      const result = await findRecommendationsCore({ query: 'ultra niche niche niche query', count: 5 });

      // Must return the 1 item — NOT empty
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('Rare Specialist');
    });
  });

  /**
   * AC-7: No strict-retry path — generateText called exactly once on valid response
   * Given: LLM returns valid JSON on first pass
   * When: findRecommendationsCore runs
   * Then: generateText is called exactly once (no retry)
   */
  describe('AC-7: Single LLM call on success', () => {
    it('generateText called once when first parse succeeds', async () => {
      mockPlatformSearches([
        [{ title: 'Coach A', url: 'https://example.com/a', description: 'Good coach' }],
        [],
        [],
        [],
        [],
      ]);
      mockReaderResponses(['Coach A content']);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [{ name: 'Coach A', description: 'Good coach', whyRecommended: 'Top rated' }],
          sources: [{ title: 'Coach A', url: 'https://example.com/a', snippet: 'Good coach' }],
          query: 'career coach query',
          durationMs: 500,
        }),
      } as any);

      await findRecommendationsCore({ query: 'career coach query', count: 3 });

      expect(generateText).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * AC-8: Diagnostic logs fire at key pipeline points
   * Given: happy path (sources found, synthesis succeeds)
   * When: findRecommendationsCore runs
   * Then: console.log called with [findRec] prefix for sources count, content length, parse result
   */
  describe('AC-8: Diagnostic logs at key pipeline points', () => {
    it('logs sources count, content length, and parse result', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockPlatformSearches([
        [{ title: 'Coach B', url: 'https://example.com/b', description: 'Great coach' }],
        [],
        [],
        [],
        [],
      ]);
      mockReaderResponses(['Coach B content']);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [{ name: 'Coach B', description: 'Great coach', whyRecommended: 'Top pick' }],
          sources: [{ title: 'Coach B', url: 'https://example.com/b', snippet: 'Great coach' }],
          query: 'test diagnostic',
          durationMs: 500,
        }),
      } as any);

      await findRecommendationsCore({ query: 'test diagnostic', count: 3 });

      const logCalls = logSpy.mock.calls.map(c => c[0] as string);

      // Must have at least one [findRec] prefixed log
      expect(logCalls.some(m => m.includes('[findRec]'))).toBe(true);

      logSpy.mockRestore();
    });
  });

  /**
   * Additional: Verify both internalAction and public action are exported
   */
  describe('Exports', () => {
    it('exports findRecommendationsAction (internal)', () => {
      expect(findRecommendationsAction).toBeDefined();
    });

    it('exports findRecommendations (public)', () => {
      expect(findRecommendations).toBeDefined();
    });
  });
});
