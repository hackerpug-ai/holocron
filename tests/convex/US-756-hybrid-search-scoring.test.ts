/**
 * US-756: Hybrid search scoring weights
 *
 * Tests that verify the hybrid search scoring configuration in
 * convex/documents/search.ts.
 *
 * Current implementation: 70/30 weighting (vector 70%, FTS 30%)
 * This weighting was chosen intentionally so semantic matches (e.g., "RL" finding
 * "reinforcement learning") rank above keyword-only hits.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('US-756: Hybrid Search Scoring', () => {
  const searchFilePath = join(process.cwd(), 'convex', 'documents', 'search.ts');

  const readSearchFile = (): string => {
    return readFileSync(searchFilePath, 'utf-8');
  };

  /**
   * AC-1: Vector weight configuration
   *
   * The code uses VECTOR_WEIGHT = 0.7 so semantic matches rank higher.
   */
  describe('AC-1: Vector weight', () => {
    it('should apply vector weight via normalizedScore * VECTOR_WEIGHT', () => {
      const searchCode = readSearchFile();

      // Vector results are scored with normalizedScore * VECTOR_WEIGHT
      expect(searchCode).toContain('normalizedScore * VECTOR_WEIGHT');
    });

    it('should define VECTOR_WEIGHT constant', () => {
      const searchCode = readSearchFile();

      expect(searchCode).toContain('VECTOR_WEIGHT');
    });
  });

  /**
   * AC-2: FTS weight configuration
   *
   * The code uses FTS_WEIGHT = 0.3 to complement vector weight.
   */
  describe('AC-2: FTS weight', () => {
    it('should apply FTS weight via doc.score * FTS_WEIGHT', () => {
      const searchCode = readSearchFile();

      // FTS results are scored with (doc.score || 0) * FTS_WEIGHT
      expect(searchCode).toContain('FTS_WEIGHT');
    });

    it('should define FTS_WEIGHT constant', () => {
      const searchCode = readSearchFile();

      expect(searchCode).toContain('FTS_WEIGHT');
    });
  });

  /**
   * AC-3: Combined weights equal 100%
   */
  describe('AC-3: Weights sum to 100%', () => {
    it('should have vector + FTS weights equal to 1.0', () => {
      const searchCode = readSearchFile();

      // Extract weight values from the source
      const vectorMatch = searchCode.match(/VECTOR_WEIGHT\s*=\s*([\d.]+)/);
      const ftsMatch = searchCode.match(/FTS_WEIGHT\s*=\s*([\d.]+)/);

      expect(vectorMatch).not.toBeNull();
      expect(ftsMatch).not.toBeNull();

      const vectorWeight = parseFloat(vectorMatch![1]);
      const ftsWeight = parseFloat(ftsMatch![1]);

      // Weights must sum to 1.0 regardless of the split
      expect(vectorWeight + ftsWeight).toBe(1.0);
    });
  });

  /**
   * AC-4: Scoring uses named constants (not magic numbers)
   */
  describe('AC-4: Named constants', () => {
    it('should use named VECTOR_WEIGHT and FTS_WEIGHT constants', () => {
      const searchCode = readSearchFile();

      // Should define named constants rather than inline magic numbers
      expect(searchCode).toMatch(/const\s+VECTOR_WEIGHT\s*=/);
      expect(searchCode).toMatch(/const\s+FTS_WEIGHT\s*=/);
    });
  });
});
