import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all audio segments for a document, ordered by paragraphIndex.
 * For completed segments with a storageId, resolves the audio URL from storage.
 */
export const getSegments = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const segments = await ctx.db
      .query("audioSegments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .collect();

    return Promise.all(
      segments.map(async (segment) => {
        let audioUrl: string | null = null;

        if (segment.status === "completed" && segment.storageId) {
          audioUrl = await ctx.storage.getUrl(segment.storageId);
        }

        return {
          _id: segment._id,
          paragraphIndex: segment.paragraphIndex,
          status: segment.status,
          audioUrl,
          durationMs: segment.durationMs ?? null,
          jobId: segment.jobId,
        };
      })
    );
  },
});

/**
 * Get the creation time of the most recently created audio segment for a document.
 * Used for enforcing a regeneration cooldown.
 *
 * Note: .order("desc") on the by_document index sorts by paragraphIndex (the second
 * field in the compound index ["documentId", "paragraphIndex"]), not by creation time.
 * This works correctly only because paragraphs are inserted in ascending paragraphIndex
 * order, making the highest paragraphIndex also the most recently inserted. This is
 * fragile — if insertion order ever changes, this query would return the wrong segment.
 */
export const getMostRecentCreation = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const segment = await ctx.db
      .query("audioSegments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .first()
    return segment ? { createdAt: segment._creationTime } : null
  },
})

/**
 * Get the most recent audio generation job for a document.
 * Returns the job record or null if no job exists.
 * The frontend uses this for overall generation status (progress, errors, etc.).
 */
export const getJob = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("audioJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .first();
    return job ?? null;
  },
});

/**
 * Get aggregate status counts for all audio segments belonging to a document.
 * Returns totals broken down by status.
 */
export const getStatus = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const segments = await ctx.db
      .query("audioSegments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    const counts = {
      total: segments.length,
      completed: 0,
      pending: 0,
      generating: 0,
      failed: 0,
    };

    for (const segment of segments) {
      counts[segment.status] += 1;
    }

    return counts;
  },
});
