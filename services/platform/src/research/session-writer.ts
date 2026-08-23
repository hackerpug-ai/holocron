/**
 * Research session writer — sole production owner of research_sessions.status.
 *
 * Terminal latch: cancelled / completed / failed are never clobbered by running.
 * Status spellings: queued | running | paused | completed | failed | cancelled | pending(retry).
 * Never emit canceled / in_progress / planning / pending_approval / rejected as status
 * (planning is a phase value only).
 */
import { createSql, type Sql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { researchPhaseValues } from '../db/schema/research.ts';
import { advanceResearchSessionIteration } from './progress.ts';

export const RESEARCH_SESSION_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'pending',
] as const;

export type ResearchSessionStatus = (typeof RESEARCH_SESSION_STATUSES)[number];

export type ResearchPhase = (typeof researchPhaseValues)[number];

const TERMINAL_STATUSES = new Set<ResearchSessionStatus>(['completed', 'failed', 'cancelled']);
const NON_TERMINAL_STATUSES = new Set<ResearchSessionStatus>([
  'queued',
  'running',
  'paused',
  'pending',
]);

const FORBIDDEN_STATUS_SPELLINGS = [
  'canceled',
  'in_progress',
  'planning',
  'pending_approval',
  'rejected',
] as const;

type SqlOpts = {
  databaseUrl?: string;
  sql?: Sql;
};

type SessionStatusRow = {
  id: string;
  status: string;
  idempotency_key: string | null;
  phase: string | null;
  progress: unknown;
  current_iteration: number | null;
  updated_at: Date | string | null;
};

export type StartResearchSessionInput = {
  query: string;
  idempotencyKey: string;
  system?: 'simple' | 'deep';
  topic?: string;
  maxIterations?: number;
  researchType?: string;
  researchMode?: string;
} & SqlOpts;

export type StartResearchSessionResult =
  | { ok: true; sessionId: string; status: ResearchSessionStatus; reused: boolean }
  | { ok: false; error: string };

export type UpdateResearchSessionStatusResult =
  | {
      ok: true;
      sessionId: string;
      previousStatus: string;
      status: ResearchSessionStatus;
      latched: boolean;
    }
  | { ok: false; sessionId: string; error: string };

type ProgressThrottleState = {
  lastWriteMs: number;
  lastPhase: string | null;
  lastIteration: number | null;
  lastSourceCount: number;
};

const progressThrottle = new Map<string, ProgressThrottleState>();

function resolveSql(opts: SqlOpts, context: string): { sql: Sql; ownsSql: boolean } {
  if (opts.sql) return { sql: opts.sql, ownsSql: false };
  return {
    sql: createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: opts.databaseUrl,
        context,
      })
    ),
    ownsSql: true,
  };
}

function assertLegalStatus(next: string): asserts next is ResearchSessionStatus {
  if ((FORBIDDEN_STATUS_SPELLINGS as readonly string[]).includes(next)) {
    throw new Error(
      `forbidden research_sessions.status spelling: ${next} (use cancelled/running; planning is phase-only)`
    );
  }
  if (!(RESEARCH_SESSION_STATUSES as readonly string[]).includes(next)) {
    throw new Error(`illegal research_sessions.status: ${next}`);
  }
}

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status as ResearchSessionStatus);
}

function isLegalTransition(from: string, to: ResearchSessionStatus): boolean {
  if (from === to) return true;

  // Terminal latch: never leave terminal except retry → pending.
  if (isTerminal(from)) {
    return to === 'pending';
  }

  switch (from) {
    case 'queued':
    case 'pending':
      return to === 'running' || isTerminal(to) || to === 'paused';
    case 'running':
      return to === 'paused' || isTerminal(to);
    case 'paused':
      return to === 'running' || isTerminal(to);
    default:
      // Unknown legacy row: allow move into known non-forbidden statuses.
      return (RESEARCH_SESSION_STATUSES as readonly string[]).includes(to);
  }
}

/**
 * INSERT research_sessions with idempotency_key.
 * Concurrent duplicates against a non-terminal row converge on one id.
 * A prior terminal row clears its key so the same key can open a fresh session.
 */
export async function startResearchSession(
  input: StartResearchSessionInput
): Promise<StartResearchSessionResult> {
  const query = input.query?.trim();
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!query) return { ok: false, error: 'query is required' };
  if (!idempotencyKey) return { ok: false, error: 'idempotencyKey is required' };

  const { sql, ownsSql } = resolveSql(input, 'research session start');
  const system = input.system ?? 'simple';
  const maxIterations = input.maxIterations ?? 5;
  const topic = input.topic ?? query;

  try {
    // If a terminal row still holds this key, free it so a fresh insert can proceed.
    await sql`
      UPDATE research_sessions
      SET idempotency_key = NULL,
          updated_at = now()
      WHERE idempotency_key = ${idempotencyKey}
        AND status IN ('completed', 'failed', 'cancelled')
    `;

    const inserted = await sql<{ id: string; status: string }[]>`
      INSERT INTO research_sessions (
        system,
        query,
        topic,
        status,
        idempotency_key,
        max_iterations,
        current_iteration,
        research_type,
        research_mode,
        created_at,
        updated_at
      )
      VALUES (
        ${system},
        ${query},
        ${topic},
        'queued',
        ${idempotencyKey},
        ${maxIterations},
        0,
        ${input.researchType ?? null},
        ${input.researchMode ?? null},
        now(),
        now()
      )
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id::text AS id, status
    `;

    if (inserted[0]) {
      return {
        ok: true,
        sessionId: inserted[0].id,
        status: 'queued',
        reused: false,
      };
    }

    const existing = await sql<{ id: string; status: string }[]>`
      SELECT id::text AS id, status
      FROM research_sessions
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    const row = existing[0];
    if (!row) {
      return {
        ok: false,
        error: `idempotent insert raced without visible row for ${idempotencyKey}`,
      };
    }
    if (isTerminal(row.status)) {
      // Extremely narrow race: terminalized between free + insert; retry once as fresh.
      await sql`
        UPDATE research_sessions
        SET idempotency_key = NULL, updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      const retry = await sql<{ id: string; status: string }[]>`
        INSERT INTO research_sessions (
          system, query, topic, status, idempotency_key, max_iterations, current_iteration,
          research_type, research_mode, created_at, updated_at
        )
        VALUES (
          ${system}, ${query}, ${topic}, 'queued', ${idempotencyKey}, ${maxIterations}, 0,
          ${input.researchType ?? null}, ${input.researchMode ?? null}, now(), now()
        )
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING id::text AS id, status
      `;
      if (retry[0]) {
        return { ok: true, sessionId: retry[0].id, status: 'queued', reused: false };
      }
      const again = await sql<{ id: string; status: string }[]>`
        SELECT id::text AS id, status FROM research_sessions
        WHERE idempotency_key = ${idempotencyKey} LIMIT 1
      `;
      if (!again[0])
        return { ok: false, error: 'failed to start research session after terminal race' };
      return {
        ok: true,
        sessionId: again[0].id,
        status: again[0].status as ResearchSessionStatus,
        reused: true,
      };
    }

    return {
      ok: true,
      sessionId: row.id,
      status: row.status as ResearchSessionStatus,
      reused: true,
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}

/**
 * Sole production writer for `UPDATE research_sessions SET status`.
 * Terminal latch generalized from progress.ts CASE:
 * never clobber cancelled/completed/failed with running (or any non-pending).
 */
export async function updateResearchSessionStatus(
  sessionId: string,
  next: ResearchSessionStatus,
  opts: SqlOpts = {}
): Promise<UpdateResearchSessionStatusResult> {
  const id = sessionId?.trim();
  if (!id) {
    return { ok: false, sessionId: sessionId ?? '', error: 'sessionId is required' };
  }
  assertLegalStatus(next);

  const { sql, ownsSql } = resolveSql(opts, 'research session status');
  try {
    const rows = await sql<SessionStatusRow[]>`
      SELECT id::text AS id, status, idempotency_key, phase, progress, current_iteration, updated_at
      FROM research_sessions
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    const current = rows[0];
    if (!current) {
      return { ok: false, sessionId: id, error: `research session not found: ${id}` };
    }

    if (!isLegalTransition(current.status, next)) {
      // Terminal latch: treat illegal terminal→running as soft latch success.
      if (isTerminal(current.status) && next === 'running') {
        return {
          ok: true,
          sessionId: id,
          previousStatus: current.status,
          status: current.status as ResearchSessionStatus,
          latched: true,
        };
      }
      return {
        ok: false,
        sessionId: id,
        error: `illegal status transition ${current.status} → ${next}`,
      };
    }

    if (current.status === next) {
      return {
        ok: true,
        sessionId: id,
        previousStatus: current.status,
        status: next,
        latched: false,
      };
    }

    const clearKey = isTerminal(next);
    const startedAtSql =
      next === 'running' && (current.status === 'queued' || current.status === 'pending');
    const completedAtSql = isTerminal(next);

    const updated = await sql<{ id: string; status: string }[]>`
      UPDATE research_sessions
      SET status = CASE
            WHEN status IN ('completed', 'failed', 'cancelled')
              AND ${next}::text <> 'pending'
            THEN status
            ELSE ${next}
          END,
          idempotency_key = CASE
            WHEN ${clearKey} THEN NULL
            ELSE idempotency_key
          END,
          started_at = CASE
            WHEN ${startedAtSql} AND started_at IS NULL THEN now()
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ${completedAtSql} THEN COALESCE(completed_at, now())
            WHEN ${next}::text = 'pending' THEN NULL
            ELSE completed_at
          END,
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text AS id, status
    `;

    const row = updated[0];
    if (!row) {
      return { ok: false, sessionId: id, error: `status update failed for ${id}` };
    }

    const latched =
      isTerminal(current.status) && row.status === current.status && next !== current.status;
    return {
      ok: true,
      sessionId: id,
      previousStatus: current.status,
      status: row.status as ResearchSessionStatus,
      latched,
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}

export type SetResearchPhaseInput = {
  sessionId: string;
  phase: ResearchPhase;
  progress?: Record<string, unknown>;
  sourceCount?: number;
  force?: boolean;
} & SqlOpts;

export type RecordResearchProgressInput = {
  sessionId: string;
  phase?: ResearchPhase;
  progress?: Record<string, unknown>;
  sourceCount?: number;
  /** When true, also advance current_iteration via advanceResearchSessionIteration. */
  advanceIteration?: boolean;
  force?: boolean;
} & SqlOpts;

function shouldWriteProgress(args: {
  sessionId: string;
  phase: string | null | undefined;
  sourceCount: number | undefined;
  currentIteration: number | null;
  force?: boolean;
}): boolean {
  if (args.force) return true;
  const prev = progressThrottle.get(args.sessionId);
  const now = Date.now();
  if (!prev) return true;
  if (args.phase != null && args.phase !== prev.lastPhase) return true;
  if (
    args.currentIteration != null &&
    prev.lastIteration != null &&
    args.currentIteration !== prev.lastIteration
  ) {
    return true;
  }
  if (args.sourceCount != null && args.sourceCount - prev.lastSourceCount >= 5) {
    return true;
  }
  if (now - prev.lastWriteMs >= 1000) return true;
  return false;
}

function noteProgressWrite(
  sessionId: string,
  phase: string | null,
  iteration: number | null,
  sourceCount: number
): void {
  progressThrottle.set(sessionId, {
    lastWriteMs: Date.now(),
    lastPhase: phase,
    lastIteration: iteration,
    lastSourceCount: sourceCount,
  });
}

/** Clear throttle state (tests). */
export function resetResearchProgressThrottle(): void {
  progressThrottle.clear();
}

export async function setResearchPhase(
  input: SetResearchPhaseInput
): Promise<{ ok: true; written: boolean; phase: string | null } | { ok: false; error: string }> {
  if (!(researchPhaseValues as readonly string[]).includes(input.phase)) {
    return { ok: false, error: `illegal research phase: ${input.phase}` };
  }
  return recordResearchProgress({
    sessionId: input.sessionId,
    phase: input.phase,
    progress: input.progress,
    sourceCount: input.sourceCount,
    force: input.force,
    databaseUrl: input.databaseUrl,
    sql: input.sql,
  });
}

/**
 * Throttled phase/progress writer. Iteration advances reuse advanceResearchSessionIteration
 * (no raw SET current_iteration here).
 */
export async function recordResearchProgress(
  input: RecordResearchProgressInput
): Promise<{ ok: true; written: boolean; phase: string | null } | { ok: false; error: string }> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) return { ok: false, error: 'sessionId is required' };
  if (input.phase && !(researchPhaseValues as readonly string[]).includes(input.phase)) {
    return { ok: false, error: `illegal research phase: ${input.phase}` };
  }

  const { sql, ownsSql } = resolveSql(input, 'research session progress fields');
  try {
    if (input.advanceIteration) {
      const advanced = await advanceResearchSessionIteration({
        sessionId,
        sql,
        databaseUrl: input.databaseUrl,
      });
      if (!advanced.ok) {
        return { ok: false, error: advanced.error };
      }
    }

    const rows = await sql<SessionStatusRow[]>`
      SELECT id::text AS id, status, idempotency_key, phase, progress, current_iteration, updated_at
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, error: `research session not found: ${sessionId}` };

    const nextPhase = input.phase ?? row.phase;
    const sourceCount =
      input.sourceCount ??
      (typeof (row.progress as { sourceCount?: number } | null)?.sourceCount === 'number'
        ? (row.progress as { sourceCount: number }).sourceCount
        : 0);

    const write = shouldWriteProgress({
      sessionId,
      phase: nextPhase,
      sourceCount: input.sourceCount,
      currentIteration: row.current_iteration,
      force: input.force,
    });
    if (!write) {
      return { ok: true, written: false, phase: row.phase };
    }

    const baseProgress =
      row.progress && typeof row.progress === 'object' && !Array.isArray(row.progress)
        ? (row.progress as Record<string, unknown>)
        : {};
    const mergedProgress =
      input.progress != null || input.sourceCount != null
        ? {
            ...baseProgress,
            ...(input.progress ?? {}),
            ...(input.sourceCount != null ? { sourceCount: input.sourceCount } : {}),
          }
        : null;

    if (mergedProgress != null) {
      await sql`
        UPDATE research_sessions
        SET phase = ${nextPhase},
            progress = ${sql.json(toSqlJsonValue(mergedProgress))},
            updated_at = now()
        WHERE id = ${sessionId}::uuid
      `;
    } else {
      await sql`
        UPDATE research_sessions
        SET phase = ${nextPhase},
            updated_at = now()
        WHERE id = ${sessionId}::uuid
      `;
    }

    noteProgressWrite(sessionId, nextPhase, row.current_iteration, sourceCount);
    return { ok: true, written: true, phase: nextPhase };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}

/** Exported for source-audit / invariant tests. */
export const RESEARCH_SESSION_STATUS_FORBIDDEN = FORBIDDEN_STATUS_SPELLINGS;
export const RESEARCH_SESSION_NON_TERMINAL = [...NON_TERMINAL_STATUSES] as const;
