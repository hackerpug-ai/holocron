import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get deep research session count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("deepResearchSessions").collect();
    return sessions.length;
  },
});

/**
 * List all deep research sessions (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("deepResearchSessions").collect();
  },
});

/**
 * Get a single deep research session by ID with related iterations
 *
 * This is the key query for US-060: Direct session entity watching
 * Convex will automatically push updates to the client when the session changes
 */
export const get = query({
  args: { id: v.id("deepResearchSessions") },
  handler: async (ctx, { id }) => {
    const session = await ctx.db.get(id);
    if (!session) {
      throw new Error(`Deep research session ${id} not found`);
    }

    // Fetch iterations for this session
    const iterations = await ctx.db
      .query("deepResearchIterations")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .collect();

    return {
      ...session,
      iterations,
    };
  },
});
