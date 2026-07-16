/**
 * Shared never-cloud choke for Claude escape paths (REDHAT-FIX-H1 + H4).
 *
 * Both resolveModel(allowEscape) and runBudgetedEscape MUST call
 * assertEscapeNotDegraded() before any Anthropic SDK construction, probe,
 * or generateText — single choke, no dual-path drift.
 *
 * H1: process-memory flag (+ optional HOLO_PROCESS_DEGRADED_STATE for CLI subprocess).
 * H4: also SELECT durable Postgres degraded_mode (global row). Fresh CLI / multi-process
 * invocations honor fleet-down without constructing DegradedModeController.
 *
 * Fail closed: DB read errors refuse escape (prefer never-cloud over allow-on-DB-error).
 */

import { createSql, type Sql } from '../db/client.ts';
import { resolveDatabaseUrl } from '../db/connection.ts';
import { isProcessInDegradedMode } from './degraded-process-flag.ts';

export const ESCAPE_DEGRADED_REFUSED_CODE = 'ESCAPE_DEGRADED_REFUSED' as const;

/** Message literal matched by never-cloud ACs / CLI refuse checks. */
export const ESCAPE_NEVER_CLOUD_MESSAGE =
  'degraded mode active — Claude escape refused (never-cloud; local fleet only)';

export const ANTHROPIC_ESCAPE_ENDPOINT = 'https://api.anthropic.com';

/** Singleton row id written by DegradedModeController (durable source of truth). */
export const DEGRADED_MODE_GLOBAL_ID = 'global' as const;

export type EscapeDegradedGuardOptions = {
  /** Override DATABASE_URL for the durable read (tests). */
  databaseUrl?: string;
  /** Injected postgres.js client — when set, caller owns lifecycle (no end()). */
  sql?: Sql;
  /**
   * When true, skip durable Postgres read (process/env only).
   * Production escape paths MUST leave this false/undefined.
   */
  skipDurableRead?: boolean;
};

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

/** Process flag or CLI env force — sync, no I/O. */
export function isProcessEscapeBlocked(): boolean {
  if (isProcessInDegradedMode()) return true;
  const forced = process.env.HOLO_PROCESS_DEGRADED_STATE?.trim();
  if (!forced || forced === 'normal') return false;
  return true;
}

/**
 * SELECT degraded_mode.degraded_state for the global row.
 * Fail closed on connection/query errors (escape must refuse, not allow).
 * @returns true when durable state is non-normal OR unreadable
 */
export async function isDurableDegradedMode(
  options: EscapeDegradedGuardOptions = {}
): Promise<boolean> {
  let sql = options.sql;
  let ownsSql = false;
  try {
    if (!sql) {
      const url =
        options.databaseUrl ??
        process.env.DATABASE_URL ??
        resolveDatabaseUrl({ preferHolocron: true });
      sql = createSql(url);
      ownsSql = true;
    }
    const rows = await sql<{ degraded_state: string }[]>`
      SELECT degraded_state
      FROM degraded_mode
      WHERE id = ${DEGRADED_MODE_GLOBAL_ID}
    `;
    const state = rows[0]?.degraded_state;
    // Missing row: cannot prove normal → fail closed for escape
    if (state == null || state === '') return true;
    return state !== 'normal';
  } catch {
    // Prefer refuse escape over allow-on-DB-error
    return true;
  } finally {
    if (ownsSql && sql) {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
  }
}

/**
 * True when escape must be refused (never-cloud).
 * Process flag OR CLI env force OR durable Postgres degraded_mode non-normal.
 * Fail closed if durable state cannot be read.
 */
export async function isEscapeBlockedByDegraded(
  options: EscapeDegradedGuardOptions = {}
): Promise<boolean> {
  if (isProcessEscapeBlocked()) return true;
  if (options.skipDurableRead) return false;
  return isDurableDegradedMode(options);
}

/**
 * Fail closed before any Anthropic host contact when degraded (process or durable).
 * @throws EscapeDegradedRefusedError
 */
export async function assertEscapeNotDegraded(
  role = 'divergent',
  options: EscapeDegradedGuardOptions = {}
): Promise<void> {
  if (await isEscapeBlockedByDegraded(options)) {
    throw new EscapeDegradedRefusedError(role);
  }
}
