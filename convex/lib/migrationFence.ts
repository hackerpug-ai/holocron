/**
 * D06-03 / CAP-CUT-01 — durable Convex write fence + cutover schedule sequencing.
 *
 * SINGLE write-enforcement mechanism: process.env.HOLO_MIGRATION_READ_ONLY === '1'
 * (also accepts 'true' for D06-01 RED suite compatibility).
 *
 * Complementary sequencing (NOT a second write fence): when
 * HOLO_CUTOVER_SCHEDULES_DISABLED is set, internal mutation/action builders
 * (cron, queue, outbox, scheduled job consumers) refuse to run scheduled work.
 * Public mutations/actions stay gated solely by HOLO_MIGRATION_READ_ONLY.
 *
 * Applied repo-wide via scripts/cutover/apply-convex-fence.ts (import swap only).
 * Mirrors ALLOW_CLEAR_ALL env-gate precedent in convex/documents/mutations.ts.
 *
 * Observability (migrationFenceAudit) lives in convex/migrationFence/* and is
 * intentionally unfenced so quiet-check can record rejected probes while frozen.
 */
import { customAction, customMutation } from 'convex-helpers/server/customFunctions';
import {
  action as rawAction,
  httpAction as rawHttpAction,
  internalAction as rawInternalAction,
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from '../_generated/server';

/** Pinned env var name — deployment-level via `npx convex env set`. */
export const MIGRATION_READ_ONLY_ENV = 'HOLO_MIGRATION_READ_ONLY';

/**
 * Non-destructive schedule-disable flag for cutover quiet-check (C-03).
 * Complementary sequencing to the write fence — not a second write-enforcement path.
 */
export const CUTOVER_SCHEDULES_DISABLED_ENV = 'HOLO_CUTOVER_SCHEDULES_DISABLED';

/**
 * True when the durable fence is armed.
 * Primary contract value is the literal '1'; 'true' accepted for D06-01 parity.
 */
export function isMigrationReadOnly(): boolean {
  const v = process.env[MIGRATION_READ_ONLY_ENV];
  return v === '1' || v === 'true';
}

/**
 * True when cutover has disabled crons/queues/outbox/scheduled consumers.
 * Read by internal (cron/queue/scheduled) builders so disable is real, not audit theatre.
 */
export function isCutoverSchedulesDisabled(): boolean {
  const v = process.env[CUTOVER_SCHEDULES_DISABLED_ENV];
  return v === '1' || v === 'true';
}

/**
 * FIRST-statement gate for every wrapped write surface.
 * Throws Error with lowercase `migration_read_only:` prefix (MCP/gateway contract).
 */
export function assertMigrationWritable(surface: string): void {
  if (isMigrationReadOnly()) {
    throw new Error(
      `migration_read_only: ${surface} blocked while ${MIGRATION_READ_ONLY_ENV} is set`
    );
  }
}

/**
 * Sequencing gate for cron/queue/outbox/scheduled-job consumers.
 * Throws `schedules_disabled:` — complementary to the write fence, not a replacement.
 */
export function assertSchedulesEnabled(surface: string): void {
  if (isCutoverSchedulesDisabled()) {
    throw new Error(
      `schedules_disabled: ${surface} skipped while ${CUTOVER_SCHEDULES_DISABLED_ENV} is set`
    );
  }
}

function fenceInput(surface: string) {
  return {
    args: {},
    input: () => {
      // STRICTLY the env-var check is the FIRST statement inside every wrapped handler
      assertMigrationWritable(surface);
      return { ctx: {}, args: {} };
    },
  };
}

/**
 * Internal builders: honor schedule disable THEN write fence.
 * Cron/queue/scheduled consumers import these builders; reading
 * HOLO_CUTOVER_SCHEDULES_DISABLED here is the real disable path (C-03).
 */
function internalScheduledFenceInput(surface: string) {
  return {
    args: {},
    input: () => {
      // Real schedule disable — consumers MUST honor this flag (not audit-only).
      assertSchedulesEnabled(surface);
      assertMigrationWritable(surface);
      return { ctx: {}, args: {} };
    },
  };
}

/** Public mutation builder — swap target for `mutation` imports. */
export const fencedMutation = customMutation(rawMutation, fenceInput('mutation'));

/** Internal mutation builder — covers cron/scheduled write paths; honors schedule disable. */
export const fencedInternalMutation = customMutation(
  rawInternalMutation,
  internalScheduledFenceInput('internalMutation')
);

/** Public action builder. */
export const fencedAction = customAction(rawAction, fenceInput('action'));

/** Internal action builder — covers cron actions; honors schedule disable. */
export const fencedInternalAction = customAction(
  rawInternalAction,
  internalScheduledFenceInput('internalAction')
);
type HttpHandler = (
  ctx: Parameters<Parameters<typeof rawHttpAction>[0]>[0],
  request: Request
) => Response | Promise<Response>;

/**
 * httpAction wrapper. GET/HEAD/OPTIONS stay open so /article/:shareToken
 * remains readable for post-freeze article baseline capture (AC-5).
 * Mutating methods (POST/PUT/PATCH/DELETE) are fenced via assertMigrationWritable
 * (throws Error with migration_read_only: prefix), then mapped to HTTP 423 so
 * cutover probes can observe the literal prefix in the response body.
 */
export function fencedHttpAction(handler: HttpHandler) {
  return rawHttpAction(async (ctx, request) => {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      try {
        assertMigrationWritable('httpAction');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(message, {
          status: 423,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    }
    return handler(ctx, request);
  });
}

/** Names the codemod rewrites onto fenced* builders. */
export const FENCED_IMPORT_NAMES = [
  'mutation',
  'internalMutation',
  'action',
  'internalAction',
  'httpAction',
] as const;

export type FencedImportName = (typeof FENCED_IMPORT_NAMES)[number];

export const FENCED_ALIAS: Record<FencedImportName, string> = {
  mutation: 'fencedMutation',
  internalMutation: 'fencedInternalMutation',
  action: 'fencedAction',
  internalAction: 'fencedInternalAction',
  httpAction: 'fencedHttpAction',
};
