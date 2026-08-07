/**
 * D06-03 — migration fence audit + operator probe surfaces.
 *
 * INTENTIONALLY UNFENCED from the generic write fence (raw _generated/server).
 * REDHAT-FIX-RH-S30-04: when HOLO_MIGRATION_READ_ONLY is armed, recordWriteAttempt
 * requires operatorSecret matching HOLO_CUTOVER_OPERATOR_SECRET so unauthenticated
 * public callers cannot forge the accepted-write oracle.
 *
 * Operator tooling (holo cutover:quiet-check) passes operatorSecret from env/secrets.
 */
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import {
  assertCutoverOperatorAuthorized,
  isMigrationReadOnly,
  MIGRATION_READ_ONLY_ENV,
} from '../lib/migrationFence';

/**
 * Read-only runtime propagation oracle for operator sequencing.
 *
 * `convex env get` confirms the durable control-plane value, but a serving
 * generation can briefly continue observing the previous value. Cutover waits
 * on this query before issuing its single blocked-write probe so propagation
 * lag can never become an accepted probe write.
 */
export const migrationReadOnlyStatus = query({
  args: {},
  handler: async () => ({
    readOnly: isMigrationReadOnly(),
    envValue: process.env[MIGRATION_READ_ONLY_ENV] ?? null,
  }),
});

/**
 * Record fence arm moment (epoch-ms) — called by holo cutover:freeze.
 * REDHAT-FIX-RH-S30-11: always requires operatorSecret (not only when fence
 * already armed) so unauthenticated callers cannot forge the PONR prerequisite.
 */
export const recordFenceArmed = mutation({
  args: {
    fenceArmedAtMs: v.number(),
    reason: v.optional(v.string()),
    /** Required (always). Must match HOLO_CUTOVER_OPERATOR_SECRET. */
    operatorSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Always authorize — forging fence_armed enables enable-writes even when
    // soak fence env is not yet visible on the deployment.
    const expected = process.env.HOLO_CUTOVER_OPERATOR_SECRET ?? '';
    if (!expected || expected.length < 8) {
      throw new Error(
        'migration_fence: recordFenceArmed refused — HOLO_CUTOVER_OPERATOR_SECRET not configured ' +
          '(REDHAT-FIX-RH-S30-11)'
      );
    }
    if (typeof args.operatorSecret !== 'string' || args.operatorSecret !== expected) {
      throw new Error(
        'migration_fence: recordFenceArmed refused — unauthenticated/public call without valid ' +
          'operatorSecret (REDHAT-FIX-RH-S30-11)'
      );
    }
    const id = await ctx.db.insert('migrationFenceAudit', {
      kind: 'fence_armed',
      fenceArmedAtMs: args.fenceArmedAtMs,
      reason: args.reason,
      atMs: args.fenceArmedAtMs,
    });
    return { id, fenceArmedAtMs: args.fenceArmedAtMs };
  },
});

/**
 * Record a single accepted/rejected write attempt for quiet-check oracle.
 * Under armed fence: requires operatorSecret (REDHAT-FIX-RH-S30-04).
 */
export const recordWriteAttempt = mutation({
  args: {
    outcome: v.union(v.literal('accepted'), v.literal('rejected')),
    surface: v.string(),
    reason: v.optional(v.string()),
    atMs: v.optional(v.number()),
    /** Required when HOLO_MIGRATION_READ_ONLY is armed. */
    operatorSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertCutoverOperatorAuthorized('migrationFence.audit.recordWriteAttempt', args.operatorSecret);
    const atMs = args.atMs ?? Date.now();
    const id = await ctx.db.insert('migrationFenceAudit', {
      kind: 'write_attempt',
      outcome: args.outcome,
      surface: args.surface,
      reason: args.reason,
      atMs,
    });
    return { id, atMs, outcome: args.outcome };
  },
});

/** Latest fence_armed row (if any). */
export const latestFenceArmed = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('migrationFenceAudit')
      .withIndex('by_kind_atMs', (q) => q.eq('kind', 'fence_armed'))
      .order('desc')
      .take(1);
    const row = rows[0];
    if (!row) return null;
    return {
      fenceArmedAtMs: row.fenceArmedAtMs ?? row.atMs,
      reason: row.reason ?? null,
      atMs: row.atMs,
      _id: row._id,
    };
  },
});

/** Count write_attempt rows in [sinceMs, untilMs]. */
export const countAttemptsInWindow = query({
  args: {
    sinceMs: v.number(),
    untilMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const untilMs = args.untilMs ?? Date.now();
    const rows = await ctx.db
      .query('migrationFenceAudit')
      .withIndex('by_atMs', (q) => q.gte('atMs', args.sinceMs))
      .collect();
    const inWindow = rows.filter((r) => r.kind === 'write_attempt' && r.atMs <= untilMs);
    let acceptedWriteCount = 0;
    let rejectedWriteCount = 0;
    for (const r of inWindow) {
      if (r.outcome === 'accepted') acceptedWriteCount += 1;
      else if (r.outcome === 'rejected') rejectedWriteCount += 1;
    }
    return {
      acceptedWriteCount,
      rejectedWriteCount,
      total: inWindow.length,
      sinceMs: args.sinceMs,
      untilMs,
    };
  },
});
