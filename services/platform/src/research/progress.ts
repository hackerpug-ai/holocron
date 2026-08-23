/**
 * Research session progress writer — production path for
 * research_sessions.current_iteration / max_iterations.
 *
 * REDHAT-FIX-02 PATH-A: real Postgres UPDATE outside seed/tests/Maestro harness.
 * Zero-published columns; UI binds via useResearchProgress → researchSessionById.
 */
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';

export type AdvanceResearchSessionIterationInput = {
  sessionId: string;
  /** Override DATABASE_URL (must be holocron_nonprod unless override allowed). */
  databaseUrl?: string;
  /** Optional shared connection — caller owns lifecycle when provided. */
  sql?: Sql;
};

export type AdvanceResearchSessionIterationSuccess = {
  ok: true;
  sessionId: string;
  previousIteration: number;
  currentIteration: number;
  maxIterations: number;
};

export type AdvanceResearchSessionIterationFailure = {
  ok: false;
  sessionId: string;
  errorCode: 'RESEARCH_SESSION_NOT_FOUND' | 'ITERATION_BOUNDS' | 'RESEARCH_SESSION_UPDATE_FAILED';
  error: string;
};

export type AdvanceResearchSessionIterationResult =
  | AdvanceResearchSessionIterationSuccess
  | AdvanceResearchSessionIterationFailure;

type SessionRow = {
  id: string;
  current_iteration: number | null;
  max_iterations: number | null;
  status: string;
};

/**
 * Advance research_sessions.current_iteration by 1 for the given session.
 *
 * Fail-closed:
 * - unknown session → ok:false RESEARCH_SESSION_NOT_FOUND
 * - current >= max (or max unset/invalid) → ok:false ITERATION_BOUNDS
 * - zero-row update → ok:false RESEARCH_SESSION_UPDATE_FAILED
 *
 * Never shells to the Maestro harness simulate server; this is the production writer.
 */
export async function advanceResearchSessionIteration(
  input: AdvanceResearchSessionIterationInput
): Promise<AdvanceResearchSessionIterationResult> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    return {
      ok: false,
      sessionId: input.sessionId ?? '',
      errorCode: 'RESEARCH_SESSION_NOT_FOUND',
      error: 'research session not found: empty sessionId',
    };
  }

  const ownsSql = !input.sql;
  const sql =
    input.sql ??
    createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: input.databaseUrl,
        context: 'research session progress',
      })
    );

  try {
    const rows = await sql<SessionRow[]>`
      SELECT id, current_iteration, max_iterations, status
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;
    const session = rows[0];
    if (!session) {
      return {
        ok: false,
        sessionId,
        errorCode: 'RESEARCH_SESSION_NOT_FOUND',
        error: `research session not found: ${sessionId}`,
      };
    }

    const previousIteration = session.current_iteration ?? 0;
    const maxIterations = session.max_iterations;

    if (maxIterations == null || maxIterations <= 0) {
      return {
        ok: false,
        sessionId,
        errorCode: 'ITERATION_BOUNDS',
        error: `iteration bounds: max_iterations is unset or invalid for session ${sessionId}`,
      };
    }

    if (previousIteration >= maxIterations) {
      return {
        ok: false,
        sessionId,
        errorCode: 'ITERATION_BOUNDS',
        error: `iteration bounds: current_iteration ${previousIteration} already at or over max_iterations ${maxIterations}`,
      };
    }

    const nextIteration = previousIteration + 1;

    // Status transitions belong solely in session-writer.updateResearchSessionStatus
    // (terminal latch). This writer only advances current_iteration.
    const updated = await sql<SessionRow[]>`
      UPDATE research_sessions
      SET current_iteration = ${nextIteration},
          updated_at = now()
      WHERE id = ${sessionId}::uuid
        AND COALESCE(current_iteration, 0) = ${previousIteration}
      RETURNING id, current_iteration, max_iterations, status
    `;

    const row = updated[0];
    if (!row) {
      return {
        ok: false,
        sessionId,
        errorCode: 'RESEARCH_SESSION_UPDATE_FAILED',
        error: `research session update failed (0 rows) for ${sessionId}`,
      };
    }

    return {
      ok: true,
      sessionId,
      previousIteration,
      currentIteration: row.current_iteration ?? nextIteration,
      maxIterations: row.max_iterations ?? maxIterations,
    };
  } finally {
    if (ownsSql) {
      await sql.end({ timeout: 5 });
    }
  }
}

export type AdvanceResearchSessionTowardResult = AdvanceResearchSessionIterationResult & {
  steps: number;
  targetIteration: number;
};

/**
 * Advance research_sessions.current_iteration repeatedly until `targetIteration`
 * (inclusive) or the writer fails closed. Used by mission phase transitions and
 * the production CLI so multi-step progress is real engine code (1→2→3…), not a
 * single absolute SET from a harness.
 */
export async function advanceResearchSessionToward(
  input: AdvanceResearchSessionIterationInput & { targetIteration: number }
): Promise<AdvanceResearchSessionTowardResult> {
  const target = Math.floor(Number(input.targetIteration));
  if (!Number.isFinite(target) || target < 1) {
    return {
      ok: false,
      sessionId: input.sessionId ?? '',
      errorCode: 'ITERATION_BOUNDS',
      error: `iteration bounds: invalid targetIteration ${input.targetIteration}`,
      steps: 0,
      targetIteration: target,
    };
  }

  let steps = 0;
  let lastOk: AdvanceResearchSessionIterationSuccess | null = null;

  // Cap iterations at target to avoid runaway loops under concurrent writers.
  for (let i = 0; i < target; i++) {
    const result = await advanceResearchSessionIteration({
      sessionId: input.sessionId,
      databaseUrl: input.databaseUrl,
      sql: input.sql,
    });
    if (!result.ok) {
      // If we already stepped at least once and hit the ceiling, report last success.
      if (lastOk && result.errorCode === 'ITERATION_BOUNDS') {
        return { ...lastOk, steps, targetIteration: target };
      }
      return { ...result, steps, targetIteration: target };
    }
    steps += 1;
    lastOk = result;
    if (result.currentIteration >= target) {
      return { ...result, steps, targetIteration: target };
    }
  }

  if (lastOk) {
    return { ...lastOk, steps, targetIteration: target };
  }
  return {
    ok: false,
    sessionId: input.sessionId ?? '',
    errorCode: 'RESEARCH_SESSION_UPDATE_FAILED',
    error: 'advanceResearchSessionToward made no progress',
    steps,
    targetIteration: target,
  };
}

/**
 * Ensure a research session has iteration bounds and an initial current_iteration.
 * Used by mission-research when creating durable research_sessions rows.
 */
export async function ensureResearchSessionIterationBaseline(input: {
  sessionId: string;
  maxIterations?: number;
  currentIteration?: number;
  databaseUrl?: string;
  sql?: Sql;
}): Promise<AdvanceResearchSessionIterationResult> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    return {
      ok: false,
      sessionId: input.sessionId ?? '',
      errorCode: 'RESEARCH_SESSION_NOT_FOUND',
      error: 'research session not found: empty sessionId',
    };
  }

  const maxIterations = input.maxIterations ?? 5;
  const currentIteration = input.currentIteration ?? 1;
  if (maxIterations <= 0 || currentIteration < 0 || currentIteration > maxIterations) {
    return {
      ok: false,
      sessionId,
      errorCode: 'ITERATION_BOUNDS',
      error: `iteration bounds: current=${currentIteration} max=${maxIterations}`,
    };
  }

  const ownsSql = !input.sql;
  const sql =
    input.sql ??
    createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: input.databaseUrl,
        context: 'research session progress baseline',
      })
    );

  try {
    const updated = await sql<SessionRow[]>`
      UPDATE research_sessions
      SET max_iterations = ${maxIterations},
          current_iteration = ${currentIteration},
          updated_at = now()
      WHERE id = ${sessionId}::uuid
      RETURNING id, current_iteration, max_iterations, status
    `;
    const row = updated[0];
    if (!row) {
      return {
        ok: false,
        sessionId,
        errorCode: 'RESEARCH_SESSION_NOT_FOUND',
        error: `research session not found: ${sessionId}`,
      };
    }
    return {
      ok: true,
      sessionId,
      previousIteration: currentIteration,
      currentIteration: row.current_iteration ?? currentIteration,
      maxIterations: row.max_iterations ?? maxIterations,
    };
  } finally {
    if (ownsSql) {
      await sql.end({ timeout: 5 });
    }
  }
}
