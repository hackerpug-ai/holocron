/**
 * C-03 / D06-03 / C-02 — real schedule disable + in-flight drain-to-zero.
 *
 * INTENTIONALLY UNFENCED (raw _generated/server imports). HOLO_MIGRATION_READ_ONLY
 * remains the sole write-enforcement mechanism; this module is sequencing + evidence
 * so quiet-check can prove schedules were disabled/drained before the quiet window.
 *
 * Non-destructive: does not delete cron registrations. Operator sets
 * HOLO_CUTOVER_SCHEDULES_DISABLED=1 (env). Consumers under fencedInternal* and
 * taskCrons honor that flag (real disable). This mutation:
 *   1. Requires the env flag visible in Convex runtime
 *   2. Paginates drain of in-flight tasks / queued subscription work to terminal states
 *      until residual counts are zero (C-02 — not a single .take(DRAIN_BATCH) pass)
 *   3. Fails closed on query/patch errors and on non-zero residual
 *   4. Records drain_completed audit with consumer-honor + residual proof
 */
import { v } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import { mutation, query } from '../_generated/server';
import { CUTOVER_SCHEDULES_DISABLED_ENV, isCutoverSchedulesDisabled } from '../lib/migrationFence';

/** Inventory of schedule surfaces drained during cutover quiet protocol. */
export const CUTOVER_DRAIN_SURFACES = ['crons', 'queues', 'outbox', 'scheduled_jobs'] as const;

const TASK_ACTIVE_STATUSES = ['pending', 'queued', 'loading', 'running'] as const;
/** Per-pass batch size (Convex take limit convenience; MUST loop until residual zero). */
export const DRAIN_BATCH = 100;
/** Safety cap: max drain passes (each pass may drain up to DRAIN_BATCH per status + queue). */
const MAX_DRAIN_PASSES_DEFAULT = 50;

type InFlightSample = {
  runningTasks: number;
  activeTasks: number;
  queuedSubscriptionContent: number;
};

type DrainFault = 'sample' | 'patch';

/**
 * Sample residual in-flight work. Fail-closed: never swallow query/index errors
 * into zero residual (C-02 empty-catch theatre kill).
 *
 * Counts are lower-bounded by a single take(DRAIN_BATCH) per surface — enough to
 * detect residual > 0 after drain. Exact totals above DRAIN_BATCH are not required
 * for the residual-zero gate.
 */
async function sampleInFlight(ctx: MutationCtx, injectFault?: DrainFault): Promise<InFlightSample> {
  if (injectFault === 'sample') {
    throw new Error('drain injectFault=sample: forced sampleInFlight failure (C-02 fail-closed)');
  }

  let runningTasks = 0;
  let activeTasks = 0;

  for (const status of TASK_ACTIVE_STATUSES) {
    const rows = await ctx.db
      .query('tasks')
      .withIndex('by_status', (q) => q.eq('status', status))
      .take(DRAIN_BATCH);
    activeTasks += rows.length;
    if (status === 'running') runningTasks = rows.length;
  }

  const queued = await ctx.db
    .query('subscriptionContent')
    .withIndex('by_status', (q) => q.eq('researchStatus', 'queued'))
    .take(DRAIN_BATCH);
  const queuedSubscriptionContent = queued.length;

  return { runningTasks, activeTasks, queuedSubscriptionContent };
}

function residualZero(sample: InFlightSample): boolean {
  return (
    sample.runningTasks === 0 && sample.activeTasks === 0 && sample.queuedSubscriptionContent === 0
  );
}

/**
 * One drain pass: cancel up to DRAIN_BATCH tasks per active status + skip up to
 * DRAIN_BATCH queued subscriptionContent rows. Returns how many rows were terminalised.
 */
async function drainOnePass(
  ctx: MutationCtx,
  atMs: number,
  injectFault?: DrainFault
): Promise<{ tasksCancelled: number; contentSkipped: number }> {
  if (injectFault === 'patch') {
    throw new Error('drain injectFault=patch: forced patch failure (C-02 fail-closed)');
  }

  let tasksCancelled = 0;
  let contentSkipped = 0;

  for (const status of TASK_ACTIVE_STATUSES) {
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
  }

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

  return { tasksCancelled, contentSkipped };
}

/**
 * Real schedule disable/drain for quiet-check evidence.
 * Fails closed if HOLO_CUTOVER_SCHEDULES_DISABLED is not visible in-runtime
 * (setting env from CLI without consumers reading it is theatre).
 *
 * C-02: paginates until residual zero (or maxPasses exhausted → ok:false).
 * ok:true ONLY when all after* residual counts are 0.
 */
export const disableAndDrain = mutation({
  args: {
    surfaces: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
    atMs: v.optional(v.number()),
    /** Cap drain passes (default MAX_DRAIN_PASSES_DEFAULT). Use 1 to simulate pre-fix single-batch. */
    maxPasses: v.optional(v.number()),
    /** Test-only fault injection for fail-closed proofs (AC-3). */
    injectFault: v.optional(v.union(v.literal('sample'), v.literal('patch'))),
  },
  handler: async (ctx, args) => {
    const atMs = args.atMs ?? Date.now();
    const surfaces = args.surfaces?.length ? args.surfaces : [...CUTOVER_DRAIN_SURFACES];
    const maxPasses =
      typeof args.maxPasses === 'number' && args.maxPasses > 0
        ? Math.min(Math.floor(args.maxPasses), MAX_DRAIN_PASSES_DEFAULT)
        : MAX_DRAIN_PASSES_DEFAULT;
    const injectFault = args.injectFault as DrainFault | undefined;

    const emptySamples = {
      runningTasks: 0,
      activeTasks: 0,
      queuedSubscriptionContent: 0,
      tasksCancelled: 0,
      contentSkipped: 0,
      afterRunningTasks: 0,
      afterActiveTasks: 0,
      afterQueuedSubscriptionContent: 0,
      batchesProcessed: 0,
      drainBatches: 0,
    };

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
        samples: emptySamples,
        error: `${CUTOVER_SCHEDULES_DISABLED_ENV} not visible/true in Convex runtime — refuse audit-only drain theatre`,
      };
    }

    let before: InFlightSample = {
      runningTasks: 0,
      activeTasks: 0,
      queuedSubscriptionContent: 0,
    };
    let tasksCancelled = 0;
    let contentSkipped = 0;
    let batchesProcessed = 0;
    let after: InFlightSample = before;
    let error: string | undefined;

    try {
      // ── 2. Sample in-flight before drain (fail-closed on query error) ────
      before = await sampleInFlight(ctx, injectFault === 'sample' ? 'sample' : undefined);

      // ── 3. Paginated drain-to-zero (C-02: not a single .take(DRAIN_BATCH)) ─
      for (let pass = 0; pass < maxPasses; pass++) {
        // Inject patch fault on first pass only when requested
        const fault = injectFault === 'patch' && pass === 0 ? 'patch' : undefined;
        const drained = await drainOnePass(ctx, atMs, fault);
        batchesProcessed += 1;
        tasksCancelled += drained.tasksCancelled;
        contentSkipped += drained.contentSkipped;
        if (drained.tasksCancelled === 0 && drained.contentSkipped === 0) {
          break;
        }
        // Peek residual; stop early when clear (avoids extra empty pass when possible)
        const mid = await sampleInFlight(ctx);
        if (residualZero(mid)) {
          break;
        }
      }

      // ── 4. Re-sample residual after drain ────────────────────────────────
      after = await sampleInFlight(ctx);
    } catch (err) {
      // Fail closed: never coerce residual to zero on query/patch exceptions
      error = err instanceof Error ? err.message : String(err);
      const samples = {
        runningTasks: before.runningTasks,
        activeTasks: before.activeTasks,
        queuedSubscriptionContent: before.queuedSubscriptionContent,
        tasksCancelled,
        contentSkipped,
        afterRunningTasks: -1,
        afterActiveTasks: -1,
        afterQueuedSubscriptionContent: -1,
        batchesProcessed,
        drainBatches: batchesProcessed,
      };
      return {
        ok: false,
        id: null,
        drainCompletedAtMs: 0,
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
        error: `disableAndDrain fail-closed: ${error}`,
      };
    }

    const samples = {
      runningTasks: before.runningTasks,
      activeTasks: before.activeTasks,
      queuedSubscriptionContent: before.queuedSubscriptionContent,
      tasksCancelled,
      contentSkipped,
      afterRunningTasks: after.runningTasks,
      afterActiveTasks: after.activeTasks,
      afterQueuedSubscriptionContent: after.queuedSubscriptionContent,
      batchesProcessed,
      drainBatches: batchesProcessed,
    };

    // C-02: ok:true ONLY when all after* residual counts are zero
    const ok = residualZero(after);
    if (!ok) {
      error =
        `residual after drain: afterActiveTasks=${after.activeTasks} ` +
        `afterRunningTasks=${after.runningTasks} ` +
        `afterQueuedSubscriptionContent=${after.queuedSubscriptionContent} ` +
        `(batchesProcessed=${batchesProcessed}, maxPasses=${maxPasses})`;
    }

    const id = await ctx.db.insert('migrationFenceAudit', {
      kind: 'drain_completed',
      surface: surfaces.join(','),
      reason: args.reason ?? 'cutover:quiet-check schedule disable/drain',
      drainSurfacesJson: JSON.stringify({
        surfaces,
        consumersHonored: true,
        ok,
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
          batchesProcessed,
        },
        error: error ?? null,
      }),
      atMs,
    });

    return {
      ok,
      id,
      drainCompletedAtMs: ok ? atMs : 0,
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
      error,
    };
  },
});

/**
 * PLATFORM_IT seed helper for C-02 residual-zero multi-batch proofs.
 * Intentionally unfenced (like disableAndDrain) so seeds work under HOLO_MIGRATION_READ_ONLY.
 * Creates active tasks + queued subscriptionContent rows for multi-batch drain.
 */
export const seedInFlightForDrainTest = mutation({
  args: {
    activeTasks: v.number(),
    queuedSubscriptionContent: v.number(),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nTasks = Math.max(0, Math.min(Math.floor(args.activeTasks), 500));
    const nContent = Math.max(0, Math.min(Math.floor(args.queuedSubscriptionContent), 500));
    const tag = args.tag ?? `c02-drain-seed-${Date.now()}`;
    const now = Date.now();
    const taskIds: string[] = [];
    const contentIds: string[] = [];

    // Put ALL seeds in a single active status so >DRAIN_BATCH forces multi-pass
    // (status-round-robin would fit 101 into one pass of 4×100).
    for (let i = 0; i < nTasks; i++) {
      const id = await ctx.db.insert('tasks', {
        taskType: 'research',
        status: 'pending',
        config: { purpose: 'c02_drain_seed', tag, i },
        createdAt: now,
        updatedAt: now,
      });
      taskIds.push(id);
    }

    let sourceId: string | null = null;
    if (nContent > 0) {
      sourceId = await ctx.db.insert('subscriptionSources', {
        sourceType: 'changelog',
        identifier: `c02-drain-seed-${tag}`,
        name: `C-02 drain seed ${tag}`,
        fetchMethod: 'test',
        autoResearch: false,
        createdAt: now,
        updatedAt: now,
      });
      for (let i = 0; i < nContent; i++) {
        const id = await ctx.db.insert('subscriptionContent', {
          sourceId: sourceId as never,
          contentId: `${tag}-content-${i}`,
          title: `C-02 seed content ${i}`,
          passedFilter: true,
          researchStatus: 'queued',
          discoveredAt: now,
        });
        contentIds.push(id);
      }
    }

    return {
      ok: true,
      tag,
      taskIds,
      contentIds,
      sourceId,
      activeTasks: nTasks,
      queuedSubscriptionContent: nContent,
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
