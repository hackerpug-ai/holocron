/**
 * Agent helper mutations and queries (V8 - not Node.js)
 *
 * These internal mutations/queries support the chat agent action in agent.ts.
 * They are separated into this V8 file because internalMutation/internalQuery
 * cannot be defined in Node.js ("use node") files.
 */

import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { v } from "convex/values";
import { buildConversationContext } from "./context";

/**
 * Set agentBusy flag on a conversation
 */
export const setAgentBusy = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    busy: v.boolean(),
  },
  handler: async (ctx, { conversationId, busy }) => {
    await ctx.db.patch(conversationId, {
      agentBusy: busy,
      agentBusySince: busy ? Date.now() : undefined,
    });
  },
});

/**
 * Insert a tool_approval chatMessage
 * (schema allows tool_approval but chatMessages/mutations doesn't expose it)
 */
export const createToolApprovalMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    cardData: v.optional(v.any()),
    toolCallId: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, content, cardData, toolCallId }) => {
    return await ctx.db.insert("chatMessages", {
      conversationId,
      role: "agent",
      content,
      messageType: "tool_approval",
      cardData,
      toolCallId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Link a toolCallId back to an existing chatMessage
 */
export const linkToolCallToMessage = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    toolCallId: v.string(),
  },
  handler: async (ctx, { messageId, toolCallId }) => {
    await ctx.db.patch(messageId, { toolCallId });
  },
});

/**
 * Cancel an in-progress agent run, clearing agentBusy and agentBusySince.
 * Use this to force-unlock a conversation that is stuck in a busy state.
 */
export const cancelAgent = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      agentBusy: false,
      agentBusySince: undefined,
    });
  },
});

/**
 * Build conversation context for LLM — proxy to buildConversationContext()
 * Returns the array of LLM messages for the conversation.
 */
export const buildContext = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }) => {
    return await buildConversationContext(ctx.db, conversationId);
  },
});

/**
 * Get a conversation document by ID.
 * Used by agent actions (Node.js) to read pending state fields.
 */
export const getConversation = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db.get(conversationId);
  },
});

/**
 * Get the most recent result_card message in a conversation, and walk back
 * to the associated tool_approval to read cardData.specialist_name.
 *
 * Used by detectRefinement in agent.ts to determine whether the prior turn
 * ended with a completed tool result so we can inherit the specialist on
 * multi-turn refinements.
 *
 * Returns null when no result_card exists in the conversation.
 */
export const getLastToolResultWithSpecialist = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }) => {
    // Find the most recent result_card message
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .order("desc")
      .filter((q) => q.eq(q.field("messageType"), "result_card"))
      .first();

    if (!messages) {
      return { hasResult: false, specialistName: null, resultCreatedAt: null };
    }

    // Walk backward to find the toolCall that produced this result_card,
    // then read the specialist_name from the tool_approval message.
    // The toolCalls table has resultMessageId pointing to the result_card.
    const toolCall = await ctx.db
      .query("toolCalls")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .filter((q) => q.eq(q.field("resultMessageId"), messages._id))
      .first();

    if (!toolCall) {
      return {
        hasResult: true,
        specialistName: null,
        resultCreatedAt: messages.createdAt,
      };
    }

    // Read the tool_approval message (linked via toolCall.messageId)
    const approvalMessage = await ctx.db.get(toolCall.messageId);
    const specialistName: string | null =
      typeof (approvalMessage?.cardData as Record<string, unknown> | undefined)
        ?.specialist_name === "string"
        ? (approvalMessage?.cardData as Record<string, unknown>)
            .specialist_name as string
        : null;

    return {
      hasResult: true,
      specialistName,
      resultCreatedAt: messages.createdAt,
    };
  },
});

/**
 * List recent telemetry classifications for a conversation.
 * Returns the most recent records ordered by creation time (newest last).
 * Used by computeClarificationDepth to count consecutive ambiguous results.
 */
export const listRecentClassifications = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.number(),
  },
  handler: async (ctx, { conversationId, limit }) => {
    const records = await ctx.db
      .query("agentTelemetry")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .order("desc")
      .take(limit);
    // Return in chronological order (oldest first) for depth counting
    return records.reverse();
  },
});
