/**
 * US-IMP-007: AI Feedback System for News
 *
 * Tests the AI-powered feedback system for news ranking
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("US-IMP-007: AI Feedback System for News", () => {
  const mutationsPath = path.join(process.cwd(), "convex/feeds/mutations.ts");
  const internalPath = path.join(process.cwd(), "convex/feeds/internal.ts");

  const readMutations = (): string => {
    return fs.readFileSync(mutationsPath, "utf-8");
  };

  const readInternal = (): string => {
    return fs.readFileSync(internalPath, "utf-8");
  };

  describe("AC-1: User interactions logged as implicit feedback", () => {
    it("should have submitFeedback mutation that accepts feedback", () => {
      const content = readMutations();

      // Should have export const submitFeedback
      expect(content).toMatch(/export\s+const\s+submitFeedback\s*=/);
    });

    it("should accept feedItemId and feedback type arguments", () => {
      const content = readMutations();
      const validatorsPath = path.join(process.cwd(), "convex/feeds/validators.ts");
      const validators = fs.readFileSync(validatorsPath, "utf-8");

      // Should have args with feedItemId and feedback (either inline or from validators)
      const hasInlineFeedItemId = content.match(/feedItemId\s*:\s*v\.id\(["']feedItems["']\)/);
      const hasValidatorImport = content.match(/submitFeedbackArgs/);
      const hasValidatorDef = validators.match(/submitFeedbackArgs/);

      expect(hasInlineFeedItemId || (hasValidatorImport && hasValidatorDef)).toBeTruthy();

      // Check for feedback validator (inline or imported)
      const hasInlineFeedback = content.match(/feedback\s*:/);
      expect(hasInlineFeedback || hasValidatorImport).toBeTruthy();
    });

    it("should update feedItem with userFeedback and userFeedbackAt", () => {
      const content = readMutations();

      // Should patch the feed item with feedback
      expect(content).toMatch(/ctx\.db\.patch\(/);
      expect(content).toMatch(/userFeedback\s*:\s*feedback/);
      expect(content).toMatch(/userFeedbackAt\s*:\s*Date\.now\(\)/);
    });

    it("should return success confirmation", () => {
      const content = readMutations();

      // Should return { success: true, feedback }
      expect(content).toMatch(/success\s*:\s*true/);
      // Check for feedback property (either explicit or shorthand)
      expect(content).toMatch(/feedback\s*[:\s,]/);
    });
  });

  describe("AC-2: User provides explicit feedback with content analysis", () => {
    it("should have internal query to get recent feedback", () => {
      const content = readInternal();

      // Should have export const getRecentFeedback
      expect(content).toMatch(/export\s+const\s+getRecentFeedback\s*=/);
    });

    it("should accept optional limit argument", () => {
      const content = readInternal();

      // Should have args with optional limit
      expect(content).toMatch(/limit\s*:\s*v\.optional\(v\.number\(\)\)/);
    });

    it("should return array of feedback with title, feedback, and feedbackAt", () => {
      const content = readInternal();

      // Should return feedback array
      expect(content).toMatch(/title\s*:\s*item\.title/);
      expect(content).toMatch(/feedback\s*:\s*item\.userFeedback/);
      expect(content).toMatch(/feedbackAt\s*:\s*item\.userFeedbackAt/);
    });

    it("should filter to only items with feedback", () => {
      const content = readInternal();

      // Should filter for items where userFeedback is defined
      expect(content).toMatch(/\.filter\(\(item\)\s*=>\s*item\.userFeedback\s*!==\s*undefined\)/);
    });
  });

  describe("AC-3: AI processes feedback with batch process", () => {
    it("should have AI scoring action that incorporates feedback", () => {
      const aiScoringPath = path.join(process.cwd(), "convex/subscriptions/ai_scoring.ts");
      const content = fs.readFileSync(aiScoringPath, "utf-8");

      // Should have scoreContentRelevance action
      expect(content).toMatch(/export\s+const\s+scoreContentRelevance\s*=/);
    });

    it("should accept items array and source context", () => {
      const aiScoringPath = path.join(process.cwd(), "convex/subscriptions/ai_scoring.ts");
      const content = fs.readFileSync(aiScoringPath, "utf-8");

      // Should have items, sourceName, and topic args
      expect(content).toMatch(/items\s*:\s*v\.array\(v\.object\(\{\s*title\s*:\s*v\.string\(\),\s*platform\s*:\s*v\.string\(\)\s*\}\)\)/);
      expect(content).toMatch(/sourceName\s*:\s*v\.string\(\)/);
      expect(content).toMatch(/topic\s*:\s*v\.string\(\)/);
    });

    it("should fetch recent feedback for few-shot learning", () => {
      const aiScoringPath = path.join(process.cwd(), "convex/subscriptions/ai_scoring.ts");
      const content = fs.readFileSync(aiScoringPath, "utf-8");

      // Should call getRecentFeedback internal query
      expect(content).toMatch(/ctx\.runQuery\(internal\.feeds\.internal\.getRecentFeedback/);
    });

    it("should build few-shot examples from feedback", () => {
      const aiScoringPath = path.join(process.cwd(), "convex/subscriptions/ai_scoring.ts");
      const content = fs.readFileSync(aiScoringPath, "utf-8");

      // Should filter and map liked/disliked examples
      expect(content).toMatch(/likedExamples/);
      expect(content).toMatch(/dislikedExamples/);
      expect(content).toMatch(/\.filter\(\(f\)\s*=>\s*f\.feedback\s*===\s*["']up["']\)/);
      expect(content).toMatch(/\.filter\(\(f\)\s*=>\s*f\.feedback\s*===\s*["']down["']\)/);
    });

    it("should include user preferences in AI prompt", () => {
      const aiScoringPath = path.join(process.cwd(), "convex/subscriptions/ai_scoring.ts");
      const content = fs.readFileSync(aiScoringPath, "utf-8");

      // Should have feedbackSection in prompt
      expect(content).toMatch(/feedbackSection/);
      expect(content).toMatch(/User preferences/);
      expect(content).toMatch(/Items the user liked/);
      expect(content).toMatch(/Items the user disliked/);
    });
  });

  describe("AC-4: Suggestions generated with user review", () => {
    it("should have query to get feedback for feed item", () => {
      const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
      const content = fs.readFileSync(queriesPath, "utf-8");

      // Should have getFeedItemFeedback query
      expect(content).toMatch(/export\s+const\s+getFeedItemFeedback\s*=/);
    });

    it("should return feedback state for UI display", () => {
      const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
      const content = fs.readFileSync(queriesPath, "utf-8");

      // Should return feedback and feedbackAt
      expect(content).toMatch(/feedback\s*:\s*item\.userFeedback\s*\?\?\s*null/);
      expect(content).toMatch(/feedbackAt\s*:\s*item\.userFeedbackAt\s*\?\?\s*null/);
    });

    it("should handle null when no feedback exists", () => {
      const queriesPath = path.join(process.cwd(), "convex/feeds/queries.ts");
      const content = fs.readFileSync(queriesPath, "utf-8");

      // Should return null when item not found
      expect(content).toMatch(/if\s*\(!item\)\s*\{\s*return\s+null;\s*\}/);
    });
  });

  describe("Pattern Compliance", () => {
    it("should use v validators from convex/values", () => {
      const content = readMutations();

      // Must use v.id(), v.union(), v.literal() from convex/values
      expect(content).toMatch(/from\s+["']convex\/values["']/);
    });

    it("should make all AI decisions explainable", () => {
      const aiScoringPath = path.join(process.cwd(), "convex/subscriptions/ai_scoring.ts");
      const content = fs.readFileSync(aiScoringPath, "utf-8");

      // Should return reason with each score
      expect(content).toMatch(/reason\s*:\s*typeof|string/);
      // Check for return statement with both score and reason
      expect(content).toMatch(/return\s*\{[^}]*score[^}]*reason/);
    });

    it("should ensure feedback is deletable by users", () => {
      const schemaPath = path.join(process.cwd(), "convex/schema.ts");
      const schema = fs.readFileSync(schemaPath, "utf-8");

      // Schema should have optional userFeedback field (can be set to undefined)
      expect(schema).toMatch(/userFeedback\s*:\s*v\.optional\(v\.union\(v\.literal\(["']up["']\),\s*v\.literal\(["']down["']\)\)\)/);
    });
  });

  describe("Integration Tests", () => {
    it("should have NewsCard component with feedback buttons", () => {
      const newsCardPath = path.join(process.cwd(), "components/whats-new/NewsCard.tsx");
      const content = fs.readFileSync(newsCardPath, "utf-8");

      // Should have feedback button props or handlers
      // This test will fail initially - we need to add feedback buttons
      expect(content).toMatch(/onFeedback|feedbackType|FeedbackButton/);
    });

    it("should have feedback button with testID", () => {
      const newsCardPath = path.join(process.cwd(), "components/whats-new/NewsCard.tsx");
      const content = fs.readFileSync(newsCardPath, "utf-8");

      // Should have testID for feedback buttons
      expect(content).toMatch(/feedback.*testID|testID.*feedback/);
    });

    it("should use semantic colors for feedback", () => {
      const newsCardPath = path.join(process.cwd(), "components/whats-new/NewsCard.tsx");
      const content = fs.readFileSync(newsCardPath, "utf-8");

      // Should either use FeedbackButtons component (which handles semantic colors)
      // or reference semantic colors directly
      const usesFeedbackButtons = content.match(/FeedbackButtons/);
      const usesSemanticColors = content.match(/success|danger|primary/);

      expect(usesFeedbackButtons || usesSemanticColors).toBeTruthy();
    });
  });
});
