/**
 * REDHAT-FIX-3 / H-1 — Load durable model-call evidence for `holo infer:trace <id>`.
 *
 * Sources `inference_telemetry` (written by `runFleetModelCall` / escape path).
 * Never invents rows. Fail-closed when neither a mission run nor telemetry exist
 * for the given id.
 */

import { createSql } from '../db/client';
import { resolveDatabaseUrl } from '../db/connection';
import {
  listInferenceTelemetry,
  type InferenceTelemetryRecord,
} from './telemetry';

export type InferTraceModelCall = {
  provider: string;
  endpoint: string;
  modelId: string | null;
  role: string;
  status: string;
  traceId: string | null;
  stepId: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  wallMs?: number;
  errorCode?: string | null;
};

export type InferTraceSuccess = {
  ok: true;
  runId: string;
  traceId: string | null;
  modelCalls: InferTraceModelCall[];
  count: number;
};

export type InferTraceFailure = {
  ok: false;
  runId: string | null;
  error: string;
  code: 'INFER_TRACE_NOT_FOUND' | 'MISSION_RUN_NOT_FOUND' | 'TRACE_NOT_FOUND' | 'INFER_TRACE_ID_REQUIRED';
};

export type InferTraceResult = InferTraceSuccess | InferTraceFailure;

function databaseUrl(url?: string, env: NodeJS.ProcessEnv = process.env): string {
  return url ?? env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });
}

function mapModelCall(r: InferenceTelemetryRecord): InferTraceModelCall {
  return {
    provider: r.provider,
    endpoint: r.endpoint,
    modelId: r.modelId,
    role: r.role,
    status: r.status,
    traceId: r.traceId,
    stepId: r.stepId,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    wallMs: r.wallMs,
    errorCode: r.errorCode,
  };
}

async function lookupMissionRun(
  id: string,
  url?: string
): Promise<{ id: string; traceId: string | null } | null> {
  const sql = createSql(databaseUrl(url));
  try {
    const rows = await sql<{ id: string; trace_id: string | null }[]>`
      SELECT id::text AS id, trace_id
      FROM mission_runs
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, traceId: row.trace_id };
  } catch {
    // Invalid UUID cast or missing table — treat as not found at this layer.
    return null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Load modelCalls for a mission run id (primary) or fall back to telemetry keyed by
 * that run_id. Unknown ids fail closed — never ok:true with empty modelCalls for a
 * non-existent run.
 */
export async function loadInferTrace(
  id: string | null | undefined,
  options?: { databaseUrl?: string; limit?: number }
): Promise<InferTraceResult> {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!trimmed) {
    return {
      ok: false,
      runId: null,
      error: 'infer:trace requires <id> (mission run id)',
      code: 'INFER_TRACE_ID_REQUIRED',
    };
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 500, 1000));
  const dbUrl = options?.databaseUrl;

  const mission = await lookupMissionRun(trimmed, dbUrl);
  const rows = await listInferenceTelemetry({
    runId: trimmed,
    limit,
    databaseUrl: dbUrl,
  });

  // Primary success: mission run exists (telemetry may be empty for non-reasoning runs).
  if (mission) {
    const modelCalls = rows.map(mapModelCall);
    return {
      ok: true,
      runId: mission.id,
      traceId: mission.traceId ?? rows[0]?.traceId ?? null,
      modelCalls,
      count: modelCalls.length,
    };
  }

  // Durable telemetry without a surviving mission_runs row still proves model calls.
  if (rows.length > 0) {
    const modelCalls = rows.map(mapModelCall);
    return {
      ok: true,
      runId: trimmed,
      traceId: rows[0]?.traceId ?? null,
      modelCalls,
      count: modelCalls.length,
    };
  }

  return {
    ok: false,
    runId: trimmed,
    error: `infer trace not found for id: ${trimmed}`,
    code: 'INFER_TRACE_NOT_FOUND',
  };
}
