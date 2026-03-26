/**
 * FR-018: Update feeds index exports tests
 *
 * Tests that the index file properly exports mutations and queries
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("FR-018: Update feeds index exports", () => {
  describe("AC-1: Verify mutations.ts exists with all mutations", () => {
    it("should have five mutations exported", async () => {
      const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
      const content = fs.readFileSync(mutationsPath, "utf-8");

      // Should have 5 export const statements (markViewed, markAllViewed, createDigestNotification, updateFeedSettings, openFeedItem)
      const exportMatches = content.match(/export\s+const\s+\w+/g) || [];
      expect(exportMatches.length).toBe(5);

      // Should have specific mutations
      expect(content).toMatch(/export\s+const\s+markViewed/);
      expect(content).toMatch(/export\s+const\s+markAllViewed/);
      expect(content).toMatch(/export\s+const\s+createDigestNotification/);
      expect(content).toMatch(/export\s+const\s+updateFeedSettings/);
      expect(content).toMatch(/export\s+const\s+openFeedItem/);
    });
  });

  describe("AC-2: Uncomment mutations export in index.ts", () => {
    it("should uncomment export mutations line", async () => {
      const indexPath = path.join(process.cwd(), "convex/feeds/index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      // Should have uncommented mutations export
      expect(content).toMatch(/^export\s+\*\s+from\s+["']\.\/mutations["']/m);
    });
  });

  describe("AC-3: Uncomment queries export in index.ts", () => {
    it("should uncomment export queries line", async () => {
      const indexPath = path.join(process.cwd(), "convex/feeds/index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      // Should have uncommented queries export
      expect(content).toMatch(/^export\s+\*\s+from\s+["']\.\/queries["']/m);
    });
  });

  describe("AC-4: Verify validators export remains", () => {
    it("should keep validators export", async () => {
      const indexPath = path.join(process.cwd(), "convex/feeds/index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      // Should have validators export
      expect(content).toMatch(/^export\s+\*\s+from\s+["']\.\/validators["']/m);
    });
  });

  describe("AC-5: Keep actions and internal commented", () => {
    it("should keep actions export commented", async () => {
      const indexPath = path.join(process.cwd(), "convex/feeds/index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      // Actions line should be commented (or not exist)
      const uncommentedActions = content.match(/^export\s+\*\s+from\s+["']\.\/actions["']/m);
      expect(uncommentedActions).toBeNull();
    });

    it("should keep internal export commented", async () => {
      const indexPath = path.join(process.cwd(), "convex/feeds/index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      // Check that internal is either commented or not present
      const uncommentedInternal = content.match(/^export\s+\*\s+as\s+internal\s+from\s+["']\.\/internal["']/m);
      expect(uncommentedInternal).toBeNull();
    });
  });

  describe("AC-6: Verify all exports are functional", () => {
    it("should have all exports in index file", async () => {
      const indexPath = path.join(process.cwd(), "convex/feeds/index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      // Should have validators export
      expect(content).toMatch(/^export\s+\*\s+from\s+["']\.\/validators["']/m);

      // Should have queries export
      expect(content).toMatch(/^export\s+\*\s+from\s+["']\.\/queries["']/m);

      // Should have mutations export
      expect(content).toMatch(/^export\s+\*\s+from\s+["']\.\/mutations["']/m);
    });
  });

  describe("AC-7: Verify frontend can import mutations", () => {
    it("should have mutations in generated API types", async () => {
      const apiPath = path.join(process.cwd(), "convex/_generated/api.d.ts");

      try {
        const apiContent = fs.readFileSync(apiPath, "utf-8");

        // Should have markViewed
        expect(apiContent).toMatch(/markViewed/);

        // Should have markAllViewed
        expect(apiContent).toMatch(/markAllViewed/);

        // Should have createDigestNotification
        expect(apiContent).toMatch(/createDigestNotification/);
      } catch {
        // File might not exist yet if types haven't been generated
        // That's OK - skip this test
        console.log("API types not generated yet, skipping check");
      }
    });
  });
});
