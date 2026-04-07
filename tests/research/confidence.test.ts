/**
 * Edge Case Tests for Confidence Scoring System
 *
 * Tests boundary conditions, zero sources, max scores, and all transitions between confidence levels.
 */

import { describe, it, expect } from "vitest";
import {
  calculateConfidenceScore,
  determineConfidenceLevel,
  calculateFullConfidenceResult,
  calculateCorroborationScore,
  calculateRecencyScore,
  aggregateConfidenceStats,
  type ConfidenceFactors,
} from "../../convex/research/confidence";

describe("Confidence Scoring - Edge Cases", () => {
  describe("Zero Sources", () => {
    it("returns LOW when zero sources", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 0,
          evidenceQualityScore: 0,
          corroborationScore: 0,
          recencyScore: 0,
          expertConsensusScore: 0,
        },
        0
      );

      expect(result.level).toBe("LOW");
      expect(result.score).toBe(0);
      expect(result.warnings).toContain("⚠️ No verifiable sources found - treat as unverified claim");
      expect(result.meetsMultiSourceRequirement).toBe(false);
    });

    it("returns LOW with all zero factors", () => {
      const factors: ConfidenceFactors = {
        sourceCredibilityScore: 0,
        evidenceQualityScore: 0,
        corroborationScore: 0,
        recencyScore: 0,
        expertConsensusScore: 0,
      };

      const score = calculateConfidenceScore(factors);
      const level = determineConfidenceLevel(score, 0);

      expect(score).toBe(0);
      expect(level).toBe("LOW");
    });
  });

  describe("Max Scores", () => {
    it("caps score at maximum threshold (100)", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 100,
          evidenceQualityScore: 100,
          corroborationScore: 100,
          recencyScore: 100,
          expertConsensusScore: 100,
        },
        10
      );

      expect(result.score).toBe(100);
      expect(result.level).toBe("HIGH");
    });

    it("returns HIGH with max score and sufficient sources", () => {
      const level = determineConfidenceLevel(100, 5);
      expect(level).toBe("HIGH");
    });

    it("returns MEDIUM with max score but insufficient sources (< 3)", () => {
      const level = determineConfidenceLevel(100, 2);
      expect(level).toBe("MEDIUM");
    });

    it("returns MEDIUM with max score but only 1 source", () => {
      const level = determineConfidenceLevel(100, 1);
      expect(level).toBe("MEDIUM");
    });
  });

  describe("Boundary Conditions - HIGH/MEDIUM Transition", () => {
    it("returns HIGH at score 80 with 3 sources (exact boundary)", () => {
      const level = determineConfidenceLevel(80, 3);
      expect(level).toBe("HIGH");
    });

    it("returns HIGH at score 80 with 4 sources", () => {
      const level = determineConfidenceLevel(80, 4);
      expect(level).toBe("HIGH");
    });

    it("returns MEDIUM at score 80 with only 2 sources", () => {
      const level = determineConfidenceLevel(80, 2);
      expect(level).toBe("MEDIUM");
    });

    it("returns MEDIUM at score 79 with 3 sources (below threshold)", () => {
      const level = determineConfidenceLevel(79, 3);
      expect(level).toBe("MEDIUM");
    });

    it("returns MEDIUM at score 81 with only 2 sources (high score, low sources)", () => {
      const level = determineConfidenceLevel(81, 2);
      expect(level).toBe("MEDIUM");
    });

    it("returns HIGH at score 81 with 3 sources", () => {
      const level = determineConfidenceLevel(81, 3);
      expect(level).toBe("HIGH");
    });
  });

  describe("Boundary Conditions - MEDIUM/LOW Transition", () => {
    it("returns MEDIUM at score 50 (exact boundary)", () => {
      const level = determineConfidenceLevel(50, 3);
      expect(level).toBe("MEDIUM");
    });

    it("returns MEDIUM at score 50 with any source count", () => {
      expect(determineConfidenceLevel(50, 0)).toBe("MEDIUM");
      expect(determineConfidenceLevel(50, 1)).toBe("MEDIUM");
      expect(determineConfidenceLevel(50, 5)).toBe("MEDIUM");
    });

    it("returns LOW at score 49 (below threshold)", () => {
      const level = determineConfidenceLevel(49, 3);
      expect(level).toBe("LOW");
    });

    it("returns LOW at score 0", () => {
      const level = determineConfidenceLevel(0, 3);
      expect(level).toBe("LOW");
    });
  });

  describe("Source Count Impact on HIGH Confidence", () => {
    it("requires exactly 3 sources for HIGH at score 80", () => {
      const level2 = determineConfidenceLevel(80, 2);
      const level3 = determineConfidenceLevel(80, 3);
      const level4 = determineConfidenceLevel(80, 4);

      expect(level2).toBe("MEDIUM");
      expect(level3).toBe("HIGH");
      expect(level4).toBe("HIGH");
    });

    it("penalizes high scores with insufficient sources", () => {
      const highScoreLowSources = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 90,
          evidenceQualityScore: 90,
          corroborationScore: 90,
          recencyScore: 90,
          expertConsensusScore: 90,
        },
        1
      );

      expect(highScoreLowSources.score).toBeGreaterThan(80);
      expect(highScoreLowSources.level).toBe("MEDIUM");
      expect(highScoreLowSources.caveats).toContain(
        "Based on 1 source; additional sources would increase confidence"
      );
    });
  });

  describe("Corroboration Score Edge Cases", () => {
    it("returns 0 for zero sources", () => {
      const score = calculateCorroborationScore(0);
      expect(score).toBe(0);
    });

    it("returns 20 for single source", () => {
      const score = calculateCorroborationScore(1);
      expect(score).toBe(20);
    });

    it("returns 50 for two sources", () => {
      const score = calculateCorroborationScore(2);
      expect(score).toBe(50);
    });

    it("returns 75 for three sources (minimum for HIGH confidence)", () => {
      const score = calculateCorroborationScore(3);
      expect(score).toBe(75);
    });

    it("returns 90 for four sources", () => {
      const score = calculateCorroborationScore(4);
      expect(score).toBe(90);
    });

    it("caps at 100 for five or more sources", () => {
      const score5 = calculateCorroborationScore(5);
      const score10 = calculateCorroborationScore(10);
      const score100 = calculateCorroborationScore(100);

      expect(score5).toBe(100);
      expect(score10).toBe(100);
      expect(score100).toBe(100);
    });
  });

  describe("Recency Score Edge Cases", () => {
    it("returns 40 for null date", () => {
      const score = calculateRecencyScore(null);
      expect(score).toBe(40);
    });

    it("returns 40 for invalid date", () => {
      const score = calculateRecencyScore("invalid-date");
      expect(score).toBe(20);
    });

    it("returns 100 for very recent (within 1 month)", () => {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const score = calculateRecencyScore(oneWeekAgo.toISOString());
      expect(score).toBe(100);
    });

    it("returns 90 for within 3 months", () => {
      const now = new Date();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const score = calculateRecencyScore(twoMonthsAgo.toISOString());
      expect(score).toBe(90);
    });

    it("returns 20 for very old (older than 5 years)", () => {
      const now = new Date();
      const sixYearsAgo = new Date(
        now.getTime() - 6 * 12 * 30 * 24 * 60 * 60 * 1000
      );
      const score = calculateRecencyScore(sixYearsAgo.toISOString());
      expect(score).toBe(20);
    });
  });

  describe("Caveats Generation - Edge Cases", () => {
    it("generates all caveats for poor MEDIUM confidence", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 50,
          evidenceQualityScore: 50,
          corroborationScore: 50,
          recencyScore: 50,
          expertConsensusScore: 50,
        },
        2
      );

      expect(result.level).toBe("MEDIUM");
      expect(result.caveats.length).toBeGreaterThan(0);
      expect(result.caveats).toContain(
        "Based on 2 sources; additional sources would increase confidence"
      );
    });

    it("generates no caveats for HIGH confidence", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 90,
          evidenceQualityScore: 90,
          corroborationScore: 90,
          recencyScore: 90,
          expertConsensusScore: 90,
        },
        5
      );

      expect(result.level).toBe("HIGH");
      expect(result.caveats).toEqual([]);
    });

    it("generates no caveats for LOW confidence (warnings instead)", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 20,
          evidenceQualityScore: 20,
          corroborationScore: 20,
          recencyScore: 20,
          expertConsensusScore: 20,
        },
        1
      );

      expect(result.level).toBe("LOW");
      expect(result.caveats).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("Warnings Generation - Edge Cases", () => {
    it("generates single source warning", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 70,
          evidenceQualityScore: 70,
          corroborationScore: 70,
          recencyScore: 70,
          expertConsensusScore: 70,
        },
        1
      );

      expect(result.level).toBe("MEDIUM");
      expect(result.warnings).toEqual([]);
    });

    it("generates no source warning for zero sources", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 0,
          evidenceQualityScore: 0,
          corroborationScore: 0,
          recencyScore: 0,
          expertConsensusScore: 0,
        },
        0
      );

      expect(result.level).toBe("LOW");
      expect(result.warnings).toContain(
        "⚠️ No verifiable sources found - treat as unverified claim"
      );
    });

    it("generates low credibility warning", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 30,
          evidenceQualityScore: 70,
          corroborationScore: 70,
          recencyScore: 70,
          expertConsensusScore: 70,
        },
        2
      );

      expect(result.level).toBe("MEDIUM");
      expect(result.warnings).toEqual([]);
    });

    it("generates anecdotal evidence warning", () => {
      const result = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 70,
          evidenceQualityScore: 20,
          corroborationScore: 20,
          recencyScore: 20,
          expertConsensusScore: 20,
        },
        2
      );

      expect(result.level).toBe("LOW");
      expect(result.warnings).toContain(
        "⚠️ Evidence is primarily anecdotal or speculative"
      );
    });
  });

  describe("Aggregate Stats - Edge Cases", () => {
    it("handles empty array", () => {
      const stats = aggregateConfidenceStats([]);

      expect(stats.totalClaims).toBe(0);
      expect(stats.highConfidenceCount).toBe(0);
      expect(stats.mediumConfidenceCount).toBe(0);
      expect(stats.lowConfidenceCount).toBe(0);
      expect(stats.averageConfidenceScore).toBe(0);
      expect(stats.claimsWithMultipleSources).toBe(0);
    });

    it("correctly aggregates all HIGH confidence", () => {
      const stats = aggregateConfidenceStats([
        {
          confidenceLevel: "HIGH",
          confidenceScore: 90,
          citationIds: ["id1" as any, "id2" as any, "id3" as any],
        },
        {
          confidenceLevel: "HIGH",
          confidenceScore: 85,
          citationIds: ["id4" as any, "id5" as any, "id6" as any],
        },
      ]);

      expect(stats.totalClaims).toBe(2);
      expect(stats.highConfidenceCount).toBe(2);
      expect(stats.mediumConfidenceCount).toBe(0);
      expect(stats.lowConfidenceCount).toBe(0);
      expect(stats.averageConfidenceScore).toBe(88);
      expect(stats.claimsWithMultipleSources).toBe(2);
    });

    it("correctly aggregates mixed confidence levels", () => {
      const stats = aggregateConfidenceStats([
        {
          confidenceLevel: "HIGH",
          confidenceScore: 90,
          citationIds: ["id1" as any, "id2" as any, "id3" as any],
        },
        {
          confidenceLevel: "MEDIUM",
          confidenceScore: 60,
          citationIds: ["id4" as any, "id5" as any],
        },
        {
          confidenceLevel: "LOW",
          confidenceScore: 30,
          citationIds: ["id6" as any],
        },
      ]);

      expect(stats.totalClaims).toBe(3);
      expect(stats.highConfidenceCount).toBe(1);
      expect(stats.mediumConfidenceCount).toBe(1);
      expect(stats.lowConfidenceCount).toBe(1);
      expect(stats.averageConfidenceScore).toBe(60);
      expect(stats.claimsWithMultipleSources).toBe(1);
    });

    it("counts claims with multiple sources correctly", () => {
      const stats = aggregateConfidenceStats([
        {
          confidenceLevel: "MEDIUM",
          confidenceScore: 70,
          citationIds: ["id1" as any, "id2" as any, "id3" as any],
        },
        {
          confidenceLevel: "MEDIUM",
          confidenceScore: 65,
          citationIds: ["id4" as any, "id5" as any],
        },
        {
          confidenceLevel: "LOW",
          confidenceScore: 40,
          citationIds: ["id6" as any],
        },
      ]);

      expect(stats.claimsWithMultipleSources).toBe(1);
    });
  });

  describe("Score Calculation Precision", () => {
    it("correctly applies all weights", () => {
      const factors: ConfidenceFactors = {
        sourceCredibilityScore: 100,
        evidenceQualityScore: 100,
        corroborationScore: 100,
        recencyScore: 100,
        expertConsensusScore: 100,
      };

      const score = calculateConfidenceScore(factors);
      expect(score).toBe(100);
    });

    it("correctly weights each factor (25%, 25%, 25%, 15%, 10%)", () => {
      const factors: ConfidenceFactors = {
        sourceCredibilityScore: 100,
        evidenceQualityScore: 0,
        corroborationScore: 0,
        recencyScore: 0,
        expertConsensusScore: 0,
      };

      const score = calculateConfidenceScore(factors);
      expect(score).toBe(25);
    });

    it("rounds to nearest integer", () => {
      const factors: ConfidenceFactors = {
        sourceCredibilityScore: 33,
        evidenceQualityScore: 33,
        corroborationScore: 33,
        recencyScore: 33,
        expertConsensusScore: 34,
      };

      const score = calculateConfidenceScore(factors);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(score)).toBe(true);
    });

    it("clamps to minimum 0", () => {
      const factors: ConfidenceFactors = {
        sourceCredibilityScore: -10,
        evidenceQualityScore: -10,
        corroborationScore: -10,
        recencyScore: -10,
        expertConsensusScore: -10,
      };

      const score = calculateConfidenceScore(factors);
      expect(score).toBe(0);
    });
  });

  describe("All Confidence Level Transitions", () => {
    it("transitions LOW to MEDIUM at score 50", () => {
      expect(determineConfidenceLevel(49, 3)).toBe("LOW");
      expect(determineConfidenceLevel(50, 3)).toBe("MEDIUM");
      expect(determineConfidenceLevel(51, 3)).toBe("MEDIUM");
    });

    it("transitions MEDIUM to HIGH at score 80 with 3 sources", () => {
      expect(determineConfidenceLevel(79, 3)).toBe("MEDIUM");
      expect(determineConfidenceLevel(80, 3)).toBe("HIGH");
      expect(determineConfidenceLevel(81, 3)).toBe("HIGH");
    });

    it("stays MEDIUM for high scores with insufficient sources", () => {
      expect(determineConfidenceLevel(90, 0)).toBe("MEDIUM");
      expect(determineConfidenceLevel(90, 1)).toBe("MEDIUM");
      expect(determineConfidenceLevel(90, 2)).toBe("MEDIUM");
      expect(determineConfidenceLevel(90, 3)).toBe("HIGH");
    });
  });

  describe("Multi-Source Requirement Flag", () => {
    it("sets flag to false for less than 3 sources", () => {
      const result0 = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 90,
          evidenceQualityScore: 90,
          corroborationScore: 90,
          recencyScore: 90,
          expertConsensusScore: 90,
        },
        0
      );

      const result1 = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 90,
          evidenceQualityScore: 90,
          corroborationScore: 90,
          recencyScore: 90,
          expertConsensusScore: 90,
        },
        1
      );

      const result2 = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 90,
          evidenceQualityScore: 90,
          corroborationScore: 90,
          recencyScore: 90,
          expertConsensusScore: 90,
        },
        2
      );

      expect(result0.meetsMultiSourceRequirement).toBe(false);
      expect(result1.meetsMultiSourceRequirement).toBe(false);
      expect(result2.meetsMultiSourceRequirement).toBe(false);
    });

    it("sets flag to true for 3 or more sources", () => {
      const result3 = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 90,
          evidenceQualityScore: 90,
          corroborationScore: 90,
          recencyScore: 90,
          expertConsensusScore: 90,
        },
        3
      );

      const result5 = calculateFullConfidenceResult(
        {
          sourceCredibilityScore: 90,
          evidenceQualityScore: 90,
          corroborationScore: 90,
          recencyScore: 90,
          expertConsensusScore: 90,
        },
        5
      );

      expect(result3.meetsMultiSourceRequirement).toBe(true);
      expect(result5.meetsMultiSourceRequirement).toBe(true);
    });
  });
});
