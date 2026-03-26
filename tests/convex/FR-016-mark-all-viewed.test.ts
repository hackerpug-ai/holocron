/**
 * FR-016: markAllViewed mutation tests
 *
 * Tests the mutation that marks all feed items as viewed
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("FR-016: Create markAllViewed mutation", () => {
  describe("AC-1: Import markAllViewedArgs validator", () => {
    it("should import markAllViewedArgs from validators.ts", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should import markAllViewedArgs
      expect(content).toMatch(/import\s+.*markAllViewedArgs.*from.*["']\.\/validators/);
    });
  });

  describe("AC-2: Export markAllViewed function", () => {
    it("should export markAllViewed function", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have export const markAllViewed
      expect(content).toMatch(/export\s+const\s+markAllViewed\s*=/);
    });

    it("should use markAllViewedArgs validator", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have args: markAllViewedArgs
      expect(content).toMatch(/args\s*:\s*markAllViewedArgs/);
    });
  });

  describe("AC-3: Query by by_viewed index", () => {
    it("should use withIndex with by_viewed", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should use withIndex("by_viewed")
      expect(content).toMatch(/withIndex\s*\(\s*["']by_viewed["']/);
    });

    it("should filter by viewed equals false", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have .eq("viewed", false)
      expect(content).toMatch(/\.eq\s*\(\s*["']viewed["']\s*,\s*false\s*\)/);
    });
  });

  describe("AC-4: Default viewedAt from args or Date.now()", () => {
    it("should default viewedAt to args.viewedAt ?? Date.now()", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have viewedAt = args.viewedAt ?? Date.now() or similar pattern
      expect(content).toMatch(/viewedAt.*=.*args\.viewedAt.*\?\?.*Date\.now\(\)|viewedAt\s*:\s*args\.viewedAt\s*\?\?\s*Date\.now\(\)/);
    });
  });

  describe("AC-5: Update viewed and viewedAt on all items", () => {
    it("should update viewed to true", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have viewed: true in patch
      expect(content).toMatch(/viewed\s*:\s*true/);
    });

    it("should update viewedAt timestamp", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have viewedAt in patch
      const patchMatches = content.match(/ctx\.db\.patch\([^)]+\)/gs);
      if (patchMatches) {
        const hasViewedAt = patchMatches.some((patch) => patch.includes("viewedAt"));
        expect(hasViewedAt).toBe(true);
      } else {
        throw new Error("No db.patch calls found");
      }
    });
  });

  describe("AC-6: Use Promise.all for concurrent updates", () => {
    it("should use Promise.all for concurrent execution", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should use Promise.all
      const promiseAllMatches = (content.match(/Promise\.all/g) || []).length;
      expect(promiseAllMatches).toBeGreaterThanOrEqual(2); // markViewed + markAllViewed
    });
  });

  describe("AC-7: Return count of marked items", () => {
    it("should return object with marked count from unviewedItems.length", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should return { marked: unviewedItems.length }
      expect(content).toMatch(/return\s*\{\s*marked\s*:\s*unviewedItems\.length\s*\}/);
    });
  });

  describe("AC-8: Verify type safety", () => {
    it("should have proper TypeScript types", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have mutation function definition
      expect(content).toMatch(/export const markAllViewed\s*=\s*mutation/);

      // Should have proper args typing
      expect(content).toMatch(/args\s*:\s*markAllViewedArgs/);
    });
  });
});
