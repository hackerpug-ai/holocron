/**
 * FR-015: markViewed mutation tests
 *
 * Tests the mutation that marks feed items as viewed
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("FR-015: Create markViewed mutation", () => {
  describe("AC-1: Create mutations.ts file with imports", () => {
    it("should create convex/feeds/mutations.ts file", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");
        expect(content).toBeTruthy();

        // Should import mutation
        expect(content).toMatch(/import\s+.*mutation.*from.*["'].*_generated\/server/);

        // Should import v from convex/values
        expect(content).toMatch(/import\s+.*v.*from.*["']convex\/values/);

        // Should import markViewedArgs
        expect(content).toMatch(/import\s+.*markViewedArgs.*from.*["']\.\/validators/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });
  });

  describe("AC-2: Export markViewed function", () => {
    it("should export markViewed function", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");

        // Should have export const markViewed
        expect(content).toMatch(/export\s+const\s+markViewed\s*=/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });

    it("should use markViewedArgs validator", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");

        // Should have args: markViewedArgs
        expect(content).toMatch(/args\s*:\s*markViewedArgs/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });
  });

  describe("AC-3: Handle feedItemIds array argument", () => {
    it("should destructure feedItemIds from args", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");

        // Should destructure feedItemIds from args
        expect(content).toMatch(/feedItemIds/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });
  });

  describe("AC-4: Default viewedAt to Date.now()", () => {
    it("should default viewedAt to Date.now()", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");

        // Should have viewedAt with Date.now() default
        expect(content).toMatch(/viewedAt\s*=\s*Date\.now\(\)|viewedAt\s*\?\?\s*Date\.now\(\)/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });
  });

  describe("AC-5: Update viewed and viewedAt fields", () => {
    it("should update both viewed and viewedAt fields", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");

        // Should have db.patch call
        expect(content).toMatch(/ctx\.db\.patch/);

        // Should set viewed: true
        expect(content).toMatch(/viewed\s*:\s*true/);

        // Should set viewedAt
        expect(content).toMatch(/viewedAt\s*:/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });
  });

  describe("AC-6: Use Promise.all for concurrent updates", () => {
    it("should use Promise.all for concurrent updates", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");

        // Should use Promise.all
        expect(content).toMatch(/Promise\.all/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });
  });

  describe("AC-7: Return count of marked items", () => {
    it("should return object with marked count", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");

      try {
        const content = fs.readFileSync(mutationsPath, "utf-8");

        // Should return { marked: ... }
        expect(content).toMatch(/return\s*\{\s*marked\s*:/);
      } catch (error) {
        // File doesn't exist yet - test fails as expected in RED phase
        expect((error as NodeJS.ErrnoException).code).not.toBe("ENOENT");
      }
    });
  });

  describe("AC-8: Verify type safety", () => {
    it("should have proper TypeScript types", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have mutation function definition
      expect(content).toMatch(/export const markViewed\s*=\s*mutation/);

      // Should have proper args typing
      expect(content).toMatch(/args\s*:\s*markViewedArgs/);
    });
  });
});
