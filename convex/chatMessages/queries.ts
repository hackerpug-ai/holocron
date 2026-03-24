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
      .filter((q) => q.neq(q.field("deleted"), true))
      .take(limit);

    // Return in descending order (newest first) for inverted FlatList
    return messages;
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

/**
 * Find deep research loading card by session ID
 *
 * Returns the "deep_research_loading" card for a given session
 * so it can be updated with progress steps instead of creating new cards.
 */
export const findLoadingCardBySession = query({
  args: {
    conversationId: v.id("conversations"),
    sessionId: v.string(),
  },
  handler: async (ctx, { conversationId, sessionId }) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .filter((q) => q.eq(q.field("messageType"), "result_card"))
      .collect();

    // Find the message with matching session_id and card_type
    const loadingCard = messages.find((msg) => {
      const cardData = msg.cardData as Record<string, unknown> | undefined;
      return (
        cardData?.card_type === "deep_research_loading" &&
        cardData?.session_id === sessionId
      );
    });

    return loadingCard ?? null;
  },
});
