/**
 * queue-3 — the 16 migrated cron jobs (formerly convex/crons.ts).
 *
 * Inventory split required by the sprint gate:
 *   7 janitor sweeps · 4 workflows · 1 consumer · 3 backfill · 1 digest = 16
 *
 * Each job carries a priority lane (interactive | background) so the leased
 * queue (queue-1) dequeues latency-sensitive work before background missions.
 * Schedules mirror the legacy Convex definitions (convex/crons.ts).
 *
 * S31-02: each job binds a real handler by reference so an unbound handler is
 * a compile-time-visible hole (and a runtime HANDLER_UNBOUND).
 */
import type { JobLane } from './backend.ts';
import { JOB_HANDLERS, type JobHandler } from './jobs-handlers/index.ts';

export type JobCategory = 'janitor' | 'workflow' | 'consumer' | 'backfill' | 'digest';

export type MigratedJob = {
  name: string;
  category: JobCategory;
  lane: JobLane;
  /** Legacy schedule expression (human-readable; mirrors convex/crons.ts). */
  schedule: string;
  description: string;
  /**
   * Executable handler ported from Convex. Optional only so AC-6 can construct
   * a handlerless override; production MIGRATED_JOBS always bind a handler.
   */
  handler?: JobHandler;
};

function bind(name: keyof typeof JOB_HANDLERS): JobHandler {
  const h = JOB_HANDLERS[name];
  if (!h) {
    throw new Error(`HANDLER_UNBOUND: registry bootstrap missing handler for ${name}`);
  }
  return h;
}

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
    handler: bind('task-timeout-worker'),
  },
  {
    name: 'audio-stuck-segment-cleanup',
    category: 'janitor',
    lane: 'background',
    schedule: 'interval 5m',
    description: 'Fail audio segments stuck generating > 3m and jobs stuck > 10m.',
    handler: bind('audio-stuck-segment-cleanup'),
  },
  {
    name: 'toolcall-timeout',
    category: 'janitor',
    lane: 'interactive',
    schedule: 'interval 2m',
    description: 'Expire toolCalls stuck approved > 5m; reset agentBusy.',
    handler: bind('toolcall-timeout'),
  },
  {
    name: 'assimilation-timeout',
    category: 'janitor',
    lane: 'background',
    schedule: 'interval 15m',
    description: 'Fail assimilation sessions stuck in-progress.',
    handler: bind('assimilation-timeout'),
  },
  {
    name: 'agent-plan-timeout',
    category: 'janitor',
    lane: 'interactive',
    schedule: 'interval 5m',
    description: 'Fail agent plans stuck executing/awaiting > 30m.',
    handler: bind('agent-plan-timeout'),
  },
  {
    name: 'voice-session-timeout',
    category: 'janitor',
    lane: 'interactive',
    schedule: 'interval 2m',
    description: 'Complete orphaned voice sessions (> 2m, no completedAt).',
    handler: bind('voice-session-timeout'),
  },
  {
    name: 'cleanup-agent-telemetry',
    category: 'janitor',
    lane: 'background',
    schedule: 'daily 07:00 UTC',
    description: 'Delete agentTelemetry older than 90 days (batched TTL).',
    handler: bind('cleanup-agent-telemetry'),
  },
  // ── 4 workflows ───────────────────────────────────────────────────────────
  {
    name: 'subscription-monitor',
    category: 'workflow',
    lane: 'background',
    schedule: 'interval 1h',
    description: 'Fetch new content from active subscriptions; queue for research.',
    handler: bind('subscription-monitor'),
  },
  {
    name: 'subscription-auto-research',
    category: 'workflow',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Process queued subscription content into holocron documents.',
    handler: bind('subscription-auto-research'),
  },
  {
    name: 'feed-builder',
    category: 'workflow',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Build feed items from recent subscription content, grouped by creator.',
    handler: bind('feed-builder'),
  },
  {
    name: 'whats-new-daily',
    category: 'workflow',
    lane: 'background',
    schedule: 'daily 13:00 UTC',
    description: 'Generate the daily AI software-engineering news briefing (3-phase workflow).',
    handler: bind('whats-new-daily'),
  },
  // ── 1 consumer ────────────────────────────────────────────────────────────
  {
    name: 'audio-transcript-job-processor',
    category: 'consumer',
    lane: 'interactive',
    schedule: 'interval 2m',
    description: 'Process pending audio transcript jobs (Deepgram Nova-3).',
    handler: bind('audio-transcript-job-processor'),
  },
  // ── 3 backfill ────────────────────────────────────────────────────────────
  {
    name: 'document-embedding-backfill',
    category: 'backfill',
    lane: 'background',
    schedule: 'interval 1h',
    description: 'Backfill embeddings for documents created without them.',
    handler: bind('document-embedding-backfill'),
  },
  {
    name: 'research-embedding-backfill',
    category: 'backfill',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Backfill embeddings for research findings/iterations.',
    handler: bind('research-embedding-backfill'),
  },
  {
    name: 'improvements-embedding-backfill',
    category: 'backfill',
    lane: 'background',
    schedule: 'interval 2h',
    description: 'Backfill embeddings for improvement requests.',
    handler: bind('improvements-embedding-backfill'),
  },
  // ── 1 digest ──────────────────────────────────────────────────────────────
  {
    name: 'morning-digest',
    category: 'digest',
    lane: 'background',
    schedule: 'daily 16:00 UTC',
    description: 'Create the daily morning digest notification (24h of unviewed feed).',
    handler: bind('morning-digest'),
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

/**
 * Resolve the active job list. Tests may override via HOLO_JOBS_UNBIND env
 * (comma-separated job names) to exercise AC-6 HANDLER_UNBOUND without
 * mutating the module-level registry.
 */
export function resolveJobsForRun(): MigratedJob[] {
  const unbind = (process.env.HOLO_JOBS_UNBIND ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (unbind.length === 0) {
    return [...MIGRATED_JOBS];
  }
  return MIGRATED_JOBS.map((j) =>
    unbind.includes(j.name) ? { ...j, handler: undefined } : { ...j }
  );
}
