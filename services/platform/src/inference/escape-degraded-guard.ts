/**
 * Shared never-cloud choke for Claude escape paths (REDHAT-FIX-H1).
 *
 * Both resolveModel(allowEscape) and runBudgetedEscape MUST call
 * assertEscapeNotDegraded() before any Anthropic SDK construction, probe,
 * or generateText — single choke, no dual-path drift.
 *
 * H1: process-memory flag (+ optional HOLO_PROCESS_DEGRADED_STATE for CLI subprocess).
 * H4 will extend isEscapeBlockedByDegraded() to also read durable Postgres
 * degraded_mode without adding a second choke site.
 */

import { isProcessInDegradedMode } from './degraded-process-flag.ts';

export const ESCAPE_DEGRADED_REFUSED_CODE = 'ESCAPE_DEGRADED_REFUSED' as const;

/** Message literal matched by never-cloud ACs / CLI refuse checks. */
export const ESCAPE_NEVER_CLOUD_MESSAGE =
  'degraded mode active — Claude escape refused (never-cloud; local fleet only)';

export const ANTHROPIC_ESCAPE_ENDPOINT = 'https://api.anthropic.com';

/**
 * Thrown when escape is refused under degraded never-cloud policy.
 * Call sites may rethrow as RoleUnavailableError for fleet resolve semantics;
 * runBudgetedEscape surfaces this error (or RoleUnavailableError) directly.
 */
export class EscapeDegradedRefusedError extends Error {
  readonly code = ESCAPE_DEGRADED_REFUSED_CODE;
  readonly degradationAction = 'fail-closed' as const;
  readonly endpoint = ANTHROPIC_ESCAPE_ENDPOINT;

  constructor(readonly role: string = 'divergent') {
    super(ESCAPE_NEVER_CLOUD_MESSAGE);
    this.name = 'EscapeDegradedRefusedError';
  }
}

/**
 * True when escape must be refused (never-cloud).
 * Process flag is authoritative for in-process surfaces (controller / server).
 * HOLO_PROCESS_DEGRADED_STATE forces the same semantic for CLI subprocess tests
 * and operator dry-runs (not a substitute for H4 durable DB read).
 */
export function isEscapeBlockedByDegraded(): boolean {
  if (isProcessInDegradedMode()) return true;
  const forced = process.env.HOLO_PROCESS_DEGRADED_STATE?.trim();
  if (!forced || forced === 'normal') return false;
  return true;
}

/**
 * Fail closed before any Anthropic host contact when degraded.
 * @throws EscapeDegradedRefusedError
 */
export function assertEscapeNotDegraded(role = 'divergent'): void {
  if (isEscapeBlockedByDegraded()) {
    throw new EscapeDegradedRefusedError(role);
  }
}
