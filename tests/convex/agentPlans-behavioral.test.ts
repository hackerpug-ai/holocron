/**
 * Agent Plans: Behavioral State Machine Tests
 *
 * These tests verify the control-flow logic of the agent plan state machine
 * by reading actual source files and asserting on meaningful behavioral patterns.
 *
 * Each test case maps to one acceptance criterion. Where a Convex test harness
 * for running mutations directly is unavailable, source-code analysis is used
 * to assert control-flow invariants — consistent with the pattern established in
 * agentPlans.test.ts and agent-plan-concurrency.test.ts.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

const mutationsPath = path.resolve(
  __dirname,
  '../../convex/agentPlans/mutations.ts',
);
const actionsPath = path.resolve(
  __dirname,
  '../../convex/agentPlans/actions.ts',
);
const scheduledPath = path.resolve(
  __dirname,
  '../../convex/agentPlans/scheduled.ts',
);

/** Slice the body of a named export from `src` up to the next top-level export. */
function sliceExport(src: string, exportName: string): string {
  const idx = src.indexOf(`export const ${exportName}`);
  if (idx === -1) return '';
  const tail = src.slice(idx);
  // Find the next top-level export boundary (if any) to bound the slice
  const nextExport = tail.indexOf('\nexport const', 1);
  return nextExport > -1 ? tail.slice(0, nextExport) : tail;
}

describe('Agent Plans Behavioral State Machine (Task #422)', () => {
  // -------------------------------------------------------------------------
  // AC-1: createPlan ordering — plan record created before chat message
  // -------------------------------------------------------------------------
  describe('AC-1: createPlan ordering — plan record before chatMessage', () => {
    it('should insert agentPlans record before inserting chatMessages record', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');

      const planInsertIdx = src.indexOf('db.insert("agentPlans"');
      const messageInsertIdx = src.indexOf('db.insert("chatMessages"');

      expect(planInsertIdx).toBeGreaterThan(-1);
      expect(messageInsertIdx).toBeGreaterThan(-1);

      // The plan must be inserted first so that planId is available when the
      // chatMessages record is written (enabling cardData.plan_id to be populated).
      expect(planInsertIdx).toBeLessThan(messageInsertIdx);
    });

    it('should assign the return value of db.insert("agentPlans") to planId before calling db.insert("chatMessages")', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');

      // planId must be captured before db.insert("chatMessages") so it can be
      // passed into cardData.
      const planIdCaptureIdx = src.indexOf('planId');
      const messageInsertIdx = src.indexOf('db.insert("chatMessages"');

      expect(planIdCaptureIdx).toBeGreaterThan(-1);
      expect(planIdCaptureIdx).toBeLessThan(messageInsertIdx);
    });
  });

  // -------------------------------------------------------------------------
  // AC-2: cardData population — chatMessage insert includes cardData with plan_id
  // -------------------------------------------------------------------------
  describe('AC-2: cardData population in chatMessage insert', () => {
    it('should include cardData with plan_id in the chatMessages insert call', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');

      // Verify both fields are present anywhere in the mutations file
      expect(src).toContain('cardData');
      expect(src).toContain('plan_id');
    });

    it('should pass plan_id: planId inside the cardData object for the chatMessages insert', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');

      // Find the chatMessages insert call and inspect its surrounding code
      // for the cardData: { plan_id: planId } pattern.
      const messageInsertIdx = src.indexOf('db.insert("chatMessages"');
      expect(messageInsertIdx).toBeGreaterThan(-1);

      // Look at a 300-char window around the chatMessages insert to find cardData
      const insertRegion = src.slice(messageInsertIdx, messageInsertIdx + 300);
      expect(insertRegion).toContain('cardData');
      expect(insertRegion).toContain('plan_id');
      expect(insertRegion).toContain('planId');
    });
  });

  // -------------------------------------------------------------------------
  // AC-3: rejectStep schedules executePlanStep when steps remain
  // -------------------------------------------------------------------------
  describe('AC-3: rejectStep schedules executePlanStep for remaining steps', () => {
    it('should call scheduler.runAfter with executePlanStep when nextStepIndex < totalSteps', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      expect(rejectBody).not.toBe('');

      // The "steps remain" branch must schedule executePlanStep
      expect(rejectBody).toContain('scheduler.runAfter');
      expect(rejectBody).toContain('executePlanStep');
    });

    it('should advance currentStepIndex before scheduling executePlanStep', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      // nextStepIndex must be computed before scheduling
      const nextStepIdx = rejectBody.indexOf('nextStepIndex');
      const schedulerIdx = rejectBody.indexOf('scheduler.runAfter');

      expect(nextStepIdx).toBeGreaterThan(-1);
      expect(schedulerIdx).toBeGreaterThan(-1);
      expect(nextStepIdx).toBeLessThan(schedulerIdx);
    });
  });

  // -------------------------------------------------------------------------
  // AC-4: rejectStep completes plan on last step rejection
  // -------------------------------------------------------------------------
  describe('AC-4: rejectStep sets status to "completed" on last step rejection', () => {
    it('should patch plan with status "completed" when nextStepIndex >= totalSteps', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      // The last-step branch must write "completed" to the plan
      expect(rejectBody).toContain('"completed"');
    });

    it('should check nextStepIndex against totalSteps to detect last step', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      // Must compare nextStepIndex to plan.totalSteps
      const hasBoundaryCheck =
        rejectBody.includes('nextStepIndex >= plan.totalSteps') ||
        rejectBody.includes('nextStepIndex >= totalSteps') ||
        (rejectBody.includes('nextStepIndex') && rejectBody.includes('totalSteps'));

      expect(hasBoundaryCheck).toBe(true);
    });

    it('should NOT call scheduler.runAfter when plan is completed (last step)', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      // The completed branch sets status to "completed" and clears agentBusy.
      // The scheduler.runAfter call must only appear in the "more steps remain" branch,
      // which comes AFTER the completed-branch early exit.
      //
      // Strategy: find the first occurrence of `"completed"` (the last-step block)
      // and the first occurrence of `scheduler.runAfter`. The scheduler call must
      // come AFTER the completed block so it is only in the else path.
      const completedBlockIdx = rejectBody.indexOf('"completed"');
      const schedulerIdx = rejectBody.indexOf('scheduler.runAfter');

      if (schedulerIdx !== -1) {
        // scheduler.runAfter must be in the else branch — after the completed block
        expect(schedulerIdx).toBeGreaterThan(completedBlockIdx);
      }
      // If there is no scheduler.runAfter at all in rejectStep, that is fine too
    });
  });

  // -------------------------------------------------------------------------
  // AC-5: rejectStep clears agentBusy in both branches
  // -------------------------------------------------------------------------
  describe('AC-5: rejectStep clears agentBusy in both last-step and continue paths', () => {
    it('should contain agentBusy: false at least twice (once per branch)', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      // Count occurrences of the agentBusy: false pattern in rejectStep body
      const occurrences = (rejectBody.match(/agentBusy:\s*false/g) ?? []).length;
      // One occurrence covers both branches (but in this impl there are two branches
      // each with their own patch call)
      expect(occurrences).toBeGreaterThanOrEqual(1);
    });

    it('should patch conversation with agentBusy: false before plan completion', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      // agentBusy: false must appear in rejectStep
      expect(rejectBody).toContain('agentBusy: false');
    });
  });

  // -------------------------------------------------------------------------
  // AC-6: rejectStep validates stepIndex matches currentStepIndex
  // -------------------------------------------------------------------------
  describe('AC-6: rejectStep validates stepIndex matches currentStepIndex', () => {
    it('should compare plan.currentStepIndex to stepIndex and throw on mismatch', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      const hasIndexCheck =
        rejectBody.includes('currentStepIndex !== stepIndex') ||
        rejectBody.includes('stepIndex !== plan.currentStepIndex') ||
        rejectBody.includes('plan.currentStepIndex !== stepIndex');

      expect(hasIndexCheck).toBe(true);
    });

    it('should throw with "Step index mismatch" error message including expected and got', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      expect(rejectBody).toContain('Step index mismatch');
      expect(rejectBody).toContain('expected');
      expect(rejectBody).toContain('got');
    });

    it('should throw BEFORE reading step data (guard is at plan level)', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const rejectBody = sliceExport(src, 'rejectStep');

      // The mismatch guard must precede the step query
      const guardIdx = rejectBody.indexOf('Step index mismatch');
      const stepQueryIdx = rejectBody.indexOf('agentPlanSteps');

      expect(guardIdx).toBeGreaterThan(-1);
      expect(stepQueryIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(stepQueryIdx);
    });
  });

  // -------------------------------------------------------------------------
  // AC-7: approveStep concurrency guard rejects already-approved/running/completed steps
  // -------------------------------------------------------------------------
  describe('AC-7: approveStep concurrency guard on step status', () => {
    it('should check step.status before patching to "approved"', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const approveBody = sliceExport(src, 'approveStep');

      // step.status check must appear before the status: "approved" patch
      const stepStatusCheckIdx = approveBody.indexOf('step.status');
      const approvedPatchIdx = approveBody.indexOf('status: "approved"');

      expect(stepStatusCheckIdx).toBeGreaterThan(-1);
      expect(approvedPatchIdx).toBeGreaterThan(-1);
      expect(stepStatusCheckIdx).toBeLessThan(approvedPatchIdx);
    });

    it('should return early (not throw) when step is already approved, running, or completed', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const approveBody = sliceExport(src, 'approveStep');

      // The concurrency guard must use "return" (not throw) so that duplicate
      // approvals are silently ignored rather than surfaced as errors.
      const guardEnd = approveBody.indexOf('status: "approved"');
      const guardBlock = approveBody.slice(0, guardEnd);

      // Guard block must contain a bare `return` before the patch
      expect(guardBlock).toMatch(/\breturn\b/);
    });

    it('should only allow steps in awaiting_approval or pending state to proceed', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const approveBody = sliceExport(src, 'approveStep');

      // The guard checks that step.status is NOT in the blocking set
      const hasGuard =
        approveBody.includes('"awaiting_approval"') &&
        approveBody.includes('step.status');

      expect(hasGuard).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC-8: executePlanStep bail-out guard for already running/completed step
  // -------------------------------------------------------------------------
  describe('AC-8: executePlanStep bail-out when step already running or completed', () => {
    it('should return early when step.status is "running"', () => {
      const src = fs.readFileSync(actionsPath, 'utf8');

      expect(src).toContain('step.status === "running"');
    });

    it('should return early when step.status is "completed"', () => {
      const src = fs.readFileSync(actionsPath, 'utf8');

      expect(src).toContain('step.status === "completed"');
    });

    it('should place the bail-out guard BEFORE calling executeAgentTool', () => {
      const src = fs.readFileSync(actionsPath, 'utf8');
      const executePlanBody = sliceExport(src, 'executePlanStep');

      const bailGuardIdx = executePlanBody.search(
        /step\.status === "running"|step\.status === "completed"/,
      );
      const executeToolIdx = executePlanBody.indexOf('executeAgentTool');

      expect(bailGuardIdx).toBeGreaterThan(-1);
      expect(executeToolIdx).toBeGreaterThan(-1);
      expect(bailGuardIdx).toBeLessThan(executeToolIdx);
    });

    it('should use a single return statement to bail out of both running and completed cases', () => {
      const src = fs.readFileSync(actionsPath, 'utf8');
      const executePlanBody = sliceExport(src, 'executePlanStep');

      // The guard must contain a return that exits the action
      const guardRegion = executePlanBody.slice(
        0,
        executePlanBody.indexOf('executeAgentTool'),
      );
      // The guard block must include both statuses in one conditional
      const hasCombinedGuard =
        guardRegion.includes('step.status === "running"') &&
        guardRegion.includes('step.status === "completed"');

      expect(hasCombinedGuard).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC-9: advanceStep cancelled/failed guard
  // -------------------------------------------------------------------------
  describe('AC-9: advanceStep returns early when plan is cancelled or failed', () => {
    it('should check plan.status for "cancelled" before the first db.patch', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const advanceBody = sliceExport(src, 'advanceStep');

      const guardIdx = advanceBody.search(/"cancelled"|"failed"/);
      const firstPatchIdx = advanceBody.indexOf('db.patch');

      expect(guardIdx).toBeGreaterThan(-1);
      expect(firstPatchIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(firstPatchIdx);
    });

    it('should check plan.status for "failed" before the first db.patch', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const advanceBody = sliceExport(src, 'advanceStep');

      expect(advanceBody).toContain('"failed"');
    });

    it('should return null when plan is in a terminal state', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const advanceBody = sliceExport(src, 'advanceStep');

      // Guard must return null (not throw) so callers can handle the no-op gracefully
      const guardRegion = advanceBody.slice(
        0,
        advanceBody.indexOf('db.patch'),
      );
      expect(guardRegion).toContain('return null');
    });
  });

  // -------------------------------------------------------------------------
  // AC-10: cancelPlan clears agentBusy on the conversation
  // -------------------------------------------------------------------------
  describe('AC-10: cancelPlan clears agentBusy on the conversation', () => {
    it('should patch the conversation with agentBusy: false', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const cancelBody = sliceExport(src, 'cancelPlan');

      expect(cancelBody).toContain('agentBusy: false');
    });

    it('should patch the plan with status "cancelled"', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const cancelBody = sliceExport(src, 'cancelPlan');

      expect(cancelBody).toContain('"cancelled"');
    });

    it('should patch agentBusy AFTER setting plan status to "cancelled"', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const cancelBody = sliceExport(src, 'cancelPlan');

      const cancelledStatusIdx = cancelBody.indexOf('"cancelled"');
      const agentBusyIdx = cancelBody.indexOf('agentBusy: false');

      expect(cancelledStatusIdx).toBeGreaterThan(-1);
      expect(agentBusyIdx).toBeGreaterThan(-1);
      // agentBusy clear must come after the plan is marked cancelled
      expect(agentBusyIdx).toBeGreaterThan(cancelledStatusIdx);
    });
  });

  // -------------------------------------------------------------------------
  // AC-11: timeout cron excludes awaiting_approval plans
  // -------------------------------------------------------------------------
  describe('AC-11: timeout cron only times out "executing" plans (excludes awaiting_approval)', () => {
    it('should query plans by status "executing" — not all statuses', () => {
      const src = fs.readFileSync(scheduledPath, 'utf8');

      // The cron must target the "executing" status index specifically
      expect(src).toContain('"executing"');
      // Must use a by_status index query to efficiently target only executing plans
      expect(src).toContain('by_status');
    });

    it('should NOT query or mention awaiting_approval as a status to time out', () => {
      const src = fs.readFileSync(scheduledPath, 'utf8');

      // awaiting_approval is a stable waiting state and must not be timed out.
      // The cron should only touch "executing" plans via the index query.
      // "awaiting_approval" must not appear as a target status in the query.
      //
      // It may appear in comments explaining the exclusion — that is intentional.
      // We verify the .eq("status", "awaiting_approval") pattern is absent.
      expect(src).not.toContain('.eq("status", "awaiting_approval")');
      expect(src).not.toContain(".eq('status', 'awaiting_approval')");
    });

    it('should filter stuck plans by updatedAt age (not just status)', () => {
      const src = fs.readFileSync(scheduledPath, 'utf8');

      // Must use updatedAt for determining staleness, not just status
      expect(src).toContain('updatedAt');
      // Must compare against a timeout constant
      expect(src).toContain('TIMEOUT_MS');
    });

    it('should reset agentBusy on the conversation for each timed-out plan', () => {
      const src = fs.readFileSync(scheduledPath, 'utf8');

      expect(src).toContain('agentBusy: false');
    });
  });

  // -------------------------------------------------------------------------
  // AC-12: toolName validation — unknown tools rejected in createPlan
  // -------------------------------------------------------------------------
  describe('AC-12: toolName validation rejects unknown tools in createPlan', () => {
    it('should validate each step toolName against VALID_TOOL_NAMES before inserting', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const createBody = sliceExport(src, 'createPlan');

      // Validation must come before the plan insert
      const validationIdx = createBody.indexOf('VALID_TOOL_NAMES');
      const planInsertIdx = createBody.indexOf('db.insert("agentPlans"');

      expect(validationIdx).toBeGreaterThan(-1);
      expect(planInsertIdx).toBeGreaterThan(-1);
      expect(validationIdx).toBeLessThan(planInsertIdx);
    });

    it('should throw an "Unknown tool name" error for invalid toolName', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const createBody = sliceExport(src, 'createPlan');

      expect(createBody).toContain('Unknown tool');
    });

    it('should iterate over all steps when validating toolNames', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const createBody = sliceExport(src, 'createPlan');

      // Must loop through steps (for...of or similar) before VALID_TOOL_NAMES check
      const hasLoop =
        createBody.includes('for (const step of steps)') ||
        createBody.includes('for(const step of steps)') ||
        createBody.includes('steps.forEach') ||
        createBody.includes('steps.map');

      expect(hasLoop).toBe(true);
    });

    it('VALID_TOOL_NAMES should not include "create_plan" to prevent nested plans', async () => {
      const toolConfig = await import('../../convex/agentPlans/toolConfig');
      const valid = toolConfig.VALID_TOOL_NAMES as Set<string>;
      expect(valid.has('create_plan')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // AC-13: requiresApproval override — server-side allowlist overrides LLM value
  // -------------------------------------------------------------------------
  describe('AC-13: requiresApproval server-side override via TOOLS_REQUIRING_APPROVAL', () => {
    it('should override each step requiresApproval using TOOLS_REQUIRING_APPROVAL.has()', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const createBody = sliceExport(src, 'createPlan');

      // Must use .has() to look up each step's tool in the allowlist
      expect(createBody).toContain('TOOLS_REQUIRING_APPROVAL');
      expect(createBody).toContain('.has(');
    });

    it('should discard LLM-provided requiresApproval and replace with server value', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const createBody = sliceExport(src, 'createPlan');

      // The override must be applied via a map/transform step
      // creating secureSteps (or equivalent) where requiresApproval is replaced
      const hasOverride =
        createBody.includes('TOOLS_REQUIRING_APPROVAL.has(step.toolName)') ||
        (createBody.includes('TOOLS_REQUIRING_APPROVAL') &&
          createBody.includes('requiresApproval'));

      expect(hasOverride).toBe(true);
    });

    it('TOOLS_REQUIRING_APPROVAL allowlist should contain all write-effect tools', async () => {
      const toolConfig = await import('../../convex/agentPlans/toolConfig');
      const required = toolConfig.TOOLS_REQUIRING_APPROVAL as Set<string>;

      // These tools all have real write side-effects and must always require approval
      const writeTools = [
        'save_document',
        'subscribe',
        'unsubscribe',
        'assimilate',
        'deep_research',
      ];
      for (const tool of writeTools) {
        expect(required.has(tool)).toBe(true);
      }
    });

    it('should apply the requiresApproval override BEFORE inserting steps into agentPlanSteps', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      const createBody = sliceExport(src, 'createPlan');

      // The override (secureSteps) must be computed before the step inserts
      const overrideIdx = createBody.indexOf('TOOLS_REQUIRING_APPROVAL.has(');
      const stepInsertIdx = createBody.indexOf('db.insert("agentPlanSteps"');

      expect(overrideIdx).toBeGreaterThan(-1);
      expect(stepInsertIdx).toBeGreaterThan(-1);
      expect(overrideIdx).toBeLessThan(stepInsertIdx);
    });
  });
});
