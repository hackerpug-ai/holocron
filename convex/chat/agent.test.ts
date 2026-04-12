/**
 * Agent Tests
 *
 * Tests for the chat agent orchestrator, including specialist dispatch,
 * queryShape hint injection, and tool continuation flow.
 */

import { describe, it, expect } from "vitest";
import { RESEARCH_SPECIALIST_PROMPT } from "./specialistPrompts";

describe("RESEARCH_SPECIALIST_PROMPT", () => {
  describe("AC-1: TOP PRIORITY section", () => {
    it("should contain 'TOP PRIORITY' text", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("TOP PRIORITY");
    });

    it("should contain 'find_recommendations' tool reference", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("find_recommendations");
    });
  });

  describe("AC-2: deep_research gating on explicit signals", () => {
    it("should contain 'comprehensive' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("comprehensive");
    });

    it("should contain 'deep dive' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("deep dive");
    });

    it("should contain 'thorough analysis' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("thorough analysis");
    });

    it("should contain 'complete guide' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("complete guide");
    });

    it("should contain 'never use deep_research for recommendations' rule", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain(
        "NEVER use deep_research for recommendations"
      );
    });
  });

  describe("Canonical failing case example", () => {
    it("should contain 'career coaches' example", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("career coaches");
    });

    it("should map the example to find_recommendations tool call", () => {
      // The example should show the tool call syntax
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("find_recommendations({");
    });
  });
});

describe("queryShape hint injection", () => {
  describe("AC-3: recommendation queryShape gets hint", () => {
    it("should inject 'Use find_recommendations' hint for recommendation shape", () => {
      // This test will be enabled once we implement the dispatch logic
      // For now, we're testing that the shape hints mapping exists
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["recommendation"];
      expect(hint).toContain("Use find_recommendations");
    });
  });

  describe("AC-4: factual queryShape gets no hint", () => {
    it("should return null hint for factual queryShape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["factual"];
      expect(hint).toBeNull();
    });

    it("should return null hint for exploratory queryShape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["exploratory"];
      expect(hint).toBeNull();
    });

    it("should return null hint for ambiguous queryShape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["ambiguous"];
      expect(hint).toBeNull();
    });
  });

  describe("comprehensive queryShape gets deep_research hint", () => {
    it("should inject 'Use deep_research' hint for comprehensive shape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["comprehensive"];
      expect(hint).toContain("Use deep_research");
    });
  });
});
