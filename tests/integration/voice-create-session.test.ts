/**
 * Integration tests for voice.createSession action (US-002)
 *
 * Tests verify createSession action structure and handler behavior.
 * Behavior tests use the exported createSessionHandler pure function
 * with mocked ctx to avoid Convex runtime dependencies.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete process.env.OPENAI_API_KEY;
});

// ============================================================================
// AC-1: Returns {ephemeralKey, expiresAt, sessionId} on success
// ============================================================================

describe("voice.createSession - AC-1: Returns token on success", () => {
  it("createSession action is exported from convex/voice/actions.ts", async () => {
    const { createSession } = await import("../../convex/voice/actions");

    expect(createSession).toBeDefined();
    expect(typeof createSession).toBe("function");
  });

  it("createSessionHandler returns ephemeralKey, expiresAt, sessionId on success", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: "ek_abc123_testtoken",
            expires_at: 1234567890,
          }),
        text: () => Promise.resolve(""),
      })
    );

    const { createSessionHandler } = await import("../../convex/voice/actions");

    const mockSessionId = "vs_newSession123";
    const mockCtx = {
      runQuery: vi.fn().mockResolvedValue(null), // no active session
      runMutation: vi.fn().mockResolvedValue(mockSessionId),
    };

    const result = await createSessionHandler(
      mockCtx as any,
      { conversationId: "conv_abc" },
      {
        activeSessionQuery: "mock-query-ref" as any,
        createSessionMutation: "mock-mutation-ref" as any,
      }
    );

    expect(result.ephemeralKey).toBe("ek_abc123_testtoken");
    expect(result.expiresAt).toBe(1234567890);
    expect(result.sessionId).toBe(mockSessionId);
  });
});

// ============================================================================
// AC-2: Throws error if active session already exists for conversationId
// ============================================================================

describe("voice.createSession - AC-2: Active session guard", () => {
  it("createSessionHandler throws when active session exists", async () => {
    const { createSessionHandler } = await import("../../convex/voice/actions");

    const mockActiveSession = {
      _id: "vs_existing123",
      conversationId: "conv_123",
      startedAt: Date.now() - 5000,
      completedAt: undefined,
      turnCount: 0,
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 5000,
    };

    const mockCtx = {
      runQuery: vi.fn().mockResolvedValue(mockActiveSession),
      runMutation: vi.fn(),
    };

    await expect(
      createSessionHandler(
        mockCtx as any,
        { conversationId: "conv_123" },
        { activeSessionQuery: "mock-query-ref" as any }
      )
    ).rejects.toThrow(/active session/i);

    // Mutation must NOT have been called
    expect(mockCtx.runMutation).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AC-3: Throws descriptive error if OPENAI_API_KEY missing
// ============================================================================

describe("voice.createSession - AC-3: Missing API key error", () => {
  it("createSessionHandler throws descriptive error when OPENAI_API_KEY is missing", async () => {
    // Ensure API key is not set
    delete process.env.OPENAI_API_KEY;

    const { createSessionHandler } = await import("../../convex/voice/actions");

    const mockCtx = {
      runQuery: vi.fn().mockResolvedValue(null), // no active session
      runMutation: vi.fn(),
    };

    await expect(
      createSessionHandler(
        mockCtx as any,
        { conversationId: "conv_123" },
        { activeSessionQuery: "mock-query-ref" as any }
      )
    ).rejects.toThrow(/OPENAI_API_KEY/i);

    // Mutation must NOT have been called — no session record created
    expect(mockCtx.runMutation).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AC-4: Non-200 OpenAI response throws error, no session record created
// ============================================================================

describe("voice.createSession - AC-4: Non-200 OpenAI response", () => {
  it("createSessionHandler throws with status code context on non-200 and does not create session", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    const { createSessionHandler } = await import("../../convex/voice/actions");

    const mockCtx = {
      runQuery: vi.fn().mockResolvedValue(null), // no active session
      runMutation: vi.fn(),
    };

    await expect(
      createSessionHandler(
        mockCtx as any,
        { conversationId: "conv_123" },
        {
          activeSessionQuery: "mock-query-ref" as any,
          createSessionMutation: "mock-mutation-ref" as any,
        }
      )
    ).rejects.toThrow(/401/);

    // Mutation must NOT have been called — no session record created
    expect(mockCtx.runMutation).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Internal mutation: internalCreateSession is exported
// ============================================================================

describe("voice.createSession - Internal mutation", () => {
  it("internalCreateSession is exported from convex/voice/mutations.ts", async () => {
    const { internalCreateSession } = await import(
      "../../convex/voice/mutations"
    );

    expect(internalCreateSession).toBeDefined();
    expect(typeof internalCreateSession).toBe("function");
  });
});
