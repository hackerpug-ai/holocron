import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get a single toolCall by ID
 */
export const get = query({
  args: { id: v.id("toolCalls") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Get all toolCalls for a conversation
 */
export const listByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("toolCalls")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .collect();
  },
});

/**
 * Get all pending toolCalls for a conversation
 */
export const getPending = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("toolCalls")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});
