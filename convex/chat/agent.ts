"use node";

/**
 * Chat Agent Action
 *
 * Core agentic loop for the Holocron chat assistant.
 * Handles LLM invocation, tool call approval flow, and conversation state.
 *
 * Flow:
 *   run() → LLM → text response OR tool_approval message
 *   executeTool() → approved → executeAgentTool → result_card → continueAfterTool()
 *   rejectTool() → rejected → continueAfterTool()
 *   continueAfterTool() → LLM follow-up response
 *
 * Note: Internal mutations/queries (setAgentBusy, buildContext, etc.) live in
 * ./agentMutations.ts because Convex does not allow internalMutation/internalQuery
 * to be defined inside Node.js ("use node") files.
 */

import { internalAction, action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { generateText } from "ai";
import { zaiPro } from "../lib/ai/zai_provider";
import { agentTools } from "./tools";
import { executeAgentTool } from "./toolExecutor";
import { HOLOCRON_SYSTEM_PROMPT } from "./prompts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a snake_case tool name into a human-readable display name
 */
function formatToolDisplayName(toolName: string): string {
  return toolName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * callLlmAndHandleResponse
 *
 * Builds context, calls the LLM, and handles the response:
 * - Plain text → persists agent chatMessage
 * - Tool calls → creates tool_approval chatMessage + toolCall record per call
 */
async function callLlmAndHandleResponse(
  ctx: any,
  conversationId: string,
): Promise<void> {
  // Build context from conversation history (via internal query in V8 file)
  const messages = await ctx.runQuery(
    internal.chat.agentMutations.buildContext,
    { conversationId },
  );

  const result = await generateText({
    model: zaiPro(),
    system: HOLOCRON_SYSTEM_PROMPT,
    messages,
    tools: agentTools,
  });

  // Handle tool calls — create approval messages
  if (result.toolCalls && result.toolCalls.length > 0) {
    for (const toolCall of result.toolCalls) {
      const toolDisplayName = formatToolDisplayName(toolCall.toolName);
      const content = `I'd like to use the **${toolDisplayName}** tool to help with your request.`;

      // Insert the tool_approval chatMessage first (to get its ID)
      const approvalMessageId: string = await ctx.runMutation(
        internal.chat.agentMutations.createToolApprovalMessage,
        {
          conversationId,
          content,
          cardData: {
            tool_name: toolCall.toolName,
            tool_display_name: toolDisplayName,
            tool_args: toolCall.input,
          },
        },
      );

      // Create the toolCall record linked to the approval message
      const toolCallId: string = await ctx.runMutation(
        api.toolCalls.mutations.create,
        {
          conversationId,
          messageId: approvalMessageId,
          toolName: toolCall.toolName,
          toolDisplayName,
          toolArgs: toolCall.input,
        },
      );

      // Back-patch the approval message with the toolCallId reference
      await ctx.runMutation(internal.chat.agentMutations.linkToolCallToMessage, {
        messageId: approvalMessageId,
        toolCallId,
      });
    }

    return;
  }

  // Handle plain text response
  const text = result.text?.trim() ?? "";
  if (text) {
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent",
      content: text,
      messageType: "text",
    });
  }
}

// ---------------------------------------------------------------------------
// run - Main agent entry point
// ---------------------------------------------------------------------------

/**
 * run
 *
 * Internal action invoked after a user message is persisted.
 * Sets agentBusy, calls LLM, handles text or tool_approval response.
 */
export const run = internalAction({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }): Promise<void> => {
    await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
      conversationId,
      busy: true,
    });

    try {
      await callLlmAndHandleResponse(ctx, conversationId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";

      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent",
        content: `I encountered an error: ${errorMessage}`,
        messageType: "error",
      });
    } finally {
      await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
        conversationId,
        busy: false,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// executeTool - Approve and execute a pending tool call
// ---------------------------------------------------------------------------

/**
 * executeTool
 *
 * Public action triggered by the user approving a tool call.
 * Validates the toolCall is pending, executes it, persists the result,
 * then schedules a follow-up LLM continuation.
 */
export const executeTool = action({
  args: {
    toolCallId: v.id("toolCalls"),
  },
  handler: async (ctx, { toolCallId }): Promise<void> => {
    const toolCall = await ctx.runQuery(api.toolCalls.queries.get, {
      id: toolCallId,
    });

    if (!toolCall) {
      throw new Error(`toolCall ${toolCallId} not found`);
    }

    if (toolCall.status !== "pending") {
      throw new Error(
        `toolCall ${toolCallId} is not pending (status: ${toolCall.status})`,
      );
    }

    const conversationId = toolCall.conversationId;

    // Mark as approved
    await ctx.runMutation(api.toolCalls.mutations.updateStatus, {
      id: toolCallId,
      status: "approved",
    });

    await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
      conversationId,
      busy: true,
    });

    try {
      const agentResponse = await executeAgentTool(
        ctx,
        toolCall.toolName,
        toolCall.toolArgs,
        conversationId,
      );

      // Validate messageType against allowed chatMessages schema values
      const allowedTypes = ["text", "result_card", "error", "progress"] as const;
      type AllowedType = (typeof allowedTypes)[number];
      const messageType: AllowedType = allowedTypes.includes(
        agentResponse.messageType as AllowedType,
      )
        ? (agentResponse.messageType as AllowedType)
        : "text";

      const resultMessageId: string = await ctx.runMutation(
        api.chatMessages.mutations.create,
        {
          conversationId,
          role: "agent",
          content: agentResponse.content,
          messageType,
          cardData: agentResponse.cardData,
        },
      );

      await ctx.runMutation(api.toolCalls.mutations.updateStatus, {
        id: toolCallId,
        status: "completed",
        resultMessageId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Tool execution failed";

      await ctx.runMutation(api.toolCalls.mutations.updateStatus, {
        id: toolCallId,
        status: "failed",
        error: errorMessage,
      });

      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent",
        content: `Tool execution failed: ${errorMessage}`,
        messageType: "error",
      });
    } finally {
      await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
        conversationId,
        busy: false,
      });
    }

    // Schedule LLM continuation regardless of tool success/failure
    await ctx.scheduler.runAfter(0, internal.chat.agent.continueAfterTool, {
      conversationId,
    });
  },
});

// ---------------------------------------------------------------------------
// rejectTool - Reject a pending tool call
// ---------------------------------------------------------------------------

/**
 * rejectTool
 *
 * Public action triggered by the user rejecting a tool call.
 * Marks the toolCall as rejected and schedules a follow-up LLM response
 * so the agent can acknowledge the rejection and offer alternatives.
 */
export const rejectTool = action({
  args: {
    toolCallId: v.id("toolCalls"),
  },
  handler: async (ctx, { toolCallId }): Promise<void> => {
    const toolCall = await ctx.runQuery(api.toolCalls.queries.get, {
      id: toolCallId,
    });

    if (!toolCall) {
      throw new Error(`toolCall ${toolCallId} not found`);
    }

    await ctx.runMutation(api.toolCalls.mutations.updateStatus, {
      id: toolCallId,
      status: "rejected",
    });

    await ctx.scheduler.runAfter(0, internal.chat.agent.continueAfterTool, {
      conversationId: toolCall.conversationId,
    });
  },
});

// ---------------------------------------------------------------------------
// continueAfterTool - LLM follow-up after tool execution or rejection
// ---------------------------------------------------------------------------

/**
 * continueAfterTool
 *
 * Internal action scheduled after a tool is executed or rejected.
 * Rebuilds the full conversation context (now including tool results)
 * and calls the LLM for a follow-up response.
 */
export const continueAfterTool = internalAction({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }): Promise<void> => {
    const completedToolCalls = await ctx.runQuery(api.toolCalls.queries.listByConversation, {
      conversationId,
    });
    const completedCount = (completedToolCalls ?? []).filter((tc: any) => tc.status === 'completed').length;
    const MAX_TOOL_CHAIN_DEPTH = 10;
    if (completedCount >= MAX_TOOL_CHAIN_DEPTH) {
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent",
        content: "I've reached the maximum number of sequential tool operations for this turn. Please send another message if you'd like me to continue.",
        messageType: "text",
      });
      await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
        conversationId,
        busy: false,
      });
      return;
    }

    await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
      conversationId,
      busy: true,
    });

    try {
      await callLlmAndHandleResponse(ctx, conversationId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";

      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent",
        content: `I encountered an error while continuing: ${errorMessage}`,
        messageType: "error",
      });
    } finally {
      await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
        conversationId,
        busy: false,
      });
    }
  },
});
