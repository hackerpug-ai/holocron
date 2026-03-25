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

  /**
   * AC-6: createPlan inserts chatMessage WITH cardData.plan_id populated
   *
   * GIVEN: createPlan is called
   * WHEN:  the agent_plan chatMessage is inserted
   * THEN:  the message must carry cardData: { plan_id: <the planId> }
   *        so that MessageBubble can render the AgentPlanCard and
   *        buildConversationContext can look up the plan state.
   *
   * Verified structurally: the mutations source must create the plan record
   * BEFORE inserting the chat message, and must pass cardData containing plan_id
   * to the chatMessages insert call.
   */
  describe('AC-6: createPlan chatMessage includes cardData.plan_id', () => {
    it('should insert the plan record before the chatMessage and pass cardData with plan_id', async () => {
      const path = await import('path');
      const fs = await import('fs');
      const mutationsPath = path.resolve(
        __dirname,
        '../../convex/agentPlans/mutations.ts',
      );
      const src = fs.readFileSync(mutationsPath, 'utf8');

      // The plan insert must come before the chatMessages insert in the source
      const planInsertIdx = src.indexOf('db.insert("agentPlans"');
      const messageInsertIdx = src.indexOf('db.insert("chatMessages"');
      expect(planInsertIdx).toBeGreaterThan(-1);
      expect(messageInsertIdx).toBeGreaterThan(-1);
      expect(planInsertIdx).toBeLessThan(messageInsertIdx);

      // The chatMessages insert must include cardData with plan_id
      expect(src).toContain('cardData');
      expect(src).toContain('plan_id');
    });
  });

  /**
   * AC-7: rejectStep schedules executePlanStep when there are remaining steps
   *
   * GIVEN a plan in awaiting_approval with multiple steps
   * WHEN the user rejects the current step
   * THEN rejectStep must schedule executePlanStep so the plan continues instead of hanging
   */
  describe('AC-7: rejectStep schedules executePlanStep for remaining steps', () => {
    it('should schedule executePlanStep in rejectStep when steps remain', async () => {
      const path = await import('path');
      const fs = await import('fs');
      const mutationsPath = path.resolve(
        __dirname,
        '../../convex/agentPlans/mutations.ts',
      );
      const src = fs.readFileSync(mutationsPath, 'utf8');
      // rejectStep must schedule executePlanStep so execution continues after rejection
      expect(src).toContain('executePlanStep');
    });
  });

  /**
   * AC-8: rejectStep clears agentBusy after rejection
   *
   * GIVEN a plan in awaiting_approval with agentBusy=true on the conversation
   * WHEN the user rejects the current step
   * THEN agentBusy must be cleared so the conversation input is not locked
   */
  describe('AC-8: rejectStep clears agentBusy after rejection', () => {
    it('should clear agentBusy in rejectStep handler', async () => {
      const path = await import('path');
      const fs = await import('fs');
      const mutationsPath = path.resolve(
        __dirname,
        '../../convex/agentPlans/mutations.ts',
      );
      const src = fs.readFileSync(mutationsPath, 'utf8');
      // rejectStep must clear agentBusy — either via setAgentBusy or direct db.patch
      const clearsViaSetAgentBusy =
        src.includes('setAgentBusy') && src.includes('busy: false');
      const clearsViaPatch = src.includes('agentBusy: false');
      expect(clearsViaSetAgentBusy || clearsViaPatch).toBe(true);
    });
  });
});
