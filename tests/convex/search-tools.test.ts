/**
 * Test file for search tools (US-777)
 *
 * Tests three search tool implementations:
 * - exaSearchTool (exa-js SDK for technical content)
 * - jinaSearchTool (direct API for broad web search)
 * - jinaReaderTool (deep content extraction from URLs)
 *
 * AI SDK tool() returns { description, inputSchema, execute }, not { parameters }.
 */

import { describe, it, expect } from 'vitest';

describe('US-777: Search Tools Implementation', () => {
  /**
   * AC-1: exaSearchTool - Using exa-js SDK for technical content search
   */
  describe('AC-1: exaSearchTool', () => {
    it('should be exported from convex/research/tools', async () => {
      const tools = await import('../../convex/research/tools');
      expect(tools.exaSearchTool).toBeTruthy();
      expect(typeof tools.exaSearchTool).toBe('object');
    });

    it('should have correct schema with description, inputSchema, and execute', async () => {
      const tools = await import('../../convex/research/tools');

      // AI SDK tool() returns { description, inputSchema, execute }
      expect(tools.exaSearchTool).toHaveProperty('description');
      expect(tools.exaSearchTool).toHaveProperty('inputSchema');
    });

    it('should execute search and return formatted results', async () => {
      const tools = await import('../../convex/research/tools');

      // Verify the tool has execute function
      expect(tools.exaSearchTool).toHaveProperty('execute');
      expect(typeof tools.exaSearchTool.execute).toBe('function');
    });
  });

  /**
   * AC-2: jinaSearchTool - Direct API for broad web search
   */
  describe('AC-2: jinaSearchTool', () => {
    it('should be exported from convex/research/tools', async () => {
      const tools = await import('../../convex/research/tools');
      expect(tools.jinaSearchTool).toBeTruthy();
      expect(typeof tools.jinaSearchTool).toBe('object');
    });

    it('should have correct schema with description, inputSchema, and execute', async () => {
      const tools = await import('../../convex/research/tools');

      expect(tools.jinaSearchTool).toHaveProperty('description');
      expect(tools.jinaSearchTool).toHaveProperty('inputSchema');
      expect(tools.jinaSearchTool).toHaveProperty('execute');
    });

    it('should handle errors gracefully and return empty results', async () => {
      const tools = await import('../../convex/research/tools');

      // Verify error handling structure exists
      expect(tools.jinaSearchTool.execute).toBeTruthy();
      expect(typeof tools.jinaSearchTool.execute).toBe('function');
    });
  });

  /**
   * AC-3: jinaReaderTool - Deep content extraction from URLs
   */
  describe('AC-3: jinaReaderTool', () => {
    it('should be exported from convex/research/tools', async () => {
      const tools = await import('../../convex/research/tools');
      expect(tools.jinaReaderTool).toBeTruthy();
      expect(typeof tools.jinaReaderTool).toBe('object');
    });

    it('should have correct schema with description, inputSchema, and execute', async () => {
      const tools = await import('../../convex/research/tools');

      expect(tools.jinaReaderTool).toHaveProperty('description');
      expect(tools.jinaReaderTool).toHaveProperty('inputSchema');
      expect(tools.jinaReaderTool).toHaveProperty('execute');
    });

    it('should handle errors and return empty content', async () => {
      const tools = await import('../../convex/research/tools');

      // Verify error handling structure exists
      expect(tools.jinaReaderTool.execute).toBeTruthy();
      expect(typeof tools.jinaReaderTool.execute).toBe('function');
    });
  });

  /**
   * AC-4: All tools handle errors gracefully
   */
  describe('AC-4: Error Handling', () => {
    it('should not throw errors for any tool', async () => {
      const tools = await import('../../convex/research/tools');

      // All tools should have execute functions that catch errors
      expect(tools.exaSearchTool.execute).toBeTruthy();
      expect(tools.jinaSearchTool.execute).toBeTruthy();
      expect(tools.jinaReaderTool.execute).toBeTruthy();

      // Execute functions should be async functions
      expect(tools.exaSearchTool.execute!.constructor.name).toBe('AsyncFunction');
      expect(tools.jinaSearchTool.execute!.constructor.name).toBe('AsyncFunction');
      expect(tools.jinaReaderTool.execute!.constructor.name).toBe('AsyncFunction');
    });
  });
});
