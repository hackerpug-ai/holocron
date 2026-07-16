/**
 * Budget ledger — deterministic Claude escape pre-check + per-escape telemetry (infer-2).
 *
 * Pattern:
 *   checkBudget(cost) → boolean/result  (transactional lock + optional reserve)
 *   if ok → real Anthropic call → logEscape(tokens, cost) → Postgres INSERT
 *
 * Ceiling resolution (single source of truth for gate AND status):
 *   1. HOLO_ESCAPE_BUDGET_USD env when set and finite ≥ 0  (ceilingSource='env')
 *   2. budget_ceiling.ceiling (singleton id=1)             (ceilingSource='db')
 *   3. fail-closed (ceiling 0 / BUDGET_NOT_CONFIGURED)
 *
 * Spent = SUM(budget_ledger.cost) against real Postgres. No process-local fiction.
 * Active reserves (check_type='reserve') count against remaining until released.
 *
 * REDHAT-FIX-H5: reject estimatedCostUsd<=0; SELECT FOR UPDATE reserve;
 * consistent effectiveCeiling; fail-closed logEscape after generateText.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { getSecretValue } from '../config/secrets.ts';
import { createSql, type Sql } from '../db/client';
import { resolveDatabaseUrl } from '../db/connection';
import { assertEscapeNotDegraded } from './escape-degraded-guard.ts';

/** Default escape model id (kept local to avoid circular import with resolve-model). */
const DEFAULT_ESCAPE_MODEL_ID = 'claude-haiku-4-5-20251001';

export type BudgetCheckRequest = {
  /** Estimated cost of the planned escape call in USD. MUST be > 0 for real escapes. */
  estimatedCostUsd: number;
  /** Optional operator/reason string for audit. */
  reason?: string;
  /** Fleet role requesting escape (default: divergent for pre-check audit). */
  role?: string;
  runId?: string;
  stepId?: string;
  /**
   * Echo of allowEscape for pre-check audit rows.
   * Defaults to true — checkBudget is only used on the escape path.
   */
  allowEscape?: boolean;
  /**
   * When true, insert a transactional reserve row (check_type='reserve') that
   * counts against remaining until releaseReservation / successful logEscape.
   * Used by runBudgetedEscape and concurrent-reserve proofs (H5 AC-2).
   */
  reserve?: boolean;
};

export type BudgetCheckResult =
  | {
      ok: true;
      ceilingUsd: number;
      spentUsd: number;
      remainingUsd: number;
      estimatedCostUsd: number;
      /** Present when request.reserve=true and a reserve row was inserted. */
      reservationId?: string;
      ceilingSource: 'env' | 'db';
    }
  | {
      ok: false;
      code:
        | 'BUDGET_NOT_CONFIGURED'
        | 'BUDGET_EXCEEDED'
        | 'BUDGET_LEDGER_UNAVAILABLE'
        | 'BUDGET_INVALID_ESTIMATE';
      ceilingUsd: number;
      spentUsd: number;
      remainingUsd: number;
      estimatedCostUsd: number;
      reason: string;
      ceilingSource?: 'env' | 'db';
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
  /** Whether the request path allowed Claude escape (audit / escape rows). */
  allowEscape?: boolean;
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
  /** Actual spent (escape + seed); excludes pre-check and active reserves. */
  spent: number;
  /** Effective ceiling used by the gate (env override if set, else DB). */
  ceiling: number;
  remaining: number;
  escapeCount: number;
  /** DB singleton ceiling (budget_ceiling.id=1). */
  dbCeiling: number;
  /** Same as ceiling — explicit alias for operator visibility (H5 AC-3). */
  effectiveCeiling: number;
  /** Where the effective ceiling came from. */
  ceilingSource: 'env' | 'db';
  /** Sum of active reserve rows (check_type='reserve'). */
  reserved: number;
};

export class BudgetExceededError extends Error {
  readonly code: string;
  constructor(
    readonly check: Extract<BudgetCheckResult, { ok: false }>,
    message?: string
  ) {
    super(
      message ??
        `escape blocked: ${check.code} (ceiling=${check.ceilingUsd} spent=${check.spentUsd} estimated=${check.estimatedCostUsd})`
    );
    this.name = 'BudgetExceededError';
    this.code = check.code;
  }
}

/** Fail-closed error when ledger write fails after a successful model call. */
export class BudgetLedgerWriteError extends Error {
  readonly code = 'BUDGET_LEDGER_WRITE_FAILED' as const;
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'BudgetLedgerWriteError';
  }
}

/** Haiku-class rough list pricing USD / 1M tokens (input, output). */
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;

/** Test-only fault injection for AC-4 fail-closed ledger proofs. */
let _testForceLogEscapeFailure: Error | null = null;

/**
 * Force the next logEscape call(s) to throw (test-only).
 * Pass null to clear. Used by REDHAT-FIX-H5 AC-4.
 */
export function __testOnly_forceLogEscapeFailure(err: Error | null): void {
  _testForceLogEscapeFailure = err;
}

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

export type ResolvedCeiling = {
  effectiveCeiling: number;
  dbCeiling: number;
  ceilingSource: 'env' | 'db';
};

/**
 * Resolve effective ceiling from env + DB values (pure).
 * Single source of truth shared by checkBudget and getBudgetStatus.
 */
export function resolveEffectiveCeiling(
  dbCeiling: number,
  env: NodeJS.ProcessEnv = process.env
): ResolvedCeiling {
  const db = Number.isFinite(dbCeiling) && dbCeiling >= 0 ? dbCeiling : 0;
  const envCeiling = readEnvCeilingUsd(env);
  if (envCeiling !== null) {
    return { effectiveCeiling: envCeiling, dbCeiling: db, ceilingSource: 'env' };
  }
  return { effectiveCeiling: db, dbCeiling: db, ceilingSource: 'db' };
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
  try {
    return await withLedgerSql(async (sql) => {
      const rows = await sql<{ ceiling: number }[]>`
        SELECT ceiling FROM budget_ceiling WHERE id = 1 LIMIT 1
      `;
      const dbCeiling = Number(rows[0]?.ceiling ?? 0);
      return resolveEffectiveCeiling(dbCeiling, env).effectiveCeiling;
    }, env);
  } catch {
    const envCeiling = readEnvCeilingUsd(env);
    return envCeiling !== null ? envCeiling : 0;
  }
}

/**
 * Total spent USD from real budget_ledger rows (includes active reserves;
 * pre-check rows are cost=0 so they do not inflate).
 */
export async function getSpentUsd(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return withLedgerSql(async (sql) => {
    const rows = await sql<{ spent: string | number }[]>`
      SELECT COALESCE(SUM(cost), 0)::float8 AS spent
      FROM budget_ledger
      WHERE COALESCE(check_type, 'escape') IS DISTINCT FROM 'pre-check'
    `;
    const n = Number(rows[0]?.spent ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, env);
}

/**
 * Operator status from Postgres (budget:status).
 * Ceiling is the SAME effective ceiling used by checkBudget (env override if set).
 */
export async function getBudgetStatus(env: NodeJS.ProcessEnv = process.env): Promise<BudgetStatus> {
  return withLedgerSql(async (sql) => {
    // Actual spend excludes pre-check (cost=0) and active reserves.
    const spentRows = await sql<{ spent: string | number; reserved: string | number; n: number }[]>`
      SELECT
        COALESCE(SUM(cost) FILTER (
          WHERE COALESCE(check_type, 'escape') NOT IN ('pre-check', 'reserve')
        ), 0)::float8 AS spent,
        COALESCE(SUM(cost) FILTER (
          WHERE check_type = 'reserve'
        ), 0)::float8 AS reserved,
        count(*) FILTER (
          WHERE COALESCE(check_type, 'escape') NOT IN ('pre-check', 'reserve')
        )::int AS n
      FROM budget_ledger
    `;
    const ceilRows = await sql<{ ceiling: number }[]>`
      SELECT ceiling FROM budget_ceiling WHERE id = 1 LIMIT 1
    `;
    const dbCeilingRaw = Number(ceilRows[0]?.ceiling ?? 0);
    const resolved = resolveEffectiveCeiling(dbCeilingRaw, env);
    const spentUsd = Number(spentRows[0]?.spent ?? 0);
    const reservedUsd = Number(spentRows[0]?.reserved ?? 0);
    const escapeCount = Number(spentRows[0]?.n ?? 0);
    const spent = Number.isFinite(spentUsd) ? spentUsd : 0;
    const reserved = Number.isFinite(reservedUsd) ? reservedUsd : 0;
    const ceilingUsd = resolved.effectiveCeiling;
    return {
      spent,
      ceiling: ceilingUsd,
      remaining: Math.max(0, ceilingUsd - spent - reserved),
      escapeCount,
      dbCeiling: resolved.dbCeiling,
      effectiveCeiling: resolved.effectiveCeiling,
      ceilingSource: resolved.ceilingSource,
      reserved,
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
 * Persist a budget_ledger row (escape spend, seed, pre-check audit, or reserve).
 *
 * Escape spend: check_type='escape', tokens/cost from real Anthropic usage.
 * Pre-check audit: check_type='pre-check', tokens=0, cost=0 (does not affect spent).
 * Reserve: check_type='reserve', cost=estimatedCostUsd (counts against remaining).
 * Seed rows: check_type='seed' for test isolation only.
 */
export async function logEscape(
  request: LogEscapeRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<LogEscapeResult> {
  if (_testForceLogEscapeFailure) {
    throw _testForceLogEscapeFailure;
  }

  const tokens =
    Number.isFinite(request.tokens) && request.tokens >= 0 ? Math.floor(request.tokens) : 0;
  const cost = Number.isFinite(request.cost) && request.cost >= 0 ? request.cost : 0;
  if (!request.reason || request.reason.trim() === '') {
    throw new Error('logEscape requires a non-empty reason');
  }

  return withLedgerSql(async (sql) => {
    const ts = request.timestamp ?? new Date();
    const allowEscape = request.allowEscape === undefined ? null : request.allowEscape === true;
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
        reason, tokens, cost, "timestamp", run_id, step_id, role, model_id, check_type, allow_escape
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
        ${request.checkType ?? 'escape'},
        ${allowEscape}
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
 * Release a transactional reserve row (check_type='reserve').
 * No-op if the id is missing or already gone.
 */
export async function releaseReservation(
  reservationId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (!reservationId || reservationId.trim() === '') return;
  await withLedgerSql(async (sql) => {
    await sql`
      DELETE FROM budget_ledger
      WHERE id = ${reservationId}::uuid AND check_type = 'reserve'
    `;
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
      allowEscape: meta?.allowEscape ?? true,
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
 * Write a pre-check audit row (tokens=0, cost=0, check_type='pre-check').
 * Cost stays 0 so SUM(cost) / spent is unaffected — this is audit, not spend.
 */
async function recordPreCheckAudit(
  request: BudgetCheckRequest,
  result: BudgetCheckResult,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const passFailCode = result.ok ? 'BUDGET_OK' : result.code;
  const detail = result.ok ? request.reason?.trim() || 'within-budget' : result.reason;
  await logEscape(
    {
      reason: `${passFailCode}: ${detail}`,
      tokens: 0,
      cost: 0,
      runId: request.runId,
      stepId: request.stepId,
      role: request.role ?? 'divergent',
      checkType: 'pre-check',
      // Escape-path pre-check always records allowEscape (default true).
      allowEscape: request.allowEscape !== false,
    },
    env
  );
}

/**
 * Deterministic pre-check before any Anthropic escape request.
 * Fail closed when budget is not configured, estimate is invalid, or would be exceeded.
 *
 * Transactional: BEGIN; SELECT budget_ceiling FOR UPDATE; compute spent+reserves;
 * optional reserve INSERT; COMMIT. Concurrent exclusive estimates serialize under the lock.
 *
 * On every Postgres-backed check, INSERTS a budget_ledger audit row with
 * check_type='pre-check', tokens=0, cost=0 — required by infer-5 AC-2.
 *
 * REDHAT-FIX-H5: estimatedCostUsd <= 0 → BUDGET_INVALID_ESTIMATE (never soft-coerce to free).
 */
export async function checkBudget(
  request: BudgetCheckRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<BudgetCheckResult> {
  const rawEstimate = request.estimatedCostUsd;
  const estimateValid = Number.isFinite(rawEstimate) && rawEstimate > 0;
  // Preserve caller-supplied number for audit when finite; otherwise 0 for response shape.
  const estimatedCostUsd = Number.isFinite(rawEstimate) ? rawEstimate : 0;

  let result: BudgetCheckResult;
  let ledgerReachable = false;

  try {
    result = await withLedgerSql(async (sql) => {
      // postgres.js transaction — holds FOR UPDATE until commit/rollback
      return await sql.begin(async (tx) => {
        // Serialize concurrent budget decisions on the singleton ceiling row.
        const ceilRows = await tx<{ ceiling: number }[]>`
          SELECT ceiling FROM budget_ceiling WHERE id = 1 FOR UPDATE
        `;
        const dbCeilingRaw = Number(ceilRows[0]?.ceiling ?? 0);
        const resolved = resolveEffectiveCeiling(dbCeilingRaw, env);
        const ceilingUsd = resolved.effectiveCeiling;
        const ceilingSource = resolved.ceilingSource;

        // Include active reserves so concurrent estimates cannot both pass.
        const spentRows = await tx<{ spent: string | number }[]>`
          SELECT COALESCE(SUM(cost), 0)::float8 AS spent
          FROM budget_ledger
          WHERE COALESCE(check_type, 'escape') IS DISTINCT FROM 'pre-check'
        `;
        const spentUsdRaw = Number(spentRows[0]?.spent ?? 0);
        const spentUsd = Number.isFinite(spentUsdRaw) && spentUsdRaw >= 0 ? spentUsdRaw : 0;
        const remainingUsd = Math.max(0, ceilingUsd - spentUsd);

        ledgerReachable = true;

        // Hard reject non-positive estimates BEFORE any ok:true (H5 AC-1).
        if (!estimateValid) {
          return {
            ok: false as const,
            code: 'BUDGET_INVALID_ESTIMATE' as const,
            ceilingUsd,
            spentUsd,
            remainingUsd,
            estimatedCostUsd,
            reason:
              'BUDGET_INVALID_ESTIMATE: estimatedCostUsd must be > 0 for real escapes (non-positive estimate refused)',
            ceilingSource,
          };
        }

        if (ceilingUsd <= 0) {
          return {
            ok: false as const,
            code: 'BUDGET_NOT_CONFIGURED' as const,
            ceilingUsd,
            spentUsd,
            remainingUsd: 0,
            estimatedCostUsd,
            reason:
              'escape budget not configured — set HOLO_ESCAPE_BUDGET_USD > 0 or holo budget:set --ceiling',
            ceilingSource,
          };
        }

        if (spentUsd + estimatedCostUsd > ceilingUsd) {
          return {
            ok: false as const,
            code: 'BUDGET_EXCEEDED' as const,
            ceilingUsd,
            spentUsd,
            remainingUsd,
            estimatedCostUsd,
            reason: `escape would exceed budget by $${(spentUsd + estimatedCostUsd - ceilingUsd).toFixed(4)}`,
            ceilingSource,
          };
        }

        let reservationId: string | undefined;
        if (request.reserve === true) {
          const reserveRows = await tx<{ id: string }[]>`
            INSERT INTO budget_ledger (
              reason, tokens, cost, "timestamp", run_id, step_id, role, model_id, check_type, allow_escape
            )
            VALUES (
              ${`RESERVE: ${request.reason?.trim() || 'escape-reserve'}`},
              ${0},
              ${estimatedCostUsd},
              ${new Date()},
              ${request.runId ?? null},
              ${request.stepId ?? null},
              ${request.role ?? 'divergent'},
              ${null},
              ${'reserve'},
              ${true}
            )
            RETURNING id::text
          `;
          reservationId = reserveRows[0]?.id;
          if (!reservationId) {
            throw new Error('budget reserve INSERT returned no id');
          }
        }

        return {
          ok: true as const,
          ceilingUsd,
          spentUsd,
          remainingUsd,
          estimatedCostUsd,
          reservationId,
          ceilingSource,
        };
      });
    }, env);
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

  // Audit every Postgres-backed pre-check (pass and fail). Fail closed if audit INSERT fails.
  // Temporarily clear fail-injection so AC-4 hook does not poison pre-check audit writes.
  const savedForce = _testForceLogEscapeFailure;
  _testForceLogEscapeFailure = null;
  try {
    if (ledgerReachable) {
      try {
        await recordPreCheckAudit(request, result, env);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Release reserve if we inserted one but cannot audit (fail closed).
        if (result.ok && result.reservationId) {
          await releaseReservation(result.reservationId, env).catch(() => undefined);
        }
        return {
          ok: false,
          code: 'BUDGET_LEDGER_UNAVAILABLE',
          ceilingUsd: result.ceilingUsd,
          spentUsd: result.spentUsd,
          remainingUsd: 0,
          estimatedCostUsd,
          reason: `budget pre-check audit insert failed: ${msg}`,
        };
      }
    }
  } finally {
    _testForceLogEscapeFailure = savedForce;
  }

  return result;
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
 * Full escape path: assertEscapeNotDegraded → checkBudget(reserve) → real Anthropic generateText → logEscape.
 * NEVER contacts Anthropic when process/shared degraded (REDHAT-FIX-H1) or checkBudget fails.
 * Fail-closed if logEscape fails after a successful model call (REDHAT-FIX-H5 AC-4).
 */
export async function runBudgetedEscape(
  request: RunBudgetedEscapeRequest
): Promise<RunBudgetedEscapeResult> {
  const env = request.env ?? process.env;
  const modelId = request.modelId ?? env.HOLO_ESCAPE_MODEL ?? DEFAULT_ESCAPE_MODEL_ID;
  const estimatedCostUsd = request.estimatedCostUsd ?? 0.05;
  const role = request.role ?? 'divergent';

  // Shared never-cloud choke (same helper as resolveModel allowEscape) — BEFORE
  // budget audit traffic, Anthropic SDK construction, or generateText.
  // H4: async — also SELECTs durable Postgres degraded_mode (fail closed on DB error).
  await assertEscapeNotDegraded(role);

  // Transactional reserve so concurrent escapes cannot double-spend remaining.
  const budgetOk = await assertBudget(
    {
      estimatedCostUsd,
      reason: request.reason,
      role,
      runId: request.runId,
      stepId: request.stepId,
      allowEscape: true,
      reserve: true,
    },
    env
  );
  const reservationId = budgetOk.reservationId;

  const apiKey = request.apiKey ?? env.ANTHROPIC_API_KEY ?? getSecretValue('ANTHROPIC_API_KEY');
  if (!apiKey || apiKey.trim() === '') {
    if (reservationId) await releaseReservation(reservationId, env).catch(() => undefined);
    throw new Error('ANTHROPIC_API_KEY required for runBudgetedEscape');
  }

  let modelSucceeded = false;
  try {
    const anthropic = createAnthropic({ apiKey });
    const result = await generateText({
      model: anthropic(modelId),
      prompt: request.prompt,
      maxOutputTokens: 32,
    });
    modelSucceeded = true;

    const inputTokens = Number(result.usage?.inputTokens ?? 0);
    const outputTokens = Number(result.usage?.outputTokens ?? 0);
    const totalTokens = Number(result.usage?.totalTokens ?? inputTokens + outputTokens);
    const tokens = totalTokens > 0 ? totalTokens : inputTokens + outputTokens;
    const cost = estimateEscapeCostUsd({
      inputTokens,
      outputTokens,
      totalTokens: tokens,
    });

    let logged: LogEscapeResult;
    try {
      logged = await logEscape(
        {
          reason: request.reason,
          tokens,
          cost,
          runId: request.runId,
          stepId: request.stepId,
          role,
          modelId,
          checkType: 'escape',
          allowEscape: true,
        },
        env
      );
    } catch (err) {
      // Fail closed: do NOT return success that undercounts spend.
      // Keep reservation (conservative remaining reduction) when model already spent.
      const msg = err instanceof Error ? err.message : String(err);
      throw new BudgetLedgerWriteError(
        `budget ledger write failed after successful escape (spend may be unmetered): ${msg}`,
        err
      );
    }

    if (!logged?.id) {
      throw new BudgetLedgerWriteError(
        'budget ledger write failed after successful escape: logEscape returned no id'
      );
    }

    // Metered successfully — release the estimate reserve.
    if (reservationId) {
      await releaseReservation(reservationId, env).catch(() => undefined);
    }

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
  } catch (err) {
    // Pre-model failure: release reserve so remaining is not permanently held.
    if (!modelSucceeded && reservationId) {
      await releaseReservation(reservationId, env).catch(() => undefined);
    }
    throw err;
  }
}

/** Legacy process-local helpers — no longer track spend (Postgres is source of truth). */
export function getProcessSpentUsd(): number {
  return 0;
}

export function resetProcessSpentUsd(): void {
  // no-op: use resetBudgetLedgerForTests for integration suites
}
