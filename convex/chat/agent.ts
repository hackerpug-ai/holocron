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
import type { ActionCtx } from "../_generated/server";
import { internal, api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { generateText } from "ai";
import type { GenerateTextResult, ModelMessage } from "ai";
import { zaiPro } from "../lib/ai/zai_provider";
import { agentTools } from "./tools";
import { executeAgentTool } from "./toolExecutor";
import { HOLOCRON_SYSTEM_PROMPT } from "./prompts";
import { toTitleCase } from "../lib/strings";
import { classifyIntent } from "./triage";
import { getSpecialist, INTENT_TO_SPECIALIST } from "./specialists";
import type { IntentCategory } from "./specialists";

/**
 * handleLlmResult
 *
 * Processes the LLM generateText result: handles tool calls (create_plan or individual),
 * or persists plain text response. Shared between specialist and fallback paths.
 */
async function handleLlmResult(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
   
  result: GenerateTextResult<any, any>,
): Promise<void> {
  // Handle tool calls — create approval messages
  if (result.toolCalls && result.toolCalls.length > 0) {
    // Check if the LLM wants to create a plan
    const planCall = result.toolCalls.find(
      (tc) => tc.toolName === "create_plan"
    );

    if (planCall) {
      const input = planCall.input as {
        title: string;
        steps: Array<{
          toolName: string;
          toolArgs: Record<string, unknown>;
          description: string;
          requiresApproval: boolean;
        }>;
      };

      // Create the plan (mutation creates chatMessage + plan + steps)
      const { planId } = await ctx.runMutation(
        internal.agentPlans.mutations.createPlan,
        {
          conversationId,
          title: input.title,
          steps: input.steps,
        }
      );

      // Schedule execution of the first step
      await ctx.scheduler.runAfter(
        0,
        internal.agentPlans.actions.executePlanStep,
        { planId }
      );

      return;
    }

    // Existing tool_approval flow for individual tools
    for (const toolCall of result.toolCalls) {
      const toolDisplayName = toTitleCase(toolCall.toolName);
      const content = `I'd like to use the **${toolDisplayName}** tool to help with your request.`;

      // Insert the tool_approval chatMessage first (to get its ID)
      const approvalMessageId = await ctx.runMutation(
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
      const toolCallId = await ctx.runMutation(
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
  } else {
    // Fallback: LLM returned neither text nor tool calls
    console.warn("LLM returned empty response (no text, no tool calls)");
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent",
      content: "I'm not sure how to respond to that. Could you rephrase your question?",
      messageType: "text",
    });
  }
}

/**
 * callLlmMonolithic
 *
 * Original monolithic agent path: all 17 tools + full system prompt.
 * Used as fallback when triage confidence is low.
 */
async function callLlmMonolithic(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  messages: ModelMessage[],
): Promise<void> {
  const result = await generateText({
    model: zaiPro(),
    system: HOLOCRON_SYSTEM_PROMPT,
    messages,
    tools: agentTools,
  });

  await handleLlmResult(ctx, conversationId, result);
}

/**
 * callLlmAndHandleResponse
 *
 * Triage-then-dispatch flow:
 * 1. Classify intent with zaiFlash (fast, no tools)
 * 2. Direct conversation response → persist directResponse, done
 * 3. Low confidence → fallback to monolithic agent
 * 4. Specialist intent → dispatch to domain-focused specialist
 */
async function callLlmAndHandleResponse(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
): Promise<void> {
  // Build context from conversation history (via internal query in V8 file)
  const messages = await ctx.runQuery(
    internal.chat.agentMutations.buildContext,
    { conversationId },
  );

  // Step 1: Triage — classify intent with zaiFlash (no tools, ~100-200ms)
  const triage = await classifyIntent(messages);
  

  // Step 2: Direct conversation response (no specialist needed)
  if (
    triage.intent === "conversation" &&
    triage.confidence !== "low" &&
    triage.directResponse
  ) {
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent",
      content: triage.directResponse,
      messageType: "text",
    });
    return;
  }

  // Step 3: Low confidence → fallback to monolithic agent (safety valve)
  if (triage.confidence === "low") {
    
    return callLlmMonolithic(ctx, conversationId, messages);
  }

  // Step 4: Dispatch to specialist
  const specialistName = INTENT_TO_SPECIALIST[triage.intent as IntentCategory];
  if (!specialistName) {
    // No specialist for this intent (conversation without directResponse → monolithic)
    return callLlmMonolithic(ctx, conversationId, messages);
  }

  const specialist = getSpecialist(specialistName);
  

  const result = await generateText({
    model: specialist.model(),
    system: specialist.systemPrompt,
    messages,
    tools: specialist.tools,
  });

  await handleLlmResult(ctx, conversationId, result);
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

    let skipContinuation = false;

    try {
      const agentResponse = await executeAgentTool(
        ctx,
        toolCall.toolName,
        toolCall.toolArgs,
        conversationId,
      );

      skipContinuation = agentResponse.skipContinuation ?? false;

      // Fire-and-forget tools post their own progress/result cards
      // asynchronously, so skip the redundant acknowledgment message.
      if (!skipContinuation) {
        // Validate messageType against allowed chatMessages schema values
        const allowedTypes = ["text", "result_card", "error", "progress"] as const;
        type AllowedType = (typeof allowedTypes)[number];
        const messageType: AllowedType = allowedTypes.includes(
          agentResponse.messageType as AllowedType,
        )
          ? (agentResponse.messageType as AllowedType)
          : "text";

        const resultMessageId = await ctx.runMutation(
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
      } else {
        await ctx.runMutation(api.toolCalls.mutations.updateStatus, {
          id: toolCallId,
          status: "completed",
        });
      }
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

    // Skip LLM continuation for fire-and-forget tools (research, etc.)
    // that post their own results asynchronously.
    if (!skipContinuation) {
      await ctx.scheduler.runAfter(0, internal.chat.agent.continueAfterTool, {
        conversationId,
      });
    }
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
    const completedCount = (completedToolCalls ?? []).filter((tc) => tc.status === 'completed').length;
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
