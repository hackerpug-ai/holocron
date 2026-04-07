/**
 * BP-005: Replace Count Implementations That Load Entire Tables
 *
 * AC-1: No .collect().length for counts
 * AC-2: Uses efficient counting (index or counter)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('BP-005: Efficient Count Queries', () => {
  const queriesFilePath = path.join(__dirname, '../../convex/documents/queries.ts');
  let queriesContent: string;

  beforeAll(() => {
    queriesContent = fs.readFileSync(queriesFilePath, 'utf-8');
  });

  /**
   * AC-1: No .collect().length for counts
   * GIVEN: The documents queries module
   * WHEN: Checking for inefficient count patterns
   * THEN: Should not contain .collect().length
   */
  describe('AC-1: No .collect().length for counts', () => {
    it('should not contain .collect().length in count queries', () => {
      // Check for the inefficient pattern in actual code (not comments)
      const lines = queriesContent.split('\n');
      const codeLines = lines.filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
      const codeContent = codeLines.join('\n');
      const hasInefficientCount = /\.collect\(\)\.length/.test(codeContent);
      expect(hasInefficientCount).toBe(false);
    });

    it('should not load entire table then count in JS', () => {
      // Check for patterns like: const docs = await ctx.db.query(...).collect(); return docs.length;
      const inefficientPattern = /const\s+\w+\s*=\s*await\s+ctx\.db\.query\([^)]+\)\.collect\(\);[\s\S]*?return\s+\w+\.length/;
      expect(inefficientPattern.test(queriesContent)).toBe(false);
    });

    it('should not filter after collecting entire table', () => {
      // Check for patterns like: docs.filter(...).length
      const filterAfterCollect = /\.filter\([^)]+\)\.length/.test(queriesContent);
      expect(filterAfterCollect).toBe(false);
    });
  });

  /**
   * AC-2: Uses efficient counting (index or counter)
   * GIVEN: Count queries in the module
   * WHEN: Checking implementation
   * THEN: Should use counter documents or indexed queries
   */
  describe('AC-2: Uses efficient counting', () => {
    it('should use counter table for count query', () => {
      // Check that count queries use the counters table
      const usesCounter = /counters/.test(queriesContent);
      expect(usesCounter).toBe(true);
    });

    it('should use withIndex for filtered counts', () => {
      // Check that filtered counts use indexes
      const usesIndex = /withIndex/.test(queriesContent);
      expect(usesIndex).toBe(true);
    });

    it('should have countByCategory using efficient pattern', () => {
      // Check that countByCategory doesn't load all documents
      const countByCategoryMatch = queriesContent.match(/export const countByCategory[\s\S]*?\n}/);
      if (countByCategoryMatch) {
        const countByCategoryCode = countByCategoryMatch[0];
        // Should query counters, not documents
        expect(countByCategoryCode).toContain('documentCounters');
        // Should not load all documents
        expect(countByCategoryCode).not.toContain('query("documents").collect()');
      }
    });

    it('should have countDocumentsWithoutEmbeddings using efficient pattern', () => {
      // Check that countDocumentsWithoutEmbeddings doesn't load all documents
      const countWithoutEmbeddingsMatch = queriesContent.match(/export const countDocumentsWithoutEmbeddings[\s\S]*?\n}/);
      if (countWithoutEmbeddingsMatch) {
        const countWithoutEmbeddingsCode = countWithoutEmbeddingsMatch[0];
        // Should use filter().take() or counter, not collect()
        expect(countWithoutEmbeddingsCode).not.toMatch(/\.collect\(\).*\.filter/);
      }
    });
  });

  /**
   * Verify schema has counter table
   */
  describe('Schema Requirements', () => {
    const schemaFilePath = path.join(__dirname, '../../convex/schema.ts');
    let schemaContent: string;

    beforeAll(() => {
      schemaContent = fs.readFileSync(schemaFilePath, 'utf-8');
    });

    it('should have documentCounters table defined', () => {
      const hasCountersTable = /documentCounters.*defineTable/.test(schemaContent);
      expect(hasCountersTable).toBe(true);
    });

    it('should have index on documentCounters', () => {
      // Check for index definition on documentCounters
      const hasCountersIndex = /documentCounters[\s\S]*?\.index\(/.test(schemaContent);
      expect(hasCountersIndex).toBe(true);
    });
  });
});
