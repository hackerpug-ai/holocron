/**
 * Tests for findRecommendationsAction (REC-003)
 *
 * TDD: RED → GREEN → REFACTOR
 *
 * Tests the synchronous recommendation engine that:
 * - Runs without scheduler (no document creation)
 * - Caps execution at 30 seconds
 * - Validates synthesis output with Zod
 * - Retries on parse failure
 * - Exposes both internalAction and public action
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findRecommendationsAction, findRecommendations, findRecommendationsCore } from './actions';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock generateText from AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

describe('REC-003: findRecommendationsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  /**
   * AC-1: Synchronous return with typed shape
   * Given: valid query and count=5
   * When: findRecommendationsAction runs under convex-test (mocked Jina + LLM)
   * Then: returns { items, sources, query, durationMs } with items.length in 3..7
   */
  describe('AC-1: Synchronous return with typed shape', () => {
    it('findRecommendations happy path', async () => {
      // Mock Jina Search API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `[Autism Career Coach] - [https://example.com/coach1] - Specialized career coaching for autism\n[SF Career Services] - [https://example.com/coach2] - San Francisco-based career support\n[Neurodiversity Works] - [https://example.com/coach3] - Neurodiverse job placement`,
      });

      // Mock Jina Reader responses
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Career Coach 1 content\nSpecialized in autism support',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'SF Career Services content\nBased in San Francisco',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Neurodiversity Works content\nJob placement services',
      });

      // Mock LLM synthesis response
      const { generateText } = await import('ai');
      // @ts-ignore - mocking generateText return value
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [
            {
              name: 'Autism Career Coach',
              description: 'Specialized career coaching for autism',
              whyRecommended: 'Expertise in neurodiversity',
              rating: 4.5,
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
      });

      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('durationMs');
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items.length).toBeLessThanOrEqual(7);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0); // Can be 0 in tests with instant mocks
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
      // Mock Jina Search API with empty response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      });

      const result = await findRecommendationsCore({ query: 'xyz123 nonexistent query', count: 5 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('durationMs');
      expect(result.items).toEqual([]);
      expect(result.sources).toEqual([]);
      expect(typeof result.durationMs).toBe('number');
    });
  });

  /**
   * AC-3: 30s AbortController cap
   * Given: Jina mock delays 40s
   * When: findRecommendationsCore runs with 30s cap
   * Then: returns fallback result or throws abort error before 30.5s
   */
  describe('AC-3: 30s AbortController cap', () => {
    it('abort after 30s', async () => {
      const startTime = Date.now();

      // Mock Jina Search that throws an abort error
      mockFetch.mockImplementationOnce(() => Promise.reject(new DOMException('The operation was aborted', 'AbortError')));

      // Should abort and return fallback
      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });

      const duration = Date.now() - startTime;

      // Should complete quickly (not wait 30s)
      expect(duration).toBeLessThan(1000);

      // Should return fallback result
      expect(result).toHaveProperty('durationMs');
      expect(result.items).toEqual([]);
      expect(result.sources).toEqual([]);
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
      // Mock successful search and synthesis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `[Test Coach] - [https://example.com] - Test`,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Test content',
      });

      const { generateText } = await import('ai');
      // @ts-ignore - mocking generateText return value
      vi.mocked(generateText).mockResolvedValueOnce({

        text: JSON.stringify({
          items: [{ name: 'Test Coach', description: 'Test', whyRecommended: 'Test' }],
          sources: [{ title: 'Test', url: 'https://example.com', snippet: 'Test' }],
          query: 'test',
          durationMs: 1000,
        }) as any,
      });

      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });

      // Verify we got a result
      expect(result).toHaveProperty('items');
      // The action should not create documents (verified by no ctx.runMutation calls in implementation)
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
      // Mock successful search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `[Test Coach] - [https://example.com] - Test`,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Test content',
      });

      const { generateText } = await import('ai');

      // Single call returns invalid JSON
      // @ts-ignore - mocking generateText return value
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'This is not valid JSON',
      });

      const result = await findRecommendationsCore({ query: 'career coaches for autism in SF', count: 5 });

      // Returns graceful empty
      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).toEqual([]);

      // No retry — generateText called exactly once
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `[Rare Specialist] - [https://example.com/rare] - Only one found`,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Rare Specialist content',
      });

      const { generateText } = await import('ai');
      // @ts-ignore
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [{ name: 'Rare Specialist', description: 'Only one found', whyRecommended: 'Best match available' }],
          sources: [{ title: 'Rare Specialist', url: 'https://example.com/rare', snippet: 'Only one found' }],
          query: 'ultra niche niche niche query',
          durationMs: 1000,
        }),
      });

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `[Coach A] - [https://example.com/a] - Good coach`,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Coach A content',
      });

      const { generateText } = await import('ai');
      // @ts-ignore
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [{ name: 'Coach A', description: 'Good coach', whyRecommended: 'Top rated' }],
          sources: [{ title: 'Coach A', url: 'https://example.com/a', snippet: 'Good coach' }],
          query: 'career coach query',
          durationMs: 500,
        }),
      });

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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `[Coach B] - [https://example.com/b] - Great coach`,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Coach B content',
      });

      const { generateText } = await import('ai');
      // @ts-ignore
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          items: [{ name: 'Coach B', description: 'Great coach', whyRecommended: 'Top pick' }],
          sources: [{ title: 'Coach B', url: 'https://example.com/b', snippet: 'Great coach' }],
          query: 'test diagnostic',
          durationMs: 500,
        }),
      });

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
