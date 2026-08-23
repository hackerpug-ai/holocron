/**
 * Minimal research_web_calls ledger — server-internal audit of jina/exa calls.
 */
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';

type SqlOpts = {
  databaseUrl?: string;
  sql?: Sql;
};

export type RecordResearchWebCallInput = {
  sessionId?: string;
  iterationId?: string;
  branchId?: string;
  provider?: 'jina' | 'exa';
  callKind?: 'search' | 'fetch' | 'read';
  query?: string;
  url?: string;
  httpStatus?: number;
  resultCount?: number;
  bytes?: number;
  wallMs?: number;
  estimatedCostUsd?: number;
  sourceId?: string;
  errorCode?: string;
} & SqlOpts;

export type RecordResearchWebCallResult =
  | { ok: true; webCallId: string }
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

export async function recordResearchWebCall(
  input: RecordResearchWebCallInput
): Promise<RecordResearchWebCallResult> {
  const { sql, ownsSql } = resolveSql(input, 'research web-call ledger');
  try {
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO research_web_calls (
        session_id,
        iteration_id,
        branch_id,
        provider,
        call_kind,
        query,
        url,
        http_status,
        result_count,
        bytes,
        wall_ms,
        estimated_cost_usd,
        source_id,
        error_code,
        created_at
      )
      VALUES (
        ${input.sessionId ?? null}::uuid,
        ${input.iterationId ?? null}::uuid,
        ${input.branchId ?? null},
        ${input.provider ?? null},
        ${input.callKind ?? null},
        ${input.query ?? null},
        ${input.url ?? null},
        ${input.httpStatus ?? null},
        ${input.resultCount ?? null},
        ${input.bytes ?? null},
        ${input.wallMs ?? null},
        ${input.estimatedCostUsd ?? null},
        ${input.sourceId ?? null},
        ${input.errorCode ?? null},
        now()
      )
      RETURNING id::text AS id
    `;
    const webCallId = inserted[0]?.id;
    if (!webCallId) return { ok: false, error: 'research_web_calls insert returned no id' };
    return { ok: true, webCallId };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}
