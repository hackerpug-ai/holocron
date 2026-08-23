/**
 * Research iteration writer — fills columns the RN hook actually reads:
 * summary, feedback, refined_queries, sources (+ findings_summary / review_feedback twins).
 * Replay-safe via ON CONFLICT (session_id, iteration_number) DO NOTHING.
 */
import { createSql, type Sql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';

type SqlOpts = {
  databaseUrl?: string;
  sql?: Sql;
};

export type ResearchIterationSource = {
  title?: string;
  url?: string;
  domain?: string;
  citationId?: string;
};

export type InsertResearchIterationInput = {
  sessionId: string;
  iterationNumber: number;
  summary: string;
  feedback: string;
  refinedQueries: string[];
  sources: ResearchIterationSource[];
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'queued' | 'paused';
  system?: 'simple' | 'deep';
  branchId?: string;
  findings?: unknown;
  reviewScore?: number;
  coverageScore?: number;
  reviewGaps?: unknown;
  confidenceStats?: unknown;
  durationMs?: number;
  estimatedCostUsd?: number;
} & SqlOpts;

export type InsertResearchIterationResult =
  | {
      ok: true;
      iterationId: string;
      inserted: boolean;
      summary: string;
      feedback: string;
      refinedQueries: string[];
      sources: ResearchIterationSource[];
    }
  | { ok: false; error: string };

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

export async function insertResearchIteration(
  input: InsertResearchIterationInput
): Promise<InsertResearchIterationResult> {
  const sessionId = input.sessionId?.trim();
  const iterationNumber = Math.floor(Number(input.iterationNumber));
  if (!sessionId) return { ok: false, error: 'sessionId is required' };
  if (!Number.isFinite(iterationNumber) || iterationNumber < 1) {
    return { ok: false, error: `invalid iterationNumber: ${input.iterationNumber}` };
  }
  if (typeof input.summary !== 'string' || input.summary.length === 0) {
    return { ok: false, error: 'summary is required' };
  }
  if (typeof input.feedback !== 'string' || input.feedback.length === 0) {
    return { ok: false, error: 'feedback is required' };
  }
  if (!Array.isArray(input.refinedQueries)) {
    return { ok: false, error: 'refinedQueries must be an array' };
  }
  if (!Array.isArray(input.sources)) {
    return { ok: false, error: 'sources must be an array' };
  }

  const { sql, ownsSql } = resolveSql(input, 'research iteration insert');
  const status = input.status ?? 'completed';
  const system = input.system ?? 'simple';

  try {
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO research_iterations (
        system,
        session_id,
        iteration_number,
        status,
        findings_summary,
        summary,
        sources,
        findings,
        review_score,
        coverage_score,
        review_feedback,
        feedback,
        review_gaps,
        refined_queries,
        confidence_stats,
        branch_id,
        duration_ms,
        estimated_cost_usd,
        created_at,
        updated_at
      )
      VALUES (
        ${system},
        ${sessionId}::uuid,
        ${iterationNumber},
        ${status},
        ${input.summary},
        ${input.summary},
        ${sql.json(toSqlJsonValue(input.sources))},
        ${input.findings != null ? sql.json(toSqlJsonValue(input.findings)) : null},
        ${input.reviewScore ?? null},
        ${input.coverageScore ?? null},
        ${input.feedback},
        ${input.feedback},
        ${input.reviewGaps != null ? sql.json(toSqlJsonValue(input.reviewGaps)) : null},
        ${sql.json(toSqlJsonValue(input.refinedQueries))},
        ${input.confidenceStats != null ? sql.json(toSqlJsonValue(input.confidenceStats)) : null},
        ${input.branchId ?? null},
        ${input.durationMs ?? null},
        ${input.estimatedCostUsd ?? null},
        now(),
        now()
      )
      ON CONFLICT (session_id, iteration_number) DO NOTHING
      RETURNING id::text AS id
    `;

    if (inserted[0]) {
      return {
        ok: true,
        iterationId: inserted[0].id,
        inserted: true,
        summary: input.summary,
        feedback: input.feedback,
        refinedQueries: input.refinedQueries,
        sources: input.sources,
      };
    }

    const existing = await sql<
      {
        id: string;
        summary: string | null;
        feedback: string | null;
        refined_queries: unknown;
        sources: unknown;
      }[]
    >`
      SELECT id::text AS id, summary, feedback, refined_queries, sources
      FROM research_iterations
      WHERE session_id = ${sessionId}::uuid
        AND iteration_number = ${iterationNumber}
      LIMIT 1
    `;
    const row = existing[0];
    if (!row) {
      return {
        ok: false,
        error: `iteration conflict without visible row for session ${sessionId} #${iterationNumber}`,
      };
    }

    return {
      ok: true,
      iterationId: row.id,
      inserted: false,
      summary: row.summary ?? input.summary,
      feedback: row.feedback ?? input.feedback,
      refinedQueries: Array.isArray(row.refined_queries)
        ? (row.refined_queries as string[])
        : input.refinedQueries,
      sources: Array.isArray(row.sources)
        ? (row.sources as ResearchIterationSource[])
        : input.sources,
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}
