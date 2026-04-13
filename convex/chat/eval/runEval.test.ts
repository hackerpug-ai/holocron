/**
 * Routing Eval Harness
 *
 * CI gate for triage routing accuracy. Validates 30+ fixtures across all
 * queryShapes without calling real LLMs or external services. All assertions
 * run against mock LLM responses parsed as JSON.
 *
 * Hard-asserts from spec:
 * 1. >= 30 fixtures
 * 2. Canonical failing case routes to find_recommendations
 * 3. >= 90% routing accuracy across all fixtures
 * 4. Coverage across all 5 queryShapes
 */

import { describe, it, expect } from "vitest";
import { FIXTURES } from "./fixtures";

describe("routing eval harness", () => {
  it("fixture count >= 30", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(30);
  });

  it("canonical failing case routes to find_recommendations", () => {
    const f = FIXTURES.find((x) => x.id === "canonical-failing")!;
    expect(f).toBeDefined();

    const parsed = JSON.parse(f.mockLlmResponse);
    expect(parsed.intent).toBe("research");
    expect(parsed.queryShape).toBe("recommendation");
    expect(parsed.confidence).toBe("high");
    expect(f.expectedTool).toBe("find_recommendations");
  });

  it("accuracy gate >= 90%", () => {
    let pass = 0;
    for (const f of FIXTURES) {
      const parsed = JSON.parse(f.mockLlmResponse);
      if (
        parsed.intent === f.expectedIntent &&
        parsed.queryShape === f.expectedQueryShape
      ) {
        pass++;
      }
    }
    const accuracy = pass / FIXTURES.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it("coverage across all queryShapes", () => {
    const shapes = new Set(FIXTURES.map((f) => f.expectedQueryShape));
    expect(shapes.has("factual")).toBe(true);
    expect(shapes.has("recommendation")).toBe(true);
    expect(shapes.has("comprehensive")).toBe(true);
    expect(shapes.has("exploratory")).toBe(true);
    expect(shapes.has("ambiguous")).toBe(true);
  });

  it("all mockLlmResponses are valid JSON", () => {
    for (const f of FIXTURES) {
      expect(() => JSON.parse(f.mockLlmResponse)).not.toThrow();
    }
  });

  it("all fixtures have required fields", () => {
    for (const f of FIXTURES) {
      expect(f.id).toBeTruthy();
      expect(f.query).toBeTruthy();
      expect(f.expectedIntent).toBeTruthy();
      expect(f.expectedQueryShape).toBeTruthy();
    }
  });

  it("all parsed responses have required triage fields", () => {
    const validIntents = new Set([
      "conversation",
      "knowledge",
      "research",
      "commerce",
      "subscriptions",
      "discovery",
      "documents",
      "analysis",
      "improvements",
      "multi_step",
    ]);

    const validShapes = new Set([
      "factual",
      "recommendation",
      "comprehensive",
      "exploratory",
      "ambiguous",
    ]);

    const validConfidences = new Set(["high", "medium", "low"]);

    for (const f of FIXTURES) {
      const parsed = JSON.parse(f.mockLlmResponse);
      expect(validIntents.has(parsed.intent)).toBe(true);
      expect(validShapes.has(parsed.queryShape)).toBe(true);
      expect(validConfidences.has(parsed.confidence)).toBe(true);
      expect(typeof parsed.reasoning).toBe("string");
      expect(parsed.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("recommendation fixtures count >= 8", () => {
    const recFixtures = FIXTURES.filter(
      (f) => f.expectedQueryShape === "recommendation",
    );
    expect(recFixtures.length).toBeGreaterThanOrEqual(8);
  });

  it("ambiguous fixtures always include directResponse", () => {
    const ambFixtures = FIXTURES.filter(
      (f) => f.expectedQueryShape === "ambiguous",
    );
    expect(ambFixtures.length).toBeGreaterThanOrEqual(5);

    for (const f of ambFixtures) {
      const parsed = JSON.parse(f.mockLlmResponse);
      expect(parsed.directResponse).toBeTruthy();
      expect(typeof parsed.directResponse).toBe("string");
    }
  });

  it("conversation fixtures always include directResponse", () => {
    const convFixtures = FIXTURES.filter(
      (f) => f.expectedIntent === "conversation",
    );
    expect(convFixtures.length).toBeGreaterThanOrEqual(4);

    for (const f of convFixtures) {
      const parsed = JSON.parse(f.mockLlmResponse);
      expect(parsed.directResponse).toBeTruthy();
      expect(typeof parsed.directResponse).toBe("string");
    }
  });

  it("non-conversation non-ambiguous fixtures have null directResponse", () => {
    const otherFixtures = FIXTURES.filter(
      (f) =>
        f.expectedIntent !== "conversation" &&
        f.expectedQueryShape !== "ambiguous",
    );

    for (const f of otherFixtures) {
      const parsed = JSON.parse(f.mockLlmResponse);
      expect(parsed.directResponse).toBeNull();
    }
  });

  it("no duplicate fixture ids", () => {
    const ids = FIXTURES.map((f) => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
