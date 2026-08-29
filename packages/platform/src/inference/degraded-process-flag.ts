/**
 * Process-level degraded flag shared by DegradedModeController and resolveModel.
 * Kept in a tiny module to avoid circular imports between controller ↔ resolve-model.
 *
 * NOTE (REDHAT-FIX-H4): process memory alone is NOT sufficient for multi-process /
 * fresh CLI escape gating. Escape paths MUST also consult durable Postgres
 * degraded_mode via escape-degraded-guard (assertEscapeNotDegraded) — never rely
 * solely on this module for never-cloud.
 */

export type ProcessDegradedState =
  | 'normal'
  | 'surface-unavailable'
  | 'queue-and-retry'
  | 'fail-closed'
  | 'sense-only';

let processDegraded = false;
let processDegradedState: ProcessDegradedState = 'normal';

export function isProcessInDegradedMode(): boolean {
  return processDegraded;
}

export function getProcessDegradedState(): ProcessDegradedState {
  return processDegradedState;
}

export function setProcessDegradedState(state: ProcessDegradedState): void {
  processDegradedState = state;
  processDegraded = state !== 'normal';
}

/** Test/operator helper — clear process flag between suites. */
export function resetProcessDegradedFlag(): void {
  processDegraded = false;
  processDegradedState = 'normal';
}
