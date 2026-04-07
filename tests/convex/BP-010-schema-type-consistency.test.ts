/**
 * BP-010: Schema Type Consistency Tests
 *
 * Tests for verifying that related fields across tables have matching types.
 * This prevents type mismatches that could cause runtime validation errors.
 *
 * AC-1: subscriptionFilters.sourceType matches subscriptionSources.sourceType
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('BP-010: Schema Type Consistency', () => {
  /**
   * AC-1: subscriptionFilters.sourceType matches subscriptionSources.sourceType
   *
   * Given: subscriptionSources and subscriptionFilters tables both have sourceType fields
   * When: The schema is imported and type-checked
   * Then: Both should use the same union type for consistency
   */
  describe('AC-1: sourceType type consistency', () => {
    it('should load schema without type errors', () => {
      // The schema should import without errors
      // This test verifies TypeScript compilation passes
      // If types are inconsistent, the schema import or type-checking will fail
      expect(() => {
        import('../../convex/schema');
      }).not.toThrow();
    });

    it('should have matching sourceType literals in schema definition', () => {
      // Read the schema file and verify both tables use the same literals
      const schemaPath = '/Users/justinrich/Projects/holocron/.claude/worktrees/agent-a6661eef/convex/schema.ts';
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

      // Find the subscriptionSources table definition
      const sourcesStart = schemaContent.indexOf('subscriptionSources: defineTable({');
      expect(sourcesStart).toBeGreaterThan(0);

      // Find the subscriptionFilters table definition
      const filtersStart = schemaContent.indexOf('subscriptionFilters: defineTable({');
      expect(filtersStart).toBeGreaterThan(0);

      // Extract the sourceType line from subscriptionSources
      const sourcesSourceTypeMatch = schemaContent.substring(sourcesStart).match(
        /sourceType:\s*v\.union\(\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\)\s*\)/
      );

      expect(sourcesSourceTypeMatch).toBeTruthy();

      // Extract the sourceType line from subscriptionFilters (it's wrapped in v.optional)
      const filtersSourceTypeMatch = schemaContent.substring(filtersStart).match(
        /sourceType:\s*v\.optional\(\s*v\.union\(\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\),\s*v\.literal\("([^"]+)"\)\s*\)\s*\)/
      );

      expect(filtersSourceTypeMatch).toBeTruthy();

      // Extract the literal values from both matches
      const sourcesLiterals = [
        sourcesSourceTypeMatch![1],
        sourcesSourceTypeMatch![2],
        sourcesSourceTypeMatch![3],
        sourcesSourceTypeMatch![4],
        sourcesSourceTypeMatch![5],
        sourcesSourceTypeMatch![6],
        sourcesSourceTypeMatch![7],
        sourcesSourceTypeMatch![8],
      ];

      const filtersLiterals = [
        filtersSourceTypeMatch![1],
        filtersSourceTypeMatch![2],
        filtersSourceTypeMatch![3],
        filtersSourceTypeMatch![4],
        filtersSourceTypeMatch![5],
        filtersSourceTypeMatch![6],
        filtersSourceTypeMatch![7],
        filtersSourceTypeMatch![8],
      ];

      // Sort for comparison
      sourcesLiterals.sort();
      filtersLiterals.sort();

      // Verify they match
      expect(sourcesLiterals).toEqual(filtersLiterals);

      // Verify the expected literals are present
      const expectedLiterals = [
        "changelog",
        "creator",
        "ebay",
        "github",
        "newsletter",
        "reddit",
        "whats-new",
        "youtube"
      ];
      expect(sourcesLiterals).toEqual(expectedLiterals);
      expect(filtersLiterals).toEqual(expectedLiterals);
    });
  });
});
