/**
 * AC-1 / TC-1 (infer-2): Budget ledger table stores escape records with reason/tokens/cost.
 *
 * NEGATIVE CONTROL (would fail if):
 * - budget_ledger table not created so migration missing/failed
 * - logEscape() stubbed so no real INSERT
 * - Fields missing or wrong type so schema drift
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-ledger-persistence.test.ts
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
    logEscape: (req: {
      reason: string;
      tokens: number;
      cost: number;
      runId?: string;
      stepId?: string;
      role?: string;
      modelId?: string;
      checkType?: string;
    }) => Promise<{ id: string; cost: number; tokens: number; reason: string }>;
    ensureBudgetSchemaReady?: () => Promise<void>;
  }>;
}

async function loadSql() {
  const path = ['../../../services/platform/src/db', 'client'].join('/');
  const mod = (await import(path)) as {
    createSql: (url?: string) => {
      (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
      end: (opts?: { timeout?: number }) => Promise<void>;
      unsafe: (query: string) => Promise<unknown[]>;
    };
  };
  return mod.createSql(DEFAULT_DATABASE_URL);
}

/** Serialize all infer-2 budget suites against shared Postgres ledger. */
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

describe('AC-1: budget_ledger persists escape records (real Postgres)', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    const mig = runHolo(['db:migrate', '--json']);
    if (mig.status !== 0) {
      throw new Error(`db:migrate failed:\n${mig.stdout}\n${mig.stderr}`);
    }
  });

  itLive('budget_ledger table exists with reason text column', async () => {
    await withBudgetLock(async () => {
      const sql = await loadSql();
      try {
        const cols = (await sql`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'budget_ledger'
          ORDER BY ordinal_position
        `) as Array<{ column_name: string; data_type: string }>;

        const names = cols.map((c) => c.column_name);
        expect(names, 'budget_ledger must exist').toContain('reason');
        expect(names).toContain('tokens');
        expect(names).toContain('cost');
        expect(names).toContain('timestamp');
        expect(names).toEqual(expect.arrayContaining(['run_id', 'step_id']));
        // Migration 0009: allow_escape for pre-check / escape audit (infer-5 AC-2)
        expect(names).toContain('allow_escape');
        expect(names).toContain('check_type');

        const reason = cols.find((c) => c.column_name === 'reason');
        expect(reason?.data_type).toBe('text');
        const allowEscape = cols.find((c) => c.column_name === 'allow_escape');
        expect(allowEscape?.data_type).toBe('boolean');

        writeArtifact('AC-1-schema.json', { columns: cols });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('logEscape INSERT writes 1 row with cost > 0', async () => {
    await withBudgetLock(async () => {
      const sql = await loadSql();
      const { logEscape } = await loadBudgetLedger();
      const runId = `ac1-run-${Date.now()}`;
      try {
        const before = (await sql`
          SELECT count(*)::int AS n FROM budget_ledger WHERE run_id = ${runId}
        `) as Array<{ n: number }>;
        expect(before[0]?.n ?? 0).toBe(0);

        const inserted = await logEscape({
          reason: 'ac1-persistence-probe',
          tokens: 128,
          cost: 0.0042,
          runId,
          stepId: 'ac1-step',
          role: 'divergent',
          modelId: 'deepseek-chat',
          checkType: 'escape',
        });

        expect(inserted.id).toBeTruthy();
        expect(inserted.cost).toBeGreaterThan(0);
        expect(inserted.tokens).toBe(128);

        const rows = (await sql`
          SELECT id::text, reason, tokens, cost, run_id, step_id, "timestamp"
          FROM budget_ledger
          WHERE run_id = ${runId}
        `) as Array<{
          id: string;
          reason: string;
          tokens: number;
          cost: number;
          run_id: string;
          step_id: string;
          timestamp: Date | string;
        }>;

        expect(rows.length).toBe(1);
        expect(rows[0]?.reason).toBe('ac1-persistence-probe');
        expect(Number(rows[0]?.cost)).toBeGreaterThan(0);
        expect(Number(rows[0]?.tokens)).toBe(128);
        expect(rows[0]?.step_id).toBe('ac1-step');
        expect(rows[0]?.timestamp).toBeTruthy();

        writeArtifact('AC-1-logEscape.json', { inserted, rows });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
