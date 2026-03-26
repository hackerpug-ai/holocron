import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new transcript job for a contentId (e.g., YouTube video ID).
 * Idempotent: if a non-terminal job already exists for the contentId,
 * that job's _id is returned instead of inserting a duplicate.
 *
 * Terminal statuses: "completed", "failed", "no_captions"
 * Non-terminal: "pending", "downloading", "transcribing"
 */
export const createTranscriptJob = internalMutation({
  args: {
    contentId: v.string(),
    sourceUrl: v.string(),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check for existing job
    const existing = await ctx.db
      .query("transcriptJobs")
      .withIndex("by_content", (q) => q.eq("contentId", args.contentId))
      .first();

    if (existing) {
      // Return existing job if not terminal (pending, downloading, or transcribing)
      if (existing.status === "pending" || existing.status === "downloading" || existing.status === "transcribing") {
        return { jobId: existing._id, created: false };
      }
    }

    // Create new job
    const now = Date.now();
    const jobId = await ctx.db.insert("transcriptJobs", {
      contentId: args.contentId,
      sourceUrl: args.sourceUrl,
      status: "pending",
      priority: args.priority ?? 5,
      retryCount: 0,
      createdAt: now,
    });

    return { jobId, created: true };
  },
});

/**
 * Update the status of a transcript job.
 * Sets startedAt when status transitions to "downloading" or "transcribing".
 * Sets completedAt when status transitions to "completed", "failed", or "no_captions".
 */
export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("transcriptJobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("downloading"),
      v.literal("transcribing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("no_captions")
    ),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    transcriptId: v.optional(v.id("videoTranscripts")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    const now = Date.now();
    const updateData: Record<string, any> = {
      status: args.status,
    };

    // Set startedAt if provided
    if (args.startedAt !== undefined) {
      updateData.startedAt = args.startedAt;
    } else if ((args.status === "downloading" || args.status === "transcribing") && !job.startedAt) {
      updateData.startedAt = now;
    }

    // Set completedAt if provided or on terminal status
    if (args.completedAt !== undefined) {
      updateData.completedAt = args.completedAt;
    } else if (["completed", "failed", "no_captions"].includes(args.status)) {
      updateData.completedAt = now;
    }

    // Set transcriptId if provided
    if (args.transcriptId !== undefined) {
      updateData.transcriptId = args.transcriptId;
    }

    // Set errorMessage if provided
    if (args.errorMessage !== undefined) {
      updateData.errorMessage = args.errorMessage;
    }

    await ctx.db.patch(args.jobId, updateData);

    return { success: true };
  },
});

/**
 * Mark a transcript job as failed with an error message.
 * Sets status to "failed", populates errorMessage, and sets completedAt.
 */
export const markFailed = internalMutation({
  args: {
    jobId: v.id("transcriptJobs"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: now,
    });

    return { success: true };
  },
});

/**
 * Store transcript metadata in videoTranscripts table
 */
export const storeTranscript = internalMutation({
  args: {
    transcript: v.object({
      contentId: v.string(),
      sourceUrl: v.string(),
      transcriptType: v.union(v.literal("api"), v.literal("node_fallback"), v.literal("jina_fallback")),
      transcriptSource: v.string(),
      storageId: v.id("_storage"),
      previewText: v.string(),
      wordCount: v.number(),
      generatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const transcriptId = await ctx.db.insert("videoTranscripts", {
      contentId: args.transcript.contentId,
      sourceUrl: args.transcript.sourceUrl,
      transcriptType: args.transcript.transcriptType,
      transcriptSource: args.transcript.transcriptSource,
      storageId: args.transcript.storageId,
      previewText: args.transcript.previewText,
      wordCount: args.transcript.wordCount,
      generatedAt: args.transcript.generatedAt,
      createdAt: now,
    });

    return transcriptId;
  },
});

/**
 * Schedule a retry for a failed job
 * Updates retryCount and errorMessage, resets status to pending
 */
export const scheduleRetry = internalMutation({
  args: {
    jobId: v.id("transcriptJobs"),
    retryCount: v.number(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    await ctx.db.patch(args.jobId, {
      retryCount: args.retryCount,
      errorMessage: args.errorMessage,
      status: "pending",
    });

    return { success: true };
  },
});
