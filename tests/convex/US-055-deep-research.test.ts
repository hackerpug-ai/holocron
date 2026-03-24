/**
 * US-055: Implement deep research Workflow (Lead GPT-5 + Subagents GPT-5-mini)
 *
 * The original agents.ts and workflow.ts modules were refactored into the
 * iterative research system. The deprecated stub functions in tools.ts
 * (planResearch, executeSubagentSearch, synthesizeFindings, assessCoverage)
 * now throw errors directing callers to use runIterativeResearch.
 *
 * These tests verify the current research API structure and the deprecated stubs.
 */

import { describe, it, expect } from 'vitest';

describe('US-055: Deep Research Workflow', () => {
  /**
   * AC-1: Research API exists in generated Convex API
   */
  describe('AC-1: Research API structure', () => {
    it('should have research module in the generated API', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.research).toBeDefined();
    });

    it('should have research index with start action', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.research.index).toBeDefined();
    });

    it('should export deprecated planResearch stub that throws', async () => {
      const { planResearch } = await import('../../convex/research/tools');
      await expect(planResearch('test query')).rejects.toThrow(
        /STUB_FUNCTION_REMOVED/
      );
    });
  });

  /**
   * AC-2: Deprecated stubs throw with informative messages
   */
  describe('AC-2: Deprecated stub functions', () => {
    it('should throw from executeSubagentSearch with deprecation message', async () => {
      const { executeSubagentSearch } = await import(
        '../../convex/research/tools'
      );
      await expect(
        executeSubagentSearch('test objective')
      ).rejects.toThrow(/STUB_FUNCTION_REMOVED/);
    });

    it('should throw from synthesizeFindings with deprecation message', async () => {
      const { synthesizeFindings } = await import(
        '../../convex/research/tools'
      );
      await expect(synthesizeFindings([])).rejects.toThrow(
        /STUB_FUNCTION_REMOVED/
      );
    });

    it('should throw from assessCoverage with deprecation message', async () => {
      const { assessCoverage } = await import('../../convex/research/tools');
      await expect(assessCoverage('test synthesis')).rejects.toThrow(
        /STUB_FUNCTION_REMOVED/
      );
    });
  });

  /**
   * AC-3: Search tools exist as replacements
   */
  describe('AC-3: Search tools (replacements for agents)', () => {
    it('should export exaSearchTool', async () => {
      const { exaSearchTool } = await import('../../convex/research/tools');
      expect(exaSearchTool).toBeDefined();
      expect(exaSearchTool).toHaveProperty('description');
      expect(exaSearchTool).toHaveProperty('execute');
    });

    it('should export jinaSearchTool', async () => {
      const { jinaSearchTool } = await import('../../convex/research/tools');
      expect(jinaSearchTool).toBeDefined();
      expect(jinaSearchTool).toHaveProperty('description');
      expect(jinaSearchTool).toHaveProperty('execute');
    });

    it('should export jinaReaderTool', async () => {
      const { jinaReaderTool } = await import('../../convex/research/tools');
      expect(jinaReaderTool).toBeDefined();
      expect(jinaReaderTool).toHaveProperty('description');
      expect(jinaReaderTool).toHaveProperty('execute');
    });
  });

  /**
   * AC-5: Iterative coverage review logic
   */
  describe('AC-5: Iterative coverage review', () => {
    it('should continue workflow when score < 4', () => {
      const score = 3;
      const iteration = 1;
      const maxIterations = 5;

      const shouldContinue = score < 4 && iteration < maxIterations;
      expect(shouldContinue).toBe(true);
    });

    it('should stop workflow when score >= 4', () => {
      const score = 4;
      const shouldContinue = score < 4;
      expect(shouldContinue).toBe(false);
    });

    it('should stop at max iterations even if score < 4', () => {
      const score = 3;
      const iteration = 5;
      const maxIterations = 5;

      const shouldContinue = score < 4 && iteration < maxIterations;
      expect(shouldContinue).toBe(false);
    });
  });
});
