import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { makeFunctionReference } from "convex/server";

/**
 * Convex Cron Jobs
 *
 * This file defines scheduled jobs that run automatically on a cron schedule.
 *
 * @see https://docs.convex.dev/scheduling/cron-jobs
 */

// Function references for scheduled/internal functions that may not be
// available in the generated API at type-check time.
const backfillOrphanedEmbeddings = makeFunctionReference<
  "action",
  {},
  any
>("documents/scheduled:backfillOrphanedEmbeddings");

// Research and improvements embedding backfill (may not be in generated API yet)
const backfillResearchEmbeddings = makeFunctionReference<
  "action",
  {},
  any
>("migrations/backfill_research_embeddings:backfill");

const backfillImprovementsEmbeddings = makeFunctionReference<
  "action",
  {},
  any
>("migrations/backfill_improvements_embeddings:backfill");

// Workflow-based daily report generation (replaces monolithic action)
const startDailyReportWorkflow = makeFunctionReference<
  "mutation",
  { days?: number; force?: boolean },
  any
>("whatsNew/workflow:startWorkflow");

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
 * Feed Builder
 *
 * Builds feed items from recent subscription content.
 * - Runs every 2 hours
 * - Groups content by creator
 * - Creates feed items and marks content as in feed
 *
 * This ensures the feed is regularly updated with new content
 * from all active subscriptions.
 *
 * @see .spec/prd/subscription-feed-redesign/tasks/02-feed-building/FR-009.md
 */
crons.interval(
  "feed-builder",
  { hours: 2 }, // Run every 2 hours
  internal.feeds.internal.buildFeed,
  { timeoutMinutes: 10 } // Maximum execution time
);

/**
 * Morning Digest
 *
 * Creates a daily digest notification at 9 AM local time.
 * - Runs daily at 9 AM (16:00 UTC)
 * - Summarizes unviewed feed content from the last 24 hours
 * - Provides users with a morning overview of new content
 *
 * @see .spec/prd/subscription-feed-redesign/tasks/09-red-hat-remediation/FR-036.md
 */
crons.daily(
  "morning-digest",
  { hourUTC: 16, minuteUTC: 0 }, // 9 AM PST (16:00 UTC)
  internal.feeds.internal.createMorningDigest,
  {} as any
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
  backfillOrphanedEmbeddings
);

/**
 * Research Embedding Backfill
 *
 * Backfills embeddings for research findings and iterations that were created without them.
 * - Runs every 2 hours
 * - Processes researchFindings and deepResearchIterations tables
 * - Ensures semantic search works for research content
 */
crons.interval(
  "research-embedding-backfill",
  { hours: 2 },
  backfillResearchEmbeddings
);

/**
 * Improvements Embedding Backfill
 *
 * Backfills embeddings for improvement requests that were created without them.
 * - Runs every 2 hours
 * - Processes improvementRequests table
 * - Ensures semantic search works for improvement requests
 */
crons.interval(
  "improvements-embedding-backfill",
  { hours: 2 },
  backfillImprovementsEmbeddings
);

/**
 * What's New Daily Report Generator
 *
 * Automatically generates a daily AI software engineering news briefing.
 * - Runs daily at 6 AM PST (13:00 UTC)
 * - Fetches from Reddit, HN, GitHub, Dev.to, Lobsters
 * - Synthesizes into markdown report with embeddings
 * - Stores as document for MCP/app retrieval
 *
 * Uses workflow orchestration to avoid timeout issues:
 * - Phase 1: Fetch from all sources (120s timeout)
 * - Phase 2: Enrich findings with quality scoring (180s timeout)
 * - Phase 3: Synthesize markdown report (180s timeout)
 */
crons.daily(
  "whats-new-daily",
  { hourUTC: 13, minuteUTC: 0 }, // 6 AM PST
  startDailyReportWorkflow,
  {}
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

/**
 * Agent Plan Timeout Worker
 *
 * Detects and marks stuck agent plans as failed.
 * - Runs every 5 minutes
 * - Affects plans stuck in "executing" or "awaiting_approval" for > 30 minutes
 * - Marks all active steps as failed
 * - Resets agentBusy on the conversation so the user isn't blocked
 * - Posts an error message so the user knows what happened
 */
crons.interval(
  "agent-plan-timeout",
  { minutes: 5 },
  internal.agentPlans.scheduled.timeoutStuckPlans
);

/**
 * Voice Session Timeout Worker
 *
 * Detects and marks orphaned voice sessions as completed with an error.
 * - Runs every 2 minutes
 * - Affects sessions with no completedAt that are older than 2 minutes
 * - Marks sessions completed with errorMessage: "Session timed out"
 * - Preserves sessions for audit trail (never deletes)
 *
 * @see convex/voice/scheduled.ts
 */
crons.interval(
  "voice-session-timeout",
  { minutes: 2 },
  internal.voice.scheduled.timeoutOrphanedSessions
);

export default crons;
