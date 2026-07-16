/**
 * AC-3 / TC-4 (infer-2): logEscape records telemetry after successful Anthropic call.
 *
 * NEGATIVE CONTROL (would fail if):
 * - logEscape() not called after Anthropic success
 * - Anthropic response stubbed so fake tokens/cost
 * - Network capture mocked so shows request but fake response
 *
 * Run:
 *   PLATFORM_IT=1 ANTHROPIC_API_KEY=... \
 *     pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';

const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
const itLive = PLATFORM_IT ? it : it.skip;
const itAnthropic = PLATFORM_IT && hasAnthropicKey ? it : it.skip;
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
    setBudgetCeiling: (ceilingUsd: number) => Promise<{ ceiling: number }>;
    resetBudgetLedgerForTests: () => Promise<void>;
    runBudgetedEscape: (req: {
      prompt: string;
      reason: string;
      estimatedCostUsd?: number;
      runId?: string;
      stepId?: string;
      role?: string;
      modelId?: string;
    }) => Promise<{
      text: string;
      tokens: number;
      cost: number;
      ledgerId: string;
      anthropicHostContacted: boolean;
    }>;
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

describe('AC-3: logEscape after real Anthropic escape', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    const mig = runHolo(['db:migrate', '--json']);
    if (mig.status !== 0) {
      throw new Error(`db:migrate failed:\n${mig.stdout}\n${mig.stderr}`);
    }
  });

  itLive('documents ANTHROPIC_API_KEY presence for AC-3 gate', () => {
    writeArtifact('AC-3-key-presence.json', {
      hasAnthropicKey,
      note: hasAnthropicKey
        ? 'real Anthropic path will run'
        : 'ANTHROPIC_API_KEY unset — runBudgetedEscape integration skipped (dispatch: when key present)',
    });
    expect(true).toBe(true);
  });

  itAnthropic(
    'runBudgetedEscape logs reason/tokens/cost and contacts api.anthropic.com',
    async () => {
      await withBudgetLock(async () => {
        process.env.HOLO_ESCAPE_BUDGET_USD = process.env.HOLO_ESCAPE_BUDGET_USD || '10';
        const ledger = await loadBudgetLedger();
        await ledger.resetBudgetLedgerForTests();
        await ledger.setBudgetCeiling(10);

        const capture = installNetworkCapture();
        const runId = `ac3-escape-${Date.now()}`;
        try {
          const result = await ledger.runBudgetedEscape({
            prompt: 'Reply with exactly the single word: pong',
            reason: 'ac3-budgeted-escape',
            estimatedCostUsd: 0.05,
            runId,
            stepId: 'ac3-step',
            role: 'divergent',
          });

          expect(result.tokens).toBeGreaterThan(0);
          expect(result.cost).toBeGreaterThan(0);
          expect(result.ledgerId).toBeTruthy();
          expect(capture.anthropicCount()).toBeGreaterThanOrEqual(1);

          const sql = await loadSql();
          try {
            const rows = (await sql`
              SELECT reason, tokens, cost, run_id, step_id
              FROM budget_ledger
              WHERE run_id = ${runId}
            `) as Array<{
              reason: string;
              tokens: number;
              cost: number;
              run_id: string;
              step_id: string;
            }>;
            expect(rows.length).toBe(1);
            expect(Number(rows[0]?.cost)).toBeGreaterThan(0);
            expect(Number(rows[0]?.tokens)).toBeGreaterThan(0);
            expect(Number(rows[0]?.tokens)).toBe(result.tokens);
            expect(Number(rows[0]?.cost)).toBeCloseTo(result.cost, 6);
            expect(rows[0]?.reason).toBe('ac3-budgeted-escape');

            writeArtifact('AC-3-escape-telemetry.json', {
              result: {
                tokens: result.tokens,
                cost: result.cost,
                ledgerId: result.ledgerId,
                textPreview: result.text.slice(0, 80),
              },
              rows,
              anthropicCount: capture.anthropicCount(),
              networkRows: capture.snapshot(),
            });
          } finally {
            await sql.end({ timeout: 5 });
          }
        } finally {
          capture.restore();
        }
      });
    },
    120_000
  );
});
