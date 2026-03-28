/**
 * Triage Agent Tests
 *
 * Verifies that classifyIntent returns a valid TriageResult shape
 * and that the TRIAGE_SYSTEM_PROMPT is exported from prompts.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- AC-1: classifyIntent returns a valid TriageResult ---
describe("AC-1: classifyIntent returns a valid TriageResult shape", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return a TriageResult with valid intent and confidence", async () => {
    // Mock the AI SDK so we don't hit real network
    vi.doMock("ai", () => ({
      generateText: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          intent: "conversation",
          confidence: "high",
          reasoning: "User is greeting the assistant",
          directResponse: "Hello! How can I help you today?",
        }),
      }),
    }));

    const { classifyIntent } = await import(
      "../../convex/chat/triage"
    );

    const messages = [{ role: "user" as const, content: "Hello there!" }];
    const result = await classifyIntent(messages);

    expect(result).toMatchObject({
      intent: "conversation",
      confidence: "high",
      reasoning: expect.any(String),
    });
  });
});

// --- AC-2: classifyIntent handles invalid JSON with fallback ---
describe("AC-2: classifyIntent returns fallback on bad LLM response", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should fall back gracefully when LLM returns non-JSON", async () => {
    vi.doMock("ai", () => ({
      generateText: vi.fn().mockResolvedValue({
        text: "This is not JSON at all",
      }),
    }));

    const { classifyIntent } = await import(
      "../../convex/chat/triage"
    );

    const messages = [{ role: "user" as const, content: "Search for something" }];
    const result = await classifyIntent(messages);

    expect(result.intent).toBe("conversation");
    expect(result.confidence).toBe("low");
    expect(result.reasoning).toBeTruthy();
  });
});

// --- AC-3: classifyIntent strips directResponse for non-conversation intents ---
describe("AC-3: directResponse only present for conversation intent", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should not include directResponse for knowledge intent", async () => {
    vi.doMock("ai", () => ({
      generateText: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          intent: "knowledge",
          confidence: "high",
          reasoning: "User wants to search saved documents",
          directResponse: "I will search your knowledge base",
        }),
      }),
    }));

    const { classifyIntent } = await import(
      "../../convex/chat/triage"
    );

    const messages = [{ role: "user" as const, content: "Find my notes on React" }];
    const result = await classifyIntent(messages);

    expect(result.intent).toBe("knowledge");
    expect(result.directResponse).toBeUndefined();
  });
});

// --- AC-4: TRIAGE_SYSTEM_PROMPT is exported from prompts.ts ---
describe("AC-4: TRIAGE_SYSTEM_PROMPT exported from prompts.ts", () => {
  it("should export TRIAGE_SYSTEM_PROMPT as a non-empty string", async () => {
    const { TRIAGE_SYSTEM_PROMPT } = await import("../../convex/chat/prompts");

    expect(typeof TRIAGE_SYSTEM_PROMPT).toBe("string");
    expect(TRIAGE_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(TRIAGE_SYSTEM_PROMPT).toContain("conversation");
    expect(TRIAGE_SYSTEM_PROMPT).toContain("knowledge");
    expect(TRIAGE_SYSTEM_PROMPT).toContain("research");
  });
});
