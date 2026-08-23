/**
 * Fleet rerank client — Cohere-compatible POST /v1/rerank via resolveModel('rerank').
 *
 * Rerank is not in the AI SDK provider interface, so this uses plain typed fetch
 * (same modality reasoning as embed()'s doEmbed path). Resolves through the
 * fleet role manifest; never invents an endpoint. Writes inference_telemetry
 * on success and failure. callKind 'rerank' is a FleetCallKind discriminant —
 * not a DB column.
 */

import { randomUUID } from 'node:crypto';
import { DegradedModeController } from './degraded-mode-controller.ts';
import {
  type ResolvedModel,
  type ResolveModelOptions,
  RoleUnavailableError,
  resolveModel,
  toOpenAiCompatibleBaseURL,
} from './resolve-model.ts';
import { type FleetCallKind, recordInferenceTelemetry } from './telemetry.ts';

export const RERANK_CALL_KIND: FleetCallKind = 'rerank';

/** Max chars per candidate text sent to the cross-encoder. */
export const RERANK_TEXT_TRUNCATE_CHARS = 1200;
/** Max documents per HTTP /rerank call. */
export const RERANK_BATCH_SIZE = 32;

export type RerankCandidate = { id: string; text: string };

export type RerankResultItem = {
  id: string;
  index: number;
  relevanceScore: number;
};

export type RerankCandidatesOptions = {
  query: string;
  candidates: RerankCandidate[];
  topN?: number;
  runId: string;
  stepId?: string;
  traceId?: string;
  databaseUrl?: string;
  abortSignal?: AbortSignal;
  /** Default 'required' — unavailable raises RoleUnavailableError. */
  mode?: 'required' | 'labeled-degraded';
  /** Passed through to resolveModel (dead-port fail-closed tests). */
  endpointOverride?: string;
  /** Optional mission id for degraded-mode research surface recording. */
  missionId?: string;
  resolveOptions?: ResolveModelOptions;
};

export type RerankCandidatesResult = {
  results: RerankResultItem[];
  batches: number;
  totalTokens: number;
  degraded: boolean;
};

type RerankApiResult = {
  index?: number;
  relevance_score?: number;
};

type RerankApiResponse = {
  results?: RerankApiResult[];
  meta?: {
    tokens?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    billed_units?: { total_tokens?: number };
  };
  usage?: { total_tokens?: number; prompt_tokens?: number; input_tokens?: number };
  error?: unknown;
};

function truncateText(text: string): string {
  if (text.length <= RERANK_TEXT_TRUNCATE_CHARS) return text;
  return text.slice(0, RERANK_TEXT_TRUNCATE_CHARS);
}

function chunkCandidates<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function extractTotalTokens(body: RerankApiResponse): number {
  const metaTokens = body.meta?.tokens;
  if (metaTokens) {
    const total =
      Number(metaTokens.total_tokens) ||
      Number(metaTokens.input_tokens) + Number(metaTokens.output_tokens || 0);
    if (Number.isFinite(total) && total > 0) return Math.floor(total);
  }
  const billed = Number(body.meta?.billed_units?.total_tokens);
  if (Number.isFinite(billed) && billed > 0) return Math.floor(billed);
  const usageTotal =
    Number(body.usage?.total_tokens) ||
    Number(body.usage?.prompt_tokens) ||
    Number(body.usage?.input_tokens);
  if (Number.isFinite(usageTotal) && usageTotal > 0) return Math.floor(usageTotal);
  return 0;
}

function labeledDegradedResults(candidates: RerankCandidate[]): RerankResultItem[] {
  return candidates.map((candidate, index) => ({
    id: candidate.id,
    index,
    relevanceScore: candidates.length - index,
  }));
}

async function recordUnavailable(
  err: unknown,
  opts: {
    runId: string;
    stepId: string;
    traceId: string;
    databaseUrl?: string;
    endpoint?: string;
    modelId?: string | null;
    startedMs: number;
  }
): Promise<void> {
  const isRoleUnavail = err instanceof RoleUnavailableError;
  const endpoint =
    opts.endpoint ??
    (isRoleUnavail && err.endpoint
      ? toOpenAiCompatibleBaseURL(err.endpoint)
      : toOpenAiCompatibleBaseURL(process.env.FLEET_URL?.trim() || 'http://127.0.0.1:4545/v1'));
  await recordInferenceTelemetry({
    runId: opts.runId,
    stepId: opts.stepId,
    traceId: opts.traceId,
    role: 'rerank',
    provider: 'fleet',
    endpoint,
    modelId: opts.modelId ?? null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    wallMs: Math.max(1, Date.now() - opts.startedMs),
    status: 'error',
    errorCode: isRoleUnavail ? err.code : 'RERANK_FAILED',
    errorMessage: err instanceof Error ? err.message : String(err),
    databaseUrl: opts.databaseUrl,
  });
}

async function handleRequiredUnavailable(
  err: RoleUnavailableError,
  opts: { databaseUrl?: string; missionId?: string }
): Promise<never> {
  const controller = new DegradedModeController({
    databaseUrl: opts.databaseUrl,
    role: 'rerank',
  });
  try {
    await controller.handleUnavailable(err, {
      surface: 'research',
      missionId: opts.missionId,
      stepType: 'SENSE',
    });
  } finally {
    await controller.close().catch(() => undefined);
  }
  throw err;
}

async function postRerankBatch(args: {
  resolved: ResolvedModel;
  query: string;
  documents: string[];
  topN: number;
  abortSignal?: AbortSignal;
}): Promise<{ results: Array<{ index: number; relevanceScore: number }>; totalTokens: number }> {
  const url = `${args.resolved.baseURL.replace(/\/$/, '')}/rerank`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.FLEET_KEY ?? 'sk-none'}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: args.resolved.litellmModelId,
      query: args.query,
      documents: args.documents,
      top_n: args.topN,
    }),
    signal: args.abortSignal ?? AbortSignal.timeout(args.resolved.timeoutMs),
  });

  const body = (await response.json()) as RerankApiResponse;
  if (!response.ok) {
    const detail =
      typeof body.error === 'string'
        ? body.error
        : body.error
          ? JSON.stringify(body.error)
          : `HTTP ${response.status}`;
    throw new Error(`rerank HTTP ${response.status}: ${detail}`);
  }
  if (!Array.isArray(body.results)) {
    throw new Error('rerank response missing results[]');
  }

  const results: Array<{ index: number; relevanceScore: number }> = [];
  for (const row of body.results) {
    if (typeof row.index !== 'number' || typeof row.relevance_score !== 'number') {
      throw new Error('rerank result missing index/relevance_score');
    }
    results.push({ index: row.index, relevanceScore: row.relevance_score });
  }
  return { results, totalTokens: extractTotalTokens(body) };
}

/**
 * Rerank candidates through the fleet rerank role.
 *
 * Batching: truncate to 1200 chars, ≤32 docs per HTTP call. Cross-batch scores
 * are merged globally because a pointwise cross-encoder emits a comparable
 * (query, doc) score — unlike listwise LLM ranking where batch-local ranks
 * are not commensurate.
 */
export async function rerankCandidates(
  opts: RerankCandidatesOptions
): Promise<RerankCandidatesResult> {
  const mode = opts.mode ?? 'required';
  const stepId = opts.stepId ?? 'rerank';
  const traceId = opts.traceId ?? randomUUID();
  const startedMs = Date.now();
  const candidates = opts.candidates;
  const topN = opts.topN ?? candidates.length;

  if (candidates.length === 0) {
    return { results: [], batches: 0, totalTokens: 0, degraded: false };
  }

  let resolved: ResolvedModel;
  try {
    resolved = await resolveModel('rerank', {
      allowEscape: false,
      runId: opts.runId,
      stepId,
      endpointOverride: opts.endpointOverride,
      ...opts.resolveOptions,
    });
  } catch (err) {
    await recordUnavailable(err, {
      runId: opts.runId,
      stepId,
      traceId,
      databaseUrl: opts.databaseUrl,
      startedMs,
    });
    if (mode === 'labeled-degraded') {
      return {
        results: labeledDegradedResults(candidates).slice(0, topN),
        batches: 0,
        totalTokens: 0,
        degraded: true,
      };
    }
    if (err instanceof RoleUnavailableError) {
      await handleRequiredUnavailable(err, {
        databaseUrl: opts.databaseUrl,
        missionId: opts.missionId,
      });
    }
    throw err;
  }

  if (resolved.provider !== 'fleet') {
    throw new Error(
      `rerankCandidates refused non-fleet provider=${resolved.provider} (allowEscape must stay false)`
    );
  }

  const prepared = candidates.map((c) => ({
    id: c.id,
    text: truncateText(c.text),
  }));
  const batches = chunkCandidates(prepared, RERANK_BATCH_SIZE);
  // Pointwise cross-encoder scores are globally comparable across batches.
  const scored: Array<{ id: string; index: number; relevanceScore: number }> = [];
  let totalTokens = 0;

  try {
    for (let batchOffset = 0; batchOffset < batches.length; batchOffset++) {
      const batch = batches[batchOffset]!;
      const globalOffset = batchOffset * RERANK_BATCH_SIZE;
      const { results: batchResults, totalTokens: batchTokens } = await postRerankBatch({
        resolved,
        query: opts.query,
        documents: batch.map((c) => c.text),
        topN: batch.length,
        abortSignal: opts.abortSignal,
      });
      totalTokens += batchTokens;
      for (const row of batchResults) {
        const local = batch[row.index];
        if (!local) {
          throw new Error(`rerank returned out-of-range index ${row.index}`);
        }
        scored.push({
          id: local.id,
          index: globalOffset + row.index,
          relevanceScore: row.relevanceScore,
        });
      }
    }

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const results = scored.slice(0, Math.max(0, topN));

    await recordInferenceTelemetry({
      runId: opts.runId,
      stepId,
      traceId,
      role: resolved.role,
      provider: 'fleet',
      endpoint: resolved.baseURL,
      modelId: resolved.litellmModelId,
      inputTokens: totalTokens,
      outputTokens: 0,
      totalTokens: Math.max(1, totalTokens),
      wallMs: Math.max(1, Date.now() - startedMs),
      status: 'success',
      databaseUrl: opts.databaseUrl,
    });

    return {
      results,
      batches: batches.length,
      totalTokens: Math.max(1, totalTokens),
      degraded: false,
    };
  } catch (err) {
    await recordUnavailable(err, {
      runId: opts.runId,
      stepId,
      traceId,
      databaseUrl: opts.databaseUrl,
      endpoint: resolved.baseURL,
      modelId: resolved.litellmModelId,
      startedMs,
    });

    const wrapped =
      err instanceof RoleUnavailableError
        ? err
        : new RoleUnavailableError(
            'rerank',
            resolved.endpoint,
            resolved.degradationAction,
            err instanceof Error ? err.message : String(err)
          );

    if (mode === 'labeled-degraded') {
      return {
        results: labeledDegradedResults(candidates).slice(0, topN),
        batches: batches.length,
        totalTokens: 0,
        degraded: true,
      };
    }

    await handleRequiredUnavailable(wrapped, {
      databaseUrl: opts.databaseUrl,
      missionId: opts.missionId,
    });
    throw wrapped;
  }
}

export { RoleUnavailableError };
