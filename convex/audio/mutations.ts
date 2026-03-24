import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Job management
// ---------------------------------------------------------------------------

/**
 * Create a new audio generation job for a document.
 * Idempotent: if a pending or running job already exists for the document,
 * that job's _id is returned instead of inserting a duplicate.
 */
export const createJob = internalMutation({
  args: {
    documentId: v.id("documents"),
    voiceId: v.string(),
    totalSegments: v.number(),
  },
  handler: async (ctx, args) => {
    // Check for an existing active job (pending or running).
    const existingJobs = await ctx.db
      .query("audioJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    const activeJob = existingJobs.find(
      (j) => j.status === "pending" || j.status === "running"
    );

    if (activeJob) {
      return activeJob._id;
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("audioJobs", {
      documentId: args.documentId,
      voiceId: args.voiceId,
      status: "pending",
      totalSegments: args.totalSegments,
      completedSegments: 0,
      failedSegments: 0,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

// ---------------------------------------------------------------------------
// Segment management
// ---------------------------------------------------------------------------

/**
 * Batch-create audio segment rows for a document.
 * Each segment starts with status "pending".
 * Idempotent: if segments already exist for the document, their IDs are
 * returned without inserting duplicates.
 * An optional jobId can be attached to every inserted segment.
 */
export const createSegments = internalMutation({
  args: {
    documentId: v.id("documents"),
    voiceId: v.string(),
    jobId: v.optional(v.id("audioJobs")),
    paragraphs: v.array(
      v.object({
        index: v.number(),
        hash: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Idempotency: return existing segment IDs if they match the requested paragraphs.
    const allExisting = await ctx.db
      .query("audioSegments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    if (allExisting.length > 0) {
      // If counts match and hashes match, reuse existing segments
      if (allExisting.length === args.paragraphs.length) {
        const existingHashes = new Set(allExisting.map((s) => s.paragraphHash));
        const allMatch = args.paragraphs.every((p) => existingHashes.has(p.hash));
        if (allMatch) {
          const sorted = allExisting.sort((a, b) => a.paragraphIndex - b.paragraphIndex);

          // Reset any failed/pending segments so the new job can drive them.
          // Update jobId to the new job so progress tracking works correctly.
          const now = Date.now();
          for (const seg of sorted) {
            if (seg.status === "failed" || seg.status === "pending") {
              await ctx.db.patch(seg._id, {
                status: "pending",
                jobId: args.jobId,
                errorMessage: undefined,
                updatedAt: now,
              });
            } else if (seg.jobId !== args.jobId) {
              // Completed/generating segments: just update jobId
              await ctx.db.patch(seg._id, {
                jobId: args.jobId,
                updatedAt: now,
              });
            }
          }

          // Sync the job's completed count with already-completed segments
          if (args.jobId) {
            const alreadyCompleted = sorted.filter(
              (s) => s.status === "completed"
            ).length;
            if (alreadyCompleted > 0) {
              const job = await ctx.db.get(args.jobId);
              if (job) {
                await ctx.db.patch(args.jobId, {
                  completedSegments: alreadyCompleted,
                  status: alreadyCompleted === sorted.length ? "completed" : "running",
                  failedSegments: 0,
                  updatedAt: now,
                });
              }
            }
          }

          return sorted.map((s) => s._id);
        }
      }
      // Mismatch — delete stale segments and re-create below
      await Promise.all(allExisting.map((s) => ctx.db.delete(s._id)));
    }

    const now = Date.now();
    const ids = await Promise.all(
      args.paragraphs.map((paragraph) =>
        ctx.db.insert("audioSegments", {
          documentId: args.documentId,
          voiceId: args.voiceId,
          paragraphIndex: paragraph.index,
          paragraphHash: paragraph.hash,
          status: "pending",
          jobId: args.jobId,
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        })
      )
    );

    return ids;
  },
});

/**
 * Mark a segment as generating (called by the audio generation action).
 */
export const markGenerating = internalMutation({
  args: {
    segmentId: v.id("audioSegments"),
  },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return;
    await ctx.db.patch(args.segmentId, {
      status: "generating",
      updatedAt: Date.now(),
    });
    if (segment.jobId) {
      const job = await ctx.db.get(segment.jobId);
      if (job && job.status === "pending") {
        await ctx.db.patch(segment.jobId, { status: "running", updatedAt: Date.now() });
      }
    }
  },
});

/**
 * Mark a segment as completed with its storage reference and duration.
 * If the segment belongs to a job, the job progress is updated inline.
 */
export const completeSegment = internalMutation({
  args: {
    segmentId: v.id("audioSegments"),
    storageId: v.id("_storage"),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return;

    await ctx.db.patch(args.segmentId, {
      status: "completed",
      storageId: args.storageId,
      durationMs: args.durationMs,
      updatedAt: Date.now(),
    });

    // Update parent job progress if this segment belongs to one.
    if (segment.jobId) {
      const job = await ctx.db.get(segment.jobId);
      if (job) {
        const completedSegments = job.completedSegments + 1;
        const failedSegments = job.failedSegments;
        const allResolved = completedSegments + failedSegments === job.totalSegments;
        const newStatus = allResolved
          ? failedSegments > 0
            ? "failed"
            : "completed"
          : job.status;

        await ctx.db.patch(segment.jobId, {
          completedSegments,
          status: newStatus,
          updatedAt: Date.now(),
        });

        // Notify when all segments are done and job completed successfully
        if (allResolved && newStatus === "completed") {
          await ctx.db.insert("notifications", {
            type: "audio_complete",
            title: "Audio Ready",
            body: "Audio generation for your document has finished.",
            route: `/document/${job.documentId}`,
            referenceId: job.documentId,
            read: false,
            createdAt: Date.now(),
          });
        }
      }
    }
  },
});

/**
 * Mark a segment as failed with an error message.
 * If the segment belongs to a job, the job progress is updated inline.
 */
export const failSegment = internalMutation({
  args: {
    segmentId: v.id("audioSegments"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return;

    await ctx.db.patch(args.segmentId, {
      status: "failed",
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });

    // Update parent job progress if this segment belongs to one.
    if (segment.jobId) {
      const job = await ctx.db.get(segment.jobId);
      if (job) {
        const completedSegments = job.completedSegments;
        const failedSegments = job.failedSegments + 1;
        const allResolved = completedSegments + failedSegments === job.totalSegments;
        const newStatus = allResolved
          ? failedSegments > 0
            ? "failed"
            : "completed"
          : job.status;

        await ctx.db.patch(segment.jobId, {
          failedSegments,
          status: newStatus,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

/**
 * Reset a failed segment so it can be retried.
 * Enforces a maximum of 3 retry attempts (retryCount < 3).
 * Returns { retried: true } if the reset happened, { retried: false } if
 * the segment has already reached the retry limit or does not exist.
 */
export const resetSegmentForRetry = internalMutation({
  args: {
    segmentId: v.id("audioSegments"),
  },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return { retried: false };

    const currentRetryCount = segment.retryCount ?? 0;
    if (currentRetryCount >= 3) {
      return { retried: false };
    }

    await ctx.db.patch(args.segmentId, {
      status: "pending",
      retryCount: currentRetryCount + 1,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });

    // Decrement failedSegments on the parent job and ensure it's running
    if (segment.jobId) {
      const job = await ctx.db.get(segment.jobId);
      if (job) {
        await ctx.db.patch(segment.jobId, {
          failedSegments: Math.max(0, job.failedSegments - 1),
          status: "running",
          updatedAt: Date.now(),
        });
      }
    }

    return { retried: true };
  },
});

/**
 * Delete all audio segments and active jobs for a document.
 * Storage blobs are deleted atomically before their DB rows, preventing
 * orphaned files. Also removes any active audioJobs for the document.
 */
export const deleteAllForDocument = internalMutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    // Delete storage blobs and segment rows.
    const segments = await ctx.db
      .query("audioSegments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    await Promise.all(
      segments.map(async (segment) => {
        if (segment.storageId) {
          await ctx.storage.delete(segment.storageId);
        }
        await ctx.db.delete(segment._id);
      })
    );

    // Delete any audio jobs associated with this document.
    const jobs = await ctx.db
      .query("audioJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    await Promise.all(jobs.map((job) => ctx.db.delete(job._id)));
  },
});
