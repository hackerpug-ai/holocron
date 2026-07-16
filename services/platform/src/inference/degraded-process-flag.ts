/**
 * Process-level degraded flag shared by DegradedModeController and resolveModel.
 * Kept in a tiny module to avoid circular imports between controller ↔ resolve-model.
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
