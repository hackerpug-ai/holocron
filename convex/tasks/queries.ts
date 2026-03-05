import { query } from "../_generated/server";

/**
 * Get task count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks.length;
  },
});

/**
 * List all tasks (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});
