/**
 * Agent Plans Security: requiresApproval allowlist + toolName validation
 *
 * Task #417
 *
 * AC-1: Server-side map determines requiresApproval, not the LLM.
 *       The createPlan mutation must override each step's requiresApproval
 *       using a server-side TOOLS_REQUIRING_APPROVAL constant before inserting.
 *
 * AC-2: Unknown toolName rejected at plan creation time with a clear error.
 *       The createPlan mutation must validate each step's toolName against
 *       VALID_TOOL_NAMES and throw if an unknown name is provided.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

const mutationsPath = path.resolve(
  __dirname,
  '../../convex/agentPlans/mutations.ts',
);

describe('Agent Plans Security (Task #417)', () => {
  /**
   * AC-1: Server-side requiresApproval allowlist
   *
   * GIVEN a toolConfig module exists with TOOLS_REQUIRING_APPROVAL
   * WHEN createPlan receives steps from the LLM
   * THEN each step's requiresApproval is overridden by the server-side map
   */
  describe('AC-1: Server-side requiresApproval allowlist', () => {
    it('toolConfig.ts should export TOOLS_REQUIRING_APPROVAL as a Set', async () => {
      const toolConfig = await import('../../convex/agentPlans/toolConfig');
      expect(toolConfig.TOOLS_REQUIRING_APPROVAL).toBeDefined();
      expect(toolConfig.TOOLS_REQUIRING_APPROVAL).toBeInstanceOf(Set);
    });

    it('TOOLS_REQUIRING_APPROVAL must include all write-effect tools', async () => {
      const toolConfig = await import('../../convex/agentPlans/toolConfig');
      const required = toolConfig.TOOLS_REQUIRING_APPROVAL as Set<string>;
      // These tools have real side effects and must always require approval
      expect(required.has('save_document')).toBe(true);
      expect(required.has('subscribe')).toBe(true);
      expect(required.has('unsubscribe')).toBe(true);
      expect(required.has('assimilate')).toBe(true);
      expect(required.has('deep_research')).toBe(true);
    });

    it('createPlan mutation must import and use TOOLS_REQUIRING_APPROVAL to override requiresApproval', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      // Must import from toolConfig
      expect(src).toContain('toolConfig');
      // Must reference TOOLS_REQUIRING_APPROVAL
      expect(src).toContain('TOOLS_REQUIRING_APPROVAL');
      // Must use .has() to look up each step's tool — enforcing server-side override
      expect(src).toContain('.has(');
    });
  });

  /**
   * AC-2: toolName validation rejects unknown tool names
   *
   * GIVEN a toolConfig module exports VALID_TOOL_NAMES
   * WHEN createPlan receives a step with an unknown toolName
   * THEN createPlan throws an error (does not silently succeed)
   */
  describe('AC-2: toolName validation', () => {
    it('toolConfig.ts should export VALID_TOOL_NAMES as a Set', async () => {
      const toolConfig = await import('../../convex/agentPlans/toolConfig');
      expect(toolConfig.VALID_TOOL_NAMES).toBeDefined();
      expect(toolConfig.VALID_TOOL_NAMES).toBeInstanceOf(Set);
    });

    it('VALID_TOOL_NAMES must include all known agent tools', async () => {
      const toolConfig = await import('../../convex/agentPlans/toolConfig');
      const valid = toolConfig.VALID_TOOL_NAMES as Set<string>;
      // Spot-check a representative sample of both safe and write tools
      expect(valid.has('search_knowledge_base')).toBe(true);
      expect(valid.has('browse_category')).toBe(true);
      expect(valid.has('quick_research')).toBe(true);
      expect(valid.has('deep_research')).toBe(true);
      expect(valid.has('save_document')).toBe(true);
      expect(valid.has('subscribe')).toBe(true);
      expect(valid.has('unsubscribe')).toBe(true);
      expect(valid.has('assimilate')).toBe(true);
      expect(valid.has('shop_search')).toBe(true);
      expect(valid.has('list_subscriptions')).toBe(true);
      expect(valid.has('check_subscriptions')).toBe(true);
      expect(valid.has('toolbelt_search')).toBe(true);
      expect(valid.has('whats_new')).toBe(true);
      expect(valid.has('knowledge_base_stats')).toBe(true);
    });

    it('VALID_TOOL_NAMES must NOT include create_plan (plans cannot be nested)', async () => {
      const toolConfig = await import('../../convex/agentPlans/toolConfig');
      const valid = toolConfig.VALID_TOOL_NAMES as Set<string>;
      expect(valid.has('create_plan')).toBe(false);
    });

    it('createPlan mutation must validate toolName against VALID_TOOL_NAMES and throw on unknown', () => {
      const src = fs.readFileSync(mutationsPath, 'utf8');
      // Must reference VALID_TOOL_NAMES
      expect(src).toContain('VALID_TOOL_NAMES');
      // Must throw when an unknown toolName is encountered
      expect(src).toContain('Unknown tool');
    });
  });
});
