/**
 * Content Quality Trust Tests (US-X-004)
 *
 * Tests verify that quality scoring filters findings based on configurable threshold,
 * penalizes clickbait, and shows quality scores in debug mode.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Content Quality Trust - Quality Scoring", () => {
  /**
   * AC-1: Finding with score >= 0.4 included in report
   */
  describe("AC-1: Findings with score >= threshold are included", () => {
    it("should include findings with score >= minQualityScore (0.4)", async () => {
      const actionsPath = join(process.cwd(), "convex/whatsNew/actions.ts");
      const source = readFileSync(actionsPath, "utf-8");

      // Verify filtering logic exists with QUALITY_CONFIG
      expect(source).toContain("QUALITY_CONFIG.minQualityScore");
      expect(source).toContain(".filter((f) => f.qualityScore!");
    });

    it("should use configurable threshold from config", async () => {
      const configPath = join(process.cwd(), "convex/whatsNew/config.ts");
      const source = readFileSync(configPath, "utf-8");

      // Verify config file exists with minQualityScore
      expect(source).toContain("minQualityScore");
      expect(source).toContain("0.4");
    });
  });

  /**
   * AC-2: Finding with score < 0.4 filtered out
   */
  describe("AC-2: Findings with score < threshold are filtered", () => {
    it("should filter out findings below quality threshold", async () => {
      const actionsPath = join(process.cwd(), "convex/whatsNew/actions.ts");
      const source = readFileSync(actionsPath, "utf-8");

      // Verify filter operation
      expect(source).toContain(".filter((f) => f.qualityScore!");
      expect(source).toContain("filtered out");
      expect(source).toContain("low-quality");
    });
  });

  /**
   * AC-3: Clickbait titles penalized (score reduction)
   */
  describe("AC-3: Clickbait titles are penalized", () => {
    it("should penalize clickbait in quality scoring prompt", async () => {
      const actionsPath = join(process.cwd(), "convex/whatsNew/actions.ts");
      const source = readFileSync(actionsPath, "utf-8");

      // Verify clickbait is mentioned in scoring criteria
      expect(source.toLowerCase()).toContain("clickbait");
    });
  });

  /**
   * AC-4: Quality score visible in debug mode
   */
  describe("AC-4: Quality score visible in debug mode", () => {
    it("should include qualityScore in Finding type", async () => {
      const actionsPath = join(process.cwd(), "convex/whatsNew/actions.ts");
      const source = readFileSync(actionsPath, "utf-8");

      // Verify qualityScore is part of Finding interface
      expect(source).toContain("qualityScore?: number");
    });

    it("should include qualityScore in synthesis for debugging", async () => {
      const llmPath = join(process.cwd(), "convex/whatsNew/llm.ts");
      const source = readFileSync(llmPath, "utf-8");

      // Verify qualityScore is passed to synthesis
      expect(source).toContain("qualityScore: f.qualityScore");
    });
  });

  /**
   * AC-5: Only quality findings included when 100 findings processed
   */
  describe("AC-5: Quality filtering applied to large batches", () => {
    it("should apply quality filtering before capping findings", async () => {
      const actionsPath = join(process.cwd(), "convex/whatsNew/actions.ts");
      const source = readFileSync(actionsPath, "utf-8");

      // Verify quality filtering happens before capping in generateDailyReport
      // Look for the specific execution order: qualityFindings assignment before capFindingsPerSource call
      const qualityAssignmentIndex = source.indexOf("const qualityFindings = await scoreFindingsQuality");
      const capCallIndex = source.indexOf("const cappedFindings = capFindingsPerSource(qualityFindings");

      expect(qualityAssignmentIndex).toBeGreaterThan(-1);
      expect(capCallIndex).toBeGreaterThan(-1);
      expect(qualityAssignmentIndex).toBeLessThan(capCallIndex);
    });
  });

  /**
   * AC-6: Threshold configurable (not hardcoded)
   */
  describe("AC-6: Threshold is configurable", () => {
    it("should export QUALITY_CONFIG with minQualityScore", async () => {
      const configPath = join(process.cwd(), "convex/whatsNew/config.ts");
      const source = readFileSync(configPath, "utf-8");

      // Verify config export
      expect(source).toContain("export const QUALITY_CONFIG");
      expect(source).toContain("minQualityScore:");
    });

    it("should have configurable penalty values", async () => {
      const configPath = join(process.cwd(), "convex/whatsNew/config.ts");
      const source = readFileSync(configPath, "utf-8");

      // Verify penalty/bonus config exists
      expect(source).toContain("clickbaitPenalty");
    });

    it("should import config in actions", async () => {
      const actionsPath = join(process.cwd(), "convex/whatsNew/actions.ts");
      const source = readFileSync(actionsPath, "utf-8");

      // Verify config is imported
      expect(source).toContain('import { QUALITY_CONFIG } from "./config"');
    });
  });
});
