import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { detectPodcastPlatform, generateContentId } from "./internal";

interface CreatePodcastTranscriptJobResult {
  success: boolean;
  alreadyExists: boolean;
  transcriptId?: string;
  jobId?: string;
  contentId: string;
  platform?: "spotify" | "apple_podcasts" | "rss" | "direct_mp3";
  status?: string;
}

/**
 * Create an audio transcript job from a podcast URL
 * This is the main entry point for podcast transcription from chat
 */
export const createPodcastTranscriptJob = action({
  args: {
    url: v.string(),
    priority: v.optional(v.number()), // Default: 8 (high priority for user-initiated)
  },
  handler: async (ctx, args): Promise<CreatePodcastTranscriptJobResult> => {
    const platform = detectPodcastPlatform(args.url);

    if (!platform) {
      throw new Error("Unsupported podcast URL. Please provide a Spotify, Apple Podcasts, RSS feed, or direct MP3 link.");
    }

    const contentId = generateContentId(args.url);

    // Check if a transcript already exists for this URL
    const existingTranscript = await ctx.runQuery(internal.audioTranscripts.queries.getTranscriptBySourceUrl, {
      sourceUrl: args.url,
    });

    if (existingTranscript) {
      return {
        success: true,
        alreadyExists: true,
        transcriptId: existingTranscript._id,
        contentId,
      };
    }

    // Check if there's already a pending job
    const existingJobs = await ctx.runQuery(internal.audioTranscripts.queries.listPendingJobs, {});
    const existingJob = existingJobs.find((job) => job.contentId === contentId);

    if (existingJob) {
      return {
        success: true,
        alreadyExists: true,
        jobId: existingJob._id,
        contentId,
        status: existingJob.status,
      };
    }

    // Create new job
    const jobId = await ctx.runMutation(internal.audioTranscripts.mutations.createJob, {
      contentId,
      sourceUrl: args.url,
      platform,
      priority: args.priority ?? 8,
    });

    // Trigger job processing
    await ctx.scheduler.runAfter(
      0,
      internal.audioTranscripts.scheduled.processPendingJobs,
      {}
    );

    return {
      success: true,
      alreadyExists: false,
      jobId,
      contentId,
      platform,
    };
  },
});

interface GetTranscriptStatusResult {
  status: "completed" | "pending" | "downloading" | "transcribing" | "failed" | "not_found";
  transcriptId?: string;
  jobId?: string;
  previewText?: string;
  wordCount?: number;
  durationMs?: number;
  language?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * Get transcript status by content ID
 */
export const getTranscriptStatus = action({
  args: {
    contentId: v.string(),
  },
  handler: async (ctx, args): Promise<GetTranscriptStatusResult> => {
    // Check for completed transcript
    const transcript = await ctx.runQuery(internal.audioTranscripts.queries.getTranscriptByContentId, {
      contentId: args.contentId,
    });

    if (transcript) {
      return {
        status: "completed",
        transcriptId: transcript._id,
        previewText: transcript.previewText,
        wordCount: transcript.wordCount,
        durationMs: transcript.durationMs,
        language: transcript.language,
        metadata: transcript.metadataJson,
      };
    }

    // Check for pending jobs
    const jobs = await ctx.runQuery(internal.audioTranscripts.queries.listPendingJobs, {});
    const job = jobs.find((j) => j.contentId === args.contentId);

    if (job) {
      return {
        status: job.status as "pending" | "downloading" | "transcribing" | "failed",
        jobId: job._id,
        errorMessage: job.errorMessage,
      };
    }

    return {
      status: "not_found",
    };
  },
});

interface GetTranscriptTextResult {
  text: string;
  metadata: {
    sourceUrl: string;
    contentId: string;
    wordCount: number;
    durationMs?: number;
    language?: string;
    generatedAt: number;
    transcriptSource: string;
  };
}

/**
 * Get full transcript text
 */
export const getTranscriptText = action({
  args: {
    transcriptId: v.id("audioTranscripts"),
  },
  handler: async (ctx, args): Promise<GetTranscriptTextResult> => {
    const transcript = await ctx.runQuery(internal.audioTranscripts.queries.getTranscriptMetadata, {
      transcriptId: args.transcriptId,
    });

    if (!transcript) {
      throw new Error("Transcript not found");
    }

    // Get storage ID from the document
    const transcriptDoc = await ctx.runQuery(internal.audioTranscripts.queries.getTranscriptByContentId, {
      contentId: transcript.contentId,
    });

    if (!transcriptDoc) {
      throw new Error("Transcript document not found");
    }

    // Access storage directly (only available in actions)
    const transcriptFile = await ctx.storage.get(transcriptDoc.storageId);
    if (!transcriptFile) {
      throw new Error("Transcript file not found in storage");
    }

    const text = await transcriptFile.text();

    return {
      text,
      metadata: {
        sourceUrl: transcript.sourceUrl,
        contentId: transcript.contentId,
        wordCount: transcript.wordCount,
        durationMs: transcript.durationMs,
        language: transcript.language,
        generatedAt: transcript.generatedAt,
        transcriptSource: transcript.transcriptSource,
      },
    };
  },
});
