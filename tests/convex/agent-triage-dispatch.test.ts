/**
 * Agent Triage-Dispatch Tests
 *
 * Verifies that the triage-dispatch architecture is correctly wired:
 * - AC-3: INTENT_TO_SPECIALIST maps every IntentCategory to a specialist or null
 * - AC-4: getSpecialist returns valid config with tools, model, systemPrompt
 * - AC-5: triage and specialists modules export expected symbols
 *
 * NOTE: Tests that mock the "ai" module (AC-1/AC-2 for classifyIntent behavior)
 * live in triage.test.ts to avoid corrupting the ai.tool() export needed here.
 */

import { describe, it, expect } from "vitest";

// -------------------------------------------------------------------------
// AC-3: INTENT_TO_SPECIALIST maps all intent categories
// -------------------------------------------------------------------------
describe("AC-3: INTENT_TO_SPECIALIST maps all intent categories", () => {
  it("should map every IntentCategory to a SpecialistName or null", async () => {
    const { INTENT_TO_SPECIALIST } = await import("../../convex/chat/specialists");

    const expectedKeys = [
      "conversation",
      "knowledge",
      "research",
      "commerce",
      "subscriptions",
      "discovery",
      "documents",
      "analysis",
      "multi_step",
    ];

    for (const key of expectedKeys) {
      expect(
        Object.prototype.hasOwnProperty.call(INTENT_TO_SPECIALIST, key),
        `INTENT_TO_SPECIALIST should have key "${key}"`
      ).toBe(true);
    }

    // conversation maps to null (handled directly by triage)
    expect(INTENT_TO_SPECIALIST["conversation"]).toBeNull();

    // All others map to a SpecialistName string
    const nonConversationKeys = expectedKeys.filter((k) => k !== "conversation");
    for (const key of nonConversationKeys) {
      expect(
        typeof INTENT_TO_SPECIALIST[key as keyof typeof INTENT_TO_SPECIALIST],
        `INTENT_TO_SPECIALIST["${key}"] should be a string`
      ).toBe("string");
    }
  });
});

// -------------------------------------------------------------------------
// AC-4: getSpecialist returns valid config with tools, model, systemPrompt
// -------------------------------------------------------------------------
describe("AC-4: getSpecialist returns valid SpecialistConfig", () => {
  it("should return a valid config for the knowledge specialist", async () => {
    const { getSpecialist } = await import("../../convex/chat/specialists");
    const config = getSpecialist("knowledge");

    expect(config.name).toBe("knowledge");
    expect(typeof config.model).toBe("function");
    expect(typeof config.systemPrompt).toBe("string");
    expect(config.systemPrompt.length).toBeGreaterThan(50);
    expect(typeof config.tools).toBe("object");
    expect(Object.keys(config.tools).length).toBeGreaterThan(0);
  });

  it("should throw for an unknown specialist name", async () => {
    const { getSpecialist } = await import("../../convex/chat/specialists");
    expect(() => getSpecialist("nonexistent" as any)).toThrow();
  });
});

// -------------------------------------------------------------------------
// AC-5: triage and specialists export expected symbols
// -------------------------------------------------------------------------
describe("AC-5: triage and specialists export expected symbols", () => {
  it("classifyIntent export exists in triage module", async () => {
    const triageModule = await import("../../convex/chat/triage");
    expect(typeof triageModule.classifyIntent).toBe("function");
  });

  it("getSpecialist and INTENT_TO_SPECIALIST exports exist in specialists module", async () => {
    const specialistsModule = await import("../../convex/chat/specialists");
    expect(typeof specialistsModule.getSpecialist).toBe("function");
    expect(typeof specialistsModule.INTENT_TO_SPECIALIST).toBe("object");
  });
});
