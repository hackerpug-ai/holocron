import { internalMutation } from "../_generated/server";

const SEGMENT_TIMEOUT_MS = 180_000; // 3 minutes
const JOB_TIMEOUT_MS = 600_000; // 10 minutes

/**
 * Finds and marks stuck audio segments and jobs as failed.
 *
 * Strategy:
 * 1. Query audioJobs with status "running" using the by_status index.
 * 2. For each running job, query its segments by documentId that are stuck
 *    in "generating" status beyond the timeout threshold.
 * 3. Separately, mark any running audioJobs that have exceeded the job
 *    timeout threshold as failed.
 */
export const timeoutStuckSegments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const segmentCutoff = now - SEGMENT_TIMEOUT_MS;
    const jobCutoff = now - JOB_TIMEOUT_MS;

    // Query all running jobs via the by_status index
    const runningJobs = await ctx.db
      .query("audioJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    // For each running job, find and timeout stuck segments
    for (const job of runningJobs) {
      const generatingSegments = await ctx.db
        .query("audioSegments")
        .withIndex("by_document_and_status", (q) =>
          q.eq("documentId", job.documentId).eq("status", "generating")
        )
        .collect();

      for (const segment of generatingSegments) {
        if (segment.updatedAt < segmentCutoff) {
          await ctx.db.patch(segment._id, {
            status: "failed",
            errorMessage: "Generation timed out",
            updatedAt: now,
          });
        }
      }

      // Timeout the job itself if it has been running too long
      if (job.updatedAt < jobCutoff) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Job timed out",
          updatedAt: now,
        });
      }
    }

    // Also timeout pending jobs that never started
    const pendingJobs = await ctx.db
      .query("audioJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    for (const job of pendingJobs) {
      if (job.updatedAt < jobCutoff) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Job timed out (never started)",
          updatedAt: now,
        });
      }
    }
  },
});
