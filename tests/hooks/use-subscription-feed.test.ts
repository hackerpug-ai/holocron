/**
 * FR-019: useSubscriptionFeed hook tests
 *
 * Tests the custom hook that fetches feed items from Convex
 * with filtering and pagination support
 *
 * NOTE: These tests verify implementation structure and patterns.
 * Full integration testing requires a React environment with
 * ConvexProvider and @testing-library/react.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("FR-019: Create useSubscriptionFeed hook", () => {
  const hookPath = join(process.cwd(), "hooks/use-subscription-feed.ts");

  const readHook = (): string => {
    return readFileSync(hookPath, "utf-8");
  };

  describe("AC-1: Hook fetches feed items with useQuery", () => {
    it("should create hooks/use-subscription-feed.ts file", () => {
      const content = readHook();
      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    });

    it("should import useQuery from convex/react", () => {
      const content = readHook();
      expect(content).toMatch(/import\s+.*useQuery.*from\s+["']convex\/react["']/);
    });

    it("should import api from convex generated API", () => {
      const content = readHook();
      expect(content).toMatch(/import\s+.*api.*from\s+["']@\/convex\/_generated\/api["']/);
    });

    it("should call useQuery with api.feeds.queries.getFeed", () => {
      const content = readHook();
      expect(content).toMatch(/useQuery\(\s*api\.feeds\.queries\.getFeed/);
    });

    it("should export useSubscriptionFeed function", () => {
      const content = readHook();
      expect(content).toMatch(/export\s+function\s+useSubscriptionFeed/);
    });

    it("should destructure data, isLoading, and error from useQuery", () => {
      const content = readHook();
      // Verify proper destructuring pattern
      // Note: Convex's useQuery returns data directly, not { data, isLoading, error }
      // The hook should assign useQuery result to feedItems variable
      expect(content).toMatch(/const\s+feedItems\s*=\s*useQuery/);
    });
  });

  describe("AC-2: Hook supports contentType filtering", () => {
    it("should accept contentType parameter in interface", () => {
      const content = readHook();
      expect(content).toMatch(/contentType\s*\??:\s*["']video["']\s*\|\s*["']blog["']\s*\|\s*["']social["']/);
    });

    it("should pass contentType to useQuery args", () => {
      const content = readHook();
      expect(content).toMatch(/contentType:\s*queryContentType/);
    });
  });

  describe("AC-3: Hook implements pagination", () => {
    it("should accept limit parameter with default value", () => {
      const content = readHook();
      // The default value is set in the function parameter, not interface
      expect(content).toMatch(/limit\s*=\s*20/);
    });

    it("should pass limit to useQuery args", () => {
      const content = readHook();
      // Updated for FR-032: Pagination uses currentLimit state variable
      expect(content).toMatch(/limit:\s*currentLimit/);
    });

    it("should return hasMore indicator based on items length", () => {
      const content = readHook();
      // Updated for FR-032: hasMore is declared as const, not inline in return
      expect(content).toMatch(/const hasMore = \(filteredItems\?\.length\s*\?\?\s*0\)\s*>=\s*limit/);
    });
  });

  describe("AC-4: Hook handles loading state", () => {
    it("should return isLoading state", () => {
      const content = readHook();
      expect(content).toMatch(/isLoading:/);
    });

    it("should set isLoading based on feedItems being undefined", () => {
      const content = readHook();
      // Convex's useQuery returns undefined when loading
      expect(content).toMatch(/isLoading:\s*feedItems\s*===\s*undefined/);
    });
  });

  describe("AC-5: Hook handles error state", () => {
    it("should return error state", () => {
      const content = readHook();
      expect(content).toMatch(/error:/);
    });

    it("should note that Convex uses error boundaries for error handling", () => {
      const content = readHook();
      // Should have comment explaining error handling
      expect(content).toMatch(/Convex useQuery doesn't expose errors directly|error boundaries/);
    });

    it("should not destructured non-existent error property from useQuery", () => {
      const content = readHook();
      // Should NOT try to destructure error from useQuery (Convex doesn't provide it)
      expect(content).not.toMatch(/\{\s*data:\s*\w+,\s*isLoading,\s*error\s*\}\s*=\s*useQuery/);
    });
  });

  describe("AC-6: Hook supports search query filtering", () => {
    it("should accept searchQuery parameter", () => {
      const content = readHook();
      expect(content).toMatch(/searchQuery\s*\??:\s*string/);
    });

    it("should filter items client-side when searchQuery provided", () => {
      const content = readHook();
      // Should have client-side filtering logic
      expect(content).toMatch(/searchQuery\s*&&\s*feedItems/);
      expect(content).toMatch(/\.filter\(/);
    });

    it("should filter on title and summary fields", () => {
      const content = readHook();
      expect(content).toMatch(/title\?\.toLowerCase\(\)\s*\|\|\s*['"]['']/);
      expect(content).toMatch(/summary\?\.toLowerCase\(\)/);
    });

    it("should use case-insensitive search", () => {
      const content = readHook();
      expect(content).toMatch(/\.toLowerCase\(\)/);
    });
  });

  describe("Type Safety", () => {
    it("should have proper TypeScript interface for args", () => {
      const content = readHook();
      expect(content).toMatch(/interface\s+UseSubscriptionFeedArgs/);
    });

    it("should return typed result object with all required fields", () => {
      const content = readHook();
      // Should return object with items, isLoading, error, hasMore, loadMore, reset (FR-032 additions)
      // Updated to match shorthand syntax: hasMore, loadMore, reset
      expect(content).toMatch(/return\s*\{[\s\S]*items:[\s\S]*isLoading:[\s\S]*error:[\s\S]*hasMore/);
    });

    it("should provide empty array fallback for items", () => {
      const content = readHook();
      expect(content).toMatch(/items:\s*filteredItems\s*\?\?\s*\[\]/);
    });
  });

  describe("Edge Cases & Safety", () => {
    it("should handle null/undefined title with optional chaining", () => {
      const content = readHook();
      // Should have optional chaining on title
      expect(content).toMatch(/title\?\.toLowerCase\(\)\s*\|\|\s*['"]['"]/);
    });

    it("should handle null/undefined summary with optional chaining", () => {
      const content = readHook();
      // Should have optional chaining on summary
      expect(content).toMatch(/summary\?\.toLowerCase\(\)/);
    });

    it("should handle empty searchQuery gracefully", () => {
      const content = readHook();
      // When searchQuery is falsy, return all items
      expect(content).toMatch(/searchQuery\s*&&\s*feedItems\s*\?\s*[\s\S]*:\s*feedItems/);
    });

    it("should handle empty feedItems gracefully", () => {
      const content = readHook();
      // Should return empty array when no items
      expect(content).toMatch(/filteredItems\s*\?\?\s*\[\]/);
    });
  });

  describe("Integration with Convex", () => {
    it("should call getFeed query with correct parameter structure", () => {
      const content = readHook();
      // Verify the query call structure
      expect(content).toMatch(/useQuery\(\s*api\.feeds\.queries\.getFeed,\s*\{[\s\S]*limit[\s\S]*contentType[\s\S]*viewed[\s\S]*\}/);
    });

    it("should support viewed parameter for filtering", () => {
      const content = readHook();
      expect(content).toMatch(/viewed\s*\??:\s*boolean/);
      expect(content).toMatch(/viewed/);
    });
  });
});
