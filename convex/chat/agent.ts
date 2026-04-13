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
import type { GenerateTextResult, ModelMessage } from "ai";
import { zaiPro } from "../lib/ai/zai_provider";
import { agentTools } from "./tools";
import { executeAgentTool } from "./toolExecutor";
import { HOLOCRON_SYSTEM_PROMPT } from "./prompts";
import { toTitleCase } from "../lib/strings";
import { classifyIntent, type QueryShape } from "./triage";
import { isPendingExpired } from "../conversations/mutations";
import { getSpecialist, INTENT_TO_SPECIALIST } from "./specialists";
import type { IntentCategory } from "./specialists";
import { generateTextWithReAct } from "../lib/react";

/**
 * handleLlmResult
 *
 * Processes the LLM generateText result: handles tool calls (create_plan or individual),
 * or persists plain text response. Shared between specialist and fallback paths.
 *
 * @param specialistName - The specialist that produced this result. Stored in tool
 *   approval cardData so continueAfterTool can dispatch back to the same specialist
 *   without re-triaging.
 */
async function handleLlmResult(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  result: GenerateTextResult<any, any>,
  specialistName?: string,
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
            // Thread the specialist name through so continueAfterTool can
            // dispatch back to the same specialist without re-triaging.
            specialist_name: specialistName ?? null,
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
  const result = await generateTextWithReAct({
    model: zaiPro(),
    system: HOLOCRON_SYSTEM_PROMPT,
    messages,
    tools: agentTools,
  });

  await handleLlmResult(ctx, conversationId, result);
}

/**
 * computeClarificationDepth
 *
 * Counts consecutive ambiguous classifications from the tail of recent
 * telemetry records. Used to cap the clarification loop at depth 1 —
 * after one round of clarification, we force a best-guess dispatch.
 */
async function computeClarificationDepth(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
): Promise<number> {
  const recentClassifications = await ctx.runQuery(
    internal.chat.agentMutations.listRecentClassifications,
    { conversationId, limit: 5 },
  );
  if (!recentClassifications) return 0;

  // Count consecutive ambiguous results from the end
  let depth = 0;
  for (let i = recentClassifications.length - 1; i >= 0; i--) {
    if (recentClassifications[i].queryShape === "ambiguous") {
      depth++;
    } else {
      break;
    }
  }
  return depth;
}

/**
 * callLlmAndHandleResponse
 *
 * Triage-then-dispatch flow:
 * 1. Classify intent with zaiFlash (fast, no tools)
 * 2. Direct conversation response → persist directResponse, done
 * 3. Ambiguous short-circuit → set pending intent, ask clarification
 * 4. Low confidence → fallback to monolithic agent
 * 5. Specialist intent → dispatch to domain-focused specialist
 *
 * Returns the specialist name used (for threading through tool continuations).
 */
async function callLlmAndHandleResponse(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
): Promise<string | null> {
  // Build context from conversation history (via internal query in V8 file)
  let messages = await ctx.runQuery(
    internal.chat.agentMutations.buildContext,
    { conversationId },
  );

  // --- Pending-state rehydrate (CLR-002) ---
  // Read the conversation document to check for fresh pending state.
  const conv = await ctx.runQuery(
    internal.chat.agentMutations.getConversation,
    { conversationId },
  );

  if (conv && conv.pendingIntent && !isPendingExpired(conv.pendingSince)) {
    // Prepend a system message so triage sees the original context
    const pendingPreamble =
      `The user is mid-request. Their original intent was ${conv.pendingIntent} ` +
      `with shape ${conv.pendingQueryShape}.`;
    messages = [
      { role: "system" as const, content: pendingPreamble },
      ...messages,
    ];
  }

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
    return null;
  }

  // --- Ambiguous short-circuit (CLR-002) ---
  // Check clarification depth to cap at 1 round of clarification.
  const clarificationDepth = await computeClarificationDepth(ctx, conversationId);

  // Compute effective shape: if ambiguous but depth cap reached, force best-guess
  const effectiveShape: QueryShape =
    triage.queryShape === "ambiguous" && clarificationDepth >= 1
      ? "factual"
      : triage.queryShape;

  if (
    triage.queryShape === "ambiguous" &&
    triage.directResponse &&
    triage.confidence !== "low" &&
    clarificationDepth < 1
  ) {
    // Set pending intent so next turn can rehydrate
    await ctx.runMutation(internal.conversations.mutations.setPendingIntent, {
      conversationId,
      intent: triage.intent,
      queryShape: triage.queryShape,
    });
    // Persist the clarification question as an assistant message
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent",
      content: triage.directResponse,
      messageType: "text",
    });
    return null; // no specialist dispatch
  }

  // Clear pending state on non-ambiguous turn completion
  if (effectiveShape !== "ambiguous" && conv?.pendingIntent) {
    await ctx.runMutation(internal.conversations.mutations.clearPendingIntent, {
      conversationId,
    });
  }

  // Step 3: Low confidence → fallback to monolithic agent (safety valve)
  if (triage.confidence === "low") {
    await callLlmMonolithic(ctx, conversationId, messages);
    return null;
  }

  // Step 4: Dispatch to specialist
  const specialistName = INTENT_TO_SPECIALIST[triage.intent as IntentCategory];
  if (!specialistName) {
    // No specialist for this intent (conversation without directResponse → monolithic)
    await callLlmMonolithic(ctx, conversationId, messages);
    return null;
  }

  const specialist = getSpecialist(specialistName);

  // QueryShape hint injection for research specialist
  // Injects a system-message preamble to guide tool selection based on query shape
  let dispatchMessages = messages;
  if (specialistName === "research" && effectiveShape) {
    const shapeHints: Record<QueryShape, string | null> = {
      recommendation: "The user wants named providers they can act on. Use find_recommendations.",
      comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
      factual: null,
      exploratory: null,
      ambiguous: null,
    };
    const preamble = shapeHints[effectiveShape];
    if (preamble) {
      // Prepend hint as system message to guide specialist behavior
      dispatchMessages = [
        { role: "system" as const, content: preamble },
        ...messages,
      ];
    }
  }

  const result = await generateTextWithReAct({
    model: specialist.model(),
    system: specialist.systemPrompt,
    messages: dispatchMessages,
    tools: specialist.tools,
  });

  await handleLlmResult(ctx, conversationId, result, specialistName);
  return specialistName;
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
    // Read the specialist that generated this tool call from the approval
    // message cardData so continueAfterTool can skip re-triage.
    const approvalMessage = await ctx.runQuery(api.chatMessages.queries.get, {
      id: toolCall.messageId,
    });
    const specialistName: string | undefined =
      typeof (approvalMessage?.cardData as any)?.specialist_name === "string"
        ? (approvalMessage?.cardData as any).specialist_name
        : undefined;

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
        specialistName,
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
 *
 * If specialistName is provided (threaded from the original tool approval),
 * skips triage and dispatches directly to that specialist — preserving intent
 * context across multi-tool chains.
 */
export const continueAfterTool = internalAction({
  args: {
    conversationId: v.id("conversations"),
    specialistName: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, specialistName }): Promise<void> => {
    const completedToolCalls = await ctx.runQuery(api.toolCalls.queries.listByConversation, {
      conversationId,
    });
    const completedCount = (completedToolCalls ?? []).filter((tc: { status: string }) => tc.status === 'completed').length;
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
      if (specialistName) {
        // Skip triage — dispatch directly to the original specialist so intent
        // context is preserved across multi-tool chains without re-classification.
        let messages = await ctx.runQuery(
          internal.chat.agentMutations.buildContext,
          { conversationId },
        );

        // REC-005: Inject continuation hint for find_recommendations
        // Get the most recent completed tool call
        const priorTool = completedToolCalls && completedToolCalls.length > 0
          ? completedToolCalls[completedToolCalls.length - 1]
          : null;

        if (priorTool?.toolName === 'find_recommendations') {
          const FIND_REC_CONTINUATION_HINT =
            'The user just saw a list of recommendations. Do NOT re-render the list. ' +
            'Do NOT call another tool for the same query. ' +
            'In 1-2 sentences max, acknowledge the list and offer to save it to their KB if they want.';

          // Prepend hint as system message to guide specialist behavior
          messages = [
            { role: 'system' as const, content: FIND_REC_CONTINUATION_HINT },
            ...messages,
          ];
        }

        const specialist = getSpecialist(specialistName as any);
        const result = await generateTextWithReAct({
          model: specialist.model(),
          system: specialist.systemPrompt,
          messages,
          tools: specialist.tools,
        });
        await handleLlmResult(ctx, conversationId, result, specialistName);
      } else {
        await callLlmAndHandleResponse(ctx, conversationId);
      }
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
