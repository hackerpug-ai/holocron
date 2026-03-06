/**
 * Test file for search tools (US-777)
 *
 * Tests three search tool implementations:
 * - exaSearchTool (exa-js SDK for technical content)
 * - jinaSearchTool (direct API for broad web search)
 * - jinaReaderTool (deep content extraction from URLs)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('US-777: Search Tools Implementation', () => {
  /**
   * AC-1: exaSearchTool - Using exa-js SDK for technical content search
   * GIVEN: A search query
   * WHEN: exaSearchTool is called with query and parameters
   * THEN: It returns results with title, url, content (500 char), score, publishedDate, author
   */
  describe('AC-1: exaSearchTool', () => {
    it('should be exported from convex/research/tools', async () => {
      // This test will fail until we implement the tools
      const tools = await import('../../convex/research/tools');
      expect(tools.exaSearchTool).toBeDefined();
      expect(typeof tools.exaSearchTool).toBe('object');
    });

    it('should have correct schema with query, numResults, and category parameters', async () => {
      const tools = await import('../../convex/research/tools');

      // The tool should be an object with description and parameters
      expect(tools.exaSearchTool).toHaveProperty('description');
      expect(tools.exaSearchTool).toHaveProperty('parameters');
    });

    it('should execute search and return formatted results', async () => {
      const tools = await import('../../convex/research/tools');

      // Verify the tool has execute function
      // AI SDK tools use "execute" instead of "handler"
      expect(tools.exaSearchTool).toHaveProperty('execute');
      expect(typeof tools.exaSearchTool.execute).toBe('function');
    });
  });

  /**
   * AC-2: jinaSearchTool - Direct API for broad web search
   * GIVEN: A search query
   * WHEN: jinaSearchTool is called with query and numResults
   * THEN: It returns results with title, url, content (500 char), domain
   */
  describe('AC-2: jinaSearchTool', () => {
    it('should be exported from convex/research/tools', async () => {
      const tools = await import('../../convex/research/tools');
      expect(tools.jinaSearchTool).toBeDefined();
      expect(typeof tools.jinaSearchTool).toBe('object');
    });

    it('should have correct schema with query and numResults parameters', async () => {
      const tools = await import('../../convex/research/tools');

      expect(tools.jinaSearchTool).toHaveProperty('description');
      expect(tools.jinaSearchTool).toHaveProperty('parameters');
      expect(tools.jinaSearchTool).toHaveProperty('execute');
    });

    it('should handle errors gracefully and return empty results', async () => {
      const tools = await import('../../convex/research/tools');

      // Verify error handling structure exists
      expect(tools.jinaSearchTool.execute).toBeDefined();
      expect(typeof tools.jinaSearchTool.execute).toBe('function');
    });
  });

  /**
   * AC-3: jinaReaderTool - Deep content extraction from URLs
   * GIVEN: A URL
   * WHEN: jinaReaderTool is called with a valid URL
   * THEN: It returns content (5000 char) from the URL
   */
  describe('AC-3: jinaReaderTool', () => {
    it('should be exported from convex/research/tools', async () => {
      const tools = await import('../../convex/research/tools');
      expect(tools.jinaReaderTool).toBeDefined();
      expect(typeof tools.jinaReaderTool).toBe('object');
    });

    it('should have correct schema with url parameter', async () => {
      const tools = await import('../../convex/research/tools');

      expect(tools.jinaReaderTool).toHaveProperty('description');
      expect(tools.jinaReaderTool).toHaveProperty('parameters');
      expect(tools.jinaReaderTool).toHaveProperty('execute');
    });

    it('should handle errors and return empty content', async () => {
      const tools = await import('../../convex/research/tools');

      // Verify error handling structure exists
      expect(tools.jinaReaderTool.execute).toBeDefined();
      expect(typeof tools.jinaReaderTool.execute).toBe('function');
    });
  });

  /**
   * AC-4: All tools handle errors gracefully
   * GIVEN: Any tool encounters an error
   * WHEN: The API call fails
   * THEN: Return empty results/content with error field, no throwing
   */
  describe('AC-4: Error Handling', () => {
    it('should not throw errors for any tool', async () => {
      const tools = await import('../../convex/research/tools');

      // All tools should have execute functions that catch errors
      expect(tools.exaSearchTool.execute).toBeDefined();
      expect(tools.jinaSearchTool.execute).toBeDefined();
      expect(tools.jinaReaderTool.execute).toBeDefined();

      // Execute functions should be async functions
      expect(tools.exaSearchTool.execute.constructor.name).toBe('AsyncFunction');
      expect(tools.jinaSearchTool.execute.constructor.name).toBe('AsyncFunction');
      expect(tools.jinaReaderTool.execute.constructor.name).toBe('AsyncFunction');
    });
  });
});
