/**
 * Transcript Scheduled Functions — Job Processing with Staggered Execution
 *
 * Background job processing for transcript fetching.
 * Prevents timeout by processing one job at a time,
 * scheduling the next via ctx.scheduler with staggered delays.
 *
 * Flow:
 *   processPendingJobs → processJob (fetch transcript via service)
 *   → completed (transcript stored) OR failed/no_captions (with retry logic)
 */

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

const STAGGER_MS = 5000; // 5 seconds between jobs (increased to avoid YouTube bot protection)
const MAX_RETRIES = 3;

/**
 * Process pending transcript jobs with staggered scheduling
 * Fetches transcripts via YouTube API (primary) or Jina Reader (fallback)
 */
export const processPendingJobs = internalAction({
  args: {},
  handler: async (ctx) => {
    // Fetch pending jobs, sorted by priority (high first) then createdAt
    const jobs = await ctx.runQuery(internal.transcripts.queries.listPendingJobs, {});

    if (jobs.length === 0) {
      
      return;
    }

    

    // Stagger jobs to avoid rate limits
    let staggerIndex = 0;

    for (const job of jobs) {
      await ctx.scheduler.runAfter(
        staggerIndex * STAGGER_MS,
        internal.transcripts.scheduled.processJob,
        { jobId: job._id }
      );
      staggerIndex++;
    }

    
  },
});

/**
 * Process individual transcript job
 * Handles status transitions, retries, and error recovery
 */
export const processJob = internalAction({
  args: {
    jobId: v.id("transcriptJobs"),
  },
  handler: async (ctx, args) => {
    // Fetch job
    const job = await ctx.runQuery(internal.transcripts.queries.getJob, {
      jobId: args.jobId,
    });

    if (!job) {
      console.error(`Job ${args.jobId} not found`);
      return;
    }

    // Status guard: prevent re-processing of terminal states
    const terminalStatuses = ["completed", "failed", "no_captions"];
    if (terminalStatuses.includes(job.status)) {
      
      return;
    }

    

    // Update status to "transcribing"
    await ctx.runMutation(internal.transcripts.mutations.updateJobStatus, {
      jobId: args.jobId,
      status: "transcribing",
      startedAt: Date.now(),
    });

    try {
      // Fetch transcript with fallback (YouTube API → Jina Reader)
      const result = await ctx.runAction(
        internal.transcripts.service.fetchTranscriptWithFallback,
        {
          contentId: job.contentId,
          sourceUrl: job.sourceUrl,
        }
      );

      if (result.success && result.transcript) {
        // Store transcript metadata
        const transcriptId = await ctx.runMutation(
          internal.transcripts.mutations.storeTranscript,
          {
            transcript: {
              sourceUrl: result.transcript.sourceUrl,
              contentId: result.transcript.contentId,
              storageId: result.transcript.storageId as any, // Cast to Id<"_storage">
              transcriptType: result.transcript.transcriptType,
              transcriptSource: result.transcript.transcriptSource,
              previewText: result.transcript.previewText,
              wordCount: result.transcript.wordCount,
              generatedAt: result.transcript.generatedAt,
            },
          }
        );

        // Update job as completed
        await ctx.runMutation(internal.transcripts.mutations.updateJobStatus, {
          jobId: args.jobId,
          status: "completed",
          transcriptId,
          completedAt: Date.now(),
        });

        
      } else {
        // No transcript available (not a failure, expected for some videos)
        await ctx.runMutation(internal.transcripts.mutations.updateJobStatus, {
          jobId: args.jobId,
          status: "no_captions",
          errorMessage: result.error,
          completedAt: Date.now(),
        });

        
      }
    } catch (error) {
      // Handle system errors (API down, network issues, etc.)
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Transcript job failed for ${job.contentId}:`, errorMessage);

      // Calculate backoff for retry
      const newRetryCount = job.retryCount + 1;

      if (newRetryCount <= MAX_RETRIES) {
        // Schedule retry with exponential backoff
        const backoffMs = Math.pow(2, job.retryCount) * 1000;

        await ctx.runMutation(internal.transcripts.mutations.scheduleRetry, {
          jobId: args.jobId,
          retryCount: newRetryCount,
          errorMessage,
        });

        await ctx.scheduler.runAfter(
          backoffMs,
          internal.transcripts.scheduled.processJob,
          { jobId: args.jobId }
        );

        
      } else {
        // Max retries reached, mark as permanently failed
        await ctx.runMutation(internal.transcripts.mutations.updateJobStatus, {
          jobId: args.jobId,
          status: "failed",
          errorMessage: `Max retries reached: ${errorMessage}`,
          completedAt: Date.now(),
        });

        
      }
    }
  },
});
