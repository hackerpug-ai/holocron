import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const SESSION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Finds and marks orphaned voice sessions as completed with an error message.
 *
 * A session is orphaned when:
 * - It has no completedAt (still "active")
 * - It was created more than 10 minutes ago
 *
 * Orphaned sessions are caused by app crashes or disconnects.
 * We mark them completed rather than deleting to preserve audit trail.
 *
 * Returns the count of sessions that were timed out.
 */
export const timeoutOrphanedSessions = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - SESSION_TIMEOUT_MS;

    // Query sessions by created timestamp to find old ones
    // Use by_created index to avoid a full table scan
    const oldSessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .filter((q) => q.eq(q.field("completedAt"), undefined))
      .collect();

    let timedOutCount = 0;

    for (const session of oldSessions) {
      await ctx.db.patch(session._id, {
        completedAt: now,
        errorMessage: "Session timed out",
        updatedAt: now,
      });
      timedOutCount++;
    }

    return timedOutCount;
  },
});
