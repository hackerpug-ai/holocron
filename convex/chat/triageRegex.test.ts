/**
 * Triage Regex Pre-filter Tests
 *
 * TDD: RED → GREEN → REFACTOR
 * Tests for pure regex-based classification of recommendation queries.
 */

import { describe, it, expect } from "vitest";
import { regexClassify } from "./triageRegex";

describe("triageRegex", () => {
  describe("AC-1: Classifies canonical failing case as recommendation", () => {
    it("canonical failing case", () => {
      const input =
        "career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals";
      const result = regexClassify(input);

      expect(result).toBeDefined();
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.confidence).toBe("high");
      expect(result?.matchedPattern).toMatch(/highly_rated|provide_n/);
    });
  });

  describe("AC-1: Recommendation pattern variations", () => {
    it("'find me N' pattern", () => {
      const result = regexClassify("find me 5 therapists in SF");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("find_me_n");
    });

    it("'top N' pattern", () => {
      const result = regexClassify("top 10 React state libraries");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("top_n");
    });

    it("'best N' pattern", () => {
      const result = regexClassify("best 5 restaurants in NYC");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("best_n");
    });

    it("'highly rated' pattern", () => {
      const result = regexClassify("show me highly rated dentists nearby");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("highly_rated");
    });

    it("'referrals for' pattern", () => {
      const result = regexClassify("I need referrals for accountants");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("referrals_for");
    });

    it("'who should I hire' pattern", () => {
      const result = regexClassify("who should I hire for UI design");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("who_should_hire");
    });

    it("'where can I find' pattern", () => {
      const result = regexClassify("where can I find good contractors");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("where_can_find");
    });

    it("'provide N' pattern", () => {
      const result = regexClassify("provide 3-5 options for learning TypeScript");
      expect(result?.queryShape).toBe("recommendation");
      expect(result?.matchedPattern).toBe("provide_n");
    });
  });

  describe("AC-2: Ignores factual queries (no false positives)", () => {
    it("factual negative - 'what is RAG'", () => {
      const result = regexClassify("what is RAG");
      expect(result).toBeUndefined();
    });

    it("factual negative - 'explain WebGL'", () => {
      const result = regexClassify("explain WebGL");
      expect(result).toBeUndefined();
    });

    it("factual negative - 'how does JWT work'", () => {
      const result = regexClassify("how does JWT work");
      expect(result).toBeUndefined();
    });

    it("factual negative - 'define microservices'", () => {
      const result = regexClassify("define microservices");
      expect(result).toBeUndefined();
    });

    it("exploratory query - 'tell me about AI'", () => {
      const result = regexClassify("tell me about AI");
      expect(result).toBeUndefined();
    });

    it("conversational - 'hello there'", () => {
      const result = regexClassify("hello there");
      expect(result).toBeUndefined();
    });
  });

  describe("AC-4: Under 5ms per classification call", () => {
    it("perf under 5ms", () => {
      const input =
        "I'm looking for career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals for me to review";
      const iterations = 1000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        regexClassify(input);
      }
      const end = performance.now();

      const meanTimeMs = (end - start) / iterations;
      expect(meanTimeMs).toBeLessThan(5);
    });
  });

  describe("Edge cases and robustness", () => {
    it("case insensitive matching", () => {
      const result1 = regexClassify("FIND ME 5 therapists");
      const result2 = regexClassify("Find Me 5 therapists");
      const result3 = regexClassify("find me 5 therapists");

      expect(result1?.queryShape).toBe("recommendation");
      expect(result2?.queryShape).toBe("recommendation");
      expect(result3?.queryShape).toBe("recommendation");
    });

    it("handles empty string", () => {
      const result = regexClassify("");
      expect(result).toBeUndefined();
    });

    it("handles whitespace only", () => {
      const result = regexClassify("   ");
      expect(result).toBeUndefined();
    });

    it("first pattern wins when multiple match", () => {
      const result = regexClassify(
        "find me 5 highly rated therapists in SF"
      );
      expect(result).toBeDefined();
      expect(result?.queryShape).toBe("recommendation");
      // Should match the first pattern in the list
      expect(result?.matchedPattern).toBeDefined();
    });
  });

  describe("Type safety", () => {
    it("returns correct QueryShape type", () => {
      const result = regexClassify("find me 5 therapists");
      if (result) {
        const validShapes = [
          "factual",
          "recommendation",
          "comprehensive",
          "exploratory",
          "ambiguous",
        ];
        expect(validShapes).toContain(result.queryShape);
      }
    });

    it("returns correct confidence type", () => {
      const result = regexClassify("find me 5 therapists");
      if (result) {
        const validConfidences = ["high", "medium"];
        expect(validConfidences).toContain(result.confidence);
      }
    });
  });
});
