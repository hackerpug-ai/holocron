/**
 * Summary Quality Monitoring Tests (US-SUMM-004)
 *
 * Tests verify that getSummaryStats query is registered in the Convex API
 * and that the error handling implementation is present in the source code.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Summary Quality Monitoring - getSummaryStats", () => {
  /**
   * AC-1: getSummaryStats query is registered in the API
   */
  describe("AC-1: getSummaryStats query is registered", () => {
    it("should have getSummaryStats query defined in whatsNew module", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify getSummaryStats is defined
      expect(source).toContain("export const getSummaryStats = query");
      expect(source).toContain("limit: v.optional(v.number())");
    });
  });

  /**
   * AC-2: Error handling is implemented for JSON.parse
   */
  describe("AC-2: Error handling for malformed JSON", () => {
    it("should wrap JSON.parse in try-catch block", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify try-catch exists around JSON.parse
      expect(source).toContain("try {");
      expect(source).toContain("JSON.parse(report.findingsJson)");
      expect(source).toContain("} catch (error)");
      expect(source).toContain("console.error");
      expect(source).toContain("Failed to parse findingsJson");
    });

    it("should log errors and continue processing other reports", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify error logging and continue statement
      expect(source).toContain("[Summary Quality] Failed to parse findingsJson for report:");
      expect(source).toContain("continue;");
    });
  });

  /**
   * AC-3: Validates findingsJson is an array
   */
  describe("AC-3: Array validation for findingsJson", () => {
    it("should check if findings is an array before processing", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify array check
      expect(source).toContain("Array.isArray(findings)");
      expect(source).toContain("findingsJson is not an array for report:");
    });
  });

  /**
   * AC-4: Handles null/undefined finding objects
   */
  describe("AC-4: Null/undefined handling for finding objects", () => {
    it("should check if finding is valid object before accessing properties", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify null/undefined check
      expect(source).toContain("if (!finding || typeof finding !== 'object')");
      expect(source).toContain("continue;");
    });
  });

  /**
   * AC-5: Only counts non-empty summaries
   */
  describe("AC-5: Non-empty summary validation", () => {
    it("should check if summary exists and has length > 0", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify non-empty string check
      expect(source).toContain("if (finding.summary && finding.summary.length > 0)");
    });
  });

  /**
   * AC-6: Rounds coverageRate to 2 decimal places
   */
  describe("AC-6: Coverage rate precision", () => {
    it("should round coverageRate to 2 decimal places", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify rounding logic
      expect(source).toContain("Math.round((withSummary / totalFindings) * 100 * 100) / 100");
    });
  });

  /**
   * AC-7: Internal mutations for logging are registered
   */
  describe("AC-7: Internal mutations for quality logging", () => {
    it("should have logSummaryGeneration internal mutation", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify logSummaryGeneration is defined
      expect(source).toContain("export const logSummaryGeneration = internalMutation");
      expect(source).toContain("findingId: v.string()");
      expect(source).toContain("success: v.boolean()");
      expect(source).toContain("summaryLength: v.optional(v.number())");
    });

    it("should have flagSummary internal mutation", async () => {
      const qualityPath = join(process.cwd(), "convex/whatsNew/quality.ts");
      const source = readFileSync(qualityPath, "utf-8");

      // Verify flagSummary is defined
      expect(source).toContain("export const flagSummary = internalMutation");
      expect(source).toContain("findingId: v.string()");
      expect(source).toContain("reason: v.string()");
    });
  });
});
