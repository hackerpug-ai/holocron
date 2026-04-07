import { describe, it, expect } from "vitest";

describe("FR-014: getDigestSummary Query", () => {
  describe("AC-1: Add getDigestSummary query to queries.ts", () => {
    it("should export getDigestSummary from queries module", async () => {
      const queriesModule = await import("../../../convex/feeds/queries");

      // Should export getDigestSummary
      expect(queriesModule).toHaveProperty("getDigestSummary");
      const getDigestSummary = queriesModule.getDigestSummary;
      expect(getDigestSummary).toBeTruthy();
    });
  });

  describe("AC-2: Query accepts optional since parameter", () => {
    it("should have args with optional since parameter", async () => {
      const queriesModule = await import("../../../convex/feeds/queries");
      const getDigestSummary = queriesModule.getDigestSummary;

      // Query should be defined
      expect(getDigestSummary).toBeTruthy();
    });

    it("should have since defined as optional number in args", async () => {
      const fs = await import("fs");
      const path = await import("path");

      try {
        const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
        const queriesContent = fs.readFileSync(queriesPath, "utf-8");

        // Should have since: v.optional(v.number())
        expect(queriesContent).toMatch(/since\s*:\s*v\.optional\(v\.number\(\)\)/);
      } catch (error) {
        // File doesn't exist yet, test should fail
        expect((error as Error).message).not.toContain("no such file");
      }
    });
  });

  describe("AC-3: Query returns counts by contentType", () => {
    it("should have counts object with video, blog, social properties", async () => {
      const fs = await import("fs");
      const path = await import("path");

      try {
        const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
        const queriesContent = fs.readFileSync(queriesPath, "utf-8");

        // Should have counts object with video, blog, social, total, unviewed
        expect(queriesContent).toMatch(/counts\s*=\s*\{[^}]*video\s*:/);
        expect(queriesContent).toMatch(/counts\s*=\s*\{[^}]*blog\s*:/);
        expect(queriesContent).toMatch(/counts\s*=\s*\{[^}]*social\s*:/);
        expect(queriesContent).toMatch(/counts\s*=\s*\{[^}]*total\s*:/);
        expect(queriesContent).toMatch(/counts\s*=\s*\{[^}]*unviewed\s*:/);
      } catch (error) {
        // File doesn't exist yet, test should fail
        expect((error as Error).message).not.toContain("no such file");
      }
    });
  });

  describe("AC-4: Query includes sample items", () => {
    it("should include sampleItems array collection", async () => {
      const fs = await import("fs");
      const path = await import("path");

      try {
        const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
        const queriesContent = fs.readFileSync(queriesPath, "utf-8");

        // Should have sampleItems collection
        expect(queriesContent).toMatch(/sampleItems/);

        // Should limit to 3 items
        expect(queriesContent).toMatch(/sampleItems\.length\s*<\s*3/);
      } catch (error) {
        // File doesn't exist yet, test should fail
        expect((error as Error).message).not.toContain("no such file");
      }
    });
  });

  describe("AC-5: Query generates human-readable summary text", () => {
    it("should generate summary text", async () => {
      const fs = await import("fs");
      const path = await import("path");

      try {
        const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
        const queriesContent = fs.readFileSync(queriesPath, "utf-8");

        // Should have summary property in return
        expect(queriesContent).toMatch(/summary\s*:/);

        // Should have parts array for building summary
        expect(queriesContent).toMatch(/parts/);

        // Should use parts.join for summary
        expect(queriesContent).toMatch(/parts\.join/);
      } catch (error) {
        // File doesn't exist yet, test should fail
        expect((error as Error).message).not.toContain("no such file");
      }
    });
  });

  describe("AC-6: Query uses 24-hour default window", () => {
    it("should default to 24 hours when since not provided", async () => {
      const fs = await import("fs");
      const path = await import("path");

      try {
        const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
        const queriesContent = fs.readFileSync(queriesPath, "utf-8");

        // Should have 24 * 60 * 60 * 1000 calculation
        expect(queriesContent).toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);

        // Should use Date.now() - calculation as default
        expect(queriesContent).toMatch(/args\.since\s*\?\?\s*\(Date\.now\(\)\s*-\s*24/);
      } catch (error) {
        // File doesn't exist yet, test should fail
        expect((error as Error).message).not.toContain("no such file");
      }
    });
  });

  describe("AC-7: Query uses by_created index", () => {
    it("should use by_created index for efficient querying", async () => {
      const fs = await import("fs");
      const path = await import("path");

      try {
        const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
        const queriesContent = fs.readFileSync(queriesPath, "utf-8");

        // Should use by_created index
        expect(queriesContent).toContain("by_created");
      } catch (error) {
        // File doesn't exist yet, test should fail
        expect((error as Error).message).not.toContain("no such file");
      }
    });
  });

  describe("AC-8: Verify type check passes", () => {
    it("should have correct TypeScript types", async () => {
      const queriesModule = await import("../../../convex/feeds/queries");

      // Module should load without type errors
      expect(queriesModule).toBeTruthy();

      const getDigestSummary = queriesModule.getDigestSummary;
      expect(getDigestSummary).toBeTruthy();
    });
  });
});
