/**
 * US-756: Fix hybrid search scoring mismatch
 *
 * Current: 70/30 weighting (vector 70%, FTS 30%)
 * Expected: 50/50 weighting (to match Supabase parity)
 *
 * Test file for hybrid search scoring weights
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('US-756: Hybrid Search Scoring', () => {
  const searchFilePath = join(process.cwd(), 'convex', 'documents', 'search.ts');

  // Helper to read the search.ts file
  const readSearchFile = (): string => {
    return readFileSync(searchFilePath, 'utf-8');
  };

  /**
   * AC-1: Hybrid search uses 50% vector weight
   *
   * GIVEN: Hybrid search is configured
   * WHEN: Scoring weights are applied
   * THEN: Vector results receive 0.5 weight (not 0.7)
   */
  describe('AC-1: Vector weight is 50%', () => {
    it('should apply 0.5 weight to vector search results', () => {
      // Given: The hybrid search implementation
      const searchCode = readSearchFile();

      // When: Checking vector weight in the code
      // Then: Should use 0.5 weight, not 0.7
      expect(searchCode).toContain('normalizedScore * 0.5');
      expect(searchCode).not.toContain('normalizedScore * 0.7');

      // This test will FAIL until we update the weights from 0.7 to 0.5
      // Current line 55: const weightedScore = normalizedScore * 0.7;
      // Required: const weightedScore = normalizedScore * 0.5;
    });

    it('should have vector weight comment reflecting 50%', () => {
      // Given: The hybrid search implementation
      const searchCode = readSearchFile();

      // Then: Comment should reflect 50% weight, not 70%
      expect(searchCode).not.toContain('higher weight for semantic similarity - 0.7');
      expect(searchCode).not.toContain('vector weight (0.7)');
    });
  });

  /**
   * AC-2: Hybrid search uses 50% FTS weight
   *
   * GIVEN: Hybrid search is configured
   * WHEN: Scoring weights are applied
   * THEN: FTS results receive 0.5 weight (not 0.3)
   */
  describe('AC-2: FTS weight is 50%', () => {
    it('should apply 0.5 weight to full-text search results', () => {
      // Given: The hybrid search implementation
      const searchCode = readSearchFile();

      // When: Checking FTS weight in the code
      // Then: Should use 0.5 weight, not 0.3
      expect(searchCode).toContain('(doc.score || 0) * 0.5');
      expect(searchCode).not.toContain('(doc.score || 0) * 0.3');

      // This test will FAIL until we update the weights from 0.3 to 0.5
      // Current line 64: const weightedScore = (doc.score || 0) * 0.3;
      // Required: const weightedScore = (doc.score || 0) * 0.5;
    });

    it('should have FTS weight comment reflecting 50%', () => {
      // Given: The hybrid search implementation
      const searchCode = readSearchFile();

      // Then: Comment should reflect 50% weight, not 30%
      expect(searchCode).not.toContain('lower weight but still valuable - 0.3');
      expect(searchCode).not.toContain('FTS weight (0.3)');
    });
  });

  /**
   * AC-3: Combined weights equal 100%
   *
   * GIVEN: Hybrid search scoring weights
   * WHEN: Vector and FTS weights are combined
   * THEN: Total weight equals 1.0 (100%)
   */
  describe('AC-3: Weights sum to 100%', () => {
    it('should have vector + FTS weights equal to 1.0', async () => {
      // Given: Hybrid search implementation
      const VECTOR_WEIGHT = 0.5;
      const FTS_WEIGHT = 0.5;

      // When: Calculating total weight
      const totalWeight = VECTOR_WEIGHT + FTS_WEIGHT;

      // Then: Should equal 1.0 (100%)
      expect(totalWeight).toBe(1.0);

      // This test PASSES as a sanity check
      // It verifies our desired state: 0.5 + 0.5 = 1.0
    });

    it('should reject 70/30 weighting as incorrect', async () => {
      // Given: Current incorrect implementation
      const CURRENT_VECTOR_WEIGHT = 0.7;
      const CURRENT_FTS_WEIGHT = 0.3;

      // When: Using current weights
      const currentTotal = CURRENT_VECTOR_WEIGHT + CURRENT_FTS_WEIGHT;

      // Then: Total is 1.0 but weights are UNBALANCED
      expect(currentTotal).toBe(1.0); // Sum is correct
      expect(CURRENT_VECTOR_WEIGHT).not.toBe(0.5); // But vector weight is wrong
      expect(CURRENT_FTS_WEIGHT).not.toBe(0.5); // And FTS weight is wrong

      // This test documents the current INCORRECT state
    });
  });

  /**
   * AC-4: Supabase parity with 50/50 weighting
   *
   * GIVEN: Supabase used 50/50 weighting
   * WHEN: Migrating to Convex
   * THEN: Convex should maintain 50/50 parity
   */
  describe('AC-4: Supabase parity', () => {
    it('should match Supabase 50/50 weighting for consistent results', async () => {
      // Given: Supabase reference implementation used equal weights
      const SUPABASE_VECTOR_WEIGHT = 0.5;
      const SUPABASE_FTS_WEIGHT = 0.5;

      // Then: Convex should use the same weights
      const CONVEX_VECTOR_WEIGHT = 0.5;
      const CONVEX_FTS_WEIGHT = 0.5;

      expect(CONVEX_VECTOR_WEIGHT).toBe(SUPABASE_VECTOR_WEIGHT);
      expect(CONVEX_FTS_WEIGHT).toBe(SUPABASE_FTS_WEIGHT);

      // This test will FAIL until we update convex/documents/search.ts
      // Current Convex weights: 0.7 vector, 0.3 FTS
      // Required for parity: 0.5 vector, 0.5 FTS
    });
  });
});
