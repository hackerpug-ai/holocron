/**
 * Tests for refinement detection helpers.
 *
 * Covers startsWithRefinementPhrase — the pure lexicon-based function
 * that determines if a user message is refining a prior tool result.
 */

import { describe, it, expect } from "vitest";
import { startsWithRefinementPhrase, REFINEMENT_LEXICON } from "./refinement";

describe("startsWithRefinementPhrase", () => {
  describe("lexicon coverage — each phrase triggers true", () => {
    it("returns true for 'expand the search...'", () => {
      expect(startsWithRefinementPhrase("expand the search to include the Bay Area")).toBe(true);
    });

    it("returns true for 'also add...'", () => {
      expect(startsWithRefinementPhrase("also add coaches who specialize in ADHD")).toBe(true);
    });

    it("returns true for 'include...'", () => {
      expect(startsWithRefinementPhrase("include results from the East Coast")).toBe(true);
    });

    it("returns true for 'add...'", () => {
      expect(startsWithRefinementPhrase("add more results in tech sector")).toBe(true);
    });

    it("returns true for 'try...'", () => {
      expect(startsWithRefinementPhrase("try searching for executive coaches")).toBe(true);
    });

    it("returns true for 'instead...'", () => {
      expect(startsWithRefinementPhrase("instead show me life coaches")).toBe(true);
    });

    it("returns true for 'what about...'", () => {
      expect(startsWithRefinementPhrase("what about coaches in Seattle?")).toBe(true);
    });

    it("returns true for 'refine...'", () => {
      expect(startsWithRefinementPhrase("refine the results to show only certified coaches")).toBe(true);
    });

    it("returns true for 'narrow...'", () => {
      expect(startsWithRefinementPhrase("narrow it down to coaches under $200/hr")).toBe(true);
    });

    it("returns true for 'broaden...'", () => {
      expect(startsWithRefinementPhrase("broaden the search to include adjacent fields")).toBe(true);
    });

    it("returns true for 'more...'", () => {
      expect(startsWithRefinementPhrase("more results please")).toBe(true);
    });

    it("returns true for 'less...'", () => {
      expect(startsWithRefinementPhrase("less focus on certifications")).toBe(true);
    });

    it("returns true for 'but...'", () => {
      expect(startsWithRefinementPhrase("but only show ones with 5-star reviews")).toBe(true);
    });

    it("returns true for 'now...'", () => {
      expect(startsWithRefinementPhrase("now filter by location")).toBe(true);
    });

    it("returns true for 'actually...'", () => {
      expect(startsWithRefinementPhrase("actually, show me coaches in Austin")).toBe(true);
    });
  });

  describe("case insensitivity", () => {
    it("returns true for 'Expand...' (title case)", () => {
      expect(startsWithRefinementPhrase("Expand the search to include the Bay Area")).toBe(true);
    });

    it("returns true for 'EXPAND...' (upper case)", () => {
      expect(startsWithRefinementPhrase("EXPAND the search to include the Bay Area")).toBe(true);
    });

    it("returns true for 'expand...' (lower case)", () => {
      expect(startsWithRefinementPhrase("expand the search to include the Bay Area")).toBe(true);
    });

    it("returns true for 'What About...' (mixed case)", () => {
      expect(startsWithRefinementPhrase("What About coaches in Seattle?")).toBe(true);
    });
  });

  describe("leading whitespace handling", () => {
    it("returns true with leading spaces before expand", () => {
      expect(startsWithRefinementPhrase("  expand the search")).toBe(true);
    });

    it("returns true with leading tab before also", () => {
      expect(startsWithRefinementPhrase("\talso add more results")).toBe(true);
    });
  });

  describe("non-refinement messages return false", () => {
    it("returns false for 'find me a coach'", () => {
      expect(startsWithRefinementPhrase("find me a coach")).toBe(false);
    });

    it("returns false for 'what is RAG?'", () => {
      expect(startsWithRefinementPhrase("what is RAG?")).toBe(false);
    });

    it("returns false for 'save this'", () => {
      expect(startsWithRefinementPhrase("save this")).toBe(false);
    });

    it("returns false for a sentence containing lexicon word mid-sentence", () => {
      expect(startsWithRefinementPhrase("I want to expand my business")).toBe(false);
    });

    it("returns false for 'show me career coaches in NYC'", () => {
      expect(startsWithRefinementPhrase("show me career coaches in NYC")).toBe(false);
    });
  });

  describe("empty and whitespace-only strings", () => {
    it("returns false for empty string", () => {
      expect(startsWithRefinementPhrase("")).toBe(false);
    });

    it("returns false for whitespace-only string", () => {
      expect(startsWithRefinementPhrase("   ")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns true for 'expand' alone (no trailing content)", () => {
      expect(startsWithRefinementPhrase("expand")).toBe(true);
    });

    it("returns false for 'expander' (expand followed by letter, not boundary)", () => {
      expect(startsWithRefinementPhrase("expander")).toBe(false);
    });

    it("returns true for 'more.' (ends with punctuation)", () => {
      expect(startsWithRefinementPhrase("more.")).toBe(true);
    });

    it("returns true for 'but, show me' (comma after phrase)", () => {
      expect(startsWithRefinementPhrase("but, show me different results")).toBe(true);
    });
  });

  describe("REFINEMENT_LEXICON export", () => {
    it("exports REFINEMENT_LEXICON as array", () => {
      expect(Array.isArray(REFINEMENT_LEXICON)).toBe(true);
    });

    it("REFINEMENT_LEXICON contains 'expand'", () => {
      expect(REFINEMENT_LEXICON).toContain("expand");
    });

    it("REFINEMENT_LEXICON contains 'what about'", () => {
      expect(REFINEMENT_LEXICON).toContain("what about");
    });
  });
});
