import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
/**
 * List pending audio transcript jobs, sorted by priority (high first) then createdAt
 */
export const listPendingJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("audioTranscriptJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Sort by priority (descending) then createdAt (ascending)
    return jobs.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.createdAt - b.createdAt; // Older jobs first
    });
  },
});

/**
 * Get a single audio transcript job by ID
 */
export const getJob = internalQuery({
  args: {
    jobId: v.id("audioTranscriptJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get audio transcript by content ID
 */
export const getTranscriptByContentId = internalQuery({
  args: {
    contentId: v.string(),
  },
  handler: async (ctx, args) => {
    const transcripts = await ctx.db
      .query("audioTranscripts")
      .withIndex("by_content_id", (q) => q.eq("contentId", args.contentId))
      .collect();

    return transcripts[0] || null;
  },
});

/**
 * Get audio transcript by source URL
 */
export const getTranscriptBySourceUrl = internalQuery({
  args: {
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const transcripts = await ctx.db
      .query("audioTranscripts")
      .withIndex("by_source_url", (q) => q.eq("sourceUrl", args.sourceUrl))
      .collect();

    return transcripts[0] || null;
  },
});

/**
 * Get transcript metadata by ID (without text)
 * Use internal.audioTranscripts.actions.getTranscriptText for full text
 */
export const getTranscriptMetadata = internalQuery({
  args: {
    transcriptId: v.id("audioTranscripts"),
  },
  handler: async (ctx, args) => {
    const transcript = await ctx.db.get(args.transcriptId);
    if (!transcript) {
      return null;
    }

    return {
      sourceUrl: transcript.sourceUrl,
      contentId: transcript.contentId,
      wordCount: transcript.wordCount,
      durationMs: transcript.durationMs,
      language: transcript.language,
      generatedAt: transcript.generatedAt,
      transcriptSource: transcript.transcriptSource,
    };
  },
});
