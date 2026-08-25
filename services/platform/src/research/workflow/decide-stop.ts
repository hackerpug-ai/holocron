/**
 * Pure behavioral stop decision for research-depth rounds.
 *
 * Never reads coverage_score / coverageScore — that is computed at commit only.
 * UNIT_TEST_JUSTIFIED: pure ledger predicates with zero I/O.
 */
import type { ResearchLedger, StopReason } from './schemas.ts';

export type DecideStopInput = {
  ledger: ResearchLedger;
  /** 1-based round that just finished (matches Mastra dountil iterationCount). */
  roundJustFinished: number;
  /** Wall clock now (ms since epoch). */
  nowMs: number;
};

const DRY_ROUND_CAP = 2;

/**
 * Decide whether the research loop should stop after the round that just finished.
 * Returns null when another round should run.
 */
export function decideStop(input: DecideStopInput): StopReason | null {
  const { ledger, roundJustFinished, nowMs } = input;

  if (ledger.steeredStop) return 'steered_stop';
  if (ledger.stopReason === 'canceled') return 'canceled';

  if (ledger.degraded) return 'degraded_sense_only';

  const open = ledger.subQuestions.filter((q) => q.status === 'open');
  if (ledger.subQuestions.length > 0 && open.length === 0) {
    return 'all_closed';
  }

  if (ledger.findings.length === 0 && roundJustFinished >= 1 && open.length === 0) {
    return 'no_evidence';
  }

  if (ledger.dryRounds >= DRY_ROUND_CAP) return 'dry_rounds';

  if (roundJustFinished >= ledger.maxRounds) return 'round_cap';

  // wallElapsed is elapsed wall clock since the workflow started. spend.wallMs
  // already accumulates per-round wall time (a subset of nowMs - startedAtMs),
  // so adding it here double-counted the round durations and fired wall_budget
  // after ~half the intended budget (observed: depth truncated to 1 round).
  const wallElapsed = Math.max(0, nowMs - ledger.startedAtMs);
  if (wallElapsed >= ledger.wallBudgetMs) return 'wall_budget';

  if (ledger.spend.tokens >= ledger.tokenBudget) return 'token_budget';
  if (ledger.spend.toolCalls >= ledger.toolcallBudget) return 'toolcall_budget';

  return null;
}

/** Exported for invariance tests — decideStop must ignore these keys entirely. */
export const DECIDE_STOP_FORBIDDEN_FIELDS = [
  'coverageScore',
  'coverage_score',
  'admitted',
] as const;
