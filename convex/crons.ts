import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Convex Cron Jobs
 *
 * This file defines scheduled jobs that run automatically on a cron schedule.
 *
 * @see https://docs.convex.dev/scheduling/cron-jobs
 */

const crons = cronJobs();

/**
 * Task Timeout Worker
 *
 * Marks stuck tasks as errored if they've been running too long.
 * - Runs every 1 hour
 * - Default timeout: 60 minutes
 * - Only affects tasks in "running" status
 *
 * This replaces the Supabase Edge Function cron job that was previously
 * used for the same purpose.
 *
 * @see supabase/functions/task-timeout-worker/index.ts (old implementation)
 */
crons.interval(
  "task-timeout-worker",
  { hours: 1 }, // Run every hour
  internal.taskCrons.timeoutStuckTasks,
  { timeoutMinutes: 60 } // Tasks running longer than 60 minutes are marked as errored
);

/**
 * Subscription Monitor
 *
 * Fetches new content from all active subscriptions.
 * - Runs every 1 hour
 * - Supports: YouTube, newsletters, Reddit, GitHub changelogs
 * - Applies relevancy filters and queues content for research
 *
 * This replaces the Supabase Edge Function subscription-fetch.
 *
 * @see .holocron/supabase/functions/subscription-fetch/index.ts (old implementation)
 */
crons.interval(
  "subscription-monitor",
  { hours: 1 }, // Run every hour
  internal.subscriptions.internal.checkAllSubscriptions
);

/**
 * Subscription Auto-Research Worker
 *
 * Processes queued subscription content by reading articles/videos
 * and storing them as holocron documents.
 * - Runs every 2 hours
 * - Processes up to 5 items per run to avoid timeouts
 * - Uses Jina Reader to extract content
 */
crons.interval(
  "subscription-auto-research",
  { hours: 2 },
  internal.subscriptions.internal.processQueuedContent
);

/**
 * Document Embedding Backfill
 *
 * Backfills embeddings for documents that were created without them.
 * - Runs every 1 hour
 * - Processes up to 50 documents per run
 * - Uses the updateWithEmbedding action to generate embeddings
 *
 * This ensures all documents have embeddings for semantic search.
 */
crons.interval(
  "document-embedding-backfill",
  { hours: 1 }, // Run every hour
  (internal as any).documents.scheduled.backfillOrphanedEmbeddings
);

/**
 * What's New Daily Report Generator
 *
 * Automatically generates a daily AI software engineering news briefing.
 * - Runs daily at 6 AM PST (13:00 UTC)
 * - Fetches from Reddit, HN, GitHub, Dev.to, Lobsters
 * - Synthesizes into markdown report with embeddings
 * - Stores as document for MCP/app retrieval
 */
crons.daily(
  "whats-new-daily",
  { hourUTC: 13, minuteUTC: 0 }, // 6 AM PST
  internal.whatsNew.actions.generateDailyReport as any,
  {} as any
);

/**
 * Audio Stuck Segment Cleanup
 *
 * Detects and marks stuck audio segments and jobs as failed.
 * - Runs every 5 minutes
 * - Segments stuck in "generating" for > 3 minutes are marked failed
 * - Jobs stuck in "running" for > 10 minutes are marked failed
 */
crons.interval(
  "audio-stuck-segment-cleanup",
  { minutes: 5 },
  internal.audio.scheduled.timeoutStuckSegments
);

/**
 * Tool Call Timeout Worker
 *
 * Detects and marks stuck tool calls as timed out.
 * - Runs every 2 minutes
 * - Affects toolCalls stuck in "approved" status for > 5 minutes
 * - Resets agentBusy on the conversation so the user isn't blocked
 * - Posts an error message so the user knows what happened
 */
crons.interval(
  "toolcall-timeout",
  { minutes: 2 },
  internal.toolCalls.scheduled.timeoutStuckToolCalls
);

/**
 * Assimilation Timeout Worker
 *
 * Detects and marks stuck assimilation sessions as timed out.
 * - Runs every 15 minutes
 * - Only affects sessions stuck in an in-progress state
 */
crons.interval("assimilation-timeout", { minutes: 15 },
  internal.assimilate.scheduled.timeoutStuckSessions
);

export default crons;
