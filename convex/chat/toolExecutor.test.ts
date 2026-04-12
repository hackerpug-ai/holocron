/**
 * Tool Executor Tests
 *
 * Tests for the tool executor that dispatches AI tool calls to Convex backend handlers.
 */

import { describe, it, expect } from "vitest";
import { executeAgentTool } from "./toolExecutor";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Mock ActionCtx
const createMockCtx = (): Partial<ActionCtx> => ({
  runAction: async (_fn: any, _args: any) => ({
    items: [
      {
        name: "Test Provider",
        description: "A test service provider",
        whyRecommended: "Highly rated",
        rating: 4.5,
      },
    ],
    sources: [
      {
        title: "Test Source",
        url: "https://example.com",
        snippet: "Test snippet",
      },
    ],
    query: "test query",
    durationMs: 100,
  }),
  runQuery: async (_fn: any, _args: any) => [],
  runMutation: async (_fn: any, _args: any) => "test-id" as any,
  scheduler: {
    runAfter: async (_delay: any, _fn: any, _args: any) => "test-scheduled-id" as any,
    runAt: async (_timestamp: any, _fn: any, _args: any) => "test-scheduled-id" as any,
    cancel: async (_id: any) => {},
  } as any,
});

describe("REC-005: find_recommendations tool executor wiring", () => {
  describe("AC-1: Tool executor dispatches find_recommendations", () => {
    it("should call findRecommendationsAction when tool_call.name='find_recommendations'", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      const result = await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "career coaches in San Francisco",
          count: 5,
          location: "San Francisco",
          constraints: ["under $100/hr"],
        },
        conversationId
      );

      // Verify the response structure
      expect(result).toBeDefined();
      expect(result.messageType).toBe("result_card");
      expect(result.cardData).toBeDefined();
      expect(result.skipContinuation).toBe(false);
    });

    it("should forward all args to findRecommendationsAction", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      let capturedArgs: any = null;
      mockCtx.runAction = async (fn: any, args: any) => {
        capturedArgs = args;
        return {
          items: [
            {
              name: "Test Provider",
              description: "A test service provider",
              whyRecommended: "Highly rated",
              rating: 4.5,
            },
          ],
          sources: [
            {
              title: "Test Source",
              url: "https://example.com",
              snippet: "Test snippet",
            },
          ],
          query: args.query,
          durationMs: 100,
        };
      };

      await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "test query",
          count: 10,
          location: "New York",
          constraints: ["budget-friendly"],
        },
        conversationId
      );

      expect(capturedArgs).toEqual({
        query: "test query",
        count: 10,
        location: "New York",
        constraints: ["budget-friendly"],
      });
    });
  });

  describe("AC-2: Returns result_card with recommendation_list", () => {
    it("should return AgentResponse with messageType='result_card'", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      const result = await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "test query",
        },
        conversationId
      );

      expect(result.messageType).toBe("result_card");
    });

    it("should return AgentResponse with cardData.card_type='recommendation_list'", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      const result = await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "test query",
        },
        conversationId
      );

      expect(result.cardData).toBeDefined();
      expect(result.cardData.card_type).toBe("recommendation_list");
    });

    it("should include items, sources, query, and durationMs in cardData", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      const result = await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "test query",
        },
        conversationId
      );

      expect(result.cardData.items).toBeDefined();
      expect(result.cardData.items).toHaveLength(1);
      expect(result.cardData.items[0].name).toBe("Test Provider");
      expect(result.cardData.sources).toBeDefined();
      expect(result.cardData.sources).toHaveLength(1);
      expect(result.cardData.query).toBe("test query");
      expect(result.cardData.durationMs).toBeDefined();
    });

    it("should set skipContinuation=false", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      const result = await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "test query",
        },
        conversationId
      );

      expect(result.skipContinuation).toBe(false);
    });
  });

  describe("AC-4: No document created", () => {
    it("should NOT call ctx.scheduler.runAfter", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      let schedulerCalled = false;
      mockCtx.scheduler = {
        runAfter: async (_delay: any, _fn: any, _args: any) => {
          schedulerCalled = true;
          return "test-scheduled-id" as any;
        },
        runAt: async (_timestamp: any, _fn: any, _args: any) => "test-scheduled-id" as any,
        cancel: async (_id: any) => {},
      } as any;

      await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "test query",
        },
        conversationId
      );

      expect(schedulerCalled).toBe(false);
    });

    it("should NOT call ctx.runMutation for documents", async () => {
      const mockCtx = createMockCtx() as ActionCtx;
      const conversationId = "test-conversation" as Id<"conversations">;

      let mutationCalled = false;
      mockCtx.runMutation = async (_fn, _args) => {
        mutationCalled = true;
        return "test-id" as any;
      };

      await executeAgentTool(
        mockCtx,
        "find_recommendations",
        {
          query: "test query",
        },
        conversationId
      );

      expect(mutationCalled).toBe(false);
    });
  });
});
