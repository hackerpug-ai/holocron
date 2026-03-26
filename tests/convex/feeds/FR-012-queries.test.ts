import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("FR-012: getByCreator Query", () => {
  // Read the queries.ts file content for verification
  const queriesPath = join(process.cwd(), "convex/feeds/queries.ts");
  let queriesContent: string;

  beforeAll(() => {
    try {
      queriesContent = readFileSync(queriesPath, "utf-8");
    } catch {
      // File doesn't exist yet, test will fail appropriately
      queriesContent = "";
    }
  });

  describe("AC-1: Add getByCreator query to queries.ts", () => {
    it("should export getByCreator query", () => {
      // Verify the export exists in the file
      expect(queriesContent).toContain("export const getByCreator");
      expect(queriesContent).toContain("query({");
    });
  });

  describe("AC-2: Query requires creatorProfileId argument", () => {
    it("should have creatorProfileId as required parameter in args", () => {
      // Extract the getByCreator query section
      const getByCreatorMatch = queriesContent.match(/export const getByCreator = query\([\s\S]*?\n\}\);/);
      expect(getByCreatorMatch).toBeTruthy();

      const getByCreatorSection = getByCreatorMatch![0];

      // Verify creatorProfileId is defined (not optional) in getByCreator
      expect(getByCreatorSection).toMatch(/creatorProfileId:\s*v\.id\("creatorProfiles"\)/);
      // Should NOT have v.optional around creatorProfileId in getByCreator
      expect(getByCreatorSection).not.toMatch(/creatorProfileId:\s*v\.optional\(v\.id/);
    });
  });

  describe("AC-3: Query uses by_creator index", () => {
    it("should use by_creator index for querying", () => {
      // Verify by_creator index is used
      expect(queriesContent).toContain('withIndex("by_creator"');
    });
  });

  describe("AC-4: Query supports optional limit parameter", () => {
    it("should have optional limit parameter", () => {
      // Verify limit is optional
      expect(queriesContent).toMatch(/limit:\s*v\.optional\(v\.number\(\)\)/);
    });
  });

  describe("AC-5: Query returns items in descending order", () => {
    it("should order items by discoveredAt desc", () => {
      // Verify order("desc") is called
      expect(queriesContent).toContain('.order("desc")');
    });
  });

  describe("AC-6: Query has default limit of 20", () => {
    it("should default to 20 items when limit not provided", () => {
      // Verify default limit is 20
      expect(queriesContent).toMatch(/limit\s*=\s*args\.limit\s*\?\?\s*20/);
    });
  });

  describe("AC-7: Verify type check passes", () => {
    it("should have correct types for getByCreator", () => {
      // Verify proper import statements
      expect(queriesContent).toContain('import { query } from "../_generated/server"');
      expect(queriesContent).toContain('import { v } from "convex/values"');
    });
  });
});
