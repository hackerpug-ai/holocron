import { query } from "../_generated/server";

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
 * List all chat messages (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("chatMessages").collect();
  },
});
