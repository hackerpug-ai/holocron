import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new toolCall with status "pending"
 */
export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("chatMessages"),
    toolName: v.string(),
    toolDisplayName: v.string(),
    toolArgs: v.any(),
    reasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("toolCalls", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * Transition toolCall status and set resolvedAt
 */
export const updateStatus = mutation({
  args: {
    id: v.id("toolCalls"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("completed"),
      v.literal("failed")
    ),
    resultMessageId: v.optional(v.id("chatMessages")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, resultMessageId, error }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`toolCall ${id} not found`);
    }

    await ctx.db.patch(id, {
      status,
      resolvedAt: Date.now(),
      ...(resultMessageId !== undefined ? { resultMessageId } : {}),
      ...(error !== undefined ? { error } : {}),
    });

    return await ctx.db.get(id);
  },
});
