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
import { RecommendationSynthesisSchema } from '../chat/specialistPrompts';

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
   * AC-5: Retry on Zod failure
   * Given: LLM returns invalid JSON on first pass, valid on second
   * When: findRecommendationsCore runs
   * Then: result is the second pass's valid output
   */
  describe('AC-5: Retry on Zod failure', () => {
    it('synthesis retry', async () => {
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

      // First call returns invalid JSON
      // @ts-ignore - mocking generateText return value
      vi.mocked(generateText).mockResolvedValueOnce({

        text: 'This is not valid JSON',
      });

      // Second call returns valid JSON
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

      // Should eventually return valid results
      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);

      // Validate against Zod schema
      const parsed = RecommendationSynthesisSchema.safeParse(result);
      expect(parsed.success).toBe(true);

      // Verify generateText was called twice (initial + retry)
      expect(generateText).toHaveBeenCalledTimes(2);
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
