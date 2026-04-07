/**
 * BP-006: Delete Read-After-Write `ctx.db.get()` Calls
 *
 * AC-1: No ctx.db.get after ctx.db.patch
 *
 * Read-after-write is redundant because Convex mutations are atomic.
 * If ctx.db.patch doesn't throw, the write succeeded.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MUTATIONS_FILE = path.join(__dirname, '../../convex/research/mutations.ts');

describe('BP-006: Delete Read-After-Write Calls', () => {
  /**
   * AC-1: No ctx.db.get after ctx.db.patch
   * GIVEN: The research mutations module
   * WHEN: Checking for read-after-write patterns
   * THEN: Should not have ctx.db.get after ctx.db.patch
   */
  describe('AC-1: No ctx.db.get after ctx.db.patch', () => {
    it('should not have ctx.db.get immediately after ctx.db.patch', async () => {
      const mutationsContent = fs.readFileSync(MUTATIONS_FILE, 'utf-8');

      // Look for the specific anti-pattern in updateDeepResearchSession
      // Lines 159-162: patch then get with "Verify" comment
      const hasReadAfterWrite = mutationsContent.includes('await ctx.db.patch(sessionId, updates)') &&
                                mutationsContent.includes('// Verify the update by reading back') &&
                                mutationsContent.includes('const updatedSession = await ctx.db.get(sessionId)');

      // Currently this pattern EXISTS (test should fail before fix)
      expect(hasReadAfterWrite).toBe(false);
    });

    it('should not have redundant verification reads after patch', async () => {
      const mutationsContent = fs.readFileSync(MUTATIONS_FILE, 'utf-8');

      // Look for specific anti-pattern: patch then "Verify" comment then get
      const antiPattern = /ctx\.db\.patch\([^)]+\);\s*(\/\/\s*Verify|\/\/\s*Read)?\s*ctx\.db\.get\(/s;

      const hasAntiPattern = antiPattern.test(mutationsContent);

      // Should NOT have this anti-pattern
      expect(hasAntiPattern).toBe(false);
    });
  });
});
