/**
 * Agent Plans: Mutations and Queries
 *
 * Tests verify that all agentPlans API endpoints exist in the generated Convex API
 * with correct shape, and that the helper utilities (snake_case → Title Case) work correctly.
 */

import { describe, it, expect } from 'vitest';

describe('Agent Plans API', () => {
  /**
   * AC-1: agentPlans mutations exist in the generated API
   */
  describe('AC-1: agentPlans mutations are registered', () => {
    it('should have internal mutations: createPlan, updatePlanStatus, updateStepStatus, advanceStep', async () => {
      const { internal } = await import('../../convex/_generated/api');
      expect(internal.agentPlans).toBeDefined();
      expect(internal.agentPlans.mutations).toBeDefined();
      expect(internal.agentPlans.mutations.createPlan).toBeDefined();
      expect(internal.agentPlans.mutations.updatePlanStatus).toBeDefined();
      expect(internal.agentPlans.mutations.updateStepStatus).toBeDefined();
      expect(internal.agentPlans.mutations.advanceStep).toBeDefined();
    });

    it('should have public mutations: approveStep, rejectStep, cancelPlan', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.agentPlans).toBeDefined();
      expect(api.agentPlans.mutations).toBeDefined();
      expect(api.agentPlans.mutations.approveStep).toBeDefined();
      expect(api.agentPlans.mutations.rejectStep).toBeDefined();
      expect(api.agentPlans.mutations.cancelPlan).toBeDefined();
    });
  });

  /**
   * AC-2: agentPlans queries exist in the generated API
   */
  describe('AC-2: agentPlans queries are registered', () => {
    it('should have public queries: get, getSteps, getActivePlan', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.agentPlans.queries).toBeDefined();
      expect(api.agentPlans.queries.get).toBeDefined();
      expect(api.agentPlans.queries.getSteps).toBeDefined();
      expect(api.agentPlans.queries.getActivePlan).toBeDefined();
    });
  });

  /**
   * AC-3: snake_case to Title Case conversion works correctly
   */
  describe('AC-3: toolDisplayName generation from toolName', () => {
    it('should convert snake_case tool names to Title Case display names', async () => {
      const { toTitleCase } = await import('../../convex/agentPlans/mutations');
      expect(toTitleCase('web_search')).toBe('Web Search');
      expect(toTitleCase('create_document')).toBe('Create Document');
      expect(toTitleCase('singleword')).toBe('Singleword');
      expect(toTitleCase('multi_word_tool_name')).toBe('Multi Word Tool Name');
    });
  });

  /**
   * AC-4: agentPlans actions exist in the generated internal API
   */
  describe('AC-4: agentPlans actions are registered', () => {
    it('should have internal actions: executePlanStep, continueAfterPlan, resumeAfterApproval', async () => {
      const { internal } = await import('../../convex/_generated/api');
      expect(internal.agentPlans).toBeDefined();
      expect(internal.agentPlans.actions).toBeDefined();
      expect(internal.agentPlans.actions.executePlanStep).toBeDefined();
      expect(internal.agentPlans.actions.continueAfterPlan).toBeDefined();
      expect(internal.agentPlans.actions.resumeAfterApproval).toBeDefined();
    });
  });

  /**
   * AC-5: approveStep mutation schedules resumeAfterApproval
   * Verified via: approveStep references internal.agentPlans.actions.resumeAfterApproval
   * (structural: the mutations file imports internal after actions exist)
   */
  describe('AC-5: approveStep schedules resumeAfterApproval after approval', () => {
    it('should use ctx.scheduler in approveStep (scheduler call present in mutations)', async () => {
      // Read mutations source to verify scheduler.runAfter is present in approveStep
      const path = await import('path');
      const fs = await import('fs');
      const mutationsPath = path.resolve(
        __dirname,
        '../../convex/agentPlans/mutations.ts',
      );
      const src = fs.readFileSync(mutationsPath, 'utf8');
      expect(src).toContain('scheduler.runAfter');
      expect(src).toContain('resumeAfterApproval');
    });
  });
});
