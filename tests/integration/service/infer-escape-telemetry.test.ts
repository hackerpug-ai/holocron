/**
 * AC-3 / TC-4 (infer-2): logEscape records telemetry after successful Anthropic call.
 *
 * NEGATIVE CONTROL (would fail if):
 * - logEscape() not called after Anthropic success
 * - Anthropic response stubbed so fake tokens/cost
 * - Network capture mocked so shows request but fake response
 *
 * Run:
 *   PLATFORM_IT=1 DEEPSEEK_API_KEY=... \
 *     pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyConsolidatedSecretsToEnv,
  getSecretValue,
} from '../../../services/platform/src/config/secrets';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';

function ensureDeepSeekKeyFromSecrets(): boolean {
  // Prefer env; fill from gitignored secrets.yaml via consolidated loader (never log value).
  applyConsolidatedSecretsToEnv();
  const fromEnv = process.env.DEEPSEEK_API_KEY?.trim();
  if (fromEnv) return true;
  const fromFile = getSecretValue('DEEPSEEK_API_KEY');
  if (fromFile?.trim()) {
    process.env.DEEPSEEK_API_KEY = fromFile.trim();
    return true;
  }
  return false;
}
const hasDeepSeekKey = ensureDeepSeekKeyFromSecrets();
/** Local-dev only: allow PLATFORM_IT suite to pass without a live Anthropic key. Harvest must NOT set this. */
const allowSkipAnthropic = process.env.ALLOW_SKIP_DEEPSEEK === '1';
const itLive = PLATFORM_IT ? it : it.skip;
const itAnthropic = PLATFORM_IT && hasDeepSeekKey ? it : it.skip;
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
      escapeHostContacted: boolean;
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

  itLive(
    'DEEPSEEK_API_KEY required under PLATFORM_IT (fail closed without ALLOW_SKIP_DEEPSEEK)',
    () => {
      writeArtifact('AC-3-key-presence.json', {
        hasDeepSeekKey,
        allowSkipAnthropic,
        platformIt: PLATFORM_IT,
        note: hasDeepSeekKey
          ? 'real Anthropic path will run'
          : allowSkipAnthropic
            ? 'ALLOW_SKIP_DEEPSEEK=1 — local-dev skip of live Anthropic path (not for harvest)'
            : 'DEEPSEEK_API_KEY unset — FAIL CLOSED under PLATFORM_IT=1',
      });
      // Fail closed by default: harvest cannot greenwash a missing key.
      // Opt-out only via ALLOW_SKIP_DEEPSEEK=1 for local work without Anthropic.
      expect(
        hasDeepSeekKey || allowSkipAnthropic,
        'AC-3 fail-closed: set DEEPSEEK_API_KEY for live escape telemetry, or ALLOW_SKIP_DEEPSEEK=1 for local-dev only'
      ).toBe(true);
    }
  );

  itAnthropic(
    'runBudgetedEscape logs reason/tokens/cost and contacts api.deepseek.com',
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
          expect(capture.deepseekCount()).toBeGreaterThanOrEqual(1);

          const sql = await loadSql();
          try {
            // Escape spend row (checkBudget also writes a cost=0 pre-check audit row)
            const rows = (await sql`
              SELECT reason, tokens, cost, run_id, step_id, check_type, role, allow_escape
              FROM budget_ledger
              WHERE run_id = ${runId} AND check_type = 'escape'
            `) as Array<{
              reason: string;
              tokens: number;
              cost: number;
              run_id: string;
              step_id: string;
              check_type: string;
              role: string | null;
              allow_escape: boolean | null;
            }>;
            expect(rows.length).toBe(1);
            expect(Number(rows[0]?.cost)).toBeGreaterThan(0);
            expect(Number(rows[0]?.tokens)).toBeGreaterThan(0);
            expect(Number(rows[0]?.tokens)).toBe(result.tokens);
            expect(Number(rows[0]?.cost)).toBeCloseTo(result.cost, 6);
            expect(rows[0]?.reason).toBe('ac3-budgeted-escape');
            expect(rows[0]?.role).toBe('divergent');
            expect(rows[0]?.allow_escape).toBe(true);

            const preChecks = (await sql`
              SELECT count(*)::int AS n
              FROM budget_ledger
              WHERE run_id = ${runId} AND check_type = 'pre-check'
            `) as Array<{ n: number }>;
            expect(Number(preChecks[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);

            writeArtifact('AC-3-escape-telemetry.json', {
              result: {
                tokens: result.tokens,
                cost: result.cost,
                ledgerId: result.ledgerId,
                textPreview: result.text.slice(0, 80),
              },
              rows,
              preCheckCount: Number(preChecks[0]?.n ?? 0),
              deepseekCount: capture.deepseekCount(),
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

  itAnthropic(
    'holo infer:call --escape runs runBudgetedEscape (ledger tokens/cost + anthropic host)',
    async () => {
      await withBudgetLock(async () => {
        process.env.HOLO_ESCAPE_BUDGET_USD = process.env.HOLO_ESCAPE_BUDGET_USD || '10';
        const ledger = await loadBudgetLedger();
        await ledger.resetBudgetLedgerForTests();
        await ledger.setBudgetCeiling(10);

        const runId = `ac3-cli-escape-${Date.now()}`;
        const cli = spawnSync(
          BUN_BIN,
          [
            HOLO_CLI,
            'infer:call',
            '--escape',
            '--cost',
            '0.05',
            '--reason',
            'ac3-cli-budgeted-escape',
            '--run-id',
            runId,
            '--prompt',
            'Reply with exactly the single word: pong',
            '--json',
          ],
          {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            env: {
              ...process.env,
              DATABASE_URL: DEFAULT_DATABASE_URL,
              HOLO_ESCAPE_BUDGET_USD: '10',
            },
            timeout: 120_000,
          }
        );
        const out = `${cli.stdout ?? ''}\n${cli.stderr ?? ''}`;
        expect(cli.status, out).toBe(0);

        let payload: {
          ok?: boolean;
          mode?: string;
          escape?: {
            tokens?: number;
            cost?: number;
            ledgerId?: string;
            text?: string;
          };
          networkCapture?: { deepseekCount?: number };
        } = {};
        try {
          payload = JSON.parse(cli.stdout ?? '{}') as typeof payload;
        } catch {
          // fall through to string assertions
        }

        expect(payload.ok ?? /"ok"\s*:\s*true/.test(out)).toBeTruthy();
        expect(payload.mode ?? out).toMatch(/runBudgetedEscape|budgeted-escape/i);
        expect(Number(payload.escape?.tokens ?? 0)).toBeGreaterThan(0);
        expect(Number(payload.escape?.cost ?? 0)).toBeGreaterThan(0);
        expect(payload.escape?.ledgerId).toBeTruthy();
        expect(payload.networkCapture?.deepseekCount ?? 0).toBeGreaterThanOrEqual(1);

        const sql = await loadSql();
        try {
          const rows = (await sql`
            SELECT reason, tokens, cost, run_id, check_type
            FROM budget_ledger
            WHERE run_id = ${runId} AND check_type = 'escape'
          `) as Array<{
            reason: string;
            tokens: number;
            cost: number;
            run_id: string;
            check_type: string;
          }>;
          expect(rows.length).toBe(1);
          expect(Number(rows[0]?.tokens)).toBeGreaterThan(0);
          expect(Number(rows[0]?.cost)).toBeGreaterThan(0);
          expect(rows[0]?.reason).toBe('ac3-cli-budgeted-escape');

          const preChecks = (await sql`
            SELECT count(*)::int AS n
            FROM budget_ledger
            WHERE run_id = ${runId} AND check_type = 'pre-check'
          `) as Array<{ n: number }>;
          expect(Number(preChecks[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);

          writeArtifact('AC-3-cli-escape-telemetry.json', {
            status: cli.status,
            payload,
            rows,
            preCheckCount: Number(preChecks[0]?.n ?? 0),
            outPreview: out.slice(0, 2000),
          });
        } finally {
          await sql.end({ timeout: 5 });
        }
      });
    },
    120_000
  );
});
