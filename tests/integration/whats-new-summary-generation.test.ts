/**
 * Integration tests for AI summary generation in What's New synthesis (US-SUMM-001)
 *
 * Tests verify summary generation using LLM for each finding with mocked LLM calls
 * to ensure behavioral correctness without making actual API calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI SDK's generateText function
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

// Mock the Zai provider
vi.mock("../../convex/lib/ai/zai_provider", () => ({
  zaiPro: vi.fn(() => ({ model: "zai-pro" })),
}));

import { generateFindingSummary } from "../../convex/whatsNew/llm";
import { generateText } from "ai";

describe("Summary Generation - AC-1: Each finding has summary field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate summary between 80-150 characters", async () => {
    const mockCtx = {};

    const finding = {
      title: "New AI Framework Released",
      source: "GitHub",
      url: "https://github.com/example/ai-framework",
      content: "A revolutionary new AI framework that simplifies building agents with advanced capabilities.",
    };

    // Mock LLM response with exactly 100 characters
    const mockSummary = "This is a revolutionary new AI framework that simplifies building agents with advanced capabilities for developers.";
    (generateText as any).mockResolvedValue({
      text: mockSummary,
      usage: { totalTokens: 50 },
    });

    const result = await generateFindingSummary(mockCtx, finding);

    expect(result).toBe(mockSummary);
    expect(result?.length).toBeGreaterThanOrEqual(80);
    expect(result?.length).toBeLessThanOrEqual(150);
    expect(generateText).toHaveBeenCalledOnce();
  });

  it("should reject summaries shorter than 80 characters", async () => {
    const mockCtx = {};

    const finding = {
      title: "AI Tool",
      source: "GitHub",
      content: "Short content here",
    };

    // Mock LLM response with only 30 characters (too short)
    const mockSummary = "Too short summary for AI engineers.";
    (generateText as any).mockResolvedValue({
      text: mockSummary,
    });

    const result = await generateFindingSummary(mockCtx, finding);

    // Should return undefined for summaries below minimum length
    expect(result).toBeUndefined();
  });
});

describe("Summary Generation - AC-2: Summary captures key insight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should capture key technical insight accurately", async () => {
    const mockCtx = {};

    const finding = {
      title: "Claude Code Source Code Leaked",
      source: "Hacker News",
      url: "https://news.ycombinator.com/item?id=12345",
      content: "Anthropic's Claude Code source code was accidentally leaked via .map file. The community is dissecting the internal safety architecture, prompt injection defenses, and agent loop design patterns.",
    };

    // Mock LLM response that captures the key insight
    const mockSummary = "Community dissecting Anthropic's internal safety architecture and agent loop design from leaked source code.";
    (generateText as any).mockResolvedValue({
      text: mockSummary,
    });

    const result = await generateFindingSummary(mockCtx, finding);

    expect(result).toBeDefined();
    expect(result).toContain("safety architecture");
    expect(result).toContain("agent loop");
    expect(result?.length).toBeGreaterThanOrEqual(80);
  });
});

describe("Summary Generation - AC-3: Graceful failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return undefined when LLM fails, not throw error", async () => {
    const mockCtx = {};

    const finding = {
      title: "Test Finding",
      source: "GitHub",
      content: "Test content",
    };

    // Mock LLM failure
    (generateText as any).mockRejectedValue(new Error("API rate limit exceeded"));

    const result = await generateFindingSummary(mockCtx, finding);

    // Should return undefined, not throw
    expect(result).toBeUndefined();
  });

  it("should return undefined when LLM returns empty response", async () => {
    const mockCtx = {};

    const finding = {
      title: "Test Finding",
      source: "GitHub",
      content: "Test content",
    };

    // Mock LLM returning empty string
    (generateText as any).mockResolvedValue({
      text: "",
    });

    const result = await generateFindingSummary(mockCtx, finding);

    expect(result).toBeUndefined();
  });
});

describe("Summary Generation - AC-4: Truncate long summaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should truncate summaries longer than 150 characters with ellipsis", async () => {
    const mockCtx = {};

    const finding = {
      title: "Comprehensive AI Framework",
      source: "GitHub",
      content: "A very long description about a comprehensive AI framework.",
    };

    // Mock LLM response with 200 characters (exceeds limit)
    const longSummary = "This is an extremely long summary that exceeds the maximum allowed length of one hundred fifty characters and therefore should be truncated with an ellipsis at the end to indicate it was cut off.";
    (generateText as any).mockResolvedValue({
      text: longSummary,
    });

    const result = await generateFindingSummary(mockCtx, finding);

    // Should be truncated to 150 chars (147 + "...")
    expect(result).toBeDefined();
    expect(result?.length).toBe(150);
    expect(result?.endsWith("...")).toBe(true);
  });

  it("should not truncate summaries exactly at 150 characters", async () => {
    const mockCtx = {};

    const finding = {
      title: "Perfect Length Summary",
      source: "GitHub",
      content: "Content here",
    };

    // Mock LLM response with exactly 150 characters
    const exactLengthSummary = "X".repeat(150);
    (generateText as any).mockResolvedValue({
      text: exactLengthSummary,
    });

    const result = await generateFindingSummary(mockCtx, finding);

    // Should NOT be truncated - it's exactly at the limit
    expect(result).toBe(exactLengthSummary);
    expect(result?.length).toBe(150);
    expect(result?.endsWith("...")).toBe(false);
  });
});

describe("Summary Generation - AC-5: Video source handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate summary for video sources", async () => {
    const mockCtx = {};

    const finding = {
      title: "Introduction to LangGraph",
      source: "YouTube",
      url: "https://youtube.com/watch?v=example",
      content: "This video covers the basics of building agent workflows with LangGraph, including state management, node design, and edge routing patterns.",
    };

    // Mock LLM response for video content
    const mockSummary = "Covers LangGraph agent workflow basics including state management, node design patterns, and edge routing for building production AI systems.";
    (generateText as any).mockResolvedValue({
      text: mockSummary,
    });

    const result = await generateFindingSummary(mockCtx, finding);

    expect(result).toBeDefined();
    expect(result?.length).toBeGreaterThanOrEqual(80);
    expect(result?.length).toBeLessThanOrEqual(150);
    expect(generateText).toHaveBeenCalledOnce();

    // Verify the prompt includes video source
    const callArgs = (generateText as any).mock.calls[0][0];
    expect(callArgs.prompt).toContain("YouTube");
  });
});

describe("Summary Generation - Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle findings with no content gracefully", async () => {
    const mockCtx = {};

    const finding = {
      title: "Title Only Finding",
      source: "GitHub",
    };

    const mockSummary = "A GitHub repository with relevant tools for AI engineers working on production systems.";
    (generateText as any).mockResolvedValue({
      text: mockSummary,
    });

    const result = await generateFindingSummary(mockCtx, finding);

    expect(result).toBeDefined();

    // Verify prompt handles missing content
    const callArgs = (generateText as any).mock.calls[0][0];
    expect(callArgs.prompt).toContain("N/A");
  });

  it("should trim whitespace from generated summaries", async () => {
    const mockCtx = {};

    const finding = {
      title: "Test Finding",
      source: "GitHub",
      content: "Content",
    };

    // Mock LLM response with extra whitespace but still >= 80 chars after trimming
    const mockSummary = "  \n  This is a much longer summary with extra whitespace that should still pass validation after trimming.  \n  ";
    (generateText as any).mockResolvedValue({
      text: mockSummary,
    });

    const result = await generateFindingSummary(mockCtx, finding);

    expect(result).toBeDefined();
    expect(result).not.toContain("\n");
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
  });

  it("should pass all finding metadata to LLM prompt", async () => {
    const mockCtx = {};

    const finding = {
      title: "React 19 Released",
      source: "Changelog",
      url: "https://react.dev/blog/2025-03-01-react-19",
      content: "React 19 introduces Server Components, new hooks, and improved performance.",
    };

    (generateText as any).mockResolvedValue({
      text: "React 19 brings Server Components and new hooks for improved performance in modern web applications.",
    });

    await generateFindingSummary(mockCtx, finding);

    const callArgs = (generateText as any).mock.calls[0][0];
    expect(callArgs.prompt).toContain("React 19 Released");
    expect(callArgs.prompt).toContain("Changelog");
    expect(callArgs.prompt).toContain("React 19 introduces Server Components");
  });
});
