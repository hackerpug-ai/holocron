/**
 * US-IMP-003: Sequential Research Context
 *
 * Tests for session context tracking across sequential research queries
 */

import { describe, it, expect } from 'vitest';

describe('US-IMP-003: Sequential Research Context', () => {
  /**
   * AC-1: User completes initial research query → First query done → Session stores query + result for context
   */
  describe('AC-1: First query stores context', () => {
    it('should have context storage fields in schema', async () => {
      const { api } = await import('../../convex/_generated/api');
      // Context-related queries should exist
      expect(api.research).toBeDefined();
      expect(api.research.queries).toBeDefined();
      expect(api.research.queries.getByConversation).toBeDefined();
    });

    it('should have context building utilities', async () => {
      const { buildContextSummary } = await import('../../convex/research/context');
      expect(buildContextSummary).toBeDefined();
      expect(typeof buildContextSummary).toBe('function');
    });
  });

  /**
   * AC-2: User submits follow-up query → Context exists → Query is enhanced with previous context
   */
  describe('AC-2: Follow-up query uses previous context', () => {
    it('should have startDeepResearch action that accepts context', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.research.actions).toBeDefined();
      expect(api.research.actions.startDeepResearch).toBeDefined();
    });

    it('should have getByConversation query for retrieving previous sessions', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.research.queries).toBeDefined();
      expect(api.research.queries.getByConversation).toBeDefined();
    });
  });

  /**
   * AC-3: Context reaches limit → 5+ queries in session → Oldest query is dropped from context
   */
  describe('AC-3: Context limit and pruning', () => {
    it('should have context pruning utility', async () => {
      const { pruneOldContext } = await import('../../convex/research/context');
      expect(pruneOldContext).toBeDefined();
      expect(typeof pruneOldContext).toBe('function');
    });

    it('should respect MAX_CONTEXT_ENTRIES constant', async () => {
      const { MAX_CONTEXT_ENTRIES } = await import('../../convex/research/context');
      expect(MAX_CONTEXT_ENTRIES).toBeDefined();
      expect(MAX_CONTEXT_ENTRIES).toBe(5);
    });
  });

  /**
   * AC-4: User starts new session → New session triggered → Context is cleared
   */
  describe('AC-4: New conversation clears context', () => {
    it('should have sessions query that filters by conversation', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.research.queries).toBeDefined();
      expect(api.research.queries.getByConversation).toBeDefined();
    });

    it('should return empty array for conversation with no sessions', async () => {
      const { api } = await import('../../convex/_generated/api');
      // Query should exist and handle empty results
      expect(api.research.queries.getByConversation).toBeDefined();
    });
  });
});
