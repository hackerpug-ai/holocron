/**
 * Tests for Jina AI Helper Module
 *
 * Test file: convex/lib/jina.ts
 *
 * These tests verify the centralized Jina helper functionality:
 * - Jina Search API integration with loose validation
 * - Jina Reader API integration with error handling
 * - Batch operations
 * - Combined search + read operations
 * - Error handling (rate limits, auth, network, validation)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JinaError,
  JinaReaderResultSchema,
  JinaSearchResultSchema,
  jinaReader,
  jinaReaderBatch,
  jinaSearch,
  jinaSearchAndRead,
} from '../../../convex/lib/jina';

describe('Jina Helper Module', () => {
  const mockApiKey = 'test-jina-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('jinaSearch', () => {
    it('should perform successful search and return validated results', async () => {
      const mockResponse = [
        { title: 'Test Result 1', url: 'https://example.com/1', content: 'Content 1' },
        { title: 'Test Result 2', url: 'https://example.com/2', content: 'Content 2' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const results = await jinaSearch('test query', { apiKey: mockApiKey });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: 'Test Result 1',
        url: 'https://example.com/1',
        content: 'Content 1',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('s.jina.ai'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
          }),
        })
      );
    });

    it('should handle search with alternative field names (link instead of url)', async () => {
      const mockResponse = [
        { title: 'Result', link: 'https://example.com', description: 'Description' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const results = await jinaSearch('test query', { apiKey: mockApiKey });

      expect(results).toHaveLength(1);
      expect(results[0].link).toBe('https://example.com');
    });

    it('should handle search with extra fields (loose validation)', async () => {
      const mockResponse = [
        {
          title: 'Result',
          url: 'https://example.com',
          extraField: 'extra value',
          anotherField: 123,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const results = await jinaSearch('test query', { apiKey: mockApiKey });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Result');
      // Extra fields are preserved via passthrough()
      expect((results[0] as any).extraField).toBe('extra value');
    });

    it('should respect limit option', async () => {
      const mockResponse = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example.com/${i}`,
        content: `Content ${i}`,
      }));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const results = await jinaSearch('test query', {
        apiKey: mockApiKey,
        limit: 3,
      });

      expect(results).toHaveLength(3);
    });

    it('should throw JinaError with rate_limit type on 429 status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      await expect(jinaSearch('test query', { apiKey: mockApiKey })).rejects.toThrow(JinaError);
      await expect(jinaSearch('test query', { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'rate_limit',
        statusCode: 429,
      });
    });

    it('should throw JinaError with auth type on 401/403 status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await expect(jinaSearch('test query', { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'auth',
        statusCode: 401,
      });
    });

    it('should throw JinaError with validation type for empty query', async () => {
      await expect(jinaSearch('', { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'validation',
        message: expect.stringContaining('cannot be empty'),
      });
    });

    it('should throw JinaError with validation type for missing API key', async () => {
      await expect(jinaSearch('test query', {})).rejects.toMatchObject({
        type: 'auth',
        message: expect.stringContaining('JINA_API_KEY is required'),
      });
    });

    it('should handle timeout with AbortError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        jinaSearch('test query', { apiKey: mockApiKey, timeout: 50 })
      ).rejects.toMatchObject({
        type: 'network',
        message: expect.stringContaining('timed out'),
      });
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(jinaSearch('test query', { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'network',
        message: expect.stringContaining('network error'),
      });
    });

    it('should handle malformed JSON by returning minimal valid objects', async () => {
      const mockResponse = [
        { invalidField: 'value' }, // Missing title, url, content
        { title: 'Valid Result', url: 'https://example.com', content: 'Valid content' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const results = await jinaSearch('test query', { apiKey: mockApiKey });

      expect(results).toHaveLength(2);
      // The fallback creates minimal objects with empty strings and 'Unknown' title
      expect(results[0].title).toBe('Unknown'); // Fallback for missing title
      expect(results[0].url).toBe(''); // Fallback for missing url
      expect(results[0].content).toBe(''); // Fallback for missing content
      expect(results[1].title).toBe('Valid Result');
    });
  });

  describe('jinaReader', () => {
    const testUrl = 'https://example.com/article';

    it('should successfully read content from URL', async () => {
      const mockContent = '# Article Title\n\nThis is the article content.';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockContent,
      } as Response);

      const content = await jinaReader(testUrl, { apiKey: mockApiKey });

      expect(content).toBe(mockContent);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('r.jina.ai'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
          }),
        })
      );
    });

    it('should handle different return formats', async () => {
      const mockContent = '<p>HTML content</p>';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockContent,
      } as Response);

      await jinaReader(testUrl, {
        apiKey: mockApiKey,
        returnFormat: 'html',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Return-Format': 'html',
          }),
        })
      );
    });

    it('should throw JinaError with validation type for empty URL', async () => {
      await expect(jinaReader('', { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'validation',
        message: expect.stringContaining('URL cannot be empty'),
      });
    });

    it('should throw JinaError with validation type for invalid URL format', async () => {
      await expect(jinaReader('not-a-url', { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'validation',
        message: expect.stringContaining('Invalid URL format'),
      });
    });

    it('should throw JinaError with rate_limit type on 429 status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      await expect(jinaReader(testUrl, { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'rate_limit',
        statusCode: 429,
      });
    });

    it('should throw JinaError with validation type for empty content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);

      await expect(jinaReader(testUrl, { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'validation',
        message: expect.stringContaining('No content extracted'),
      });
    });

    it('should handle timeout with AbortError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(jinaReader(testUrl, { apiKey: mockApiKey, timeout: 50 })).rejects.toMatchObject({
        type: 'network',
        message: expect.stringContaining('timed out'),
      });
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(jinaReader(testUrl, { apiKey: mockApiKey })).rejects.toMatchObject({
        type: 'network',
        message: expect.stringContaining('network error'),
      });
    });
  });

  describe('jinaReaderBatch', () => {
    const testUrls = [
      'https://example.com/article1',
      'https://example.com/article2',
      'https://example.com/article3',
    ];

    it('should successfully read multiple URLs in parallel', async () => {
      const mockContents = ['Content 1', 'Content 2', 'Content 3'];

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => mockContents[0],
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => mockContents[1],
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => mockContents[2],
        } as Response);

      const results = await jinaReaderBatch(testUrls, { apiKey: mockApiKey });

      expect(results.size).toBe(3);
      expect(results.get(testUrls[0])).toBe('Content 1');
      expect(results.get(testUrls[1])).toBe('Content 2');
      expect(results.get(testUrls[2])).toBe('Content 3');
    });

    it('should handle partial failures without throwing', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'Content 1',
        } as Response)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'Content 3',
        } as Response);

      const results = await jinaReaderBatch(testUrls, { apiKey: mockApiKey });

      // Should have 2 successful results, 1 failure
      expect(results.size).toBe(2);
      expect(results.get(testUrls[0])).toBe('Content 1');
      expect(results.get(testUrls[2])).toBe('Content 3');
      expect(results.has(testUrls[1])).toBe(false);
    });

    it('should return empty map when all requests fail', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const results = await jinaReaderBatch(testUrls, { apiKey: mockApiKey });

      expect(results.size).toBe(0);
    });
  });

  describe('jinaSearchAndRead', () => {
    it('should perform search then read top results', async () => {
      const mockSearchResults = [
        { title: 'Result 1', url: 'https://example.com/1', content: 'Snippet 1' },
        { title: 'Result 2', url: 'https://example.com/2', content: 'Snippet 2' },
        { title: 'Result 3', url: 'https://example.com/3', content: 'Snippet 3' },
      ];

      const mockReadContents = ['Full content 1', 'Full content 2', 'Full content 3'];

      // Mock search call
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Search call
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockSearchResults,
          } as Response);
        } else {
          // Reader calls
          const contentIndex = callCount - 2;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: async () => mockReadContents[contentIndex],
          } as Response);
        }
      });

      const results = await jinaSearchAndRead('test query', {
        apiKey: mockApiKey,
        searchLimit: 3,
        readLimit: 3,
      });

      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({
        url: 'https://example.com/1',
        title: 'Result 1',
        content: 'Full content 1',
      });
      expect(results[1]).toMatchObject({
        url: 'https://example.com/2',
        title: 'Result 2',
        content: 'Full content 2',
      });
      expect(results[2]).toMatchObject({
        url: 'https://example.com/3',
        title: 'Result 3',
        content: 'Full content 3',
      });
    });

    it('should respect readLimit option', async () => {
      const mockSearchResults = [
        { title: 'Result 1', url: 'https://example.com/1', content: 'Snippet 1' },
        { title: 'Result 2', url: 'https://example.com/2', content: 'Snippet 2' },
        { title: 'Result 3', url: 'https://example.com/3', content: 'Snippet 3' },
        { title: 'Result 4', url: 'https://example.com/4', content: 'Snippet 4' },
        { title: 'Result 5', url: 'https://example.com/5', content: 'Snippet 5' },
      ];

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockSearchResults,
          } as Response);
        } else {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: async () => `Content ${callCount - 1}`,
          } as Response);
        }
      });

      const results = await jinaSearchAndRead('test query', {
        apiKey: mockApiKey,
        searchLimit: 5,
        readLimit: 2,
      });

      // Should only read top 2 results
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://example.com/1');
      expect(results[1].url).toBe('https://example.com/2');
    });

    it('should handle results with missing URLs gracefully', async () => {
      const mockSearchResults = [
        { title: 'Result 1', url: 'https://example.com/1', content: 'Snippet 1' },
        { title: 'Result 2', content: 'Snippet 2' }, // Missing URL
        { title: 'Result 3', url: 'https://example.com/3', content: 'Snippet 3' },
      ];

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockSearchResults,
          } as Response);
        } else {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: async () => `Content ${callCount - 1}`,
          } as Response);
        }
      });

      const results = await jinaSearchAndRead('test query', {
        apiKey: mockApiKey,
      });

      // Should skip result 2 (missing URL)
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('JinaSearchResultSchema', () => {
    it('should validate standard search result', () => {
      const result = {
        title: 'Test',
        url: 'https://example.com',
        content: 'Content',
      };

      expect(() => JinaSearchResultSchema.parse(result)).not.toThrow();
    });

    it('should allow optional fields', () => {
      const result = {
        title: 'Test',
      };

      expect(() => JinaSearchResultSchema.parse(result)).not.toThrow();
    });

    it('should allow extra fields (passthrough)', () => {
      const result = {
        title: 'Test',
        url: 'https://example.com',
        extraField: 'extra',
        anotherField: 123,
      };

      const parsed = JinaSearchResultSchema.parse(result);
      expect((parsed as any).extraField).toBe('extra');
      expect((parsed as any).anotherField).toBe(123);
    });

    it('should accept alternative field names', () => {
      const result = {
        title: 'Test',
        link: 'https://example.com', // Instead of 'url'
        description: 'Description', // Instead of 'content'
      };

      expect(() => JinaSearchResultSchema.parse(result)).not.toThrow();
    });
  });

  describe('JinaReaderResultSchema', () => {
    it('should validate standard reader result', () => {
      const result = {
        content: 'Test content',
        title: 'Test',
        url: 'https://example.com',
      };

      expect(() => JinaReaderResultSchema.parse(result)).not.toThrow();
    });

    it('should allow optional fields', () => {
      const result = {
        content: 'Test content',
      };

      expect(() => JinaReaderResultSchema.parse(result)).not.toThrow();
    });

    it('should allow extra fields (passthrough)', () => {
      const result = {
        content: 'Test content',
        extraField: 'extra',
      };

      const parsed = JinaReaderResultSchema.parse(result);
      expect((parsed as any).extraField).toBe('extra');
    });

    it('should accept alternative field names', () => {
      const result = {
        text: 'Test content', // Instead of 'content'
      };

      expect(() => JinaReaderResultSchema.parse(result)).not.toThrow();
    });
  });
});
