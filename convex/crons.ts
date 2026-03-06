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
  internal.subscriptions.checkAllSubscriptions
);

export default crons;
