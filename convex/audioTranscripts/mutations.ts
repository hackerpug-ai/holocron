import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new audio transcript job
 */
export const createJob = internalMutation({
  args: {
    contentId: v.string(),
    sourceUrl: v.string(),
    platform: v.union(v.literal("spotify"), v.literal("apple_podcasts"), v.literal("rss"), v.literal("direct_mp3")),
    priority: v.optional(v.number()), // Default: 5
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.db.insert("audioTranscriptJobs", {
      contentId: args.contentId,
      sourceUrl: args.sourceUrl,
      platform: args.platform,
      status: "pending",
      priority: args.priority ?? 5,
      retryCount: 0,
      createdAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Update job status
 */
export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("audioTranscriptJobs"),
    status: v.union(v.literal("pending"), v.literal("downloading"), v.literal("transcribing"), v.literal("completed"), v.literal("failed")),
    startedAt: v.optional(v.number()),
    audioStorageId: v.optional(v.id("_storage")),
    transcriptId: v.optional(v.id("audioTranscripts")),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;
    await ctx.db.patch(jobId, updates);
  },
});

/**
 * Schedule a retry for a failed job
 */
export const scheduleRetry = internalMutation({
  args: {
    jobId: v.id("audioTranscriptJobs"),
    retryCount: v.number(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;
    await ctx.db.patch(jobId, updates);
  },
});

/**
 * Store a completed transcript
 */
export const storeTranscript = internalMutation({
  args: {
    transcript: v.object({
      sourceUrl: v.string(),
      contentId: v.string(),
      storageId: v.id("_storage"),
      previewText: v.string(),
      wordCount: v.number(),
      durationMs: v.optional(v.number()),
      language: v.optional(v.string()),
      transcriptType: v.union(v.literal("deepgram_nova3"), v.literal("deepgram_nova2")),
      transcriptSource: v.string(),
      generatedAt: v.number(),
      metadataJson: v.optional(v.record(v.string(), v.any())),
    }),
  },
  handler: async (ctx, args) => {
    const transcriptId = await ctx.db.insert("audioTranscripts", {
      ...args.transcript,
      createdAt: Date.now(),
    });

    return transcriptId;
  },
});
