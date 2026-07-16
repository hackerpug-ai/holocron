/**
 * Budget ledger — deterministic Claude escape pre-check + per-escape telemetry (infer-2).
 *
 * Pattern:
 *   checkBudget(cost) → boolean/result
 *   if ok → real Anthropic call → logEscape(tokens, cost) → Postgres INSERT
 *
 * Ceiling resolution (first hit wins):
 *   1. HOLO_ESCAPE_BUDGET_USD env when set and finite ≥ 0
 *   2. budget_ceiling.ceiling (singleton id=1)
 *   3. fail-closed (ceiling 0 / BUDGET_NOT_CONFIGURED)
 *
 * Spent = SUM(budget_ledger.cost) against real Postgres. No process-local fiction.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { getSecretValue } from '../config/secrets.ts';
import { createSql, type Sql } from '../db/client';
import { resolveDatabaseUrl } from '../db/connection';

/** Default escape model id (kept local to avoid circular import with resolve-model). */
const DEFAULT_ESCAPE_MODEL_ID = 'claude-haiku-4-5-20251001';

export type BudgetCheckRequest = {
  /** Estimated cost of the planned escape call in USD. */
  estimatedCostUsd: number;
  /** Optional operator/reason string for audit. */
  reason?: string;
  role?: string;
  runId?: string;
  stepId?: string;
};

export type BudgetCheckResult =
  | {
      ok: true;
      ceilingUsd: number;
      spentUsd: number;
      remainingUsd: number;
      estimatedCostUsd: number;
    }
  | {
      ok: false;
      code: 'BUDGET_NOT_CONFIGURED' | 'BUDGET_EXCEEDED' | 'BUDGET_LEDGER_UNAVAILABLE';
      ceilingUsd: number;
      spentUsd: number;
      remainingUsd: number;
      estimatedCostUsd: number;
      reason: string;
    };

export type LogEscapeRequest = {
  reason: string;
  tokens: number;
  cost: number;
  runId?: string;
  stepId?: string;
  role?: string;
  modelId?: string;
  checkType?: string;
  timestamp?: Date;
};

export type LogEscapeResult = {
  id: string;
  reason: string;
  tokens: number;
  cost: number;
  runId: string | null;
  stepId: string | null;
  timestamp: Date;
};

export type BudgetStatus = {
  spent: number;
  ceiling: number;
  remaining: number;
  escapeCount: number;
};

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  constructor(
    readonly check: Extract<BudgetCheckResult, { ok: false }>,
    message?: string
  ) {
    super(
      message ??
        `escape blocked: ${check.code} (ceiling=${check.ceilingUsd} spent=${check.spentUsd} estimated=${check.estimatedCostUsd})`
    );
    this.name = 'BudgetExceededError';
  }
}

/** Haiku-class rough list pricing USD / 1M tokens (input, output). */
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;

function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });
}

async function withLedgerSql<T>(
  fn: (sql: Sql) => Promise<T>,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const sql = createSql(databaseUrl(env));
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Env ceiling when HOLO_ESCAPE_BUDGET_USD is explicitly set.
 * Returns null when unset (caller should fall through to Postgres).
 */
export function readEnvCeilingUsd(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.HOLO_ESCAPE_BUDGET_USD;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** @deprecated use getEscapeBudgetCeilingUsdAsync — sync env-only fallback for callers. */
export function getEscapeBudgetCeilingUsd(env: NodeJS.ProcessEnv = process.env): number {
  const envCeiling = readEnvCeilingUsd(env);
  if (envCeiling !== null) return envCeiling;
  return 0;
}

/** Resolve ceiling: env override → budget_ceiling row → 0 (fail closed). */
export async function getEscapeBudgetCeilingUsdAsync(
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const envCeiling = readEnvCeilingUsd(env);
  if (envCeiling !== null) return envCeiling;
  try {
    return await withLedgerSql(async (sql) => {
      const rows = await sql<{ ceiling: number }[]>`
        SELECT ceiling FROM budget_ceiling WHERE id = 1 LIMIT 1
      `;
      const c = Number(rows[0]?.ceiling);
      return Number.isFinite(c) && c >= 0 ? c : 0;
    }, env);
  } catch {
    return 0;
  }
}

/** Total spent USD from real budget_ledger rows. */
export async function getSpentUsd(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return withLedgerSql(async (sql) => {
    const rows = await sql<{ spent: string | number }[]>`
      SELECT COALESCE(SUM(cost), 0)::float8 AS spent FROM budget_ledger
    `;
    const n = Number(rows[0]?.spent ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, env);
}

/**
 * Operator status from Postgres (budget:status).
 * Ceiling is always the DB singleton — env override applies only to checkBudget gate.
 */
export async function getBudgetStatus(env: NodeJS.ProcessEnv = process.env): Promise<BudgetStatus> {
  return withLedgerSql(async (sql) => {
    const spentRows = await sql<{ spent: string | number; n: number }[]>`
      SELECT COALESCE(SUM(cost), 0)::float8 AS spent, count(*)::int AS n FROM budget_ledger
    `;
    const ceilRows = await sql<{ ceiling: number }[]>`
      SELECT ceiling FROM budget_ceiling WHERE id = 1 LIMIT 1
    `;
    const ceiling = Number(ceilRows[0]?.ceiling ?? 0);
    const spent = Number(spentRows[0]?.spent ?? 0);
    const escapeCount = Number(spentRows[0]?.n ?? 0);
    const ceilingUsd = Number.isFinite(ceiling) && ceiling >= 0 ? ceiling : 0;
    const spentUsd = Number.isFinite(spent) ? spent : 0;
    return {
      spent: spentUsd,
      ceiling: ceilingUsd,
      remaining: Math.max(0, ceilingUsd - spentUsd),
      escapeCount,
    };
  }, env);
}

export async function setBudgetCeiling(
  ceilingUsd: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ceiling: number }> {
  if (!Number.isFinite(ceilingUsd) || ceilingUsd < 0) {
    throw new Error(`invalid ceiling: ${ceilingUsd}`);
  }
  return withLedgerSql(async (sql) => {
    const rows = await sql<{ ceiling: number }[]>`
      INSERT INTO budget_ceiling (id, ceiling, updated_at)
      VALUES (1, ${ceilingUsd}, now())
      ON CONFLICT (id) DO UPDATE
        SET ceiling = EXCLUDED.ceiling, updated_at = now()
      RETURNING ceiling
    `;
    return { ceiling: Number(rows[0]?.ceiling) };
  }, env);
}

/**
 * Persist a successful escape (or seed) to budget_ledger.
 * NEVER call for blocked over-budget attempts.
 */
export async function logEscape(
  request: LogEscapeRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<LogEscapeResult> {
  const tokens =
    Number.isFinite(request.tokens) && request.tokens >= 0 ? Math.floor(request.tokens) : 0;
  const cost = Number.isFinite(request.cost) && request.cost >= 0 ? request.cost : 0;
  if (!request.reason || request.reason.trim() === '') {
    throw new Error('logEscape requires a non-empty reason');
  }

  return withLedgerSql(async (sql) => {
    const ts = request.timestamp ?? new Date();
    const rows = await sql<
      {
        id: string;
        reason: string;
        tokens: number;
        cost: number;
        run_id: string | null;
        step_id: string | null;
        timestamp: Date;
      }[]
    >`
      INSERT INTO budget_ledger (
        reason, tokens, cost, "timestamp", run_id, step_id, role, model_id, check_type
      )
      VALUES (
        ${request.reason},
        ${tokens},
        ${cost},
        ${ts},
        ${request.runId ?? null},
        ${request.stepId ?? null},
        ${request.role ?? null},
        ${request.modelId ?? null},
        ${request.checkType ?? 'escape'}
      )
      RETURNING id::text, reason, tokens, cost, run_id, step_id, "timestamp"
    `;
    const row = rows[0];
    if (!row) throw new Error('logEscape INSERT returned no row');
    return {
      id: row.id,
      reason: row.reason,
      tokens: Number(row.tokens),
      cost: Number(row.cost),
      runId: row.run_id,
      stepId: row.step_id,
      timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
    };
  }, env);
}

/**
 * Record spend after a successful escape — persists via logEscape.
 * Kept for resolveModel call-site compatibility; prefer logEscape directly.
 */
export async function recordEscapeSpend(
  costUsd: number,
  meta?: Partial<LogEscapeRequest>,
  env: NodeJS.ProcessEnv = process.env
): Promise<LogEscapeResult | null> {
  if (!Number.isFinite(costUsd) || costUsd < 0) return null;
  return logEscape(
    {
      reason: meta?.reason ?? 'escape-spend',
      tokens: meta?.tokens ?? 0,
      cost: costUsd,
      runId: meta?.runId,
      stepId: meta?.stepId,
      role: meta?.role,
      modelId: meta?.modelId,
      checkType: meta?.checkType ?? 'escape',
    },
    env
  );
}

/** Test helper — TRUNCATE ledger (not for production paths). */
export async function resetBudgetLedgerForTests(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await withLedgerSql(async (sql) => {
    await sql`TRUNCATE TABLE budget_ledger RESTART IDENTITY`;
  }, env);
}

/**
 * Deterministic pre-check before any Anthropic escape request.
 * Fail closed when budget is not configured or would be exceeded.
 * Reads spent from real Postgres budget_ledger.
 */
export async function checkBudget(
  request: BudgetCheckRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<BudgetCheckResult> {
  const estimatedCostUsd =
    Number.isFinite(request.estimatedCostUsd) && request.estimatedCostUsd >= 0
      ? request.estimatedCostUsd
      : 0;

  let ceilingUsd = 0;
  let spentUsd = 0;
  try {
    ceilingUsd = await getEscapeBudgetCeilingUsdAsync(env);
    spentUsd = await getSpentUsd(env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'BUDGET_LEDGER_UNAVAILABLE',
      ceilingUsd: 0,
      spentUsd: 0,
      remainingUsd: 0,
      estimatedCostUsd,
      reason: `budget ledger unavailable: ${msg}`,
    };
  }

  const remainingUsd = Math.max(0, ceilingUsd - spentUsd);

  if (ceilingUsd <= 0) {
    return {
      ok: false,
      code: 'BUDGET_NOT_CONFIGURED',
      ceilingUsd,
      spentUsd,
      remainingUsd: 0,
      estimatedCostUsd,
      reason:
        'escape budget not configured — set HOLO_ESCAPE_BUDGET_USD > 0 or holo budget:set --ceiling',
    };
  }

  if (spentUsd + estimatedCostUsd > ceilingUsd) {
    return {
      ok: false,
      code: 'BUDGET_EXCEEDED',
      ceilingUsd,
      spentUsd,
      remainingUsd,
      estimatedCostUsd,
      reason: `escape would exceed budget by $${(spentUsd + estimatedCostUsd - ceilingUsd).toFixed(4)}`,
    };
  }

  return {
    ok: true,
    ceilingUsd,
    spentUsd,
    remainingUsd,
    estimatedCostUsd,
  };
}

/**
 * Assert budget or throw BudgetExceededError (for call sites that prefer throw).
 */
export async function assertBudget(
  request: BudgetCheckRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<Extract<BudgetCheckResult, { ok: true }>> {
  const result = await checkBudget(request, env);
  if (!result.ok) {
    throw new BudgetExceededError(result);
  }
  return result;
}

/** Estimate USD cost from token usage (Haiku-class defaults). */
export function estimateEscapeCostUsd(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): number {
  const input = Math.max(0, usage.inputTokens ?? 0);
  const output = Math.max(0, usage.outputTokens ?? 0);
  let cost = (input * HAIKU_INPUT_PER_M + output * HAIKU_OUTPUT_PER_M) / 1_000_000;
  if (cost <= 0 && (usage.totalTokens ?? 0) > 0) {
    // Fallback blended rate when only total is available
    cost = ((usage.totalTokens ?? 0) * HAIKU_INPUT_PER_M) / 1_000_000;
  }
  // Ensure non-zero cost for any non-zero token response (AC: cost > 0)
  if (cost <= 0 && (input > 0 || output > 0 || (usage.totalTokens ?? 0) > 0)) {
    cost = 0.000001;
  }
  return cost;
}

export type RunBudgetedEscapeRequest = {
  prompt: string;
  reason: string;
  estimatedCostUsd?: number;
  runId?: string;
  stepId?: string;
  role?: string;
  modelId?: string;
  apiKey?: string;
  env?: NodeJS.ProcessEnv;
};

export type RunBudgetedEscapeResult = {
  text: string;
  tokens: number;
  cost: number;
  ledgerId: string;
  anthropicHostContacted: boolean;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
};

/**
 * Full escape path: checkBudget → real @ai-sdk/anthropic generateText → logEscape.
 * NEVER contacts Anthropic when checkBudget fails.
 */
export async function runBudgetedEscape(
  request: RunBudgetedEscapeRequest
): Promise<RunBudgetedEscapeResult> {
  const env = request.env ?? process.env;
  const modelId = request.modelId ?? env.HOLO_ESCAPE_MODEL ?? DEFAULT_ESCAPE_MODEL_ID;
  const estimatedCostUsd = request.estimatedCostUsd ?? 0.05;

  await assertBudget(
    {
      estimatedCostUsd,
      reason: request.reason,
      role: request.role,
      runId: request.runId,
      stepId: request.stepId,
    },
    env
  );

  const apiKey = request.apiKey ?? env.ANTHROPIC_API_KEY ?? getSecretValue('ANTHROPIC_API_KEY');
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('ANTHROPIC_API_KEY required for runBudgetedEscape');
  }

  const anthropic = createAnthropic({ apiKey });
  const result = await generateText({
    model: anthropic(modelId),
    prompt: request.prompt,
    maxOutputTokens: 32,
  });

  const inputTokens = Number(result.usage?.inputTokens ?? 0);
  const outputTokens = Number(result.usage?.outputTokens ?? 0);
  const totalTokens = Number(result.usage?.totalTokens ?? inputTokens + outputTokens);
  const tokens = totalTokens > 0 ? totalTokens : inputTokens + outputTokens;
  const cost = estimateEscapeCostUsd({
    inputTokens,
    outputTokens,
    totalTokens: tokens,
  });

  const logged = await logEscape(
    {
      reason: request.reason,
      tokens,
      cost,
      runId: request.runId,
      stepId: request.stepId,
      role: request.role,
      modelId,
      checkType: 'escape',
    },
    env
  );

  return {
    text: result.text ?? '',
    tokens,
    cost,
    ledgerId: logged.id,
    anthropicHostContacted: true,
    inputTokens,
    outputTokens,
    modelId,
  };
}

/** Legacy process-local helpers — no longer track spend (Postgres is source of truth). */
export function getProcessSpentUsd(): number {
  return 0;
}

export function resetProcessSpentUsd(): void {
  // no-op: use resetBudgetLedgerForTests for integration suites
}
