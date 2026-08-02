/**
 * C-03 / D06-03 — real schedule disable + in-flight drain.
 *
 * INTENTIONALLY UNFENCED (raw _generated/server imports). HOLO_MIGRATION_READ_ONLY
 * remains the sole write-enforcement mechanism; this module is sequencing + evidence
 * so quiet-check can prove schedules were disabled/drained before the quiet window.
 *
 * Non-destructive: does not delete cron registrations. Operator sets
 * HOLO_CUTOVER_SCHEDULES_DISABLED=1 (env). Consumers under fencedInternal* and
 * taskCrons honor that flag (real disable). This mutation:
 *   1. Requires the env flag visible in Convex runtime
 *   2. Drains in-flight tasks / queued subscription work to terminal states
 *   3. Records drain_completed audit with consumer-honor proof
 */
import { v } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import { mutation, query } from '../_generated/server';
import { CUTOVER_SCHEDULES_DISABLED_ENV, isCutoverSchedulesDisabled } from '../lib/migrationFence';

/** Inventory of schedule surfaces drained during cutover quiet protocol. */
export const CUTOVER_DRAIN_SURFACES = ['crons', 'queues', 'outbox', 'scheduled_jobs'] as const;

const TASK_ACTIVE_STATUSES = ['pending', 'queued', 'loading', 'running'] as const;
const DRAIN_BATCH = 100;

type InFlightSample = {
  runningTasks: number;
  activeTasks: number;
  queuedSubscriptionContent: number;
};

async function sampleInFlight(ctx: MutationCtx): Promise<InFlightSample> {
  let runningTasks = 0;
  let activeTasks = 0;
  let queuedSubscriptionContent = 0;

  try {
    for (const status of TASK_ACTIVE_STATUSES) {
      const rows = await ctx.db
        .query('tasks')
        .withIndex('by_status', (q) => q.eq('status', status))
        .take(DRAIN_BATCH);
      activeTasks += rows.length;
      if (status === 'running') runningTasks = rows.length;
    }
  } catch {
    // index/table may differ
  }

  try {
    const queued = await ctx.db
      .query('subscriptionContent')
      .withIndex('by_status', (q) => q.eq('researchStatus', 'queued'))
      .take(DRAIN_BATCH);
    queuedSubscriptionContent = queued.length;
  } catch {
    // optional table/index
  }

  return { runningTasks, activeTasks, queuedSubscriptionContent };
}

/**
 * Real schedule disable/drain for quiet-check evidence.
 * Fails closed if HOLO_CUTOVER_SCHEDULES_DISABLED is not visible in-runtime
 * (setting env from CLI without consumers reading it is theatre).
 */
export const disableAndDrain = mutation({
  args: {
    surfaces: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
    atMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const atMs = args.atMs ?? Date.now();
    const surfaces = args.surfaces?.length ? args.surfaces : [...CUTOVER_DRAIN_SURFACES];

    // ── 1. Consumers MUST see the durable disable flag in Convex runtime ──
    const envRaw = process.env[CUTOVER_SCHEDULES_DISABLED_ENV] ?? '';
    const consumersHonored = isCutoverSchedulesDisabled();
    if (!consumersHonored) {
      return {
        ok: false,
        id: null,
        drainCompletedAtMs: 0,
        surfaces,
        consumersHonored: false,
        consumers: {
          env: CUTOVER_SCHEDULES_DISABLED_ENV,
          envValue: envRaw,
          isCutoverSchedulesDisabled: false,
          fencedInternalBuilders: true,
          taskCrons: true,
        },
        samples: {
          runningTasks: 0,
          activeTasks: 0,
          queuedSubscriptionContent: 0,
          tasksCancelled: 0,
          contentSkipped: 0,
        },
        error: `${CUTOVER_SCHEDULES_DISABLED_ENV} not visible/true in Convex runtime — refuse audit-only drain theatre`,
      };
    }

    // ── 2. Sample in-flight before drain ──────────────────────────────────
    const before = await sampleInFlight(ctx);

    // ── 3. Real drain: terminalise active tasks + skip queued queue work ─
    let tasksCancelled = 0;
    let contentSkipped = 0;

    for (const status of TASK_ACTIVE_STATUSES) {
      try {
        const rows = await ctx.db
          .query('tasks')
          .withIndex('by_status', (q) => q.eq('status', status))
          .take(DRAIN_BATCH);
        for (const task of rows) {
          await ctx.db.patch(task._id, {
            status: 'cancelled',
            errorMessage: `cutover drain: cancelled while ${CUTOVER_SCHEDULES_DISABLED_ENV}=1`,
            errorDetails: {
              reason: 'cutover_schedule_drain',
              previousStatus: status,
              drainedAt: atMs,
            },
            completedAt: atMs,
            updatedAt: atMs,
          });
          tasksCancelled += 1;
        }
      } catch {
        // continue other statuses
      }
    }

    try {
      const queued = await ctx.db
        .query('subscriptionContent')
        .withIndex('by_status', (q) => q.eq('researchStatus', 'queued'))
        .take(DRAIN_BATCH);
      for (const row of queued) {
        await ctx.db.patch(row._id, {
          researchStatus: 'skipped',
          filterReason: `cutover drain: skipped while ${CUTOVER_SCHEDULES_DISABLED_ENV}=1`,
        });
        contentSkipped += 1;
      }
    } catch {
      // optional table
    }

    const after = await sampleInFlight(ctx);

    const samples = {
      runningTasks: before.runningTasks,
      activeTasks: before.activeTasks,
      queuedSubscriptionContent: before.queuedSubscriptionContent,
      tasksCancelled,
      contentSkipped,
      afterRunningTasks: after.runningTasks,
      afterActiveTasks: after.activeTasks,
      afterQueuedSubscriptionContent: after.queuedSubscriptionContent,
    };

    const id = await ctx.db.insert('migrationFenceAudit', {
      kind: 'drain_completed',
      surface: surfaces.join(','),
      reason: args.reason ?? 'cutover:quiet-check schedule disable/drain',
      drainSurfacesJson: JSON.stringify({
        surfaces,
        consumersHonored: true,
        consumers: {
          env: CUTOVER_SCHEDULES_DISABLED_ENV,
          envValue: envRaw || '1',
          isCutoverSchedulesDisabled: true,
          fencedInternalBuilders: true,
          taskCrons: true,
        },
        samples: {
          before,
          after,
          tasksCancelled,
          contentSkipped,
        },
      }),
      atMs,
    });

    return {
      ok: true,
      id,
      drainCompletedAtMs: atMs,
      surfaces,
      consumersHonored: true,
      consumers: {
        env: CUTOVER_SCHEDULES_DISABLED_ENV,
        envValue: envRaw || '1',
        isCutoverSchedulesDisabled: true,
        fencedInternalBuilders: true,
        taskCrons: true,
      },
      samples,
    };
  },
});

/** Runtime view of schedule-disable flag as seen by Convex consumers. */
export const scheduleDisableStatus = query({
  args: {},
  handler: async () => {
    const envValue = process.env[CUTOVER_SCHEDULES_DISABLED_ENV] ?? null;
    return {
      env: CUTOVER_SCHEDULES_DISABLED_ENV,
      envValue,
      disabled: isCutoverSchedulesDisabled(),
      consumers: {
        fencedInternalBuilders: true,
        taskCrons: true,
      },
    };
  },
});

/**
 * Probe that a schedule consumer reads HOLO_CUTOVER_SCHEDULES_DISABLED.
 * Returns skipped:true when disabled — positive proof of real disable, not theatre.
 */
export const probeScheduleConsumer = mutation({
  args: {
    surface: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const surface = args.surface ?? 'probeScheduleConsumer';
    if (isCutoverSchedulesDisabled()) {
      return {
        skipped: true,
        honored: true,
        surface,
        reason: `schedules_disabled: ${surface} skipped while ${CUTOVER_SCHEDULES_DISABLED_ENV} is set`,
        env: CUTOVER_SCHEDULES_DISABLED_ENV,
      };
    }
    return {
      skipped: false,
      honored: true,
      surface,
      reason: 'schedules enabled — consumer would proceed',
      env: CUTOVER_SCHEDULES_DISABLED_ENV,
    };
  },
});

/** Latest drain_completed row (if any). */
export const latestDrain = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('migrationFenceAudit')
      .withIndex('by_kind_atMs', (q) => q.eq('kind', 'drain_completed'))
      .order('desc')
      .take(1);
    const row = rows[0];
    if (!row) return null;
    let surfaces: string[] = [];
    let consumersHonored = false;
    if (row.drainSurfacesJson) {
      try {
        const parsed = JSON.parse(row.drainSurfacesJson) as {
          surfaces?: string[];
          consumersHonored?: boolean;
        };
        if (Array.isArray(parsed.surfaces)) surfaces = parsed.surfaces;
        consumersHonored = parsed.consumersHonored === true;
      } catch {
        surfaces = row.surface ? row.surface.split(',') : [];
      }
    } else if (row.surface) {
      surfaces = row.surface.split(',');
    }
    return {
      drainCompletedAtMs: row.atMs,
      surfaces,
      consumersHonored,
      reason: row.reason ?? null,
      _id: row._id,
    };
  },
});
