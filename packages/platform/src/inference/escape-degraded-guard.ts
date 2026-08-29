/**
 * Shared never-cloud choke for DeepSeek escape paths (REDHAT-FIX-H1 + H4).
 *
 * Both resolveModel(allowEscape) and runBudgetedEscape MUST call
 * assertEscapeNotDegraded() before any DeepSeek provider construction, probe,
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
import {
  DEGRADED_MODE_ROW_MISSING,
  DegradedModeRowMissingError,
} from './degraded-mode-controller.ts';
import { isProcessInDegradedMode } from './degraded-process-flag.ts';

export const ESCAPE_DEGRADED_REFUSED_CODE = 'ESCAPE_DEGRADED_REFUSED' as const;

/** Re-export loud missing-row code (S31-01 AC-4). */
export { DEGRADED_MODE_ROW_MISSING, DegradedModeRowMissingError };

/** Message literal matched by never-cloud ACs / CLI refuse checks. */
export const ESCAPE_NEVER_CLOUD_MESSAGE =
  'degraded mode active — escape refused (never-cloud; local fleet only)';

export const DEEPSEEK_ESCAPE_ENDPOINT = 'https://api.deepseek.com';

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
  readonly endpoint = DEEPSEEK_ESCAPE_ENDPOINT;

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
 * Missing row → loud DEGRADED_MODE_ROW_MISSING (never silent allow or refuse).
 * Connection/query errors (other than missing row) still refuse escape.
 * @returns true when durable state is non-normal
 * @throws DegradedModeRowMissingError when the global row is absent
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
    // Missing row is a loud named error — not silent refuse/allow (S31-01 AC-4).
    if (state == null || state === '') {
      throw new DegradedModeRowMissingError(
        'degraded_mode global row missing — cannot evaluate budgeted escape'
      );
    }
    return state !== 'normal';
  } catch (err) {
    if (err instanceof DegradedModeRowMissingError) throw err;
    // Prefer refuse escape over allow-on-DB-error (table missing / connection).
    // If the relation itself is missing, surface the same named code.
    const msg = err instanceof Error ? err.message : String(err);
    if (/degraded_mode/i.test(msg) && /does not exist|undefined_table/i.test(msg)) {
      throw new DegradedModeRowMissingError(
        'degraded_mode table/row missing — run holo db:migrate (0034)'
      );
    }
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
 * Fail closed before any DeepSeek host contact when degraded (process or durable).
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
