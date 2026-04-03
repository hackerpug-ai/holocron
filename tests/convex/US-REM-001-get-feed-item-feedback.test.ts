/**
 * US-REM-001: getFeedItemFeedback query tests
 *
 * Tests the query that fetches feedback state for a single feed item
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("US-REM-001: Add getFeedItemFeedback Query", () => {
  const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");

  const readQueries = (): string => {
    return fs.readFileSync(queriesPath, "utf-8");
  };

  describe("AC-1: Feed item exists with 'up' feedback", () => {
    it("should export getFeedItemFeedback function", () => {
      const content = readQueries();

      // Should have export const getFeedItemFeedback
      expect(content).toMatch(/export\s+const\s+getFeedItemFeedback\s*=/);
    });

    it("should accept feedItemId argument with v.id() validator", () => {
      const content = readQueries();

      // Should have args with feedItemId: v.id("feedItems")
      expect(content).toMatch(/feedItemId\s*:\s*v\.id\(["']feedItems["']\)/);
    });

    it("should return object with feedback and feedbackAt fields", () => {
      const content = readQueries();

      // Should return { feedback: ..., feedbackAt: ... }
      expect(content).toMatch(/feedback\s*:/);
      expect(content).toMatch(/feedbackAt\s*:/);
    });

    it("should return feedback from userFeedback field", () => {
      const content = readQueries();

      // Should access item.userFeedback
      expect(content).toMatch(/userFeedback/);
    });

    it("should return feedbackAt from userFeedbackAt field", () => {
      const content = readQueries();

      // Should access item.userFeedbackAt
      expect(content).toMatch(/userFeedbackAt/);
    });
  });

  describe("AC-2: Feed item exists with no feedback", () => {
    it("should return null for feedback when userFeedback is undefined", () => {
      const content = readQueries();

      // Should use nullish coalescing or similar to return null
      expect(content).toMatch(/userFeedback\s*\?\?\s*null/);
    });

    it("should return null for feedbackAt when userFeedbackAt is undefined", () => {
      const content = readQueries();

      // Should use nullish coalescing or similar to return null
      expect(content).toMatch(/userFeedbackAt\s*\?\?\s*null/);
    });
  });

  describe("AC-3: Feed item doesn't exist", () => {
    it("should return null when feed item not found", () => {
      const content = readQueries();

      // Should check if item exists and return null
      expect(content).toMatch(/if\s*\(!item\)/);
      expect(content).toMatch(/return\s+null/);
    });

    it("should not throw error for missing feed item", () => {
      const content = readQueries();

      // Should NOT throw error - return null instead
      // The pattern should be return null, not throw new Error
      const lines = content.split("\n");
      const itemNotFoundBlock = lines.join("\n").match(/if\s*\(!item\)\s*\{[\s\S]*?\n\s*\}/);

      expect(itemNotFoundBlock).toBeTruthy();
      if (itemNotFoundBlock) {
        expect(itemNotFoundBlock[0]).not.toMatch(/throw/);
      }
    });
  });

  describe("AC-4: Query is called from frontend", () => {
    it("should use query function from _generated/server", () => {
      const content = readQueries();

      // Should use query function
      expect(content).toMatch(/getFeedItemFeedback\s*=\s*query\(/);
    });

    it("should be exported from feeds/index.ts", () => {
      const indexPath = path.join(process.cwd(), "convex/feeds/index.ts");
      const indexContent = fs.readFileSync(indexPath, "utf-8");

      // The index file exports everything from queries.ts
      // This ensures the query is available via api.feeds.queries.getFeedItemFeedback
      expect(indexContent).toMatch(/export\s+\*\s+from\s+["']\.\/queries["']/);
    });

    it("should have proper TypeScript return type", () => {
      const content = readQueries();

      // Should have proper return structure with null handling
      expect(content).toMatch(/feedback\s*:\s*item\.userFeedback\s*\?\?\s*null/);
      expect(content).toMatch(/feedbackAt\s*:\s*item\.userFeedbackAt\s*\?\?\s*null/);
    });
  });

  describe("Type Safety and Implementation", () => {
    it("should use v.id() validator for feedItemId", () => {
      const content = readQueries();

      // Must use v.id() validator, not v.string() or other types
      expect(content).toMatch(/feedItemId\s*:\s*v\.id\(["']feedItems["']\)/);
    });

    it("should return null for missing data (not throw)", () => {
      const content = readQueries();

      // Should return null when item doesn't exist
      // Check for the pattern of if (!item) followed by return null
      expect(content).toMatch(/if\s*\(!item\)/);
      expect(content).toMatch(/return\s+null/);
    });

    it("should keep implementation under 30 lines", () => {
      const content = readQueries();

      // Find the getFeedItemFeedback function
      const match = content.match(/export const getFeedItemFeedback[\s\S]*?^\}/m);

      expect(match).toBeTruthy();

      if (match) {
        const lines = match[0].split("\n");
        // Should be under 30 lines (as per spec)
        expect(lines.length).toBeLessThanOrEqual(30);
      }
    });
  });

  describe("Code Pattern Compliance", () => {
    it("should follow existing query pattern in queries.ts", () => {
      const content = readQueries();

      // Should have proper query structure
      expect(content).toMatch(/export const getFeedItemFeedback\s*=\s*query\(\{\s*args\s*:/);
    });

    it("should use async handler function", () => {
      const content = readQueries();

      // Should have async handler
      expect(content).toMatch(/handler\s*:\s*async\s*\(ctx,\s*args\)/);
    });

    it("should fetch feed item using ctx.db.get()", () => {
      const content = readQueries();

      // Should use ctx.db.get(feedItemId)
      expect(content).toMatch(/ctx\.db\.get\(/);
    });
  });
});
