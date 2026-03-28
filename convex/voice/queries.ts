import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Returns the active voice session for a conversation, or null if none exists.
 * A session is active when completedAt is undefined.
 * Used to prevent duplicate concurrent sessions.
 *
 * Uses the by_conversation index for efficient lookup.
 */
export const getActiveSession = query({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.union(
    v.object({
      _id: v.id("voiceSessions"),
      _creationTime: v.number(),
      conversationId: v.id("conversations"),
      startedAt: v.number(),
      turnCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.optional(v.number()),
      totalDurationMs: v.optional(v.number()),
      errorMessage: v.optional(v.string()),
      metadata: v.optional(v.object({
        deviceType: v.string(),
        platform: v.string(),
        appVersion: v.string(),
      })),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("voiceSessions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .filter((q) => q.eq(q.field("completedAt"), undefined))
      .first();

    return session ?? null;
  },
});
