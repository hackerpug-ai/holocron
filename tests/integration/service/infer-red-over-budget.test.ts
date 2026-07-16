/**
 * infer-4 / AC-2 / TC-2 (T-INFER-011): Over-budget escape blocked before Anthropic fires.
 *
 * GIVEN spent near ceiling WHEN allowEscape=true with estimatedCost that exceeds remaining
 * THEN BudgetExceededError (or budget block) AND network capture anthropicCount === 0.
 *
 * NEGATIVE CONTROL (would fail if):
 * - checkBudget stubbed to always return ok so over-budget proceeds
 * - Budget pre-check skipped so allowEscape=true contacts Anthropic anyway
 * - Network capture mocked so always shows zero cloud requests
 * - Test passes without real Postgres budget_ledger
 *
 * RED (no checkBudget / no ledger): vitest non-zero — checkBudget undefined or no block.
 * GREEN (infer-2+): exit 0, over-budget blocked, api.anthropic.com row count = 0.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-over-budget.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/infer-4');

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
    await sql`SELECT pg_advisory_lock(hashtext('infer-4-budget-ledger'))`;
    return await fn();
  } finally {
    try {
      await sql`SELECT pg_advisory_unlock(hashtext('infer-4-budget-ledger'))`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

describe('infer-4 AC-2: over-budget escape blocked before Anthropic (real capture)', () => {
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

  itLive('checkBudget is defined (not no-budget-ledger RED state)', async () => {
    const ledger = await loadBudgetLedger();
    expect(typeof ledger.checkBudget).toBe('function');
    expect(typeof ledger.resetBudgetLedgerForTests).toBe('function');
  });

  itLive('over-budget resolveModel(allowEscape=true) blocked; anthropicCount=0', async () => {
    await withBudgetLock(async () => {
      // Ceiling $10, spent $9 → estimated $2 exceeds remaining $1
      process.env.HOLO_ESCAPE_BUDGET_USD = '10';
      const ledger = await loadBudgetLedger();
      await ledger.resetBudgetLedgerForTests();
      await ledger.setBudgetCeiling(10);
      await ledger.logEscape({
        reason: 'infer-4-seed-spent-9',
        tokens: 1000,
        cost: 9,
        runId: 'infer-4-over-budget',
        stepId: 'seed',
        checkType: 'seed',
      });

      const capture = installNetworkCapture();
      try {
        const over = await ledger.checkBudget({
          estimatedCostUsd: 2,
          reason: 'infer-4-ac2-over',
          runId: 'infer-4',
          stepId: 'over',
        });
        expect(over.ok).toBe(false);
        expect(over.spentUsd).toBe(9);
        expect(over.ceilingUsd).toBe(10);

        const within = await ledger.checkBudget({
          estimatedCostUsd: 1,
          reason: 'infer-4-ac2-within',
          runId: 'infer-4',
          stepId: 'within',
        });
        expect(within.ok).toBe(true);

        const { resolveModel, BudgetExceededError } = await loadResolveModel();
        let blocked = false;
        let blockCode = '';
        try {
          await resolveModel('divergent', {
            allowEscape: true,
            estimatedCostUsd: 2,
            reason: 'infer-4-resolve-over-budget',
            runId: 'infer-4',
            stepId: 'escape-over',
          });
        } catch (err) {
          blocked = true;
          expect(err).toBeInstanceOf(BudgetExceededError);
          blockCode =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code: unknown }).code)
              : err instanceof Error
                ? err.message
                : String(err);
        }

        expect(blocked).toBe(true);
        expect(blockCode).toMatch(/BUDGET|budget|exceeded/i);

        // CRITICAL: zero network to api.anthropic.com — blocked before API call
        expect(capture.anthropicCount()).toBe(0);
        expect(capture.countForHost('api.anthropic.com')).toBe(0);
        for (const row of capture.snapshot()) {
          expect(row.host).not.toMatch(/api\.anthropic\.com/i);
          expect(row.url).not.toMatch(/api\.anthropic\.com/i);
        }

        writeArtifact('AC-2-over-budget-blocked.json', {
          over,
          within,
          blocked,
          blockCode,
          anthropicCount: capture.anthropicCount(),
          rows: capture.snapshot(),
        });
      } finally {
        capture.restore();
      }
    });
  });

  itLive('CLI infer:call --escape --cost over budget: non-zero + zero Anthropic', async () => {
    await withBudgetLock(async () => {
      process.env.HOLO_ESCAPE_BUDGET_USD = '10';
      const ledger = await loadBudgetLedger();
      await ledger.resetBudgetLedgerForTests();
      await ledger.setBudgetCeiling(10);
      await ledger.logEscape({
        reason: 'infer-4-cli-seed',
        tokens: 100,
        cost: 9.5,
        runId: 'infer-4-cli',
        stepId: 'seed',
        checkType: 'seed',
      });

      const capture = installNetworkCapture();
      try {
        // CLI is a subprocess — capture here only sees in-process traffic from setup.
        // Subprocess must still exit non-zero with budget block messaging.
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

        // Parent process must not have contacted Anthropic while preparing the block
        expect(capture.anthropicCount()).toBe(0);

        writeArtifact('AC-2-cli-over-budget.json', {
          status: cli.status,
          out: cliOut.slice(0, 3000),
          anthropicCount: capture.anthropicCount(),
        });
      } finally {
        capture.restore();
      }
    });
  });
});
