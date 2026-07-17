/**
 * Shared helpers for Sprint 11 queue RED suite (real Postgres, PLATFORM_IT=1).
 * WRITE-ALLOWED: tests/integration/service/RED/** only.
 *
 * Pins the production module paths that queue-1/2/3 will implement. Dynamic
 * imports fail closed (missing module / missing export) until GREEN lands.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Sql } from '../../../../services/platform/src/db/client';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  PLATFORM_IT,
  parseJsonObject,
  REPO_ROOT,
  runHolo,
  withEvidenceLock,
} from './red-harness';

/** Absolute file URL for a platform source module (queue-1/2/3 targets). */
function platformModuleUrl(relFromPlatformSrc: string): string {
  const abs = resolve(REPO_ROOT, 'services/platform/src', relFromPlatformSrc);
  return pathToFileURL(abs).href;
}

export {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  PLATFORM_IT,
  parseJsonObject,
  REPO_ROOT,
  runHolo,
};

export const QUEUE4_TMP = resolve(REPO_ROOT, '.tmp/queue-4');

/** Stable advisory lock for queue RED suites (session-scoped). */
const QUEUE_LOCK_KEY = 'queue-4-red-durable';

/**
 * Legacy 16 Convex crons (convex/crons.ts) — inventory split:
 * 7 janitor sweeps + 4 workflows + 1 consumer + 3→1 backfill + 1 digest.
 */
export const EXPECTED_JOB_NAMES = [
  'task-timeout-worker',
  'subscription-monitor',
  'subscription-auto-research',
  'feed-builder',
  'morning-digest',
  'document-embedding-backfill',
  'research-embedding-backfill',
  'improvements-embedding-backfill',
  'whats-new-daily',
  'audio-stuck-segment-cleanup',
  'audio-transcript-job-processor',
  'toolcall-timeout',
  'assimilation-timeout',
  'agent-plan-timeout',
  'voice-session-timeout',
  'cleanup-agent-telemetry',
] as const;

export const EXPECTED_JOB_COUNT = 16;

export type KillBoundary =
  | 'before-commit'
  | 'after-commit-before-enqueue'
  | 'after-dispatch-before-ack'
  | 'none';

export type DurableEffectResult = {
  effect_count: number;
  outbox_count: number;
  inbox_dedupe_count: number;
  fencing_token: string | null;
  idempotency_key: string;
  status?: string;
};

export type DurableEffectApi = {
  /**
   * Run (or resume) a durable effect with an optional kill-9 simulation boundary.
   * Implementers: write outbox + effect in one TX; fenced consumer records inbox dedupe.
   */
  runDurableEffectBoundary: (opts: {
    key: string;
    payload: { n: number };
    boundary: KillBoundary;
    databaseUrl?: string;
  }) => Promise<DurableEffectResult>;
  /**
   * Audit counts for a stable idempotency key (same shape as holo queue:audit).
   */
  auditDurableEffect?: (key: string, databaseUrl?: string) => Promise<DurableEffectResult>;
};

export type PriorityJob = {
  id: string;
  lane: 'interactive' | 'background';
  name: string;
};

export type PriorityQueueApi = {
  /** Ensure schema/tables exist; clear prior RED seed rows for this suite. */
  resetPriorityLanes?: (databaseUrl?: string) => Promise<void>;
  enqueue: (job: {
    name: string;
    lane: 'interactive' | 'background';
    payload?: Record<string, unknown>;
    databaseUrl?: string;
  }) => Promise<PriorityJob>;
  /**
   * Dequeue next leased job honoring interactive-before-background priority.
   * Returns null when empty.
   */
  dequeue: (databaseUrl?: string) => Promise<PriorityJob | null>;
};

export type DlqApi = {
  resetDlq?: (databaseUrl?: string) => Promise<void>;
  /**
   * Seed a poison job that always fails, with bounded retries (max_attempts).
   */
  seedPoisonJob: (opts: {
    key: string;
    maxAttempts: number;
    databaseUrl?: string;
  }) => Promise<{ id: string; key: string; max_attempts: number }>;
  /**
   * Drive the worker until the poison job exhausts retries or lands in DLQ.
   */
  runUntilTerminal: (opts: { key: string; databaseUrl?: string }) => Promise<{
    status: string;
    attempts: number;
    dlq_count: number;
  }>;
  getJob?: (
    key: string,
    databaseUrl?: string
  ) => Promise<{ status: string; attempts: number } | null>;
};

export function ensureQueue4Tmp(): void {
  mkdirSync(QUEUE4_TMP, { recursive: true });
}

export function writeQueueRedArtifact(name: string, body: unknown): string {
  ensureQueue4Tmp();
  const path = resolve(QUEUE4_TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

export async function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const { createSql } = await import('../../../../services/platform/src/db/client');
  const sql = createSql(DEFAULT_DATABASE_URL);
  try {
    await sql`SELECT pg_advisory_lock(hashtext(${QUEUE_LOCK_KEY}))`;
    return await fn();
  } finally {
    try {
      await sql`SELECT pg_advisory_unlock(hashtext(${QUEUE_LOCK_KEY}))`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

/** Re-export withEvidenceLock for suites that only need DB isolation. */
export { withEvidenceLock };

export function pgError(err: unknown): { code: string | null; message: string } {
  const e = err as { code?: string; message?: string };
  return {
    code: e.code ?? null,
    message: e.message ?? String(err),
  };
}

type LooseModule = Record<string, unknown> & { default?: Record<string, unknown> };

function pickApi(mod: LooseModule, required: string[]): Record<string, unknown> {
  const candidate = required.every((k) => typeof mod[k] === 'function')
    ? mod
    : mod.default && required.every((k) => typeof mod.default?.[k] === 'function')
      ? mod.default
      : null;
  if (!candidate) {
    throw new Error(
      `module loaded but required exports missing: ${required.join(', ')} (queue-1/2 not implemented)`
    );
  }
  return candidate;
}

/**
 * Production module path for durable outbox/inbox effects (queue-2).
 * Missing on mainline → dynamic import fails → genuine RED.
 * Target: services/platform/src/queue/durable-effect.ts
 */
export async function loadDurableEffectApi(): Promise<DurableEffectApi> {
  const url = platformModuleUrl('queue/durable-effect.ts');
  const mod = (await import(url)) as LooseModule;
  return pickApi(mod, ['runDurableEffectBoundary']) as unknown as DurableEffectApi;
}

/**
 * Production module path for leased priority queue (queue-1).
 * Target: services/platform/src/queue/priority.ts
 */
export async function loadPriorityQueueApi(): Promise<PriorityQueueApi> {
  const url = platformModuleUrl('queue/priority.ts');
  const mod = (await import(url)) as LooseModule;
  return pickApi(mod, ['enqueue', 'dequeue']) as unknown as PriorityQueueApi;
}

/**
 * Production module path for DLQ / retry path (queue-1).
 * Target: services/platform/src/queue/dlq.ts
 */
export async function loadDlqApi(): Promise<DlqApi> {
  const url = platformModuleUrl('queue/dlq.ts');
  const mod = (await import(url)) as LooseModule;
  return pickApi(mod, ['seedPoisonJob', 'runUntilTerminal']) as unknown as DlqApi;
}

/**
 * Count rows in a table when it exists; return 0 when relation is missing.
 * Never mocks — real Postgres catalog + SELECT.
 */
export async function countTableRows(
  sql: Sql,
  table: string,
  whereSql?: string
): Promise<{ count: number; tableExists: boolean; error: string | null }> {
  try {
    const exists = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${table}
      ) AS exists
    `;
    if (!exists[0]?.exists) {
      return { count: 0, tableExists: false, error: null };
    }
    // Table name is controlled by callers (fixed whitelist in tests).
    const rows = whereSql
      ? await sql.unsafe(`SELECT count(*)::text AS count FROM ${table} WHERE ${whereSql}`)
      : await sql.unsafe(`SELECT count(*)::text AS count FROM ${table}`);
    const count = Number((rows[0] as { count?: string } | undefined)?.count ?? 0);
    return { count, tableExists: true, error: null };
  } catch (err) {
    return { count: 0, tableExists: false, error: pgError(err).message };
  }
}

/**
 * Read durable-effect audit columns for a key from outbox/inbox/effects tables.
 * Tolerates missing relations (mainline) by returning zeros.
 */
export async function readDurableAudit(
  sql: Sql,
  key: string
): Promise<{
  effect_count: number;
  outbox_count: number;
  inbox_dedupe_count: number;
  fencing_token: string | null;
  tables: Record<string, boolean>;
  errors: string[];
}> {
  const errors: string[] = [];
  const tables: Record<string, boolean> = {};

  const effectCandidates = ['durable_effects', 'queue_effects', 'observable_effects'];
  const outboxCandidates = ['outbox', 'queue_outbox', 'durable_outbox'];
  const inboxCandidates = ['inbox', 'queue_inbox', 'durable_inbox', 'inbox_dedupe'];

  async function countFirst(
    candidates: string[],
    where: string
  ): Promise<{ count: number; table: string | null }> {
    for (const t of candidates) {
      const r = await countTableRows(sql, t, where);
      tables[t] = r.tableExists;
      if (r.error) errors.push(`${t}: ${r.error}`);
      if (r.tableExists) return { count: r.count, table: t };
    }
    return { count: 0, table: null };
  }

  // Prefer key / idempotency_key columns; fall back to full table count if unknown.
  const keyWhere = `idempotency_key = '${key.replace(/'/g, "''")}' OR key = '${key.replace(/'/g, "''")}'`;

  const effects = await countFirst(effectCandidates, keyWhere);
  const outbox = await countFirst(outboxCandidates, keyWhere);
  const inbox = await countFirst(inboxCandidates, keyWhere);

  let fencing_token: string | null = null;
  for (const t of [
    'outbox',
    'queue_outbox',
    'durable_outbox',
    'inbox',
    'queue_inbox',
    'durable_inbox',
  ]) {
    if (!tables[t]) continue;
    try {
      const rows = await sql.unsafe(
        `SELECT fencing_token::text AS fencing_token FROM ${t} WHERE ${keyWhere} LIMIT 1`
      );
      const tok = (rows[0] as { fencing_token?: string } | undefined)?.fencing_token;
      if (tok) {
        fencing_token = tok;
        break;
      }
    } catch (err) {
      errors.push(`fencing_token ${t}: ${pgError(err).message}`);
    }
  }

  return {
    effect_count: effects.count,
    outbox_count: outbox.count,
    inbox_dedupe_count: inbox.count,
    fencing_token,
    tables,
    errors,
  };
}

export async function readDlqState(
  sql: Sql,
  key: string
): Promise<{
  dlq_count: number;
  job_status: string | null;
  tables: Record<string, boolean>;
  errors: string[];
}> {
  const errors: string[] = [];
  const tables: Record<string, boolean> = {};
  const keyLit = key.replace(/'/g, "''");

  const dlqTables = ['queue_dlq', 'dead_letter', 'dead_letter_queue', 'job_dlq'];
  let dlq_count = 0;
  for (const t of dlqTables) {
    const r = await countTableRows(
      sql,
      t,
      `idempotency_key = '${keyLit}' OR key = '${keyLit}' OR job_key = '${keyLit}'`
    );
    tables[t] = r.tableExists;
    if (r.error) errors.push(`${t}: ${r.error}`);
    if (r.tableExists) {
      dlq_count = r.count;
      break;
    }
  }

  let job_status: string | null = null;
  for (const t of ['queue_jobs', 'jobs', 'durable_jobs', 'pgboss.job']) {
    const bare = t.includes('.') ? t.split('.')[1]! : t;
    const schema = t.includes('.') ? t.split('.')[0]! : 'public';
    try {
      const exists = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = ${schema}
            AND table_name = ${bare}
        ) AS exists
      `;
      tables[t] = Boolean(exists[0]?.exists);
      if (!exists[0]?.exists) continue;
      const rows = await sql.unsafe(
        `SELECT status::text AS status FROM ${t} WHERE idempotency_key = '${keyLit}' OR key = '${keyLit}' OR name = '${keyLit}' LIMIT 1`
      );
      job_status = (rows[0] as { status?: string } | undefined)?.status ?? null;
      if (job_status) break;
    } catch (err) {
      errors.push(`${t}: ${pgError(err).message}`);
    }
  }

  return { dlq_count, job_status, tables, errors };
}
