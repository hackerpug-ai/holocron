import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get a transcript by contentId (e.g., YouTube video ID).
 * Returns null if transcript doesn't exist.
 */
export const getTranscript = internalQuery({
  args: {
    contentId: v.string(),
  },
  handler: async (ctx, args) => {
    const transcript = await ctx.db
      .query("videoTranscripts")
      .withIndex("by_content_id", (q) => q.eq("contentId", args.contentId))
      .first();

    if (!transcript) {
      return null;
    }

    return {
      _id: transcript._id,
      contentId: transcript.contentId,
      sourceUrl: transcript.sourceUrl,
      transcriptType: transcript.transcriptType,
      transcriptSource: transcript.transcriptSource,
      storageId: transcript.storageId,
      previewText: transcript.previewText,
      wordCount: transcript.wordCount,
      durationMs: transcript.durationMs ?? null,
      language: transcript.language ?? null,
      metadata: transcript.metadataJson ?? null,
      generatedAt: transcript.generatedAt,
      createdAt: transcript.createdAt,
    };
  },
});

/**
 * List pending transcript jobs, sorted by priority (high first) then createdAt
 */
export const listPendingJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pendingJobs = await ctx.db
      .query("transcriptJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Sort by priority (descending, so higher priority first) then createdAt (ascending)
    return pendingJobs.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.createdAt - b.createdAt; // Older jobs first
    });
  },
});

/**
 * Get a transcript job by ID
 */
export const getJob = internalQuery({
  args: {
    jobId: v.id("transcriptJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }

    return {
      _id: job._id,
      contentId: job.contentId,
      sourceUrl: job.sourceUrl,
      status: job.status,
      priority: job.priority,
      retryCount: job.retryCount,
      errorMessage: job.errorMessage ?? null,
      transcriptId: job.transcriptId ?? null,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      createdAt: job.createdAt,
    };
  },
});
