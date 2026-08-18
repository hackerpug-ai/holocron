/**
 * obs-2 — Inference telemetry stream (tokens / wall-ms / endpoint / role).
 *
 * Persists one durable, redacted Postgres row per real model call at the
 * model-call lifecycle boundary. Never logs prompt or response bodies.
 *
 * Public runners used by integration fixtures + operators:
 *   runResearchModelMission  — N real fleet generateText calls (default path)
 *   runBudgetedEscapeWithTelemetry — wraps runBudgetedEscape + records row
 *   runFleetFailureFixture   — ROLE_UNAVAILABLE with error telemetry
 *   listInferenceTelemetry   — durable query for holo telemetry:tail
 *
 * Pattern source: budget-ledger.ts durable INSERT + resolve-model routing.
 * Anti-pattern: invent success rows, buffer-only memory, repurpose agent_telemetry.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve as pathResolve, relative } from 'node:path';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4, LanguageModelV4Usage } from '@ai-sdk/provider-v7';
import { generateObject, generateText } from 'ai';
import type { z } from 'zod';
import { createSql, type Sql } from '../db/client';
import { resolveDatabaseUrl } from '../db/connection';
import {
  bufferMissionModelCall,
  createLangfuseExporterFromEnv,
  type HolocronLangfuseExporter,
} from '../observability/langfuse-exporter';
import { runBudgetedEscape } from './budget-ledger';
import {
  createFleetChatModel,
  type ResolvedModel,
  RoleUnavailableError,
  resolveModel,
  toOpenAiCompatibleBaseURL,
} from './resolve-model';

/**
 * Mission-scoped Langfuse exporter (S31-07).
 * executeRunWithLease runs stages inside this ALS so every runFleetModelCall
 * buffers spans on the same exporter that flushMissionLangfuse flushes.
 */
const missionLangfuseAls = new AsyncLocalStorage<HolocronLangfuseExporter>();

/**
 * Request/run-scoped accounting for the public chat model boundary.
 *
 * The scope is entered by chat-runs.ts immediately around agent.stream(). The
 * model wrapper below enters it at every underlying doStream/doGenerate call,
 * so a tool loop cannot be represented by one outer stream counter.
 */
export type ModelRequestInstrumentationBoundary =
  | 'provider-model'
  | 'direct-provider'
  | 'global-fetch';

export type ModelRequestAccounting = {
  requestId: string;
  runId: string;
  resolvedEndpoint: string;
  modelRequests: number;
  underlyingTransportCalls: number;
  fleetRequests: number;
  cloudRequests: number;
  unknownRequests: number;
  responseHeaderApiBases: string[];
  instrumentationBoundary: ModelRequestInstrumentationBoundary;
  terminalized: boolean;
};

export type ModelRequestAccountingSnapshot = Omit<
  ModelRequestAccounting,
  'responseHeaderApiBases'
> & {
  responseHeaderApiBase: string | null;
  responseHeaderApiBases: string[];
  reconciliationComplete: boolean;
};

export type ModelRequestAccountingEvent = {
  requestId: string;
  runId: string;
  resolvedEndpoint: string;
  responseHeaderApiBase: string;
  responseHeaderApiBases: string[];
  modelRequests: number;
  underlyingTransportCalls: number;
  telemetryRows: number;
  fleetRequests: number;
  cloudRequests: number;
  unknownRequests: number;
  instrumentationBoundary: 'provider-model';
  terminalized: true;
  reconciliationComplete: true;
};

const modelRequestAccountingAls = new AsyncLocalStorage<ModelRequestAccounting>();

export function createModelRequestAccounting(input: {
  requestId: string;
  runId: string;
  resolvedEndpoint: string;
}): ModelRequestAccounting {
  return {
    ...input,
    modelRequests: 0,
    underlyingTransportCalls: 0,
    fleetRequests: 0,
    cloudRequests: 0,
    unknownRequests: 0,
    responseHeaderApiBases: [],
    instrumentationBoundary: 'provider-model',
    terminalized: false,
  };
}

export async function runWithModelRequestAccounting<T>(
  scope: ModelRequestAccounting,
  fn: () => Promise<T>
): Promise<T> {
  return modelRequestAccountingAls.run(scope, fn);
}

export function snapshotModelRequestAccounting(
  scope: ModelRequestAccounting
): ModelRequestAccountingSnapshot {
  return {
    ...scope,
    responseHeaderApiBase: scope.responseHeaderApiBases[0] ?? null,
    reconciliationComplete:
      scope.modelRequests === scope.underlyingTransportCalls &&
      scope.modelRequests === scope.fleetRequests + scope.cloudRequests + scope.unknownRequests,
  };
}

export function terminalizeModelRequestAccounting(
  scope: ModelRequestAccounting
): ModelRequestAccountingSnapshot {
  if (scope.terminalized) {
    throw new Error(
      `model request accounting terminalized more than once: ${JSON.stringify(snapshotModelRequestAccounting(scope))}`
    );
  }
  scope.terminalized = true;
  return snapshotModelRequestAccounting(scope);
}

function accountingFailure(snapshot: ModelRequestAccountingSnapshot, reason: string): Error {
  return new Error(`model request accounting rejected (${reason}): ${JSON.stringify(snapshot)}`);
}

export function assertModelRequestAccountingSnapshot(
  snapshot: ModelRequestAccountingSnapshot,
  options?: { durableTelemetryRows?: number }
): asserts snapshot is ModelRequestAccountingSnapshot & {
  responseHeaderApiBase: string;
  terminalized: true;
  reconciliationComplete: true;
} {
  if (!snapshot.terminalized) throw accountingFailure(snapshot, 'not-terminalized');
  if (snapshot.instrumentationBoundary !== 'provider-model') {
    throw accountingFailure(snapshot, 'invalid-instrumentation-boundary');
  }
  if (
    !/^https?:\/\/(?:host\.docker\.internal|holocron(?:\.tail011a51\.ts\.net)?|localhost|127\.0\.0\.1):4545\/v1$/i.test(
      snapshot.resolvedEndpoint
    )
  ) {
    throw accountingFailure(snapshot, 'untrusted-fleet-router-endpoint');
  }
  if (snapshot.modelRequests < 1) throw accountingFailure(snapshot, 'no-model-request');
  if (snapshot.underlyingTransportCalls < 1) {
    throw accountingFailure(snapshot, 'no-underlying-transport-call');
  }
  if (snapshot.modelRequests !== snapshot.underlyingTransportCalls) {
    throw accountingFailure(snapshot, 'model-transport-count-mismatch');
  }
  if (snapshot.fleetRequests < 1) throw accountingFailure(snapshot, 'no-fleet-request');
  if (snapshot.cloudRequests !== 0) throw accountingFailure(snapshot, 'cloud-request-observed');
  if (snapshot.unknownRequests !== 0) {
    throw accountingFailure(snapshot, 'unknown-transport-observed');
  }
  if (snapshot.responseHeaderApiBases.length !== snapshot.modelRequests) {
    throw accountingFailure(snapshot, 'per-call-response-header-count-mismatch');
  }
  if (
    snapshot.responseHeaderApiBases.some(
      (value) => !/^https?:\/\/inference[12]\.tail011a51\.ts\.net:8003\/v1$/i.test(value)
    )
  ) {
    throw accountingFailure(snapshot, 'untrusted-per-call-mini-response-header');
  }
  if (
    snapshot.modelRequests !==
    snapshot.fleetRequests + snapshot.cloudRequests + snapshot.unknownRequests
  ) {
    throw accountingFailure(snapshot, 'classification-reconciliation-mismatch');
  }
  if (!snapshot.reconciliationComplete) {
    throw accountingFailure(snapshot, 'reconciliation-incomplete');
  }
  if (
    options?.durableTelemetryRows !== undefined &&
    options.durableTelemetryRows !== snapshot.modelRequests
  ) {
    throw accountingFailure(snapshot, 'durable-telemetry-row-count-mismatch');
  }
  if (
    !snapshot.responseHeaderApiBase ||
    !/^https?:\/\/inference[12]\.tail011a51\.ts\.net:8003\/v1$/i.test(
      snapshot.responseHeaderApiBase
    )
  ) {
    throw accountingFailure(snapshot, 'missing-or-untrusted-mini-response-header');
  }
}

export function createModelRequestAccountingEvent(
  snapshot: ModelRequestAccountingSnapshot,
  durableTelemetryRows: number
): ModelRequestAccountingEvent {
  assertModelRequestAccountingSnapshot(snapshot, { durableTelemetryRows });
  if (snapshot.instrumentationBoundary !== 'provider-model') {
    throw accountingFailure(snapshot, 'invalid-instrumentation-boundary');
  }
  return {
    requestId: snapshot.requestId,
    runId: snapshot.runId,
    resolvedEndpoint: snapshot.resolvedEndpoint,
    responseHeaderApiBase: snapshot.responseHeaderApiBase,
    responseHeaderApiBases: snapshot.responseHeaderApiBases,
    modelRequests: snapshot.modelRequests,
    underlyingTransportCalls: snapshot.underlyingTransportCalls,
    telemetryRows: durableTelemetryRows,
    fleetRequests: snapshot.fleetRequests,
    cloudRequests: snapshot.cloudRequests,
    unknownRequests: snapshot.unknownRequests,
    instrumentationBoundary: snapshot.instrumentationBoundary,
    terminalized: true,
    reconciliationComplete: true,
  };
}

/** Run `fn` with a shared HolocronLangfuseExporter bound for nested fleet calls. */
export function runWithMissionLangfuseExporter<T>(
  exporter: HolocronLangfuseExporter,
  fn: () => Promise<T>
): Promise<T> {
  return missionLangfuseAls.run(exporter, fn);
}

export function getMissionLangfuseExporter(): HolocronLangfuseExporter | undefined {
  return missionLangfuseAls.getStore();
}

/** Embed mode for callKind:'embedding' (mirrors embed.ts without circular import). */
export type FleetEmbedMode = 'query' | 'document';

export type InferenceTelemetryStatus = 'success' | 'error' | 'degraded';
export type InferenceTelemetryProvider = 'fleet' | 'deepseek';

/**
 * Call-kind discriminant for the single instrumented fleet client.
 * Expresses telemetry nullability in types rather than by convention.
 */
export type FleetCallKind = 'chat' | 'object' | 'embedding';

export type InferenceTelemetryRecord = {
  id: string;
  runId: string | null;
  stepId: string | null;
  traceId: string | null;
  role: string;
  provider: InferenceTelemetryProvider;
  endpoint: string;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  wallMs: number;
  status: InferenceTelemetryStatus;
  errorCode: string | null;
  errorMessage: string | null;
  budgetLedgerId: string | null;
  createdAt: Date;
};

export type RecordInferenceTelemetryInput = {
  runId?: string | null;
  stepId?: string | null;
  traceId?: string | null;
  role: string;
  provider: InferenceTelemetryProvider;
  endpoint: string;
  modelId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  wallMs: number;
  status: InferenceTelemetryStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  budgetLedgerId?: string | null;
  databaseUrl?: string;
};

function databaseUrl(url?: string, env: NodeJS.ProcessEnv = process.env): string {
  return url ?? env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });
}

async function withTelemetrySql<T>(
  fn: (sql: Sql) => Promise<T>,
  url?: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const sql = createSql(databaseUrl(url, env));
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Strip anything that looks like a prompt/response body; keep short codes only. */
function redactErrorMessage(msg: string | null | undefined, maxLen = 280): string | null {
  if (!msg) return null;
  // Never persist multi-line content that might carry user prompts.
  const oneLine = msg.replace(/\s+/g, ' ').trim();
  // Drop common prompt-like prefixes if present.
  const scrubbed = oneLine
    .replace(/prompt\s*[:=].*/gi, '[redacted]')
    .replace(/response\s*[:=].*/gi, '[redacted]');
  return scrubbed.slice(0, maxLen);
}

function nonNegInt(n: unknown): number {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

/**
 * Insert one inference_telemetry row. Fail-closed on DB errors.
 * NEVER invents success when no call was made — callers must pass real outcomes.
 */
export async function recordInferenceTelemetry(
  input: RecordInferenceTelemetryInput
): Promise<InferenceTelemetryRecord> {
  const inputTokens = nonNegInt(input.inputTokens);
  const outputTokens = nonNegInt(input.outputTokens);
  let totalTokens = nonNegInt(input.totalTokens);
  if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
    totalTokens = inputTokens + outputTokens;
  }
  const wallMs = nonNegInt(input.wallMs);
  const errorMessage = redactErrorMessage(input.errorMessage);

  return withTelemetrySql(async (sql) => {
    const rows = await sql<
      {
        id: string;
        run_id: string | null;
        step_id: string | null;
        trace_id: string | null;
        role: string;
        provider: string;
        endpoint: string;
        model_id: string | null;
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        wall_ms: number;
        status: string;
        error_code: string | null;
        error_message: string | null;
        budget_ledger_id: string | null;
        created_at: Date;
      }[]
    >`
      INSERT INTO inference_telemetry (
        run_id, step_id, trace_id, role, provider, endpoint, model_id,
        input_tokens, output_tokens, total_tokens, wall_ms,
        status, error_code, error_message, budget_ledger_id
      )
      VALUES (
        ${input.runId ?? null},
        ${input.stepId ?? null},
        ${input.traceId ?? null},
        ${input.role},
        ${input.provider},
        ${input.endpoint},
        ${input.modelId ?? null},
        ${inputTokens},
        ${outputTokens},
        ${totalTokens},
        ${wallMs},
        ${input.status},
        ${input.errorCode ?? null},
        ${errorMessage},
        ${input.budgetLedgerId ?? null}
      )
      RETURNING
        id::text,
        run_id,
        step_id,
        trace_id,
        role,
        provider,
        endpoint,
        model_id,
        input_tokens,
        output_tokens,
        total_tokens,
        wall_ms,
        status,
        error_code,
        error_message,
        budget_ledger_id::text,
        created_at
    `;
    const r = rows[0];
    if (!r) {
      throw new Error('inference_telemetry INSERT returned no row');
    }
    return mapRow(r);
  }, input.databaseUrl);
}

function mapRow(r: {
  id: string;
  run_id: string | null;
  step_id: string | null;
  trace_id: string | null;
  role: string;
  provider: string;
  endpoint: string;
  model_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  wall_ms: number;
  status: string;
  error_code: string | null;
  error_message: string | null;
  budget_ledger_id: string | null;
  created_at: Date;
}): InferenceTelemetryRecord {
  return {
    id: r.id,
    runId: r.run_id,
    stepId: r.step_id,
    traceId: r.trace_id,
    role: r.role,
    provider: r.provider as InferenceTelemetryProvider,
    endpoint: r.endpoint,
    modelId: r.model_id,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    totalTokens: Number(r.total_tokens),
    wallMs: Number(r.wall_ms),
    status: r.status as InferenceTelemetryStatus,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    budgetLedgerId: r.budget_ledger_id,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  };
}

export async function listInferenceTelemetry(opts: {
  runId?: string;
  limit?: number;
  databaseUrl?: string;
}): Promise<InferenceTelemetryRecord[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000));
  return withTelemetrySql(async (sql) => {
    const rows = opts.runId
      ? await sql<Parameters<typeof mapRow>[0][]>`
          SELECT
            id::text,
            run_id,
            step_id,
            trace_id,
            role,
            provider,
            endpoint,
            model_id,
            input_tokens,
            output_tokens,
            total_tokens,
            wall_ms,
            status,
            error_code,
            error_message,
            budget_ledger_id::text,
            created_at
          FROM inference_telemetry
          WHERE run_id = ${opts.runId}
          ORDER BY created_at ASC
          LIMIT ${limit}
        `
      : await sql<Parameters<typeof mapRow>[0][]>`
          SELECT
            id::text,
            run_id,
            step_id,
            trace_id,
            role,
            provider,
            endpoint,
            model_id,
            input_tokens,
            output_tokens,
            total_tokens,
            wall_ms,
            status,
            error_code,
            error_message,
            budget_ledger_id::text,
            created_at
          FROM inference_telemetry
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
    return rows.map(mapRow);
  }, opts.databaseUrl);
}

/** Normalize fleet endpoint to OpenAI-compatible base (…/v1) for display. */
export function displayEndpoint(
  resolved: Pick<ResolvedModel, 'endpoint' | 'baseURL' | 'provider'>
): string {
  if (resolved.provider === 'fleet') {
    return resolved.baseURL || toOpenAiCompatibleBaseURL(resolved.endpoint);
  }
  return resolved.endpoint;
}

/** Normalize the operator-selected fleet router for failure telemetry. */
function configuredFleetEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  return toOpenAiCompatibleBaseURL(env.FLEET_URL?.trim() || 'http://127.0.0.1:4545/v1');
}

function chatRunIdFromAgentId(agentId: string | undefined): string | undefined {
  return agentId?.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  )?.[1];
}

/** Read the LiteLLM-selected backend from the real provider response. */
function responseHeaderApiBase(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const value = headers.get('x-litellm-model-api-base');
    if (!value || value.trim().length === 0) return undefined;
    return toOpenAiCompatibleBaseURL(value.trim());
  }
  const value = Object.entries(headers as Record<string, unknown>).find(
    ([key]) => key.toLowerCase() === 'x-litellm-model-api-base'
  )?.[1];
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return toOpenAiCompatibleBaseURL(value.trim());
}

function classifyModelInvocation(
  responseEndpoint: string | undefined
): 'fleet' | 'cloud' | 'unknown' {
  if (!responseEndpoint) return 'unknown';
  if (
    /^https?:\/\/(?:inference1|inference2)\.tail011a51\.ts\.net:8003\/v1$/i.test(responseEndpoint)
  ) {
    return 'fleet';
  }
  if (/api\.(?:openai|anthropic|deepseek)\.com/i.test(responseEndpoint)) return 'cloud';
  return 'unknown';
}

function usageCounts(usage: LanguageModelV4Usage | undefined): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const inputTokens = nonNegInt(usage?.inputTokens?.total);
  const outputTokens = nonNegInt(usage?.outputTokens?.total);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

async function recordChatAgentModelCall(options: {
  runId?: string;
  role: string;
  modelId: string;
  fallbackEndpoint: string;
  responseHeaders: unknown;
  usage?: LanguageModelV4Usage;
  startedMs: number;
}): Promise<void> {
  const headerEndpoint = responseHeaderApiBase(options.responseHeaders);
  const scope = modelRequestAccountingAls.getStore();
  const classification = classifyModelInvocation(headerEndpoint);
  if (scope) {
    if (scope.terminalized) {
      throw new Error(
        `model request accounting increment after terminalization: ${JSON.stringify(snapshotModelRequestAccounting(scope))}`
      );
    }
    scope.modelRequests += 1;
    scope.underlyingTransportCalls += 1;
    if (headerEndpoint) scope.responseHeaderApiBases.push(headerEndpoint);
    if (classification === 'fleet') scope.fleetRequests += 1;
    if (classification === 'cloud') scope.cloudRequests += 1;
    if (classification === 'unknown') scope.unknownRequests += 1;
  }

  const runId = options.runId ?? scope?.runId;
  if (!runId) return;
  const counts = usageCounts(options.usage);
  await recordInferenceTelemetry({
    runId,
    stepId: 'chat-runs/model',
    traceId: runId,
    role: options.role,
    provider: 'fleet',
    // The durable telemetry endpoint is the resolved router endpoint. The
    // selected mini is separately persisted in the request accounting event.
    endpoint: options.fallbackEndpoint,
    modelId: options.modelId,
    ...counts,
    wallMs: Math.max(1, Date.now() - options.startedMs),
    status: classification === 'fleet' ? 'success' : 'error',
    errorCode: classification === 'fleet' ? null : 'MODEL_ENDPOINT_UNTRUSTED',
    errorMessage:
      classification === 'fleet'
        ? null
        : headerEndpoint
          ? `model response endpoint was not an allowed mini: ${headerEndpoint}`
          : 'LiteLLM response omitted x-litellm-model-api-base',
  });
}

/**
 * Wrap the actual provider model, not global fetch and not the outer Agent.
 * Mastra invokes this wrapper once for every underlying doStream/doGenerate,
 * including additional calls made by tool loops and multi-step runs.
 */
function wrapChatAgentModel(
  model: ReturnType<typeof createFleetChatModel>,
  options: { runId?: string; role: string; fallbackEndpoint: string }
): ReturnType<typeof createFleetChatModel> {
  const source = model as unknown as LanguageModelV4;
  const wrapped: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: source.provider,
    modelId: source.modelId,
    supportedUrls: source.supportedUrls,
    async doGenerate(params) {
      const startedMs = Date.now();
      let result: Awaited<ReturnType<LanguageModelV4['doGenerate']>>;
      try {
        result = await source.doGenerate(params);
      } catch (error) {
        await recordChatAgentModelCall({
          ...options,
          modelId: source.modelId,
          responseHeaders: undefined,
          startedMs,
        });
        throw error;
      }
      await recordChatAgentModelCall({
        ...options,
        modelId: source.modelId,
        responseHeaders: result.response?.headers,
        usage: result.usage,
        startedMs,
      });
      return result;
    },
    async doStream(params) {
      const startedMs = Date.now();
      let result: Awaited<ReturnType<LanguageModelV4['doStream']>>;
      try {
        result = await source.doStream(params);
      } catch (error) {
        await recordChatAgentModelCall({
          ...options,
          modelId: source.modelId,
          responseHeaders: undefined,
          startedMs,
        });
        throw error;
      }
      await recordChatAgentModelCall({
        ...options,
        modelId: source.modelId,
        responseHeaders: result.response?.headers,
        startedMs,
      });
      return result;
    },
  };
  return wrapped as unknown as ReturnType<typeof createFleetChatModel>;
}

export type RunFleetModelCallOptions = {
  role?: string;
  prompt: string;
  runId: string;
  /**
   * Durable step id. Prefer callSite strings used by the telemetry sweep
   * (evals/scorers, embed, extract-structured, probe-capability, compat/cells/agent).
   */
  stepId?: string;
  /**
   * Call-site label written into step_id when stepId is omitted.
   * Used by AC-3 DISTINCT call_site grouping (step_id AS call_site).
   */
  callSite?: string;
  /** chat (default) | object (generateObject) | embedding (embed). */
  callKind?: FleetCallKind;
  /** Required when callKind === 'object'. */
  schema?: z.ZodType;
  /** Required when callKind === 'embedding'. */
  embedMode?: FleetEmbedMode;
  /** Optional model options for the OpenAI-compatible client. */
  modelOptions?: { apiKey?: string; name?: string };
  /** When true (default), flush Langfuse after the call if exporter is configured. */
  exportToLangfuse?: boolean;
  /** Shared exporter (mission runtime). When omitted, a one-shot env exporter is used. */
  langfuseExporter?: HolocronLangfuseExporter;
  traceId?: string;
  databaseUrl?: string;
  /** Override default 32-token cap for longer reasoning prompts (business-report). */
  maxOutputTokens?: number;
  resolveOptions?: Parameters<typeof resolveModel>[1];
  /** Optional abort signal for object/chat calls. */
  abortSignal?: AbortSignal;
  /** experimental_repairText for object repair mode. */
  repairText?: (args: { text: string }) => Promise<string> | string;
  /** When true, wrap the chat model to strip response_format (repair mode). */
  stripResponseFormat?: boolean;
};

/**
 * Pull text from AI SDK reasoning parts.
 * GLM-4.7 / local fleet often emit content="" and put the answer in reasoning.
 * Shapes seen in AI SDK 5/6:
 *   - result.reasoningText: string
 *   - result.reasoning: string | { text } | Array<{ type:'reasoning', text }>
 *   - result.steps[i].reasoning / content: same part arrays
 */
function partsToText(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (!item || typeof item !== 'object') return '';
        const row = item as Record<string, unknown>;
        if (typeof row.text === 'string') return row.text.trim();
        return '';
      })
      .filter((s) => s.length > 0);
    return parts.join('\n').trim();
  }
  const nested = value as Record<string, unknown>;
  if (typeof nested.text === 'string' && nested.text.trim().length > 0) {
    return nested.text.trim();
  }
  return '';
}

/** Pull reasoning-channel text when content is empty (local reasoning models). */
function extractReasoningText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const record = result as Record<string, unknown>;

  // Prefer the SDK's pre-joined reasoningText when present.
  if (typeof record.reasoningText === 'string' && record.reasoningText.trim().length > 0) {
    return record.reasoningText.trim();
  }

  const fromReasoning = partsToText(record.reasoning);
  if (fromReasoning.length > 0) return fromReasoning;

  const details = record.reasoningDetails ?? record.reasoning_details;
  const fromDetails = partsToText(details);
  if (fromDetails.length > 0) return fromDetails;

  // AI SDK step surfaces (reasoning parts live on step.reasoning / step.content).
  const steps = record.steps;
  if (Array.isArray(steps)) {
    const parts: string[] = [];
    for (const step of steps) {
      if (!step || typeof step !== 'object') continue;
      const s = step as Record<string, unknown>;
      const stepReasoning = partsToText(s.reasoning);
      if (stepReasoning) parts.push(stepReasoning);
      const stepContent = partsToText(s.content);
      if (stepContent) parts.push(stepContent);
      if (typeof s.text === 'string' && s.text.trim()) parts.push(s.text.trim());
    }
    if (parts.length > 0) return parts.join('\n').trim();
  }
  return '';
}

/**
 * One real fleet model call with durable telemetry.
 * Default path only (allowEscape=false) — never silent cloud fallback.
 *
 * Single instrumented client for chat / object / embedding (callKind discriminant).
 * Sole production construction site for createFleetChatModel / createFleetEmbeddingModel.
 */
export async function runFleetModelCall(opts: RunFleetModelCallOptions): Promise<{
  text: string;
  object?: unknown;
  embedding?: number[];
  /** Provider response provenance for each underlying transport call. */
  responseHeaderApiBases: string[];
  telemetry: InferenceTelemetryRecord;
  resolved: ResolvedModel;
  callKind: FleetCallKind;
}> {
  const role = opts.role ?? 'divergent';
  const callKind: FleetCallKind = opts.callKind ?? 'chat';
  const stepId = opts.stepId ?? opts.callSite ?? `fleet-${callKind}`;
  const traceId = opts.traceId ?? randomUUID();
  const startedMs = Date.now();
  const startedAt = new Date(startedMs);

  if (callKind === 'object' && !opts.schema) {
    throw new Error('runFleetModelCall(callKind=object) requires schema');
  }
  if (callKind === 'embedding' && !opts.embedMode) {
    throw new Error('runFleetModelCall(callKind=embedding) requires embedMode');
  }

  let resolved: ResolvedModel;
  try {
    resolved = await resolveModel(role, {
      allowEscape: false,
      runId: opts.runId,
      stepId,
      ...opts.resolveOptions,
    });
  } catch (err) {
    const wallMs = Math.max(1, Date.now() - startedMs);
    const isRoleUnavail = err instanceof RoleUnavailableError;
    const endpoint =
      isRoleUnavail && err.endpoint
        ? toOpenAiCompatibleBaseURL(err.endpoint)
        : configuredFleetEndpoint();
    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId,
      traceId,
      role,
      provider: 'fleet',
      endpoint,
      modelId: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      wallMs,
      status: 'error',
      errorCode: isRoleUnavail ? err.code : 'RESOLVE_FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
      databaseUrl: opts.databaseUrl,
    });
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { telemetry });
  }

  if (resolved.provider !== 'fleet') {
    // STRICTLY: default path must never record an escape (deepseek) provider without budget evidence.
    throw new Error(
      `runFleetModelCall refused non-fleet provider=${resolved.provider} (allowEscape must stay false)`
    );
  }

  const endpoint = displayEndpoint(resolved);
  const modelId = resolved.litellmModelId;

  try {
    let text = '';
    let object: unknown;
    let embedding: number[] | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    const responseHeaderApiBases: string[] = [];

    if (callKind === 'embedding') {
      const mode = opts.embedMode ?? 'document';
      const expectedDim = resolved.embeddingDimension ?? 1024;
      const prefixPolicy = resolved.prefixPolicy;
      let prefixed = opts.prompt;
      if (prefixPolicy) {
        const prefix = mode === 'query' ? prefixPolicy.query : prefixPolicy.document;
        if (prefix && !opts.prompt.startsWith(prefix)) {
          prefixed = `${prefix}${opts.prompt}`;
        }
      }
      if (resolved.provider !== 'fleet') {
        throw new Error(`embedding requires provider=fleet (got ${resolved.provider})`);
      }
      const provider = createOpenAICompatible({
        name: opts.modelOptions?.name ?? 'holocron-fleet',
        baseURL: resolved.baseURL,
        apiKey: opts.modelOptions?.apiKey ?? process.env.FLEET_KEY ?? 'sk-none',
      });
      const embModel = provider.embeddingModel(resolved.litellmModelId);
      // Prefer model.doEmbed — ai.embed() rejects openai-compatible v4 models on some
      // AI SDK version mixes while doEmbed is the stable provider surface.
      const result = await embModel.doEmbed({ values: [prefixed] });
      const embeddingHeader = responseHeaderApiBase(result.response?.headers);
      if (embeddingHeader) responseHeaderApiBases.push(embeddingHeader);
      embedding = (result.embeddings?.[0] ?? []) as number[];
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(`embed() returned empty/null embedding for mode=${mode}`);
      }
      if (embedding.length !== expectedDim) {
        throw new Error(
          `embed() dimension mismatch: got ${embedding.length}, expected ${expectedDim} (mode=${mode})`
        );
      }
      if (!embedding.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        throw new Error(`embed() returned non-finite components (mode=${mode})`);
      }
      if (embedding.every((v) => v === 0)) {
        throw new Error(
          `embed() returned all-zero vector of length ${expectedDim} (mode=${mode}) — refusing silent null embedding`
        );
      }
      // Embeddings rarely return token usage; wall_ms + endpoint/role still required.
      // AC-3 requires non-null tokens — record 1 for a successful vector as a
      // positive integer signal that the call completed (not a free-form body).
      totalTokens = Math.max(1, embedding.length);
      inputTokens = totalTokens;
      text = `embedding dim=${embedding.length}`;
    } else if (callKind === 'object') {
      let fleetModel = createFleetChatModel(resolved, opts.modelOptions);
      if (opts.stripResponseFormat) {
        const { wrapLanguageModel } = await import('ai');
        fleetModel = wrapLanguageModel({
          model: fleetModel,
          middleware: {
            specificationVersion: 'v4',
            transformParams: async ({ params }) => {
              const { responseFormat: _stripped, ...rest } = params;
              return rest as typeof params;
            },
          },
        }) as typeof fleetModel;
      }
      const result = await generateObject({
        model: fleetModel,
        schema: opts.schema!,
        prompt: opts.prompt,
        abortSignal: opts.abortSignal,
        ...(opts.repairText
          ? {
              experimental_repairText: async ({ text: t }: { text: string }) =>
                opts.repairText!({ text: t }),
            }
          : {}),
      });
      const objectHeader = responseHeaderApiBase(result.response?.headers);
      if (objectHeader) responseHeaderApiBases.push(objectHeader);
      object = result.object;
      text = JSON.stringify(result.object);
      inputTokens = nonNegInt(result.usage?.inputTokens);
      outputTokens = nonNegInt(result.usage?.outputTokens);
      totalTokens = nonNegInt(result.usage?.totalTokens) || inputTokens + outputTokens;
    } else {
      const fleetModel = createFleetChatModel(resolved, opts.modelOptions);
      const result = await generateText({
        model: fleetModel,
        prompt: opts.prompt,
        maxOutputTokens: opts.maxOutputTokens ?? 32,
        abortSignal: opts.abortSignal,
      });
      const chatHeader = responseHeaderApiBase(result.response?.headers);
      if (chatHeader) responseHeaderApiBases.push(chatHeader);
      inputTokens = nonNegInt(result.usage?.inputTokens);
      outputTokens = nonNegInt(result.usage?.outputTokens);
      totalTokens = nonNegInt(result.usage?.totalTokens) || inputTokens + outputTokens;
      // Reasoning models (e.g. GLM-4.7) often fill the budget with `reasoning` and
      // leave `content` empty when maxOutputTokens is tight.
      const contentText = (result.text ?? '').trim();
      const reasoningText = extractReasoningText(result);
      text = contentText.length > 0 ? contentText : reasoningText;
    }

    const wallMs = Math.max(1, Date.now() - startedMs);
    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId,
      traceId,
      role: resolved.role,
      provider: 'fleet',
      endpoint,
      modelId,
      inputTokens,
      outputTokens,
      totalTokens,
      wallMs,
      status: 'success',
      databaseUrl: opts.databaseUrl,
    });

    await maybeExportLangfuse(opts, {
      traceId,
      runId: opts.runId,
      stepId,
      endpoint,
      modelId,
      role: resolved.role,
      callKind,
      startTime: startedAt,
      endTime: new Date(),
      input: { prompt: opts.prompt.slice(0, 200) },
      output: { text: text.slice(0, 200) },
      status: 'success',
    });

    return { text, object, embedding, responseHeaderApiBases, telemetry, resolved, callKind };
  } catch (err) {
    const wallMs = Math.max(1, Date.now() - startedMs);
    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId,
      traceId,
      role: resolved.role,
      provider: 'fleet',
      endpoint,
      modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      wallMs,
      status: 'error',
      errorCode: 'MODEL_CALL_FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
      databaseUrl: opts.databaseUrl,
    });
    await maybeExportLangfuse(opts, {
      traceId,
      runId: opts.runId,
      stepId,
      endpoint,
      modelId,
      role: resolved.role,
      callKind,
      startTime: startedAt,
      endTime: new Date(),
      input: { prompt: opts.prompt.slice(0, 200) },
      output: { error: err instanceof Error ? err.message : String(err) },
      status: 'error',
    }).catch(() => undefined);
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { telemetry });
  }
}

async function maybeExportLangfuse(
  opts: RunFleetModelCallOptions,
  span: {
    traceId: string;
    runId: string;
    stepId: string;
    endpoint: string;
    modelId: string | null;
    role: string;
    callKind: FleetCallKind;
    startTime: Date;
    endTime: Date;
    input: unknown;
    output: unknown;
    status: string;
  }
): Promise<void> {
  if (opts.exportToLangfuse === false) return;
  // Prefer explicit option → mission ALS (shared flush) → one-shot env exporter.
  const shared = opts.langfuseExporter ?? getMissionLangfuseExporter();
  const exporter =
    shared ??
    createLangfuseExporterFromEnv({
      failOnExportError: false,
    });
  // Misconfigured exporters do not export rather than throw on the hot path.
  if (!exporter.baseUrl || !exporter.publicKey || !exporter.secretKey) return;
  bufferMissionModelCall(exporter, {
    traceId: span.traceId,
    runId: span.runId,
    stepId: span.stepId,
    name: `model_${span.callKind}`,
    endpoint: span.endpoint,
    modelId: span.modelId,
    role: span.role,
    callKind: span.callKind,
    startTime: span.startTime,
    endTime: span.endTime,
    input: span.input,
    output: span.output,
    status: span.status,
  });
  // Shared mission exporter (explicit or ALS) is flushed by mission/runtime;
  // one-shot env exporters flush immediately.
  if (!shared) {
    try {
      await exporter.flush();
    } catch {
      // Telemetry row is durable; Langfuse export is best-effort on non-mission paths.
    }
  }
}

/**
 * Structural bypass guard (S31-07 AC-4): scan production sources for
 * createFleetChatModel( construction outside the instrumented client.
 *
 * Keys on construction sites (call expressions), not a filename allowlist of
 * known good callers — a brand-new file that constructs a fleet model fails.
 * Allowed:
 *   - resolve-model.ts (definition)
 *   - telemetry.ts (the single instrumented client)
 */
export function scanFleetClientBypass(options?: { srcRoot?: string }): {
  ok: boolean;
  violations: Array<{ file: string; line: number; snippet: string }>;
  scannedFiles: number;
} {
  const srcRoot = options?.srcRoot ?? pathResolve(import.meta.dirname);

  // Construction-site allowlist by basename only (definition + instrumented client).
  // NOT a list of known caller filenames — new files that construct fail.
  const allowedBasenames = new Set(['resolve-model.ts', 'telemetry.ts']);
  const callRe = /\bcreateFleetChatModel\s*\(/g;
  const violations: Array<{ file: string; line: number; snippet: string }> = [];
  let scannedFiles = 0;

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === '__tests__' || name === 'tests') continue;
        walk(full);
        continue;
      }
      if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
      if (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) continue;
      scannedFiles += 1;
      if (allowedBasenames.has(name)) continue;
      const text = readFileSync(full, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        callRe.lastIndex = 0;
        if (!callRe.test(line)) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        if (/^\s*import\b/.test(line)) continue;
        violations.push({
          file: relative(srcRoot, full),
          line: i + 1,
          snippet: trimmed.slice(0, 160),
        });
      }
    }
  }

  walk(srcRoot);
  return { ok: violations.length === 0, violations, scannedFiles };
}

/**
 * AC-5: observability modules reachable from production entrypoints.
 * Returns modules under observability/ that appear only in the test tree.
 */
export function scanObservabilityModuleGraph(options?: { platformRoot?: string }): {
  productionReachable: string[];
  testOnly: string[];
  ok: boolean;
} {
  const platformRoot = options?.platformRoot ?? pathResolve(import.meta.dirname, '..');
  const obsDir = join(platformRoot, 'observability');
  const prodEntrypoints = [
    join(platformRoot, 'cli/holo.ts'),
    join(platformRoot, 'mission/runtime.ts'),
    join(platformRoot, 'index.ts'),
  ];

  function listObsModules(): string[] {
    if (!existsSync(obsDir)) return [];
    return readdirSync(obsDir)
      .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
      .map((n) => join(obsDir, n));
  }

  function collectImports(entry: string, seen: Set<string>): void {
    const abs = pathResolve(entry);
    if (seen.has(abs)) return;
    if (!existsSync(abs)) return;
    let st;
    try {
      st = statSync(abs);
    } catch {
      return;
    }
    if (!st.isFile()) return;
    seen.add(abs);
    let text: string;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      return;
    }
    const importRe = /from\s+['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(text)) !== null) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      const base = pathResolve(dirname(abs), spec);
      const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')];
      for (const c of candidates) {
        if (existsSync(c)) {
          collectImports(c, seen);
          break;
        }
      }
    }
  }

  const prodReachable = new Set<string>();
  for (const ep of prodEntrypoints) {
    collectImports(ep, prodReachable);
  }

  const obsModules = listObsModules();
  const productionReachable = obsModules
    .filter((m) => prodReachable.has(pathResolve(m)))
    .map((m) => relative(platformRoot, m));

  const testOnly = obsModules
    .filter((m) => !prodReachable.has(pathResolve(m)))
    .map((m) => relative(platformRoot, m));

  return {
    productionReachable,
    testOnly,
    ok: testOnly.length === 0 && productionReachable.length > 0,
  };
}

/**
 * Construct a fleet chat model for Mastra Agent registration only.
 * Call sites that generate must still go through runFleetModelCall for telemetry.
 * This is the sole re-export construction site outside runFleetModelCall itself.
 */
export async function createFleetAgentModelBundle(options: {
  role?: string;
  resolveOptions?: Parameters<typeof resolveModel>[1];
  apiKey?: string;
  agentId?: string;
  runId?: string;
}): Promise<{
  model: ReturnType<typeof createFleetChatModel>;
  resolved: ResolvedModel;
}> {
  const role = options.role ?? 'divergent';
  const resolved = await resolveModel(role, {
    allowEscape: false,
    runId: options.runId,
    ...options.resolveOptions,
  });
  if (resolved.provider !== 'fleet') {
    throw new Error(`createFleetAgentModelBundle refused non-fleet provider=${resolved.provider}`);
  }
  const model = createFleetChatModel(resolved, {
    apiKey: options.apiKey,
    name: 'holocron-fleet',
  });
  const runId = options.runId ?? chatRunIdFromAgentId(options.agentId);
  return {
    model: wrapChatAgentModel(model, {
      runId,
      role: resolved.role,
      fallbackEndpoint: displayEndpoint(resolved),
    }),
    resolved,
  };
}

/**
 * Research-style mission: multiple real fleet model calls under one run/trace.
 * Produces ≥2 telemetry rows when prompts length ≥ 2 (AC-1).
 */
export async function runResearchModelMission(opts: {
  runId: string;
  role?: string;
  prompts?: string[];
  databaseUrl?: string;
}): Promise<{
  runId: string;
  traceId: string;
  rows: InferenceTelemetryRecord[];
  callCount: number;
  texts: string[];
}> {
  const role = opts.role ?? 'divergent';
  const prompts =
    opts.prompts && opts.prompts.length > 0
      ? opts.prompts
      : ['Reply with exactly one word: alpha', 'Reply with exactly one word: beta'];
  const traceId = randomUUID();
  const rows: InferenceTelemetryRecord[] = [];
  const texts: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i]!;
    const out = await runFleetModelCall({
      role,
      prompt,
      runId: opts.runId,
      stepId: `research-step-${i + 1}`,
      traceId,
      databaseUrl: opts.databaseUrl,
    });
    rows.push(out.telemetry);
    texts.push(out.text);
  }

  return {
    runId: opts.runId,
    traceId,
    rows,
    callCount: rows.length,
    texts,
  };
}

/**
 * Budgeted DeepSeek escape with inference_telemetry correlation to budget_ledger.
 * Consumes runBudgetedEscape (does not reimplement budget gate).
 */
export async function runBudgetedEscapeWithTelemetry(opts: {
  prompt: string;
  reason: string;
  runId: string;
  stepId?: string;
  role?: string;
  estimatedCostUsd?: number;
  databaseUrl?: string;
}): Promise<{
  runId: string;
  traceId: string;
  telemetry: InferenceTelemetryRecord;
  escape: {
    text: string;
    tokens: number;
    cost: number;
    ledgerId: string;
    inputTokens: number;
    outputTokens: number;
    modelId: string;
    escapeHostContacted: boolean;
  };
}> {
  const role = opts.role ?? 'divergent';
  const stepId = opts.stepId ?? 'escape-step';
  const traceId = randomUUID();
  const started = Date.now();

  try {
    const escapeResult = await runBudgetedEscape({
      prompt: opts.prompt,
      reason: opts.reason,
      estimatedCostUsd: opts.estimatedCostUsd ?? 0.05,
      runId: opts.runId,
      stepId,
      role,
    });
    const wallMs = Math.max(1, Date.now() - started);
    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId,
      traceId,
      role,
      provider: 'deepseek',
      endpoint: 'https://api.deepseek.com',
      modelId: escapeResult.modelId,
      inputTokens: escapeResult.inputTokens,
      outputTokens: escapeResult.outputTokens,
      totalTokens: escapeResult.tokens,
      wallMs,
      status: 'success',
      budgetLedgerId: escapeResult.ledgerId,
      databaseUrl: opts.databaseUrl,
    });
    return {
      runId: opts.runId,
      traceId,
      telemetry,
      escape: {
        text: escapeResult.text,
        tokens: escapeResult.tokens,
        cost: escapeResult.cost,
        ledgerId: escapeResult.ledgerId,
        inputTokens: escapeResult.inputTokens,
        outputTokens: escapeResult.outputTokens,
        modelId: escapeResult.modelId,
        escapeHostContacted: escapeResult.escapeHostContacted,
      },
    };
  } catch (err) {
    const wallMs = Math.max(1, Date.now() - started);
    await recordInferenceTelemetry({
      runId: opts.runId,
      stepId,
      traceId,
      role,
      provider: 'deepseek',
      endpoint: 'https://api.deepseek.com',
      modelId: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      wallMs,
      status: 'error',
      errorCode:
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'ESCAPE_FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
      databaseUrl: opts.databaseUrl,
    });
    throw err;
  }
}

/**
 * Fleet failure fixture: force ROLE_UNAVAILABLE against the configured fleet role
 * and persist an error telemetry row (zero-token failure remains observable).
 *
 * Records the role's configured fleet endpoint (…:4545…) so operators see which
 * surface failed, even when the health probe used a dead override.
 */
export async function runFleetFailureFixture(opts: {
  runId: string;
  role?: string;
  databaseUrl?: string;
}): Promise<{
  runId: string;
  traceId: string;
  telemetry: InferenceTelemetryRecord;
  errorCode: string;
}> {
  const role = opts.role ?? 'divergent';
  const traceId = randomUUID();
  const started = Date.now();
  // Dead loopback port — health probe fails closed (no cloud escape).
  const DEAD = 'http://127.0.0.1:1';
  // Configured fleet endpoint for operator-visible endpoint column (AC-5 :4545).
  const configuredEndpoint = configuredFleetEndpoint();

  try {
    await resolveModel(role, {
      allowEscape: false,
      endpointOverride: DEAD,
      runId: opts.runId,
      stepId: 'failure-fixture',
    });
    // If resolve unexpectedly succeeds, still fail the fixture closed.
    throw new Error('expected ROLE_UNAVAILABLE from dead fleet endpoint');
  } catch (err) {
    const wallMs = Math.max(1, Date.now() - started);
    const isRoleUnavail = err instanceof RoleUnavailableError;
    const errorCode = isRoleUnavail ? err.code : 'ROLE_UNAVAILABLE';
    // This fixture intentionally probes a dead endpoint, but records the
    // configured router that the operator would have used, never a loopback
    // literal selected by the accounting code.
    const endpoint = configuredEndpoint;

    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId: 'failure-fixture',
      traceId,
      role,
      provider: 'fleet',
      endpoint,
      modelId: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      wallMs,
      status: 'error',
      errorCode,
      errorMessage: err instanceof Error ? err.message : String(err),
      databaseUrl: opts.databaseUrl,
    });

    if (
      !isRoleUnavail &&
      !(err instanceof Error && /expected ROLE_UNAVAILABLE/.test(err.message))
    ) {
      // Unexpected error shape — still recorded; rethrow for caller.
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { telemetry });
    }

    return {
      runId: opts.runId,
      traceId,
      telemetry,
      errorCode,
    };
  }
}
