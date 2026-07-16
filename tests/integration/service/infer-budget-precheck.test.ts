/**
 * AC-2 / TC-2..3 (infer-2): checkBudget() blocks over-budget escapes before Anthropic fires.
 *
 * NEGATIVE CONTROL (would fail if):
 * - checkBudget() stubbed to always return true so over-budget calls proceed
 * - Pre-check skipped so allowEscape=true bypasses budget
 * - Network capture mocked so shows no API call but real call occurred
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-precheck.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/infer-2');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: DEFAULT_DATABASE_URL },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function loadBudgetLedger() {
  const path = ['../../../services/platform/src/inference', 'budget-ledger'].join('/');
  return import(path) as Promise<{
    checkBudget: (req: {
      estimatedCostUsd: number;
      reason?: string;
      runId?: string;
      stepId?: string;
    }) => Promise<{ ok: boolean; code?: string; spentUsd: number; ceilingUsd: number }>;
    setBudgetCeiling: (ceilingUsd: number) => Promise<{ ceiling: number }>;
    logEscape: (req: {
      reason: string;
      tokens: number;
      cost: number;
      runId?: string;
      stepId?: string;
      checkType?: string;
    }) => Promise<{ id: string }>;
    resetBudgetLedgerForTests: () => Promise<void>;
  }>;
}

async function loadSql() {
  const path = ['../../../services/platform/src/db', 'client'].join('/');
  const mod = (await import(path)) as {
    createSql: (url?: string) => {
      (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
      end: (opts?: { timeout?: number }) => Promise<void>;
    };
  };
  return mod.createSql(DEFAULT_DATABASE_URL);
}

async function withBudgetLock<T>(fn: () => Promise<T>): Promise<T> {
  const sql = await loadSql();
  try {
    await sql`SELECT pg_advisory_lock(hashtext('infer-2-budget-ledger'))`;
    return await fn();
  } finally {
    try {
      await sql`SELECT pg_advisory_unlock(hashtext('infer-2-budget-ledger'))`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

describe('AC-2: checkBudget pre-check blocks over-budget before Anthropic', () => {
  const prevBudget = process.env.HOLO_ESCAPE_BUDGET_USD;

  beforeAll(() => {
    if (!PLATFORM_IT) return;
    const mig = runHolo(['db:migrate', '--json']);
    if (mig.status !== 0) {
      throw new Error(`db:migrate failed:\n${mig.stdout}\n${mig.stderr}`);
    }
  });

  afterEach(() => {
    if (prevBudget === undefined) delete process.env.HOLO_ESCAPE_BUDGET_USD;
    else process.env.HOLO_ESCAPE_BUDGET_USD = prevBudget;
  });

  itLive(
    'checkBudget($2) false; checkBudget($1) true; no Anthropic network on over-budget',
    async () => {
      await withBudgetLock(async () => {
        // Ceiling $10, spent $9 — matches AC scenario (isolated under lock)
        process.env.HOLO_ESCAPE_BUDGET_USD = '10';
        const ledger = await loadBudgetLedger();
        await ledger.resetBudgetLedgerForTests();
        await ledger.setBudgetCeiling(10);
        await ledger.logEscape({
          reason: 'seed-spent-9',
          tokens: 1000,
          cost: 9,
          runId: 'seed-precheck',
          stepId: 'seed',
          checkType: 'seed',
        });

        const capture = installNetworkCapture();
        try {
          const { checkBudget } = ledger;

          const over = await checkBudget({
            estimatedCostUsd: 2,
            reason: 'ac2-over-budget',
            runId: 'ac2',
            stepId: 'over',
          });
          expect(over.ok).toBe(false);
          expect(over.spentUsd).toBe(9);
          expect(over.ceilingUsd).toBe(10);

          const within = await checkBudget({
            estimatedCostUsd: 1,
            reason: 'ac2-within-budget',
            runId: 'ac2',
            stepId: 'within',
          });
          expect(within.ok).toBe(true);
          expect(within.spentUsd).toBe(9);

          // Over-budget resolveModel must not contact Anthropic
          const { resolveModel, BudgetExceededError } = await loadResolveModel();
          let blocked = false;
          try {
            await resolveModel('divergent', {
              allowEscape: true,
              estimatedCostUsd: 2,
              reason: 'ac2-resolve-over',
            });
          } catch (err) {
            blocked = true;
            expect(err).toBeInstanceOf(BudgetExceededError);
          }
          expect(blocked).toBe(true);
          expect(capture.anthropicCount()).toBe(0);

          // CLI: --escape --cost 999 blocked with zero Anthropic
          const cli = spawnSync(
            BUN_BIN,
            [HOLO_CLI, 'infer:call', '--escape', '--cost', '999', '--json'],
            {
              cwd: REPO_ROOT,
              encoding: 'utf8',
              env: {
                ...process.env,
                DATABASE_URL: DEFAULT_DATABASE_URL,
                HOLO_ESCAPE_BUDGET_USD: '10',
              },
            }
          );
          const cliOut = `${cli.stdout ?? ''}\n${cli.stderr ?? ''}`;
          expect(cli.status, cliOut).not.toBe(0);
          expect(cliOut).toMatch(/BUDGET_EXCEEDED|budget|escape blocked/i);

          writeArtifact('AC-2-precheck.json', {
            over,
            within,
            anthropicCount: capture.anthropicCount(),
            rows: capture.snapshot(),
            cli: { status: cli.status, out: cliOut.slice(0, 2000) },
          });
        } finally {
          capture.restore();
        }
      });
    }
  );
});
