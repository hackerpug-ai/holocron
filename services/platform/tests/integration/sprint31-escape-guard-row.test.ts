/**
 * S31-01 AC-4 — missing degraded_mode row fails loudly (DEGRADED_MODE_ROW_MISSING).
 *
 * Positive path records real guard/controller fields (no fabricated decision object).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint31-escape-guard-row.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql } from '../../src/db/client.ts';
import { applyMigrations } from '../../src/db/migrate.ts';
import { checkBudget, resetBudgetLedgerForTests } from '../../src/inference/budget-ledger.ts';
import { DegradedModeController } from '../../src/inference/degraded-mode-controller.ts';
import { resetProcessDegradedFlag } from '../../src/inference/degraded-process-flag.ts';
import {
  assertEscapeNotDegraded,
  DEGRADED_MODE_GLOBAL_ID,
  DEGRADED_MODE_ROW_MISSING,
  DegradedModeRowMissingError,
  isDurableDegradedMode,
  isEscapeBlockedByDegraded,
} from '../../src/inference/escape-degraded-guard.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-01');

const OWNER_URL =
  process.env.DATABASE_URL_OWNER ??
  process.env.DATABASE_URL ??
  'postgres://inference1@127.0.0.1:5432/holocron';

const DB_NAME = 'holocron_s31_01_escape';

function adminUrlFrom(url: string): string {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

function dbUrl(name: string): string {
  const u = new URL(OWNER_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    'utf8'
  );
}

async function dropAndCreateDb(name: string): Promise<void> {
  const admin = createSql(adminUrlFrom(OWNER_URL));
  try {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

describe('S31-01 escape guard row (real Postgres)', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  afterAll(async () => {
    if (!PLATFORM_IT) return;
    resetProcessDegradedFlag();
    delete process.env.HOLO_PROCESS_DEGRADED_STATE;
    const admin = createSql(adminUrlFrom(OWNER_URL));
    try {
      await admin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()`
      );
      await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    } finally {
      await admin.end({ timeout: 5 }).catch(() => undefined);
    }
  });

  itLive(
    'escapeGuardFailsLoudlyWithoutRow (AC-4)',
    async () => {
      await dropAndCreateDb(DB_NAME);
      const url = dbUrl(DB_NAME);
      const mig = await applyMigrations({ databaseUrl: url });
      expect(mig.ok, mig.errors.join('; ')).toBe(true);

      process.env.DATABASE_URL = url;
      resetProcessDegradedFlag();
      delete process.env.HOLO_PROCESS_DEGRADED_STATE;
      await resetBudgetLedgerForTests({ DATABASE_URL: url });

      const sql = createSql(url);
      try {
        // --- Negative: delete seeded row ---
        await sql`DELETE FROM degraded_mode`;
        const zero = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM degraded_mode`;
        expect(Number(zero[0]?.n ?? -1)).toBe(0);

        const beforeLedger = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM budget_ledger
          WHERE COALESCE(check_type, 'escape') = 'escape'
        `;

        let thrown: unknown;
        try {
          await assertEscapeNotDegraded('divergent', { databaseUrl: url });
        } catch (err) {
          thrown = err;
        }
        writeEvidence('ac4-missing-row-error.json', {
          name: thrown instanceof Error ? thrown.name : typeof thrown,
          code:
            thrown && typeof thrown === 'object' && 'code' in thrown
              ? (thrown as { code: string }).code
              : null,
          message: thrown instanceof Error ? thrown.message : String(thrown),
        });

        expect(thrown).toBeInstanceOf(DegradedModeRowMissingError);
        expect((thrown as DegradedModeRowMissingError).code).toBe(DEGRADED_MODE_ROW_MISSING);
        expect((thrown as Error).message).toMatch(/degraded_mode/);

        const afterLedger = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM budget_ledger
          WHERE COALESCE(check_type, 'escape') = 'escape'
        `;
        expect(Number(afterLedger[0]?.n ?? 0)).toBe(Number(beforeLedger[0]?.n ?? 0));
        writeEvidence('ac4-ledger-after-missing.json', {
          before: beforeLedger[0]?.n,
          after: afterLedger[0]?.n,
        });

        // --- Positive: re-seed row; capture REAL controller + guard outcomes ---
        await sql`
          INSERT INTO degraded_mode (id, degraded_state, resume_state)
          VALUES (${DEGRADED_MODE_GLOBAL_ID}, 'normal', 'normal')
        `;
        const one = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM degraded_mode`;
        expect(Number(one[0]?.n ?? 0)).toBe(1);

        const controller = new DegradedModeController({ databaseUrl: url });
        let controllerState: ReturnType<DegradedModeController['getState']>;
        try {
          await controller.init();
          await controller.forceNormal();
          controllerState = controller.getState();
        } finally {
          await controller.close({ resetToNormal: true });
        }

        // Real durable read — false means state is 'normal' (not degraded).
        const durableDegraded = await isDurableDegradedMode({ databaseUrl: url });
        const escapeBlocked = await isEscapeBlockedByDegraded({ databaseUrl: url });
        // assertEscapeNotDegraded resolves only when escape is allowed.
        await assertEscapeNotDegraded('divergent', { databaseUrl: url });

        // Persist only real fields from guard/controller (no fabricated decision object).
        const decision = {
          degraded_mode_row_id: DEGRADED_MODE_GLOBAL_ID,
          controller: {
            'degraded-state': controllerState['degraded-state'],
            'resume-state': controllerState['resume-state'],
            message: controllerState.message,
            degradationAction: controllerState.degradationAction,
            missionMode: controllerState.missionMode,
          },
          guard: {
            isDurableDegradedMode: durableDegraded,
            isEscapeBlockedByDegraded: escapeBlocked,
            assertEscapeNotDegraded: 'resolved',
          },
        };
        writeEvidence('ac4-decision.json', decision);

        expect(controllerState['degraded-state']).toBe('normal');
        expect(durableDegraded).toBe(false);
        expect(escapeBlocked).toBe(false);

        // Real budget path writes exactly one audit/pre-check ledger row with reason.
        const runId = `s31-01-escape-${Date.now()}`;
        const budget = await checkBudget(
          {
            estimatedCostUsd: 0.01,
            reason: 's31-01-escape-guard-positive',
            role: 'divergent',
            runId,
            allowEscape: true,
          },
          { DATABASE_URL: url, HOLO_ESCAPE_BUDGET_USD: '10' }
        );
        writeEvidence('ac4-budget-check.json', budget);
        expect(budget.ok).toBe(true);

        const ledger = await sql<{ n: string; reason: string | null }[]>`
          SELECT count(*)::text AS n, max(reason) AS reason
          FROM budget_ledger
          WHERE run_id = ${runId}
        `;
        writeEvidence('ac4-ledger-positive.json', ledger[0]);
        expect(Number(ledger[0]?.n ?? 0)).toBe(1);
        expect(ledger[0]?.reason).toBeTruthy();
      } finally {
        await sql.end({ timeout: 5 });
        resetProcessDegradedFlag();
      }
    },
    240_000
  );
});
