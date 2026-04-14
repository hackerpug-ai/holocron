/**
 * Audio Transcript Scheduled Functions — Job Processing with Staggered Execution
 *
 * Background job processing for audio transcript generation.
 * Prevents timeout by processing one job at a time,
 * scheduling the next via ctx.scheduler with stagger delays.
 *
 * Flow:
 *   processPendingJobs → processJob (download audio, transcribe via Deepgram)
 *   → completed (transcript stored) OR failed (with retry logic)
 */

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  extractSpotifyAudioUrl,
  extractApplePodcastsAudioUrl,
  downloadAndStoreAudio,
  transcribeWithDeepgram,
} from "./internal";

const STAGGER_MS = 5000; // 5 seconds between jobs
const MAX_RETRIES = 3;

/**
 * Process pending audio transcript jobs with staggered scheduling
 * Fetches audio, transcribes via Deepgram Nova-3 API
 */
export const processPendingJobs = internalAction({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.runQuery(internal.audioTranscripts.queries.listPendingJobs, {});

    if (jobs.length === 0) {
      return;
    }

    let staggerIndex = 0;
    for (const job of jobs) {
      await ctx.scheduler.runAfter(
        staggerIndex * STAGGER_MS,
        internal.audioTranscripts.scheduled.processJob,
        { jobId: job._id }
      );
      staggerIndex++;
    }
  },
});

/**
 * Process individual audio transcript job
 * Handles status transitions, audio download, transcription, and error recovery
 */
export const processJob = internalAction({
  args: {
    jobId: v.id("audioTranscriptJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.audioTranscripts.queries.getJob, {
      jobId: args.jobId,
    });

    if (!job) {
      console.error(`Job ${args.jobId} not found`);
      return;
    }

    // Status guard: prevent re-processing of terminal states
    const terminalStatuses = ["completed", "failed"];
    if (terminalStatuses.includes(job.status)) {
      return;
    }

    // Update status to "downloading"
    await ctx.runMutation(internal.audioTranscripts.mutations.updateJobStatus, {
      jobId: args.jobId,
      status: "downloading",
      startedAt: Date.now(),
    });

    try {
      // Extract audio URL based on platform
      let audioUrl: string | null = null;

      switch (job.platform) {
        case "spotify":
          audioUrl = await extractSpotifyAudioUrl(job.sourceUrl);
          break;
        case "apple_podcasts":
          audioUrl = await extractApplePodcastsAudioUrl(job.sourceUrl);
          break;
        case "rss":
        case "direct_mp3":
          audioUrl = job.sourceUrl; // Direct audio URL
          break;
      }

      if (!audioUrl) {
        throw new Error("Failed to extract audio URL");
      }

      // Download audio
      const { storageId: audioStorageId, sizeBytes } = await downloadAndStoreAudio(
        ctx,
        audioUrl
      );

      console.log(`Audio downloaded: ${sizeBytes} bytes for ${job.contentId}`);

      await ctx.runMutation(internal.audioTranscripts.mutations.updateJobStatus, {
        jobId: args.jobId,
        status: "transcribing",
        audioStorageId: audioStorageId as any, // Cast to satisfy type checker
      });

      // Retrieve audio from storage for transcription
      const audioFile = await ctx.storage.get(audioStorageId);
      if (!audioFile) {
        throw new Error("Audio file not found in storage");
      }

      const audioBuffer = await audioFile.arrayBuffer();

      // Transcribe with Deepgram
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPGRAM_API_KEY not set");
      }

      console.log(`Starting Deepgram transcription for ${job.contentId}`);
      const { text, language, duration, speakers } = await transcribeWithDeepgram(audioBuffer, apiKey);
      console.log(`Deepgram transcription complete: ${text.split(/\s+/).length} words, ${speakers} speakers`);

      // Store transcript
      const transcriptTextBytes = new TextEncoder().encode(text);
      const transcriptArrayBuffer = transcriptTextBytes.buffer.slice(
        transcriptTextBytes.byteOffset,
        transcriptTextBytes.byteOffset + transcriptTextBytes.byteLength
      );
      const transcriptStorageId = await ctx.storage.store(transcriptArrayBuffer as any); // Type assertion for Convex storage

      const transcriptId = await ctx.runMutation(internal.audioTranscripts.mutations.storeTranscript, {
        transcript: {
          sourceUrl: job.sourceUrl,
          contentId: job.contentId,
          storageId: transcriptStorageId,
          previewText: text.slice(0, 500),
          wordCount: text.split(/\s+/).length,
          durationMs: Math.round(duration * 1000),
          language,
          transcriptType: "deepgram_nova3",
          transcriptSource: "deepgram_api",
          generatedAt: Date.now(),
          metadataJson: { speakers, platform: job.platform },
        },
      });

      // Clean up audio file
      await ctx.storage.delete(audioStorageId);
      console.log(`Cleaned up audio file for ${job.contentId}`);

      // Update job as completed
      await ctx.runMutation(internal.audioTranscripts.mutations.updateJobStatus, {
        jobId: args.jobId,
        status: "completed",
        transcriptId,
        completedAt: Date.now(),
      });

      console.log(`Audio transcript job completed for ${job.contentId}`);

    } catch (error) {
      // Handle system errors (API down, network issues, etc.)
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Audio transcript job failed for ${job.contentId}:`, errorMessage);

      // Calculate backoff for retry
      const newRetryCount = job.retryCount + 1;

      if (newRetryCount <= MAX_RETRIES) {
        // Schedule retry with exponential backoff
        const backoffMs = Math.pow(2, job.retryCount) * 1000;

        await ctx.runMutation(internal.audioTranscripts.mutations.scheduleRetry, {
          jobId: args.jobId,
          retryCount: newRetryCount,
          errorMessage,
        });

        await ctx.scheduler.runAfter(
          backoffMs,
          internal.audioTranscripts.scheduled.processJob,
          { jobId: args.jobId }
        );

        console.log(`Scheduled retry ${newRetryCount}/${MAX_RETRIES} for ${job.contentId} in ${backoffMs}ms`);
      } else {
        // Max retries reached, mark as permanently failed
        // First update the error message, then mark as failed
        await ctx.runMutation(internal.audioTranscripts.mutations.scheduleRetry, {
          jobId: args.jobId,
          retryCount: newRetryCount,
          errorMessage: `Max retries reached: ${errorMessage}`,
        });

        await ctx.runMutation(internal.audioTranscripts.mutations.updateJobStatus, {
          jobId: args.jobId,
          status: "failed",
          completedAt: Date.now(),
        });

        console.log(`Audio transcript job permanently failed for ${job.contentId}`);
      }
    }
  },
});
