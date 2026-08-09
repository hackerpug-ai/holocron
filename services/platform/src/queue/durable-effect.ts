/**
 * queue-2 / S31-03 — transactional outbox/inbox + fenced consumer
 * (exactly-once observable effects).
 *
 * Two API surfaces:
 *
 *  1. Low-level:
 *     - beginEffect(): allocates a monotonic fence token INSIDE the outbox
 *       insert transaction and persists it on the outbox row.
 *     - dispatchAndAck(): READs the outbox token (never mints a second one),
 *       writes effect + inbox in ONE transaction, rejects stale holders with
 *       STALE_FENCE_TOKEN.
 *     - auditEffect() / resetDurable().
 *
 *  2. High-level (queue-4 RED harness + CLI):
 *     - runDurableEffectBoundary({ key, payload, boundary }): one lifecycle
 *       pass; non-'none' boundaries leave partial progress for recovery.
 *     - auditDurableEffect(key): same shape as `holo queue:audit`.
 *
 * CRITICAL CONSTRAINT (task queue-2): the effect and the dedupe row are written
 * in the SAME transaction — NEVER split across transactions.
 *
 * Fence tokens (S31-03):
 *   - Type: decimal string of a strictly-increasing bigint (microseconds of
 *     clock_timestamp under pg_advisory_xact_lock). Ordered by BigInt compare.
 *   - Allocated inside the persisting transaction; dispatchAndAck READs it.
 *   - Distinct from lease fence tokens on queue_jobs (priority.ts) — those
 *     guard lease ownership; these guard durable-effect application.
 *
 * Real SIGKILL (S31-03): set HOLO_QUEUE_PAUSE_AT=<boundary> (or CLI
 * --pause-at). The child emits a boundary marker then blocks forever; the
 * harness SIGKILLs after observing the marker. No in-process CRASH throws.
 */
import { writeSync } from 'node:fs';
import { isMigrationReadOnly, migrationReadOnlyJobError } from '../cutover/soak-fence.ts';
import { createSql, type Sql, type TransactionSql } from '../db/client.ts';

/**
 * Decimal string of a strictly-increasing bigint.
 * Ordering: BigInt(a) < BigInt(b). Never a randomUUID `fence-…` shape.
 */
export type FenceToken = string;

/** Pause / kill boundaries for the real child-process SIGKILL harness. */
export type EffectPauseBoundary =
  | 'before-commit'
  | 'after-commit-before-dispatch'
  | 'after-dispatch-before-ack';

export const EFFECT_PAUSE_BOUNDARIES: readonly EffectPauseBoundary[] = [
  'before-commit',
  'after-commit-before-dispatch',
  'after-dispatch-before-ack',
] as const;

export const HOLO_QUEUE_PAUSE_AT_ENV = 'HOLO_QUEUE_PAUSE_AT';

/** Boundary names used by the queue-4 RED harness (KillBoundary). */
export type DurableBoundary =
  | 'before-commit'
  | 'after-commit-before-enqueue'
  | 'after-dispatch-before-ack'
  | 'none';

const DEFAULT_URL = () => process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

/** Fixed advisory-lock key for serializing fence-token allocation. */
const FENCE_ALLOC_LOCK = 872_014_031;

export type DurableEffectResult = {
  effect_count: number;
  outbox_count: number;
  inbox_dedupe_count: number;
  fencing_token: string | null;
  idempotency_key: string;
  status?: string;
};

/**
 * Typed stale-holder refusal. A consumer presenting a superseded token must
 * not apply a second effect for the same idempotency key.
 */
export class StaleFenceTokenError extends Error {
  readonly code = 'STALE_FENCE_TOKEN' as const;
  readonly presentedToken: FenceToken;
  readonly currentToken: FenceToken;

  constructor(opts: { presentedToken: FenceToken; currentToken: FenceToken }) {
    super(`STALE_FENCE_TOKEN: presented=${opts.presentedToken} current=${opts.currentToken}`);
    this.name = 'StaleFenceTokenError';
    this.presentedToken = opts.presentedToken;
    this.currentToken = opts.currentToken;
  }
}

export function isStaleFenceTokenError(err: unknown): err is StaleFenceTokenError {
  return (
    err instanceof StaleFenceTokenError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'STALE_FENCE_TOKEN')
  );
}

export function effectPauseMarker(boundary: EffectPauseBoundary): string {
  return `queue-effect/${boundary}`;
}

/**
 * If HOLO_QUEUE_PAUSE_AT matches `boundary`, emit a readiness marker then
 * block forever so an external harness can SIGKILL the process.
 */
export async function maybePauseAtEffectBoundary(
  boundary: EffectPauseBoundary,
  context: Record<string, unknown> = {}
): Promise<void> {
  const requested = process.env[HOLO_QUEUE_PAUSE_AT_ENV];
  if (!requested || requested !== boundary) return;

  const marker = effectPauseMarker(boundary);
  const payload = {
    ok: false,
    pauseHook: true,
    readiness: true,
    env: HOLO_QUEUE_PAUSE_AT_ENV,
    marker,
    boundary,
    ts: new Date().toISOString(),
    context,
  };
  // writeSync so the harness observes the marker before the process blocks
  // (stdio pipes are block-buffered under spawn).
  const line = `${JSON.stringify(payload)}\n`;
  writeSync(1, line);
  writeSync(2, line);

  // Keep the event loop alive after DB connections close. A bare
  // `new Promise(() => {})` is not a ref'd handle — Node/Bun exit 0 with an
  // empty loop, which would make SIGKILL impossible (signal=null).
  setInterval(() => {}, 1 << 30);
  return await new Promise<void>(() => {
    // Intentionally never resolves; SIGKILL proves the boundary.
  });
}

/**
 * Allocate the next monotonic fence token inside an open transaction.
 * Uses pg_advisory_xact_lock + clock_timestamp microseconds so the value
 * survives row deletes (resetDurable) and is strictly ordered.
 */
async function allocateFenceToken(tx: TransactionSql): Promise<FenceToken> {
  await tx`SELECT pg_advisory_xact_lock(${FENCE_ALLOC_LOCK})`;
  const rows = await tx<{ tok: string }[]>`
    SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000000)::bigint::text AS tok
  `;
  const tok = rows[0]?.tok;
  if (!tok) {
    throw new Error('allocateFenceToken: clock_timestamp returned no value');
  }
  return tok;
}

/** Numeric compare for FenceToken decimal strings. */
export function compareFenceTokens(a: FenceToken, b: FenceToken): number {
  const ba = BigInt(a);
  const bb = BigInt(b);
  if (ba < bb) return -1;
  if (ba > bb) return 1;
  return 0;
}

/**
 * Fail-closed assert: outbox/inbox/effects must already exist via `holo db:migrate`
 * (0011_outbox_inbox). Runtime table bootstrap is prohibited (S31-01).
 */
async function ensureOutboxSchema(sql: Sql): Promise<void> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT to_regclass('public.queue_outbox') IS NOT NULL AS exists
  `;
  if (!rows[0]?.exists) {
    throw new Error(
      'queue_outbox table is missing — run `holo db:migrate` (migration 0011_outbox_inbox) before durable effects; schema is migrate-owned only'
    );
  }
}

export { ensureOutboxSchema };

// ---------------------------------------------------------------------------
// Low-level API
// ---------------------------------------------------------------------------

export type BeginEffectResult = {
  committed: boolean;
  fenceToken: FenceToken | null;
};

export async function beginEffect(opts: {
  key: string;
  name: string;
  payload?: Record<string, unknown>;
  databaseUrl?: string;
}): Promise<BeginEffectResult> {
  // REDHAT-FIX-S29-R3-H02: re-check durable fence at irreversible outbox write.
  if (isMigrationReadOnly()) {
    throw new Error(migrationReadOnlyJobError(opts.name));
  }
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const payload = opts.payload ?? {};
  const sql = createSql(url);
  try {
    await ensureOutboxSchema(sql);
    const fenceToken = await sql.begin(async (tx) => {
      const fence = await allocateFenceToken(tx);
      const inserted = await tx<{ fence_token: string }[]>`
        INSERT INTO queue_outbox (key, name, payload, status, fence_token)
        VALUES (${opts.key}, ${opts.name}, ${tx.json(payload as never)}, 'pending', ${fence})
        ON CONFLICT (key) DO NOTHING
        RETURNING fence_token
      `;
      if (inserted.length > 0) {
        // Pause AFTER the insert so a kill rolls back uncommitted outbox work.
        await maybePauseAtEffectBoundary('before-commit', {
          key: opts.key,
          phase: 'post-insert-pre-commit',
          fenceToken: fence,
        });
        return fence;
      }
      const existing = await tx<{ fence_token: string | null }[]>`
        SELECT fence_token FROM queue_outbox WHERE key = ${opts.key} LIMIT 1
      `;
      return existing[0]?.fence_token ?? null;
    });
    return { committed: true, fenceToken };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type DispatchAckResult = {
  applied: boolean;
  deduped: boolean;
  effectId: string | null;
  fenceToken: FenceToken | null;
};

export async function dispatchAndAck(opts: {
  key: string;
  databaseUrl?: string;
  /** Optional job name for migration_read_only diagnostics (defaults to key). */
  name?: string;
  /**
   * Token the caller believes it holds. Defaults to the outbox row's token.
   * When a higher (or different) token is already persisted on the effect,
   * raises StaleFenceTokenError.
   */
  presentedFenceToken?: FenceToken;
}): Promise<DispatchAckResult> {
  // REDHAT-FIX-S29-R3-H02: re-check at irreversible effect application.
  if (isMigrationReadOnly()) {
    throw new Error(migrationReadOnlyJobError(opts.name ?? opts.key));
  }
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const sql = createSql(url);
  try {
    await ensureOutboxSchema(sql);

    const outboxRows = await sql<
      { id: string; payload: unknown; name: string; fence_token: string | null }[]
    >`
      SELECT id::text AS id, payload, name, fence_token
      FROM queue_outbox WHERE key = ${opts.key}
    `;
    const outbox = outboxRows[0];
    if (!outbox) {
      throw new Error(`dispatchAndAck: no outbox row for key=${opts.key}`);
    }

    const outboxToken = outbox.fence_token;
    if (!outboxToken) {
      throw new Error(`dispatchAndAck: outbox row for key=${opts.key} has null fence_token`);
    }

    const presented = opts.presentedFenceToken ?? outboxToken;

    // Superseded holder: outbox itself advanced past what the consumer holds.
    if (presented !== outboxToken) {
      throw new StaleFenceTokenError({
        presentedToken: presented,
        currentToken: outboxToken,
      });
    }

    // Fresh re-check immediately before the effect transaction (TOCTOU close).
    if (isMigrationReadOnly()) {
      throw new Error(migrationReadOnlyJobError(opts.name ?? outbox.name ?? opts.key));
    }

    const ackResult = await sql.begin(async (tx) => {
      // Existing effect with a different token → stale (do not silent-dedupe).
      const existingEffect = await tx<{ id: string; fence_token: string }[]>`
        SELECT id::text AS id, fence_token FROM queue_effects WHERE key = ${opts.key} LIMIT 1
      `;
      if (existingEffect[0] && existingEffect[0].fence_token !== presented) {
        throw new StaleFenceTokenError({
          presentedToken: presented,
          currentToken: existingEffect[0].fence_token,
        });
      }

      await tx`
        UPDATE queue_outbox
        SET status = 'dispatched', dispatched_at = COALESCE(dispatched_at, now())
        WHERE key = ${opts.key}
      `;
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO queue_effects (key, payload, fence_token)
        VALUES (${opts.key}, ${tx.json(outbox.payload as never)}, ${presented})
        ON CONFLICT (key) DO NOTHING
        RETURNING id::text AS id
      `;
      const applied = inserted.length > 0;
      let effectId: string | null = inserted[0]?.id ?? null;
      if (!effectId) {
        const existing = await tx<{ id: string }[]>`
          SELECT id::text AS id FROM queue_effects WHERE key = ${opts.key} LIMIT 1
        `;
        effectId = existing[0]?.id ?? null;
      }
      if (!effectId) {
        throw new Error(`dispatchAndAck: no effect row for key=${opts.key}`);
      }
      const effectRow = { id: effectId };
      await tx`
        INSERT INTO queue_inbox (key, outbox_id, effect_id, fence_token, outcome)
        VALUES (
          ${opts.key},
          ${outbox.id}::uuid,
          ${effectRow.id}::uuid,
          ${presented},
          ${applied ? 'applied' : 'deduped'}
        )
        ON CONFLICT (key) DO NOTHING
      `;

      await maybePauseAtEffectBoundary('after-dispatch-before-ack', {
        key: opts.key,
        fenceToken: presented,
        effectId: effectRow.id,
      });

      await tx`
        UPDATE queue_outbox
        SET status = 'acked', effect_id = ${effectRow.id}::uuid, acked_at = now()
        WHERE key = ${opts.key}
      `;
      return { applied, effectId: effectRow.id, fenceToken: presented };
    });

    return {
      applied: ackResult.applied,
      deduped: !ackResult.applied,
      effectId: ackResult.effectId,
      fenceToken: ackResult.fenceToken,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type EffectAudit = {
  key: string;
  outbox: { status: string | null; fenceToken: FenceToken | null; effectId: string | null };
  effect: { id: string | null; fenceToken: FenceToken | null };
  inbox: { outcome: string | null; fenceToken: FenceToken | null };
  counts: { outbox: number; effects: number; inbox: number };
  /** Convenience: effect token, else outbox, else inbox — prefer the three fields. */
  fenceToken: FenceToken | null;
};

export async function auditEffect(opts: {
  key: string;
  databaseUrl?: string;
}): Promise<EffectAudit> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const sql = createSql(url);
  try {
    await ensureOutboxSchema(sql);
    const outbox = await sql<
      { status: string; fence_token: string | null; effect_id: string | null }[]
    >`
      SELECT status, fence_token, effect_id::text AS effect_id
      FROM queue_outbox WHERE key = ${opts.key} LIMIT 1
    `;
    const effect = await sql<{ id: string; fence_token: string }[]>`
      SELECT id::text AS id, fence_token FROM queue_effects WHERE key = ${opts.key} LIMIT 1
    `;
    const inbox = await sql<{ outcome: string; fence_token: string }[]>`
      SELECT outcome, fence_token FROM queue_inbox WHERE key = ${opts.key} LIMIT 1
    `;
    const counts = await sql<{ o: string; e: string; i: string }[]>`
      SELECT
        (SELECT count(*)::text FROM queue_outbox WHERE key = ${opts.key}) AS o,
        (SELECT count(*)::text FROM queue_effects WHERE key = ${opts.key}) AS e,
        (SELECT count(*)::text FROM queue_inbox WHERE key = ${opts.key}) AS i
    `;
    const c = counts[0];
    return {
      key: opts.key,
      outbox: {
        status: outbox[0]?.status ?? null,
        fenceToken: outbox[0]?.fence_token ?? null,
        effectId: outbox[0]?.effect_id ?? null,
      },
      effect: { id: effect[0]?.id ?? null, fenceToken: effect[0]?.fence_token ?? null },
      inbox: { outcome: inbox[0]?.outcome ?? null, fenceToken: inbox[0]?.fence_token ?? null },
      counts: {
        outbox: Number(c?.o ?? 0),
        effects: Number(c?.e ?? 0),
        inbox: Number(c?.i ?? 0),
      },
      // Prefer effect, then outbox, then inbox — but audit consumers should
      // compare the three nested fields separately (S31-03).
      fenceToken: effect[0]?.fence_token ?? outbox[0]?.fence_token ?? inbox[0]?.fence_token ?? null,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function resetDurable(opts: { key: string; databaseUrl?: string }): Promise<void> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const sql = createSql(url);
  try {
    await ensureOutboxSchema(sql);
    await sql`DELETE FROM queue_inbox WHERE key = ${opts.key}`;
    await sql`DELETE FROM queue_effects WHERE key = ${opts.key}`;
    await sql`DELETE FROM queue_outbox WHERE key = ${opts.key}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ---------------------------------------------------------------------------
// High-level API (queue-4 RED harness contract + full lifecycle)
// ---------------------------------------------------------------------------

/**
 * Run ONE complete durable-effect lifecycle (begin + dispatch) for `key`.
 * Honors HOLO_QUEUE_PAUSE_AT if set (blocks at the matching boundary).
 */
export async function runDurableEffectLifecycle(opts: {
  key: string;
  payload?: Record<string, unknown>;
  databaseUrl?: string;
  name?: string;
}): Promise<DurableEffectResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const payload = { ...(opts.payload ?? { n: 1 }) };
  const name = opts.name ?? 'durable-effect';

  await beginEffect({ key: opts.key, name, payload, databaseUrl: url });

  await maybePauseAtEffectBoundary('after-commit-before-dispatch', {
    key: opts.key,
    phase: 'post-commit-pre-dispatch',
  });

  await dispatchAndAck({ key: opts.key, name, databaseUrl: url });

  const audit = await auditEffect({ key: opts.key, databaseUrl: url });
  return {
    effect_count: audit.counts.effects,
    outbox_count: audit.counts.outbox,
    inbox_dedupe_count: audit.counts.inbox,
    fencing_token: audit.fenceToken,
    idempotency_key: opts.key,
    status: audit.outbox.status ?? undefined,
  };
}

/**
 * Run ONE lifecycle pass for `key` with an optional partial-progress boundary
 * (queue-4 RED harness). Non-'none' boundaries leave the key mid-pipeline so a
 * subsequent 'none' recovery pass completes exactly once.
 *
 * Real SIGKILL proof lives in sprint31-fence-kill9.test.ts via HOLO_QUEUE_PAUSE_AT
 * + child process kill — not via in-process throws.
 */
export async function runDurableEffectBoundary(opts: {
  key: string;
  payload: { n: number } & Record<string, unknown>;
  boundary: DurableBoundary;
  databaseUrl?: string;
}): Promise<DurableEffectResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const payload = { ...opts.payload };
  // Reset on the crash/partial pass so each boundary is isolated.
  if (opts.boundary !== 'none') {
    await resetDurable({ key: opts.key, databaseUrl: url });
  }

  if (opts.boundary === 'before-commit') {
    // Partial: no durable write — recovery will begin+dispatch cleanly.
  } else if (opts.boundary === 'after-commit-before-enqueue') {
    // Outbox committed; dispatch never runs.
    await beginEffect({ key: opts.key, name: 'durable-effect', payload, databaseUrl: url });
  } else if (opts.boundary === 'after-dispatch-before-ack') {
    // Outbox committed; dispatch not completed (same recoverable residual as
    // after-commit-before-enqueue under single-tx effect+ack).
    await beginEffect({ key: opts.key, name: 'durable-effect', payload, databaseUrl: url });
  } else {
    // 'none' — full recovery / complete lifecycle.
    await beginEffect({ key: opts.key, name: 'durable-effect', payload, databaseUrl: url });
    await dispatchAndAck({ key: opts.key, databaseUrl: url });
  }

  const audit = await auditEffect({ key: opts.key, databaseUrl: url });
  return {
    effect_count: audit.counts.effects,
    outbox_count: audit.counts.outbox,
    inbox_dedupe_count: audit.counts.inbox,
    fencing_token: audit.fenceToken,
    idempotency_key: opts.key,
    status: audit.outbox.status ?? undefined,
  };
}

/** Audit alias matching the RED harness DurableEffectApi.auditDurableEffect shape. */
export async function auditDurableEffect(
  key: string,
  databaseUrl?: string
): Promise<DurableEffectResult> {
  const audit = await auditEffect({ key, databaseUrl });
  return {
    effect_count: audit.counts.effects,
    outbox_count: audit.counts.outbox,
    inbox_dedupe_count: audit.counts.inbox,
    fencing_token: audit.fenceToken,
    idempotency_key: key,
    status: audit.outbox.status ?? undefined,
  };
}
