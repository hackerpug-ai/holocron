/**
 * Tools Tests
 *
 * TDD: RED → GREEN → REFACTOR
 * Tests for tool definitions and specialist subsets
 */

import { describe, expect, it } from 'vitest';
import { agentTools, knowledgeTools, researchTools } from './tools';

describe('tools', () => {
  describe('AC-1: find_recommendations tool defined', () => {
    it('exports find_recommendations symbol', () => {
      // This test will fail until we add find_recommendations to tools.ts
      expect(researchTools).toHaveProperty('find_recommendations');
    });

    it('find_recommendations is a function (tool definition)', () => {
      const tool = researchTools.find_recommendations;
      expect(typeof tool).toBe('object'); // Vercel AI SDK tools are objects
    });
  });

  describe('AC-2: Tool description contains negative examples', () => {
    it("description contains 'Do NOT use this for'", () => {
      const tool = researchTools.find_recommendations;
      expect(tool?.description).toBeDefined();
      expect(tool?.description).toContain('Do NOT use this for');
    });

    it("description contains 'INLINE response'", () => {
      const tool = researchTools.find_recommendations;
      expect(tool?.description).toBeDefined();
      expect(tool?.description).toContain('INLINE response');
    });
  });

  describe('AC-3: Schema enforces count 3-7', () => {
    it('inputSchema exists', () => {
      const tool = researchTools.find_recommendations;
      expect(tool?.inputSchema).toBeDefined();
    });

    it('schema has query parameter', () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema;
      const shape =
        (schema as any)?.shape ?? (schema as any)?._def?.shape?.() ?? (schema as any)?._def?.shape;
      expect(shape).toHaveProperty('query');
    });

    it('schema has count parameter with min(3)', () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema as any;
      const shape = schema?.shape ?? schema?._def?.shape?.() ?? schema?._def?.shape;
      expect(shape).toHaveProperty('count');
      const parse = (v: unknown) => schema.safeParse({ query: 'x', count: v });
      expect(parse(2).success).toBe(false);
      expect(parse(3).success).toBe(true);
      expect(parse(7).success).toBe(true);
      expect(parse(8).success).toBe(false);
    });

    it('schema has location parameter (optional)', () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema;
      const shape =
        (schema as any)?.shape ?? (schema as any)?._def?.shape?.() ?? (schema as any)?._def?.shape;
      expect(shape).toHaveProperty('location');
    });

    it('schema has constraints parameter (optional)', () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema;
      const shape =
        (schema as any)?.shape ?? (schema as any)?._def?.shape?.() ?? (schema as any)?._def?.shape;
      expect(shape).toHaveProperty('constraints');
    });
  });

  describe('AC-4: Registered in researchTools subset', () => {
    it('researchTools includes find_recommendations', () => {
      expect(researchTools).toHaveProperty('find_recommendations');
    });

    it('researchTools still includes existing tools', () => {
      expect(researchTools).toHaveProperty('quick_research');
      expect(researchTools).toHaveProperty('deep_research');
      expect(researchTools).toHaveProperty('answer_question');
    });

    it('researchTools has exactly 4 tools', () => {
      const toolCount = Object.keys(researchTools).length;
      expect(toolCount).toBe(4);
    });
  });

  describe('AC-5: toolbelt_search scoped to developer tools only', () => {
    it('knowledgeTools does not include toolbelt_search', () => {
      expect(knowledgeTools).not.toHaveProperty('toolbelt_search');
    });

    it('knowledgeTools contains exactly 4 tools', () => {
      const toolCount = Object.keys(knowledgeTools).length;
      expect(toolCount).toBe(4);
    });

    it('knowledgeTools contains the expected 4 tools', () => {
      expect(knowledgeTools).toHaveProperty('search_knowledge_base');
      expect(knowledgeTools).toHaveProperty('browse_category');
      expect(knowledgeTools).toHaveProperty('knowledge_base_stats');
      expect(knowledgeTools).toHaveProperty('get_document');
    });

    it('agentTools still includes toolbelt_search', () => {
      expect(agentTools).toHaveProperty('toolbelt_search');
    });

    it("toolbelt_search description contains 'DEVELOPER TOOLS ONLY'", () => {
      const tool = agentTools.toolbelt_search;
      expect(tool?.description).toContain('DEVELOPER TOOLS ONLY');
    });
  });

  /**
   * GATE-FIX-S28R3-QA15 — Zod4/tsgo requires z.record(key, value).
   * Broken one-arg form `z.record(z.any())` is TS2554 at tools.ts toolArgs.
   * RED evidence: .tmp/GATE-FIX-S28R3-QA15/red-typecheck.log (TS2554 Expected 2-3 arguments).
   */
  describe('AC-6: create_plan toolArgs uses strict two-arg z.record', () => {
    it('source contract: toolArgs is z.record(z.string(), z.any()) not one-arg', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const src = readFileSync(resolve(import.meta.dirname, 'tools.ts'), 'utf8');
      // One-arg form is the TS2554 hook failure; refuse it.
      expect(src).not.toMatch(/toolArgs:\s*z\.record\(\s*z\.any\(\)\s*\)/);
      expect(src).toMatch(/toolArgs:\s*z\.record\(\s*z\.string\(\)\s*,\s*z\.any\(\)\s*\)/);
    });

    it('create_plan schema accepts string-key toolArgs records and rejects non-objects', () => {
      const tool = agentTools.create_plan as { inputSchema?: { safeParse: (v: unknown) => { success: boolean } } };
      const schema = tool?.inputSchema;
      expect(schema).toBeDefined();
      const base = {
        title: 'Two-step plan',
        steps: [
          {
            toolName: 'quick_research',
            toolArgs: { query: 'x' },
            description: 'research',
            requiresApproval: false,
          },
          {
            toolName: 'answer_question',
            toolArgs: { question: 'y' },
            description: 'answer',
            requiresApproval: false,
          },
        ],
      };
      expect(schema!.safeParse(base).success).toBe(true);
      expect(
        schema!.safeParse({
          ...base,
          steps: [
            { ...base.steps[0], toolArgs: 'not-an-object' },
            base.steps[1],
          ],
        }).success
      ).toBe(false);
      // Still min(2) steps — schema not weakened.
      expect(
        schema!.safeParse({
          title: 'one',
          steps: [base.steps[0]],
        }).success
      ).toBe(false);
    });
  });
});
