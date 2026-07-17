/**
 * queue-2 / AC-1 / AC-2 — transactional outbox/inbox + fenced consumer
 * (exactly-once observable effects).
 *
 * Two API surfaces:
 *
 *  1. Low-level (used by queue-exactly-once.test.ts):
 *     - beginEffect(): transactional outbox intent (the producer "commit").
 *     - dispatchAndAck(): fenced consumer — writes the observable effect AND
 *       the inbox dedupe row in ONE transaction, both UNIQUE on the key.
 *     - auditEffect() / resetDurable().
 *
 *  2. High-level (used by the queue-4 RED harness loadDurableEffectApi):
 *     - runDurableEffectBoundary({ key, payload, boundary }): one lifecycle
 *       pass with a kill-9 boundary injected; returns the audit counts.
 *     - auditDurableEffect(key): same shape as `holo queue:audit`.
 *
 * CRITICAL CONSTRAINT (task queue-2): the effect and the dedupe row are written
 * in the SAME transaction — NEVER split across transactions. Treating lease
 * acquisition as exactly-once is the named anti-pattern.
 *
 * Crash injection (crashAt / boundary) throws inside sql.begin → the real
 * Postgres transaction rolls back, identical to what SIGKILL does to
 * uncommitted work. NOT a stub: assertions read real row counts from Postgres.
 */
import { randomUUID } from 'node:crypto';
import { createSql, type Sql } from '../db/client.ts';

export type CrashBoundary =
  | 'before-commit'
  | 'after-commit-before-dispatch'
  | 'after-dispatch-before-ack'
  | null;

/** Boundary names used by the queue-4 RED harness (queue-red-harness KillBoundary). */
export type DurableBoundary =
  | 'before-commit'
  | 'after-commit-before-enqueue'
  | 'after-dispatch-before-ack'
  | 'none';

const DEFAULT_URL = () => process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

export type DurableEffectResult = {
  effect_count: number;
  outbox_count: number;
  inbox_dedupe_count: number;
  fencing_token: string | null;
  idempotency_key: string;
  status?: string;
};

const ENSURE_SQL = `
CREATE TABLE IF NOT EXISTS queue_outbox (
  id uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  fence_token text,
  effect_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  acked_at timestamptz,
  CONSTRAINT queue_outbox_status_check CHECK (status IN ('pending','dispatched','acked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_outbox_key_uidx ON queue_outbox (key);
CREATE INDEX IF NOT EXISTS queue_outbox_status_idx ON queue_outbox (status) WHERE status <> 'acked';

CREATE TABLE IF NOT EXISTS queue_effects (
  id uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fence_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_effects_key_uidx ON queue_effects (key);

CREATE TABLE IF NOT EXISTS queue_inbox (
  id uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  key text NOT NULL,
  outbox_id uuid REFERENCES queue_outbox (id) ON DELETE CASCADE,
  effect_id uuid REFERENCES queue_effects (id) ON DELETE CASCADE,
  fence_token text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_inbox_outcome_check CHECK (outcome IN ('applied','deduped'))
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_inbox_key_uidx ON queue_inbox (key);
CREATE INDEX IF NOT EXISTS queue_inbox_outcome_idx ON queue_inbox (outcome);
`;

async function ensureOutboxSchema(sql: Sql): Promise<void> {
  await sql.unsafe(ENSURE_SQL);
}

export { ensureOutboxSchema };

// ---------------------------------------------------------------------------
// Low-level API
// ---------------------------------------------------------------------------

export type BeginEffectResult = {
  committed: boolean;
  fenceToken: string | null;
  crashBoundary: CrashBoundary;
};

export async function beginEffect(opts: {
  key: string;
  name: string;
  payload?: Record<string, unknown>;
  databaseUrl?: string;
  crashAt?: CrashBoundary;
}): Promise<BeginEffectResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const fence = `fence-${randomUUID()}`;
  const payload = opts.payload ?? {};
  const crash = opts.crashAt ?? null;
  const sql = createSql(url);
  try {
    await ensureOutboxSchema(sql);
    try {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO queue_outbox (key, name, payload, status, fence_token)
          VALUES (${opts.key}, ${opts.name}, ${tx.json(payload as never)}, 'pending', ${fence})
          ON CONFLICT (key) DO NOTHING
        `;
        if (crash === 'before-commit') {
          throw new Error('CRASH:before-commit');
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('CRASH:')) {
        return { committed: false, fenceToken: null, crashBoundary: crash };
      }
      throw err;
    }
    return { committed: true, fenceToken: fence, crashBoundary: crash };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type DispatchAckResult = {
  applied: boolean;
  deduped: boolean;
  effectId: string | null;
  fenceToken: string | null;
  crashed: boolean;
};

export async function dispatchAndAck(opts: {
  key: string;
  databaseUrl?: string;
  crashAt?: CrashBoundary;
}): Promise<DispatchAckResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const fence = `fence-${randomUUID()}`;
  const crash = opts.crashAt ?? null;
  const sql = createSql(url);
  try {
    await ensureOutboxSchema(sql);

    const outboxRows = await sql<{ id: string; payload: unknown }[]>`
      SELECT id::text AS id, payload FROM queue_outbox WHERE key = ${opts.key}
    `;
    const outbox = outboxRows[0];
    if (!outbox) {
      throw new Error(`dispatchAndAck: no outbox row for key=${opts.key}`);
    }

    try {
      const ackResult = await sql.begin(async (tx) => {
        await tx`
          UPDATE queue_outbox
          SET status = 'dispatched', dispatched_at = COALESCE(dispatched_at, now())
          WHERE key = ${opts.key}
        `;
        const inserted = await tx<{ id: string }[]>`
          INSERT INTO queue_effects (key, payload, fence_token)
          VALUES (${opts.key}, ${tx.json(outbox.payload as never)}, ${fence})
          ON CONFLICT (key) DO NOTHING
          RETURNING id::text AS id
        `;
        const applied = inserted.length > 0;
        const effectRow = applied
          ? { id: inserted[0]!.id }
          : (
              await tx<{ id: string }[]>`
              SELECT id::text AS id FROM queue_effects WHERE key = ${opts.key} LIMIT 1
            `
            )[0]!;
        await tx`
          INSERT INTO queue_inbox (key, outbox_id, effect_id, fence_token, outcome)
          VALUES (
            ${opts.key},
            ${outbox.id}::uuid,
            ${effectRow.id}::uuid,
            ${fence},
            ${applied ? 'applied' : 'deduped'}
          )
          ON CONFLICT (key) DO NOTHING
        `;
        if (crash === 'after-dispatch-before-ack') {
          throw new Error('CRASH:after-dispatch-before-ack');
        }
        await tx`
          UPDATE queue_outbox
          SET status = 'acked', effect_id = ${effectRow.id}::uuid, acked_at = now()
          WHERE key = ${opts.key}
        `;
        return { applied, effectId: effectRow.id };
      });
      return {
        applied: ackResult.applied,
        deduped: !ackResult.applied,
        effectId: ackResult.effectId,
        fenceToken: fence,
        crashed: false,
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('CRASH:')) {
        return { applied: false, deduped: false, effectId: null, fenceToken: null, crashed: true };
      }
      throw err;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type EffectAudit = {
  key: string;
  outbox: { status: string | null; fenceToken: string | null; effectId: string | null };
  effect: { id: string | null; fenceToken: string | null };
  inbox: { outcome: string | null; fenceToken: string | null };
  counts: { outbox: number; effects: number; inbox: number };
  fenceToken: string | null;
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
// High-level API (queue-4 RED harness contract)
// ---------------------------------------------------------------------------

/**
 * Run ONE lifecycle pass for `key` with a kill-9 boundary injected.
 * The RED harness calls this twice: once with the boundary (crash), once with
 * 'none' (recovery). The crash is a real Postgres transaction rollback.
 *
 * On a non-'none' boundary the key is reset first so each boundary is isolated.
 */
export async function runDurableEffectBoundary(opts: {
  key: string;
  payload: { n: number } & Record<string, unknown>;
  boundary: DurableBoundary;
  databaseUrl?: string;
}): Promise<DurableEffectResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const payload = { ...opts.payload };
  // Reset on the crash pass so each boundary starts from a clean slate.
  if (opts.boundary !== 'none') {
    await resetDurable({ key: opts.key, databaseUrl: url });
  }

  if (opts.boundary === 'before-commit') {
    await beginEffect({
      key: opts.key,
      name: 'durable-effect',
      payload,
      databaseUrl: url,
      crashAt: 'before-commit',
    });
  } else {
    // Enqueue commits.
    await beginEffect({ key: opts.key, name: 'durable-effect', payload, databaseUrl: url });
    if (opts.boundary === 'after-dispatch-before-ack') {
      await dispatchAndAck({
        key: opts.key,
        databaseUrl: url,
        crashAt: 'after-dispatch-before-ack',
      });
    } else if (opts.boundary === 'none') {
      await dispatchAndAck({ key: opts.key, databaseUrl: url });
    }
    // 'after-commit-before-enqueue': dispatch never happens (kill before enqueue).
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
