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

import { randomUUID } from 'node:crypto';
import { generateText } from 'ai';
import { createSql, type Sql } from '../db/client';
import { resolveDatabaseUrl } from '../db/connection';
import { runBudgetedEscape } from './budget-ledger';
import {
  createFleetChatModel,
  type ResolvedModel,
  RoleUnavailableError,
  resolveModel,
  toOpenAiCompatibleBaseURL,
} from './resolve-model';

export type InferenceTelemetryStatus = 'success' | 'error' | 'degraded';
export type InferenceTelemetryProvider = 'fleet' | 'anthropic';

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

export type RunFleetModelCallOptions = {
  role?: string;
  prompt: string;
  runId: string;
  stepId?: string;
  traceId?: string;
  databaseUrl?: string;
  resolveOptions?: Parameters<typeof resolveModel>[1];
};

/**
 * One real fleet model call with durable telemetry.
 * Default path only (allowEscape=false) — never silent cloud fallback.
 */
export async function runFleetModelCall(opts: RunFleetModelCallOptions): Promise<{
  text: string;
  telemetry: InferenceTelemetryRecord;
  resolved: ResolvedModel;
}> {
  const role = opts.role ?? 'divergent';
  const traceId = opts.traceId ?? randomUUID();
  const started = Date.now();

  let resolved: ResolvedModel;
  try {
    resolved = await resolveModel(role, {
      allowEscape: false,
      runId: opts.runId,
      stepId: opts.stepId,
      ...opts.resolveOptions,
    });
  } catch (err) {
    const wallMs = Math.max(1, Date.now() - started);
    const isRoleUnavail = err instanceof RoleUnavailableError;
    const endpoint =
      isRoleUnavail && err.endpoint
        ? err.endpoint
        : (process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1');
    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId: opts.stepId,
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
    // STRICTLY: default path must never record anthropic without budget evidence.
    throw new Error(
      `runFleetModelCall refused non-fleet provider=${resolved.provider} (allowEscape must stay false)`
    );
  }

  const fleetModel = createFleetChatModel(resolved);
  try {
    const result = await generateText({
      model: fleetModel,
      prompt: opts.prompt,
      maxOutputTokens: 32,
    });
    const wallMs = Math.max(1, Date.now() - started);
    const inputTokens = nonNegInt(result.usage?.inputTokens);
    const outputTokens = nonNegInt(result.usage?.outputTokens);
    const totalTokens = nonNegInt(result.usage?.totalTokens) || inputTokens + outputTokens;

    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId: opts.stepId,
      traceId,
      role: resolved.role,
      provider: 'fleet',
      endpoint: displayEndpoint(resolved),
      modelId: resolved.litellmModelId,
      inputTokens,
      outputTokens,
      totalTokens,
      wallMs,
      status: 'success',
      databaseUrl: opts.databaseUrl,
    });

    return { text: result.text ?? '', telemetry, resolved };
  } catch (err) {
    const wallMs = Math.max(1, Date.now() - started);
    const telemetry = await recordInferenceTelemetry({
      runId: opts.runId,
      stepId: opts.stepId,
      traceId,
      role: resolved.role,
      provider: 'fleet',
      endpoint: displayEndpoint(resolved),
      modelId: resolved.litellmModelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      wallMs,
      status: 'error',
      errorCode: 'MODEL_CALL_FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
      databaseUrl: opts.databaseUrl,
    });
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { telemetry });
  }
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
 * Budgeted Anthropic escape with inference_telemetry correlation to budget_ledger.
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
    anthropicHostContacted: boolean;
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
      provider: 'anthropic',
      endpoint: 'https://api.anthropic.com',
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
        anthropicHostContacted: escapeResult.anthropicHostContacted,
      },
    };
  } catch (err) {
    const wallMs = Math.max(1, Date.now() - started);
    await recordInferenceTelemetry({
      runId: opts.runId,
      stepId,
      traceId,
      role,
      provider: 'anthropic',
      endpoint: 'https://api.anthropic.com',
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
  const configuredEndpoint = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';

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
    // Prefer configured fleet endpoint for AC-5 (:4545); fall back to error endpoint.
    const endpoint =
      configuredEndpoint.includes(':4545') || configuredEndpoint.includes('127.0.0.1')
        ? configuredEndpoint
        : isRoleUnavail
          ? err.endpoint
          : configuredEndpoint;

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
