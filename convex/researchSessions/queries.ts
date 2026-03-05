import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get research session count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("researchSessions").collect();
    return sessions.length;
  },
});

/**
 * List all research sessions (for validation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("researchSessions").collect();
  },
});

/**
 * Get a single research session by ID with related iterations
 *
 * This is the key query for US-060: Direct session entity watching
 * Convex will automatically push updates to the client when the session changes
 */
export const get = query({
  args: { id: v.id("researchSessions") },
  handler: async (ctx, { id }) => {
    const session = await ctx.db.get(id);
    if (!session) {
      throw new Error(`Research session ${id} not found`);
    }

    // Fetch iterations if this is deep research
    const iterations = session.researchType === "deep"
      ? await ctx.db
          .query("researchIterations")
          .withIndex("by_session", (q) => q.eq("sessionId", id))
          .collect()
      : undefined;

    return {
      ...session,
      iterations,
    };
  },
});
