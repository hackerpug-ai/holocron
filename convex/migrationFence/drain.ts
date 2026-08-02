/**
 * C-03 / D06-03 — schedule disable + in-flight drain bookkeeping.
 *
 * INTENTIONALLY UNFENCED (raw _generated/server imports). HOLO_MIGRATION_READ_ONLY
 * remains the sole write-enforcement mechanism; this module is sequencing + evidence
 * so quiet-check can prove schedules were disabled/drained before the quiet window.
 *
 * Non-destructive: does not delete cron registrations. Operator sets
 * HOLO_CUTOVER_SCHEDULES_DISABLED=1 (env) and records drain_completed audit.
 */
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';

/** Inventory of schedule surfaces drained during cutover quiet protocol. */
export const CUTOVER_DRAIN_SURFACES = ['crons', 'queues', 'outbox', 'scheduled_jobs'] as const;

/**
 * Record schedule disable/drain completion for quiet-check evidence.
 * Optionally samples in-flight work counts (best-effort; zero is valid when idle).
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

    // Best-effort in-flight samples (read-only). Under fence these should not grow.
    let runningTasks = 0;
    let queuedSubscriptionContent = 0;
    try {
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_status', (q) => q.eq('status', 'running'))
        .take(50);
      runningTasks = tasks.length;
    } catch {
      // index/table may differ in older deployments
    }
    try {
      const queued = await ctx.db
        .query('subscriptionContent')
        .withIndex('by_status', (q) => q.eq('researchStatus', 'queued'))
        .take(50);
      queuedSubscriptionContent = queued.length;
    } catch {
      // optional table/index
    }

    const id = await ctx.db.insert('migrationFenceAudit', {
      kind: 'drain_completed',
      surface: surfaces.join(','),
      reason: args.reason ?? 'cutover:quiet-check schedule disable/drain',
      drainSurfacesJson: JSON.stringify({
        surfaces,
        samples: { runningTasks, queuedSubscriptionContent },
      }),
      atMs,
    });

    return {
      ok: true,
      id,
      drainCompletedAtMs: atMs,
      surfaces,
      samples: { runningTasks, queuedSubscriptionContent },
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
    if (row.drainSurfacesJson) {
      try {
        const parsed = JSON.parse(row.drainSurfacesJson) as { surfaces?: string[] };
        if (Array.isArray(parsed.surfaces)) surfaces = parsed.surfaces;
      } catch {
        surfaces = row.surface ? row.surface.split(',') : [];
      }
    } else if (row.surface) {
      surfaces = row.surface.split(',');
    }
    return {
      drainCompletedAtMs: row.atMs,
      surfaces,
      reason: row.reason ?? null,
      _id: row._id,
    };
  },
});
