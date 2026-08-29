/**
 * Real-Postgres regression for the global research round budget.
 *
 * This test intentionally starts with an already-exhausted three-round session.
 * The aborted signal guarantees that a broken implementation cannot make a web
 * request while the database assertion proves it also cannot persist round 401.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';
import {
  startResearchSession,
  updateResearchSessionStatus,
} from '../../src/research/session-writer.ts';
import { executeResearchRound } from '../../src/research/workflow/round.ts';
import { emptyLedger } from '../../src/research/workflow/schemas.ts';

const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: 'postgres://127.0.0.1:5432/holocron_nonprod',
  context: 'deep research global round cap integration test',
});

describe('deep research global round cap', () => {
  let sql: Sql;
  const sessionIds: string[] = [];

  async function createSessionAt(currentIteration: number): Promise<string> {
    const started = await startResearchSession({
      query: 'round budget regression',
      idempotencyKey: `deep-research-round-cap-${randomUUID()}`,
      system: 'deep',
      maxIterations: 3,
      researchType: 'deep',
      researchMode: 'breadth',
      sql,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error(started.error);
    sessionIds.push(started.sessionId);

    await sql`
      UPDATE research_sessions
      SET current_iteration = ${currentIteration}
      WHERE id = ${started.sessionId}::uuid
    `;
    return started.sessionId;
  }

  function roundLedger() {
    return {
      ...emptyLedger({
        query: 'round budget regression',
        mode: 'quick' as const,
        maxRounds: 3,
        wallBudgetMs: 60_000,
        tokenBudget: 10_000,
        toolcallBudget: 10,
        startedAtMs: Date.now(),
      }),
      subQuestions: [
        {
          id: randomUUID(),
          text: 'This work must never start after the global cap.',
          component: 'budget',
          status: 'open' as const,
        },
      ],
    };
  }

  beforeAll(async () => {
    sql = createSql(DATABASE_URL);
    const targets = await sql<{ database_name: string }[]>`
      SELECT current_database() AS database_name
    `;
    expect(targets[0]?.database_name).toBe('holocron_nonprod');
  });

  afterAll(async () => {
    if (sessionIds.length > 0) {
      await sql`DELETE FROM research_web_calls WHERE session_id = ANY(${sessionIds}::uuid[])`;
      await sql`DELETE FROM research_iterations WHERE session_id = ANY(${sessionIds}::uuid[])`;
      await sql`DELETE FROM research_sessions WHERE id = ANY(${sessionIds}::uuid[])`;
    }
    await sql.end({ timeout: 5 });
  });

  it('does not persist branch 401 or gap 901 after maxRounds 3 is exhausted', async () => {
    const sessionId = await createSessionAt(3);

    const results = await Promise.all(
      [401, 901].map((round) =>
        executeResearchRound({
          sessionId,
          mode: 'breadth',
          round,
          ledger: {
            ...roundLedger(),
            mode: 'breadth',
          },
          deps: {
            sql,
            abortSignal: AbortSignal.abort(),
          },
        })
      )
    );

    expect(results.map((result) => result.handle.stopReason)).toEqual(['round_cap', 'round_cap']);
    expect(results.map((result) => result.ledger.stopReason)).toEqual(['round_cap', 'round_cap']);

    const iterations = await sql<{ iteration_number: number }[]>`
      SELECT iteration_number
      FROM research_iterations
      WHERE session_id = ${sessionId}::uuid
      ORDER BY iteration_number
    `;
    expect(iterations).toEqual([]);

    const webCalls = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM research_web_calls
      WHERE session_id = ${sessionId}::uuid
    `;
    expect(webCalls[0]?.count).toBe(0);

    const sessions = await sql<{ current_iteration: number; max_iterations: number }[]>`
      SELECT current_iteration, max_iterations
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
    `;
    expect(sessions[0]).toEqual({ current_iteration: 3, max_iterations: 3 });
  });

  it('admits only one of two concurrent round starts when one global slot remains', async () => {
    const sessionId = await createSessionAt(2);
    const clients = [createSql(DATABASE_URL), createSql(DATABASE_URL)] as const;
    await Promise.all(clients.map((client) => client`SELECT 1`));

    let results: Awaited<ReturnType<typeof executeResearchRound>>[];
    try {
      results = await Promise.all([
        executeResearchRound({
          sessionId,
          mode: 'quick',
          round: 301,
          ledger: roundLedger(),
          deps: {
            sql: clients[0],
            abortSignal: AbortSignal.abort(),
          },
        }),
        executeResearchRound({
          sessionId,
          mode: 'quick',
          round: 401,
          ledger: roundLedger(),
          deps: {
            sql: clients[1],
            abortSignal: AbortSignal.abort(),
          },
        }),
      ]);
    } finally {
      await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
    }

    expect(results.map((result) => result.handle.stopReason)).toEqual(['round_cap', 'round_cap']);

    const iterations = await sql<{ iteration_number: number }[]>`
      SELECT iteration_number
      FROM research_iterations
      WHERE session_id = ${sessionId}::uuid
      ORDER BY iteration_number
    `;
    expect(iterations).toHaveLength(1);
    expect([301, 401]).toContain(iterations[0]?.iteration_number);

    const webCalls = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM research_web_calls
      WHERE session_id = ${sessionId}::uuid
    `;
    expect(webCalls[0]?.count).toBe(0);

    const sessions = await sql<{ current_iteration: number; max_iterations: number }[]>`
      SELECT current_iteration, max_iterations
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
    `;
    expect(sessions[0]).toEqual({ current_iteration: 3, max_iterations: 3 });
  });

  it('preserves the terminal cancellation latch when a capped round is attempted', async () => {
    const sessionId = await createSessionAt(3);
    const cancelled = await updateResearchSessionStatus(sessionId, 'cancelled', { sql });
    expect(cancelled.ok).toBe(true);

    const result = await executeResearchRound({
      sessionId,
      mode: 'quick',
      round: 401,
      ledger: roundLedger(),
      deps: {
        sql,
        abortSignal: AbortSignal.abort(),
      },
    });

    expect(result.handle.stopReason).toBe('canceled');
    expect(result.ledger.stopReason).toBe('canceled');

    const iterations = await sql<{ iteration_number: number }[]>`
      SELECT iteration_number
      FROM research_iterations
      WHERE session_id = ${sessionId}::uuid
    `;
    expect(iterations).toEqual([]);

    const webCalls = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM research_web_calls
      WHERE session_id = ${sessionId}::uuid
    `;
    expect(webCalls[0]?.count).toBe(0);

    const sessions = await sql<{ status: string; current_iteration: number }[]>`
      SELECT status, current_iteration
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
    `;
    expect(sessions[0]).toEqual({ status: 'cancelled', current_iteration: 3 });
  });
});
