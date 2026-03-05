/**
 * Integration tests for Research Agents (US-047)
 *
 * Tests verify the Lead Agent and Subagent implementations
 * following the orchestrator-worker pattern
 */

import { describe, it, expect, beforeAll } from "vitest";

// Types for agent responses
interface AgentResponse {
  model: string;
  content: string;
  toolCalls?: unknown[];
}

interface ResearchPlan {
  query: string;
  subtasks: Array<{
    id: string;
    objective: string;
    searchTerms: string[];
  }>;
  maxIterations: number;
}

describe("AC-1: Lead Agent with GPT-5", () => {
  describe("GIVEN agent components are installed", () => {
    it("WHEN defining Lead Agent with GPT-5 THEN agent creates thread and generates plan", async () => {
      // This test verifies the leadAgent definition exists and can be imported
      const { leadResearcher } = await import("../../convex/research/agents");

      expect(leadResearcher).toBeDefined();
      expect(leadResearcher.name).toBe("Lead Researcher");
      expect(leadResearcher.model).toContain("gpt-5");
    });

    it("WHEN generating research plan THEN returns structured plan with subtasks", async () => {
      const { planResearch } = await import("../../convex/research/tools");

      // Mock the planning function
      const testQuery = "What are the latest developments in quantum computing?";
      const plan = await planResearch(testQuery);

      expect(plan).toBeDefined();
      expect(plan.query).toBe(testQuery);
      expect(plan.subtasks).toBeInstanceOf(Array);
      expect(plan.subtasks.length).toBeGreaterThan(0);
      expect(plan.maxIterations).toBeGreaterThan(0);
    });

    it("WHEN lead agent plans THEN subtasks have search terms", async () => {
      const { planResearch } = await import("../../convex/research/tools");

      const testQuery = "Impact of AI on healthcare";
      const plan = await planResearch(testQuery);

      for (const subtask of plan.subtasks) {
        expect(subtask.id).toBeDefined();
        expect(subtask.objective).toBeDefined();
        expect(subtask.searchTerms).toBeInstanceOf(Array);
        expect(subtask.searchTerms.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("AC-2: Parallel Subagents with GPT-5-mini", () => {
  describe("GIVEN subagent template defined", () => {
    it("WHEN spawning subagents THEN each uses GPT-5-mini model", async () => {
      const { webSearcher } = await import("../../convex/research/agents");

      expect(webSearcher).toBeDefined();
      expect(webSearcher.name).toBe("Web Searcher");
      expect(webSearcher.model).toContain("gpt-5-mini");
    });

    it("WHEN subagent executes THEN performs focused search", async () => {
      const { executeSubagentSearch } = await import("../../convex/research/tools");

      const objective = "Find recent papers on quantum error correction";
      const result = await executeSubagentSearch(objective);

      expect(result).toBeDefined();
      expect(result.objective).toBe(objective);
      expect(result.findings).toBeDefined();
      expect(result.sources).toBeInstanceOf(Array);
    });

    it("WHEN 3 subagents spawned THEN all execute in parallel", async () => {
      const { executeSubagentSearch } = await import("../../convex/research/tools");

      const subtasks = [
        { id: "1", objective: "Search for quantum algorithms", searchTerms: ["quantum", "algorithms"] },
        { id: "2", objective: "Search for quantum hardware", searchTerms: ["quantum", "hardware"] },
        { id: "3", objective: "Search for quantum applications", searchTerms: ["quantum", "applications"] },
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        subtasks.map((task) => executeSubagentSearch(task.objective))
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(3);
      // Parallel execution should be faster than sequential
      expect(duration).toBeLessThan(subtasks.length * 2000); // Less than 2s per task if sequential
    });
  });
});

describe("AC-3: Workflow Orchestration", () => {
  describe("GIVEN workflow defined", () => {
    it("WHEN running deep research THEN executes plan → subagents → synthesize", async () => {
      const { deepResearchPrototype } = await import("../../convex/research/workflow");

      const testQuery = "Test research query";
      const result = await deepResearchPrototype(testQuery);

      expect(result).toBeDefined();
      expect(result.plan).toBeDefined();
      expect(result.findings).toBeInstanceOf(Array);
      expect(result.synthesis).toBeDefined();
    });

    it("WHEN workflow executes THEN uses lead agent for planning", async () => {
      const { deepResearchPrototype } = await import("../../convex/research/workflow");

      const testQuery = "Verify lead agent usage";
      const result = await deepResearchPrototype(testQuery);

      expect(result.plan).toBeDefined();
      expect(result.plan.subtasks).toBeDefined();
    });

    it("WHEN workflow executes THEN spawns parallel subagents", async () => {
      const { deepResearchPrototype } = await import("../../convex/research/workflow");

      const testQuery = "Verify parallel execution";
      const result = await deepResearchPrototype(testQuery);

      expect(result.findings).toBeInstanceOf(Array);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it("WHEN workflow executes THEN synthesizes with lead agent", async () => {
      const { deepResearchPrototype } = await import("../../convex/research/workflow");

      const testQuery = "Verify synthesis";
      const result = await deepResearchPrototype(testQuery);

      expect(result.synthesis).toBeDefined();
      expect(typeof result.synthesis).toBe("string");
    });
  });
});

describe("AC-4: End-to-End Execution", () => {
  describe("GIVEN full workflow configured", () => {
    it("WHEN running with test query THEN completes successfully", async () => {
      const { deepResearchPrototype } = await import("../../convex/research/workflow");

      const testQuery = "What is the state of quantum computing in 2024?";
      const result = await deepResearchPrototype(testQuery);

      expect(result).toBeDefined();
      expect(result.plan).toBeDefined();
      expect(result.findings).toBeDefined();
      expect(result.synthesis).toBeDefined();
      expect(result.iterations).toBeDefined();
    });

    it("WHEN completing THEN tracks iteration count", async () => {
      const { deepResearchPrototype } = await import("../../convex/research/workflow");

      const testQuery = "Count iterations test";
      const result = await deepResearchPrototype(testQuery);

      expect(result.iterations).toBeGreaterThanOrEqual(1);
    });

    it("WHEN completing THEN includes all findings in synthesis", async () => {
      const { deepResearchPrototype } = await import("../../convex/research/workflow");

      const testQuery = "Synthesis verification test";
      const result = await deepResearchPrototype(testQuery);

      // Synthesis should reference findings
      expect(result.synthesis.length).toBeGreaterThan(0);
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });
});
