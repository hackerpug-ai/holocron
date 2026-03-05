import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get conversation count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db.query("conversations").collect();
    return conversations.length;
  },
});

/**
 * List all conversations sorted by updatedAt (newest first)
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_updated")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get a single conversation by id
 */
export const get = query({
  args: {
    id: v.id("conversations"),
  },
  handler: async (ctx, { id }) => {
    const conversation = await ctx.db.get(id);
    return conversation ?? null;
  },
});
