import { query } from "../_generated/server";

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
 * List all conversations (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("conversations").collect();
  },
});
