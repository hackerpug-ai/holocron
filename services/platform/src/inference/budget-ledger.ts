/**
 * Budget ledger pre-check surface for Claude escape (infer-1 skeleton).
 *
 * Full Postgres-backed ledger + logEscape telemetry lands in infer-2.
 * This module provides the fail-closed checkBudget() gate that resolveModel
 * MUST call before any allowEscape=true path proceeds.
 *
 * Ceiling source (provisional until infer-2):
 *   HOLO_ESCAPE_BUDGET_USD — total USD allowed for escape calls.
 *   When unset or <= 0, all escapes are blocked (default-deny).
 *
 * Spent tracking (provisional): in-process only; infer-2 replaces with SQL.
 */

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
      code: 'BUDGET_NOT_CONFIGURED' | 'BUDGET_EXCEEDED';
      ceilingUsd: number;
      spentUsd: number;
      remainingUsd: number;
      estimatedCostUsd: number;
      reason: string;
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

/** Process-local spent counter (infer-2 → Postgres). */
let processSpentUsd = 0;

export function getEscapeBudgetCeilingUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HOLO_ESCAPE_BUDGET_USD;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function getProcessSpentUsd(): number {
  return processSpentUsd;
}

/** Test/operator helper — reset process-local spent (not for production paths). */
export function resetProcessSpentUsd(): void {
  processSpentUsd = 0;
}

/**
 * Record spend after a successful escape (skeleton).
 * infer-2 will persist via logEscape() to budget_ledger.
 */
export function recordEscapeSpend(costUsd: number): void {
  if (!Number.isFinite(costUsd) || costUsd < 0) return;
  processSpentUsd += costUsd;
}

/**
 * Deterministic pre-check before any Anthropic escape request.
 * Fail closed when budget is not configured or would be exceeded.
 */
export async function checkBudget(
  request: BudgetCheckRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<BudgetCheckResult> {
  const estimatedCostUsd =
    Number.isFinite(request.estimatedCostUsd) && request.estimatedCostUsd >= 0
      ? request.estimatedCostUsd
      : 0;
  const ceilingUsd = getEscapeBudgetCeilingUsd(env);
  const spentUsd = processSpentUsd;
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
        'escape budget not configured — set HOLO_ESCAPE_BUDGET_USD > 0 (infer-2 will use Postgres ledger)',
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
