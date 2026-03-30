/**
 * Tests for convex/voice/executeTool.ts
 *
 * AC-1: executeTool action is exported from the file
 * AC-2: truncateForVoice cuts content at sentence boundary within maxChars
 * AC-3: handler maps executeAgentTool result to voice-friendly shape
 * AC-4: handler sets success=false when messageType is "error"
 * AC-5: handler strips cardData from the returned object
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import path from "path";
import fs from "fs";

const executeToolPath = path.resolve(
  __dirname,
  "../../convex/voice/executeTool.ts",
);

afterEach(() => {
  vi.resetModules();
});

// ============================================================================
// AC-1: executeTool is exported from convex/voice/executeTool.ts
// ============================================================================

describe("AC-1: executeTool action is exported", () => {
  it("file exists and exports executeTool", () => {
    expect(fs.existsSync(executeToolPath)).toBe(true);
    const src = fs.readFileSync(executeToolPath, "utf8");
    expect(src).toContain("export const executeTool");
    expect(src).toContain('"use node"');
  });
});

// ============================================================================
// AC-2: truncateForVoice cuts at sentence boundary
// ============================================================================

describe("AC-2: truncateForVoice respects sentence boundaries", () => {
  it("returns content unchanged when shorter than maxChars", async () => {
    const { truncateForVoice } = await import(
      "../../convex/voice/executeTool"
    );
    const short = "Hello world.";
    expect(truncateForVoice(short, 1500)).toBe(short);
  });

  it("truncates at a sentence boundary when one exists in the first 50% of maxChars", async () => {
    const { truncateForVoice } = await import(
      "../../convex/voice/executeTool"
    );
    // Build a string: sentence 1 ends at char 30, then filler to exceed maxChars
    const sentence1 = "This is the first sentence. ";
    const filler = "x".repeat(50);
    const combined = sentence1 + filler; // 78 chars; cut at max=40
    const result = truncateForVoice(combined, 40);
    // Should end at the period of sentence 1 (position 27 inclusive)
    expect(result.endsWith(".")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("appends ellipsis when no sentence boundary found in first half", async () => {
    const { truncateForVoice } = await import(
      "../../convex/voice/executeTool"
    );
    const noSentence = "a".repeat(200);
    const result = truncateForVoice(noSentence, 50);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
  });
});

// ============================================================================
// AC-3: handler maps successful AgentResponse to voice shape
// ============================================================================

describe("AC-3: handler returns voice-friendly shape on success", () => {
  it("returns success=true, content string, skipContinuation=false for text response", async () => {
    vi.doMock("../../convex/chat/toolExecutor", () => ({
      executeAgentTool: vi.fn().mockResolvedValue({
        content: "Here is what I found.",
        messageType: "text",
        skipContinuation: false,
      }),
    }));

    const { executeToolHandler } = await import(
      "../../convex/voice/executeTool"
    );

    const mockCtx = {} as any;
    const result = await executeToolHandler(mockCtx, {
      toolName: "knowledge_base_stats",
      toolArgs: {},
      conversationId: "conversations:test123" as any,
    });

    expect(result.success).toBe(true);
    expect(typeof result.content).toBe("string");
    expect(result.content).toBe("Here is what I found.");
    expect(result.skipContinuation).toBe(false);
  });

  it("passes skipContinuation=true through when set by tool", async () => {
    vi.doMock("../../convex/chat/toolExecutor", () => ({
      executeAgentTool: vi.fn().mockResolvedValue({
        content: "Researching in background...",
        messageType: "text",
        skipContinuation: true,
      }),
    }));

    const { executeToolHandler } = await import(
      "../../convex/voice/executeTool"
    );

    const mockCtx = {} as any;
    const result = await executeToolHandler(mockCtx, {
      toolName: "quick_research",
      toolArgs: { query: "AI trends" },
      conversationId: "conversations:test123" as any,
    });

    expect(result.skipContinuation).toBe(true);
  });
});

// ============================================================================
// AC-4: handler sets success=false when messageType is "error"
// ============================================================================

describe("AC-4: handler maps error messageType to success=false", () => {
  it("returns success=false when executeAgentTool returns messageType=error", async () => {
    vi.doMock("../../convex/chat/toolExecutor", () => ({
      executeAgentTool: vi.fn().mockResolvedValue({
        content: "Tool execution failed.",
        messageType: "error",
      }),
    }));

    const { executeToolHandler } = await import(
      "../../convex/voice/executeTool"
    );

    const mockCtx = {} as any;
    const result = await executeToolHandler(mockCtx, {
      toolName: "unknown_tool",
      toolArgs: {},
      conversationId: "conversations:test123" as any,
    });

    expect(result.success).toBe(false);
    expect(result.content).toBe("Tool execution failed.");
  });
});

// ============================================================================
// AC-5: handler strips cardData from returned object
// ============================================================================

describe("AC-5: handler strips cardData from voice response", () => {
  it("returned object does not contain cardData property", async () => {
    vi.doMock("../../convex/chat/toolExecutor", () => ({
      executeAgentTool: vi.fn().mockResolvedValue({
        content: "Browse articles by category",
        messageType: "result_card",
        cardData: { card_type: "category_list", categories: [] },
      }),
    }));

    const { executeToolHandler } = await import(
      "../../convex/voice/executeTool"
    );

    const mockCtx = {} as any;
    const result = await executeToolHandler(mockCtx, {
      toolName: "browse_category",
      toolArgs: {},
      conversationId: "conversations:test123" as any,
    });

    expect("cardData" in result).toBe(false);
    expect(result.success).toBe(true);
    expect(result.content).toBe("Browse articles by category");
  });
});
