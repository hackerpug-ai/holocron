/**
 * US-761: Create Convex queries (get, list, count)
 *
 * Test file for standard CRUD query operations
 */

import { describe, it, expect } from 'vitest';

describe('US-761: Standard Queries', () => {
  /**
   * AC-1: researchIterations.get - Get single research iteration by ID
   */
  describe('AC-1: researchIterations.get', () => {
    it('should export get query', async () => {
      // Given: researchIterations table exists
      // When: Importing the API
      const { api } = await import('../../convex/_generated/api');

      // Then: get query should be defined
      expect(api.researchIterations.get).toBeDefined();
    });
  });

  /**
   * AC-2: deepResearchIterations.get - Get single deep research iteration by ID
   */
  describe('AC-2: deepResearchIterations.get', () => {
    it('should export get query', async () => {
      // Given: deepResearchIterations table exists
      // When: Importing the API
      const { api } = await import('../../convex/_generated/api');

      // Then: get query should be defined
      expect(api.deepResearchIterations.get).toBeDefined();
    });
  });

  /**
   * AC-3: citations.get - Get single citation by ID
   */
  describe('AC-3: citations.get', () => {
    it('should export get query', async () => {
      // Given: citations table exists
      // When: Importing the API
      const { api } = await import('../../convex/_generated/api');

      // Then: get query should be defined
      expect(api.citations.get).toBeDefined();
    });
  });

  /**
   * Verify existing queries still exist
   */
  describe('Existing queries preserved', () => {
    it('should preserve researchIterations count and list', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.researchIterations.count).toBeDefined();
      expect(api.researchIterations.list).toBeDefined();
    });

    it('should preserve deepResearchIterations count and list', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.deepResearchIterations.count).toBeDefined();
      expect(api.deepResearchIterations.list).toBeDefined();
    });

    it('should preserve citations count and list', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.citations.count).toBeDefined();
      expect(api.citations.list).toBeDefined();
    });
  });
});
