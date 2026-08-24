/**
 * Persist research_web_calls rows.
 *
 * Two call shapes share one table:
 * - recordResearchWebCall() — session-writer path (opens Sql if needed)
 * - createWebCallLedger(sql) — acquisition path keyed by WebCallRecord.webCallId
 */
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import type { WebCallRecord, WebCapability } from '../web/types.ts';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSql(opts: SqlOpts, context: string): { sql: Sql; ownsSql: boolean } {
  if (opts.sql) return { sql: opts.sql, ownsSql: false };
  return {
    sql: createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: opts.databaseUrl,
        context,
      }),
      { max: 1 }
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

export type LedgerRecordInput = {
  call: WebCallRecord;
  query?: string | null;
  url?: string | null;
  resultCount?: number | null;
  bytes?: number | null;
  errorCode?: string | null;
  sourceId?: string | null;
  iterationId?: string | null;
  branchId?: string | null;
};

export type WebCallLedger = {
  record(input: LedgerRecordInput): Promise<void>;
};

function capabilityToCallKind(capability: WebCapability): 'search' | 'read' {
  return capability === 'search' ? 'search' : 'read';
}

function asSessionId(runId: string): string | null {
  return UUID_RE.test(runId) ? runId : null;
}

export function createWebCallLedger(sql: Sql): WebCallLedger {
  return {
    async record(input: LedgerRecordInput): Promise<void> {
      const { call } = input;
      const sessionId = asSessionId(call.runId);
      const callKind = capabilityToCallKind(call.capability);
      const id = call.webCallId;

      await sql`
        INSERT INTO research_web_calls (
          id,
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
          error_code
        ) VALUES (
          ${id}::uuid,
          ${sessionId}::uuid,
          ${input.iterationId ?? null}::uuid,
          ${input.branchId ?? null},
          ${call.provider},
          ${callKind},
          ${input.query ?? null},
          ${input.url ?? call.requestUrl},
          ${call.httpStatus || null},
          ${input.resultCount ?? null},
          ${input.bytes ?? null},
          ${call.latencyMs || null},
          ${call.costUsd},
          ${input.sourceId ?? null},
          ${input.errorCode ?? null}
        )
      `;
    },
  };
}

/** In-memory ledger for unit tests / dry runs (still records shape, no DB). */
export function createMemoryWebCallLedger(): WebCallLedger & {
  rows: LedgerRecordInput[];
} {
  const rows: LedgerRecordInput[] = [];
  return {
    rows,
    async record(input: LedgerRecordInput): Promise<void> {
      rows.push(input);
    },
  };
}
