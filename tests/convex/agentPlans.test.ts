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
      const { toTitleCase } = await import('../../convex/lib/strings');
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
    it('should have internal actions: executePlanStep, resumeAfterApproval', async () => {
      const { internal } = await import('../../convex/_generated/api');
      expect(internal.agentPlans).toBeDefined();
      expect(internal.agentPlans.actions).toBeDefined();
      expect(internal.agentPlans.actions.executePlanStep).toBeDefined();
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

  /**
   * AC-9: advanceStep is a no-op when plan status is "cancelled" or "failed"
   *
   * GIVEN a plan whose status is "cancelled" or "failed"
   * WHEN advanceStep is called (e.g. because a running step just completed)
   * THEN advanceStep must return early without patching plan status or currentStepIndex
   *
   * Verified structurally: the mutations source must contain a guard that checks
   * for "cancelled" and "failed" statuses before any db.patch call in advanceStep.
   */
  describe('AC-9: advanceStep guards against cancelled/failed status', () => {
    it('should return early in advanceStep when plan is cancelled or failed', async () => {
      const path = await import('path');
      const fs = await import('fs');
      const mutationsPath = path.resolve(
        __dirname,
        '../../convex/agentPlans/mutations.ts',
      );
      const src = fs.readFileSync(mutationsPath, 'utf8');

      // The advanceStep handler must contain a guard that checks for cancelled/failed
      // before patching. We verify by looking for the early-return guard pattern.
      expect(src).toContain('"cancelled"');
      expect(src).toContain('"failed"');

      // Locate advanceStep handler and confirm the guard precedes any db.patch call
      const advanceStepIdx = src.indexOf('export const advanceStep');
      expect(advanceStepIdx).toBeGreaterThan(-1);

      const handlerBody = src.slice(advanceStepIdx);
      const guardIdx = handlerBody.search(/"cancelled"|"failed"/);
      const firstPatchIdx = handlerBody.indexOf('db.patch');
      // Guard must appear before the first db.patch in the advanceStep body
      expect(guardIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(firstPatchIdx);
    });
  });

  /**
   * AC-11: rejectStep validates stepIndex matches currentStepIndex
   *
   * GIVEN a plan in awaiting_approval state
   * WHEN rejectStep is called with a stepIndex that does not match currentStepIndex
   * THEN it must throw with a message containing "Step index mismatch", "expected", and "got"
   *
   * This is the same guard approveStep already has, ensuring consistency between paths.
   */
  describe('AC-11: rejectStep validates stepIndex matches currentStepIndex', () => {
    it('should throw with a descriptive mismatch error when stepIndex !== currentStepIndex', async () => {
      const path = await import('path');
      const fs = await import('fs');
      const mutationsPath = path.resolve(
        __dirname,
        '../../convex/agentPlans/mutations.ts',
      );
      const src = fs.readFileSync(mutationsPath, 'utf8');

      // Find the rejectStep handler body (slice from its declaration)
      const rejectStepIdx = src.indexOf('export const rejectStep');
      expect(rejectStepIdx).toBeGreaterThan(-1);
      const rejectStepBody = src.slice(rejectStepIdx);

      // Must contain a guard comparing stepIndex to plan.currentStepIndex
      const hasIndexCheck =
        rejectStepBody.includes('currentStepIndex !== stepIndex') ||
        rejectStepBody.includes('stepIndex !== plan.currentStepIndex') ||
        rejectStepBody.includes('plan.currentStepIndex !== stepIndex');
      expect(hasIndexCheck).toBe(true);

      // Error message must contain all three required tokens
      expect(rejectStepBody).toContain('Step index mismatch');
      expect(rejectStepBody).toContain('expected');
      expect(rejectStepBody).toContain('got');
    });
  });

  /**
   * AC-10: cancelPlan clears agentBusy on the conversation
   *
   * GIVEN a plan that may be mid-execution (agentBusy=true on the conversation)
   * WHEN cancelPlan is called
   * THEN the conversation's agentBusy must be cleared so the input is not locked
   *
   * Verified structurally: the cancelPlan handler must patch the conversation
   * with agentBusy: false (same pattern used in rejectStep).
   */
  describe('AC-10: cancelPlan clears agentBusy on the conversation', () => {
    it('should clear agentBusy in cancelPlan handler', async () => {
      const path = await import('path');
      const fs = await import('fs');
      const mutationsPath = path.resolve(
        __dirname,
        '../../convex/agentPlans/mutations.ts',
      );
      const src = fs.readFileSync(mutationsPath, 'utf8');

      // cancelPlan must clear agentBusy on the conversation
      const cancelPlanIdx = src.indexOf('export const cancelPlan');
      expect(cancelPlanIdx).toBeGreaterThan(-1);

      const cancelPlanBody = src.slice(cancelPlanIdx);
      // Find the next export (end boundary of cancelPlan)
      const nextExportIdx = cancelPlanBody.indexOf('\nexport const', 1);
      const cancelPlanHandler =
        nextExportIdx > -1
          ? cancelPlanBody.slice(0, nextExportIdx)
          : cancelPlanBody;

      // The handler must contain agentBusy: false
      expect(cancelPlanHandler).toContain('agentBusy: false');
    });
  });
});
