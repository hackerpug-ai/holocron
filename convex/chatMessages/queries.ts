import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get chat message count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("chatMessages").collect();
    return messages.length;
  },
});

/**
 * List messages by conversation, ordered by createdAt (most recent first)
 * AC-2: Returns messages in order
 */
export const listByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, limit = 50 }) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .order("desc")
      .take(limit);

    // Return in ascending order (oldest first) for chat display
    return messages.reverse();
  },
});

/**
 * List all chat messages (for validation)
 */
export const list = query({
  args: {
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, { conversationId }) => {
    if (conversationId) {
      return await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
        .collect();
    }
    return await ctx.db.query("chatMessages").collect();
  },
});

/**
 * Get a single chat message by id
 */
export const get = query({
  args: {
    id: v.id("chatMessages"),
  },
  handler: async (ctx, { id }) => {
    const message = await ctx.db.get(id);
    return message ?? null;
  },
});
