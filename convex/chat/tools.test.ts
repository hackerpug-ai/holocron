/**
 * Tools Tests
 *
 * TDD: RED → GREEN → REFACTOR
 * Tests for tool definitions and specialist subsets
 */

import { describe, it, expect } from "vitest";
import { researchTools } from "./tools";

describe("tools", () => {
  describe("AC-1: find_recommendations tool defined", () => {
    it("exports find_recommendations symbol", () => {
      // This test will fail until we add find_recommendations to tools.ts
      expect(researchTools).toHaveProperty("find_recommendations");
    });

    it("find_recommendations is a function (tool definition)", () => {
      const tool = researchTools.find_recommendations;
      expect(typeof tool).toBe("object"); // Vercel AI SDK tools are objects
    });
  });

  describe("AC-2: Tool description contains negative examples", () => {
    it("description contains 'Do NOT use this for'", () => {
      const tool = researchTools.find_recommendations;
      expect(tool?.description).toBeDefined();
      expect(tool?.description).toContain("Do NOT use this for");
    });

    it("description contains 'INLINE response'", () => {
      const tool = researchTools.find_recommendations;
      expect(tool?.description).toBeDefined();
      expect(tool?.description).toContain("INLINE response");
    });
  });

  describe("AC-3: Schema enforces count 3-7", () => {
    it("inputSchema exists", () => {
      const tool = researchTools.find_recommendations;
      expect(tool?.inputSchema).toBeDefined();
    });

    it("schema has query parameter", () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema;
      // ZodObject stores shape in _def.shape
      const shape = (schema as any)?._def?.shape();
      expect(shape).toHaveProperty("query");
    });

    it("schema has count parameter with min(3)", () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema;
      const shape = (schema as any)?._def?.shape();
      expect(shape).toHaveProperty("count");
      // Check that count has min(3) constraint in the checks array
      const countDef = shape?.count?._def?.innerType?._def?.innerType?._def;
      const minCheck = countDef?.checks?.find((c: any) => c.kind === "min");
      expect(minCheck?.value).toBe(3);
      const maxCheck = countDef?.checks?.find((c: any) => c.kind === "max");
      expect(maxCheck?.value).toBe(7);
    });

    it("schema has location parameter (optional)", () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema;
      const shape = (schema as any)?._def?.shape();
      expect(shape).toHaveProperty("location");
    });

    it("schema has constraints parameter (optional)", () => {
      const tool = researchTools.find_recommendations;
      const schema = tool?.inputSchema;
      const shape = (schema as any)?._def?.shape();
      expect(shape).toHaveProperty("constraints");
    });
  });

  describe("AC-4: Registered in researchTools subset", () => {
    it("researchTools includes find_recommendations", () => {
      expect(researchTools).toHaveProperty("find_recommendations");
    });

    it("researchTools still includes existing tools", () => {
      expect(researchTools).toHaveProperty("quick_research");
      expect(researchTools).toHaveProperty("deep_research");
      expect(researchTools).toHaveProperty("answer_question");
    });

    it("researchTools has exactly 4 tools", () => {
      const toolCount = Object.keys(researchTools).length;
      expect(toolCount).toBe(4);
    });
  });
});
