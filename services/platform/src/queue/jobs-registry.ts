/**
 * queue-3 — the 16 migrated cron jobs (formerly convex/crons.ts).
 *
 * Inventory split required by the sprint gate:
 *   7 janitor sweeps · 4 workflows · 1 consumer · 3 backfill · 1 digest = 16
 *
 * Each job carries a priority lane (interactive | background) so the leased
 * queue (queue-1) dequeues latency-sensitive work before background missions.
 * Schedules mirror the legacy Convex definitions (convex/crons.ts).
 */
import type { JobLane } from './backend.ts';

export type JobCategory = 'janitor' | 'workflow' | 'consumer' | 'backfill' | 'digest';

export type MigratedJob = {
  name: string;
  category: JobCategory;
  lane: JobLane;
  /** Legacy schedule expression (human-readable; mirrors convex/crons.ts). */
  schedule: string;
  description: string;
};

/**
 * The 16 migrated jobs. Order is stable (registry order = inventory order).
 * Lane assignment: user-blocking / latency-sensitive work is interactive; the
 * rest are background missions.
 */
export const MIGRATED_JOBS: readonly MigratedJob[] = [
  // ── 7 janitor sweeps ──────────────────────────────────────────────────────
  {
    name: 'task-timeout-worker',
    category: 'janitor',
    lane: 'interactive',
    schedule: 'interval 1h',
    description: 'Mark stuck tasks (running > 60m) as errored.',
  },
  {
    name: 'audio-stuck-segment-cleanup',
    category: 'janitor',
    lane: 'background',
    schedule: 'interval 5m',
    description: 'Fail audio segments stuck generating > 3m and jobs stuck > 10m.',
  },
  {
    name: 'toolcall-timeout',
    category: 'janitor',
    lane: 'interactive',
    schedule: 'interval 2m',
    description: 'Expire toolCalls stuck approved > 5m; reset agentBusy.',
  },
  {
    name: 'assimilation-timeout',
    category: 'janitor',
    lane: 'background',
    schedule: 'interval 15m',
    description: 'Fail assimilation sessions stuck in-progress.',
  },
  {
    name: 'agent-plan-timeout',
    category: 'janitor',
    lane: 'interactive',
    schedule: 'interval 5m',
    description: 'Fail agent plans stuck executing/awaiting > 30m.',
  },
  {
    name: 'voice-session-timeout',
    category: 'janitor',
    lane: 'interactive',
    schedule: 'interval 2m',
    description: 'Complete orphaned voice sessions (> 2m, no completedAt).',
  },
  {
    name: 'cleanup-agent-telemetry',
    category: 'janitor',
    lane: 'background',
    schedule: 'daily 07:00 UTC',
    description: 'Delete agentTelemetry older than 90 days (batched TTL).',
  },
  // ── 4 workflows ───────────────────────────────────────────────────────────
  {
    name: 'subscription-monitor',
    category: 'workflow',
    lane: 'background',
    schedule: 'interval 1h',
    description: 'Fetch new content from active subscriptions; queue for research.',
  },
  {
    name: 'subscription-auto-research',
    category: 'workflow',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Process queued subscription content into holocron documents.',
  },
  {
    name: 'feed-builder',
    category: 'workflow',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Build feed items from recent subscription content, grouped by creator.',
  },
  {
    name: 'whats-new-daily',
    category: 'workflow',
    lane: 'background',
    schedule: 'daily 13:00 UTC',
    description: 'Generate the daily AI software-engineering news briefing (3-phase workflow).',
  },
  // ── 1 consumer ────────────────────────────────────────────────────────────
  {
    name: 'audio-transcript-job-processor',
    category: 'consumer',
    lane: 'interactive',
    schedule: 'interval 2m',
    description: 'Process pending audio transcript jobs (Deepgram Nova-3).',
  },
  // ── 3 backfill ────────────────────────────────────────────────────────────
  {
    name: 'document-embedding-backfill',
    category: 'backfill',
    lane: 'background',
    schedule: 'interval 1h',
    description: 'Backfill embeddings for documents created without them.',
  },
  {
    name: 'research-embedding-backfill',
    category: 'backfill',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Backfill embeddings for research findings/iterations.',
  },
  {
    name: 'improvements-embedding-backfill',
    category: 'backfill',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Backfill embeddings for improvement requests.',
  },
  // ── 1 digest ──────────────────────────────────────────────────────────────
  {
    name: 'morning-digest',
    category: 'digest',
    lane: 'background',
    schedule: 'daily 16:00 UTC',
    description: 'Create the daily morning digest notification (24h of unviewed feed).',
  },
];

export const MIGRATED_JOB_COUNT = MIGRATED_JOBS.length;

export const CATEGORY_SPLIT: Record<JobCategory, number> = MIGRATED_JOBS.reduce(
  (acc, j) => {
    acc[j.category] = (acc[j.category] ?? 0) + 1;
    return acc;
  },
  { janitor: 0, workflow: 0, consumer: 0, backfill: 0, digest: 0 } as Record<JobCategory, number>
);

export function getJob(name: string): MigratedJob | undefined {
  return MIGRATED_JOBS.find((j) => j.name === name);
}
