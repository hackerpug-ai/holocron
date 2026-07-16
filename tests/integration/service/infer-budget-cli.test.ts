/**
 * AC-4 / TC-5..6 (infer-2): holo budget:status / budget:set operator commands.
 *
 * NEGATIVE CONTROL (would fail if):
 * - CLI commands not registered in holo.ts so stub/empty
 * - Argument parsing stubbed so no real ceiling value
 * - Database query mocked so fake status
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-cli.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';

const itLive = PLATFORM_IT ? it : it.skip;
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/infer-2');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function runHolo(
  args: string[],
  envExtra: Record<string, string> = {}
): { status: number | null; stdout: string; stderr: string; out: string } {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: DEFAULT_DATABASE_URL, ...envExtra },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status, stdout, stderr, out: `${stdout}\n${stderr}` };
}

async function loadBudgetLedger() {
  const path = ['../../../services/platform/src/inference', 'budget-ledger'].join('/');
  return import(path) as Promise<{
    setBudgetCeiling: (ceilingUsd: number) => Promise<{ ceiling: number }>;
    resetBudgetLedgerForTests: () => Promise<void>;
    logEscape: (req: {
      reason: string;
      tokens: number;
      cost: number;
      runId?: string;
      checkType?: string;
    }) => Promise<{ id: string }>;
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

async function seedFifteenSpent(): Promise<void> {
  const ledger = await loadBudgetLedger();
  await ledger.resetBudgetLedgerForTests();
  await ledger.setBudgetCeiling(10);
  for (const cost of [5, 5, 5]) {
    await ledger.logEscape({
      reason: 'seed-cli-15',
      tokens: 500,
      cost,
      runId: 'seed-cli',
      checkType: 'seed',
    });
  }
}

describe('AC-4: holo budget:* CLI', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    const mig = runHolo(['db:migrate', '--json']);
    if (mig.status !== 0) {
      throw new Error(`db:migrate failed:\n${mig.stdout}\n${mig.stderr}`);
    }
  });

  itLive('budget:status shows total spent containing 15', async () => {
    await withBudgetLock(async () => {
      await seedFifteenSpent();
      const result = runHolo(['budget:status']);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toMatch(/15/);
      expect(result.out.toLowerCase()).toMatch(/spent|ceiling|remaining/);
      writeArtifact('AC-4-budget-status.txt', result.out);
    });
  });

  itLive('budget:set --ceiling 50 updates Postgres ceiling', async () => {
    await withBudgetLock(async () => {
      await seedFifteenSpent();
      const result = runHolo(['budget:set', '--ceiling', '50']);
      expect(result.status, result.out).toBe(0);

      const sql = await loadSql();
      try {
        const rows = (await sql`
          SELECT ceiling FROM budget_ceiling WHERE id = 1
        `) as Array<{ ceiling: number }>;
        expect(rows.length).toBe(1);
        expect(Number(rows[0]?.ceiling)).toBe(50);

        const status = runHolo(['budget:status', '--json']);
        expect(status.status, status.out).toBe(0);
        const payload = JSON.parse(status.stdout) as {
          spent?: number;
          ceiling?: number;
          remaining?: number;
        };
        expect(Number(payload.ceiling)).toBe(50);
        expect(Number(payload.spent)).toBe(15);

        writeArtifact('AC-4-budget-set.json', {
          setOut: result.out,
          statusPayload: payload,
          dbCeiling: Number(rows[0]?.ceiling),
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('budget:* commands are registered in help', () => {
    const help = runHolo(['--help']);
    expect(help.out).toMatch(/budget:status/);
    expect(help.out).toMatch(/budget:set/);
  });
});
