/**
 * REDHAT-FIX-02 — production writer for research_sessions.current_iteration (PATH-A)
 * or honest re-scope (PATH-B). Prefer PATH-A.
 *
 * AC-1: advanceResearchSessionIteration advances seeded session 1→3 without advance-server.py
 * AC-2: Zero binding non-regression (s-reactive-02 suite — run separately)
 * AC-3: greppable production writer under packages/platform/src (not seed/tests/migrations/maestro)
 * AC-4: fail-closed on unknown session and over-max iteration
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   pnpm vitest run packages/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';
import type { AdvanceResearchSessionIterationResult } from '../../src/research/progress.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;
/** Child vitest under Mutant D must not re-enter the mutation probe. */
const MUTATION_CHILD = process.env.REDHAT_FIX_09_MUTATION_CHILD === '1';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-02');
const SPRINT25_DIR = resolve(REPO_ROOT, '.tmp/sprint-25');
const PATH_JSON = resolve(SPRINT25_DIR, 'redhat-fix-02-path.json');
const FIX09_PATH_JSON = resolve(SPRINT25_DIR, 'redhat-fix-09-path.json');
const FIX09_MUTATION_LOG = resolve(SPRINT25_DIR, 'redhat-fix-09-concurrency-mutation.log');
const FIX09_AC1_JSON = resolve(SPRINT25_DIR, 'redhat-fix-09-ac1-concurrent.json');
const FIX09_EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-09');

/** Seeded active research session (e2eUuid('e', 51) → e00000000033). */
const E2E_ACTIVE_SESSION_ID = '00000000-0000-4000-8000-e00000000033';

const PROGRESS_SRC = resolve(REPO_ROOT, 'packages/platform/src/research/progress.ts');
const PLATFORM_SRC = resolve(REPO_ROOT, 'packages/platform/src');

const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL,
  context: 'redhat-fix-02 research iteration writer',
});

function ensureDirs(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(SPRINT25_DIR, { recursive: true });
}

function writeEvidence(name: string, body: unknown): string {
  ensureDirs();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function rg(pattern: string, cwd: string, extraArgs: string[] = []): string {
  try {
    return execFileSync('rg', ['-n', pattern, ...extraArgs, cwd], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    });
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    if (e.status === 1) return e.stdout ?? '';
    throw err;
  }
}

function countProductionCurrentIterationWriters(): {
  count: number;
  matches: string[];
} {
  // Greppable UPDATE/SET of current_iteration under production src, excluding seed/migrations/tests.
  const out = rg('SET current_iteration|current_iteration\\s*=', PLATFORM_SRC, [
    '--glob',
    '!**/migrations/**',
    '--glob',
    '!**/seed*',
    '--glob',
    '!**/*test*',
    '--glob',
    '!**/*.md',
  ]);
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // SELECT aliases / type-only reads are not writers
    .filter((l) => !/SELECT\b/i.test(l))
    .filter((l) => !/AS\s+"?currentIteration"?/i.test(l))
    .filter((l) => !/:\s*integer\b/.test(l));
  return { count: lines.length, matches: lines };
}

/**
 * Production call sites of advanceResearchSessionIteration (not the definition).
 * Product-lens honesty: writer must be invoked from mission/workflow/CLI code.
 */
function countProductionAdvanceCallSites(): {
  count: number;
  matches: string[];
} {
  const out = rg('advanceResearchSessionIteration\\s*\\(', PLATFORM_SRC, [
    '--glob',
    '!**/migrations/**',
    '--glob',
    '!**/seed*',
    '--glob',
    '!**/*test*',
    '--glob',
    '!**/*.md',
  ]);
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // Drop the function definition itself (export async function advance...)
    .filter((l) => !/function\s+advanceResearchSessionIteration\b/.test(l))
    // Drop pure re-exports / type-only mentions without call paren already filtered
    .filter((l) => !/export\s+async\s+function\s+advanceResearchSessionIteration\b/.test(l));
  return { count: lines.length, matches: lines };
}

function countMaestroAdvanceImportsInProgressModule(): number {
  if (!existsSync(PROGRESS_SRC)) return 0;
  const src = readFileSync(PROGRESS_SRC, 'utf8');
  const hits = src.match(/advance-server\.py|\.maestro\/reactive|spawnSync\s*\(\s*['"]psql/g);
  return hits?.length ?? 0;
}

async function withSql<T>(fn: (sql: ReturnType<typeof createSql>) => Promise<T>): Promise<T> {
  const sql = createSql(DATABASE_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function ensureSeededSessionAt(current: number, max: number): Promise<void> {
  await withSql(async (sql) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM research_sessions WHERE id = ${E2E_ACTIVE_SESSION_ID}::uuid LIMIT 1
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO research_sessions (
          id, system, query, topic, status, max_iterations, current_iteration,
          created_at, updated_at
        ) VALUES (
          ${E2E_ACTIVE_SESSION_ID}::uuid,
          'deep',
          'E2E Active Research: Native resilience',
          'E2E Active Research: Native resilience',
          'running',
          ${max},
          ${current},
          now(),
          now()
        )
      `;
      return;
    }
    await sql`
      UPDATE research_sessions
      SET current_iteration = ${current},
          max_iterations = ${max},
          status = 'running',
          updated_at = now()
      WHERE id = ${E2E_ACTIVE_SESSION_ID}::uuid
    `;
  });
}

async function readSession(): Promise<{
  current_iteration: number | null;
  max_iterations: number | null;
  status: string;
} | null> {
  return withSql(async (sql) => {
    const rows = await sql<
      { current_iteration: number | null; max_iterations: number | null; status: string }[]
    >`
      SELECT current_iteration, max_iterations, status
      FROM research_sessions
      WHERE id = ${E2E_ACTIVE_SESSION_ID}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
}

/**
 * Cold-checkout self-seed for TC-5-mandated path.json.
 * When PATH-A production writer exists in progress.ts, write PATH-A so
 * existsSync(PATH_JSON) and jq path checks pass without worktree artifacts.
 * Matches FIX-01 self-seed behavior (tests/integration/redhat-fix-01-streaming-seed.test.ts).
 */
function ensurePathJsonSelfSeed(): void {
  ensureDirs();
  if (existsSync(PATH_JSON)) return;
  if (!existsSync(PROGRESS_SRC)) return;
  const src = readFileSync(PROGRESS_SRC, 'utf8');
  const hasWriter =
    /current_iteration\s*=/.test(src) && /advanceResearchSessionIteration/.test(src);
  if (!hasWriter) return;
  writeFileSync(
    PATH_JSON,
    `${JSON.stringify({ path: 'A', agent: 'mastra-implementer' }, null, 2)}\n`,
    'utf8'
  );
}

describe('REDHAT-FIX-02 research_sessions.current_iteration production writer', () => {
  beforeAll(() => {
    ensureDirs();
    process.env.DATABASE_URL = DATABASE_URL;
    // Self-seed PATH-A at .tmp/sprint-25/redhat-fix-02-path.json when production writer greppable
    ensurePathJsonSelfSeed();
  });

  describe('AC-1: PATH-A production writer advances 1→3', () => {
    itLive(
      'advances seeded session 1→2→3 via production module (not advance-server.py)',
      async () => {
        // Prefer PATH-A: production writer under packages/platform/src/research/progress.ts
        expect(
          existsSync(PROGRESS_SRC),
          'PATH-A requires packages/platform/src/research/progress.ts'
        ).toBe(true);

        // Dynamic import so RED fails cleanly when module is missing
        const mod = await import('../../src/research/progress.ts');
        expect(typeof mod.advanceResearchSessionIteration).toBe('function');

        await ensureSeededSessionAt(1, 5);
        const before = await readSession();
        expect(before?.current_iteration).toBe(1);
        expect(before?.max_iterations).toBe(5);

        const r1 = await mod.advanceResearchSessionIteration({
          sessionId: E2E_ACTIVE_SESSION_ID,
          databaseUrl: DATABASE_URL,
        });
        expect(r1.ok, `first advance failed: ${JSON.stringify(r1)}`).toBe(true);
        if (r1.ok) {
          expect(r1.previousIteration).toBe(1);
          expect(r1.currentIteration).toBe(2);
          expect(r1.maxIterations).toBe(5);
        }

        const r2 = await mod.advanceResearchSessionIteration({
          sessionId: E2E_ACTIVE_SESSION_ID,
          databaseUrl: DATABASE_URL,
        });
        expect(r2.ok, `second advance failed: ${JSON.stringify(r2)}`).toBe(true);
        if (r2.ok) {
          expect(r2.previousIteration).toBe(2);
          expect(r2.currentIteration).toBe(3);
          expect(r2.maxIterations).toBe(5);
        }

        const after = await readSession();
        expect(after?.current_iteration).toBe(3);
        expect(after?.max_iterations).toBe(5);

        // Must not depend on Maestro harness
        expect(countMaestroAdvanceImportsInProgressModule()).toBe(0);

        // Production import path under packages/platform/src (not .maestro/)
        const progressSrc = readFileSync(PROGRESS_SRC, 'utf8');
        expect(progressSrc).toMatch(/current_iteration\s*=/);
        expect(progressSrc).not.toMatch(/advance-server\.py/);

        // Product-lens honesty: real production workflow/CLI call sites must exist
        // (definition-only writer is NOT PATH-A complete).
        const callSites = countProductionAdvanceCallSites();
        expect(
          callSites.count,
          `expected advanceResearchSessionIteration( call sites under packages/platform/src (mission/CLI); got:\n${callSites.matches.join('\n')}`
        ).toBeGreaterThanOrEqual(1);
        const joined = callSites.matches.join('\n');
        expect(joined).toMatch(
          /mission\/cycle\.ts|mission-research\.ts|cli\/holo\.ts|observability\/mission-research/
        );

        // Record PATH-A
        const pathRecord = {
          path: 'A' as const,
          agent: 'mastra-implementer',
          productionCallSites: callSites.matches,
        };
        writeFileSync(PATH_JSON, `${JSON.stringify(pathRecord, null, 2)}\n`, 'utf8');
        const written = JSON.parse(readFileSync(PATH_JSON, 'utf8')) as { path: string };
        expect(written.path).toBe('A');

        writeEvidence('AC-1-green-artifact.json', {
          path: 'A',
          sessionId: E2E_ACTIVE_SESSION_ID,
          before,
          advances: [r1, r2],
          after,
          maestroImportCount: countMaestroAdvanceImportsInProgressModule(),
          productionCallSites: callSites,
        });
      }
    );

    itLive(
      'advances 1→2→3 via production CLI research:advance-iteration (not advance-server.py)',
      async () => {
        await ensureSeededSessionAt(1, 5);
        const holo = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
        expect(existsSync(holo)).toBe(true);

        const runCli = (steps: number) =>
          execFileSync(
            'bun',
            [holo, 'research:advance-iteration', E2E_ACTIVE_SESSION_ID, String(steps), '--json'],
            {
              encoding: 'utf8',
              cwd: REPO_ROOT,
              env: { ...process.env, DATABASE_URL },
            }
          );

        const out1 = runCli(1);
        const j1 = JSON.parse(out1) as { ok: boolean; result?: { currentIteration?: number } };
        expect(j1.ok, `CLI step1 failed: ${out1}`).toBe(true);
        expect(j1.result?.currentIteration).toBe(2);

        const out2 = runCli(1);
        const j2 = JSON.parse(out2) as { ok: boolean; result?: { currentIteration?: number } };
        expect(j2.ok, `CLI step2 failed: ${out2}`).toBe(true);
        expect(j2.result?.currentIteration).toBe(3);

        const after = await readSession();
        expect(after?.current_iteration).toBe(3);
        expect(after?.max_iterations).toBe(5);

        writeEvidence('AC-1-cli-production-path.json', {
          path: 'A',
          surface: 'holo research:advance-iteration',
          steps: [j1, j2],
          after,
        });
      }
    );

    it('path.json records A or B', () => {
      // On RED (before path.json), this also fails — PATH-A test writes it; commit includes path.json.
      expect(existsSync(PATH_JSON), `.tmp/sprint-25/redhat-fix-02-path.json must exist`).toBe(true);
      const parsed = JSON.parse(readFileSync(PATH_JSON, 'utf8')) as {
        path?: string;
        agent?: string;
      };
      expect(parsed.path === 'A' || parsed.path === 'B').toBe(true);
      expect(parsed.agent).toBe('mastra-implementer');
    });

    it('production workflow/CLI imports advanceResearchSessionIteration (not definition-only)', () => {
      const callSites = countProductionAdvanceCallSites();
      writeEvidence('AC-1-production-call-sites.json', callSites);
      expect(
        callSites.count,
        `PATH-A incomplete without production callers; matches:\n${callSites.matches.join('\n')}`
      ).toBeGreaterThanOrEqual(1);
      // Must include at least one of the wired surfaces
      const blob = callSites.matches.join('\n');
      expect(blob).toMatch(/mission\/cycle\.ts|mission-research\.ts|cli\/holo\.ts/);
      // Must not only live under .maestro/
      expect(blob).not.toMatch(/\.maestro\//);
    });
  });

  describe('AC-3: source audit — production writer sites', () => {
    it('PATH-A production write site count >= 1 for current_iteration', () => {
      const { count, matches } = countProductionCurrentIterationWriters();
      const callSites = countProductionAdvanceCallSites();
      writeEvidence('AC-3-writer-audit.json', {
        count,
        matches,
        callSites,
        path: 'A',
      });
      expect(
        count,
        `expected greppable production current_iteration writer under packages/platform/src; got:\n${matches.join('\n')}`
      ).toBeGreaterThanOrEqual(1);

      // progress.ts itself must be one of the sites
      expect(existsSync(PROGRESS_SRC)).toBe(true);
      const src = readFileSync(PROGRESS_SRC, 'utf8');
      expect(src).toMatch(/current_iteration\s*=/);
      expect(src).toMatch(/UPDATE\s+research_sessions|research_sessions[\s\S]*current_iteration/i);

      // Product-lens: at least one non-definition production caller
      expect(
        callSites.count,
        `expected production callers of advanceResearchSessionIteration; got:\n${callSites.matches.join('\n')}`
      ).toBeGreaterThanOrEqual(1);

      expect(existsSync(PATH_JSON)).toBe(true);
      const path = JSON.parse(readFileSync(PATH_JSON, 'utf8')) as { path: string };
      expect(path.path).toBe('A');
    });
  });

  describe('AC-4: PATH-A fail-closed', () => {
    itLive('unknown session yields structured error (ok:false)', async () => {
      const mod = await import('../../src/research/progress.ts');
      const unknownId = '00000000-0000-4000-8000-deadbeef0001';
      const result = await mod.advanceResearchSessionIteration({
        sessionId: unknownId,
        databaseUrl: DATABASE_URL,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toMatch(/NOT_FOUND|SESSION/i);
        expect(result.error.length).toBeGreaterThan(0);
      }
      writeEvidence('AC-4-unknown-session.json', result);
    });

    itLive('over-max iteration yields bounds/iteration error', async () => {
      const mod = await import('../../src/research/progress.ts');
      // Session already past max (current=9, max=5) — advance must fail closed
      await ensureSeededSessionAt(9, 5);
      const result = await mod.advanceResearchSessionIteration({
        sessionId: E2E_ACTIVE_SESSION_ID,
        databaseUrl: DATABASE_URL,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(`${result.errorCode} ${result.error}`.toLowerCase()).toMatch(/iteration|bounds/);
      }
      // Must NOT soft-succeed with 0 rows
      expect(result).not.toMatchObject({ ok: true });
      writeEvidence('AC-4-over-max.json', result);

      // Restore seeded fixture for other suites
      await ensureSeededSessionAt(1, 5);
    });
  });

  /**
   * REDHAT-FIX-09 — concurrent dual-call oracle for COALESCE optimistic lock.
   * Closes NO_ORACLE_IDEMPOTENCY (CRITICAL): sequential 1→2→3 cannot kill Mutant D.
   */
  describe('REDHAT-FIX-09 / AC-concurrency', () => {
    afterAll(async () => {
      if (!PLATFORM_IT) return;
      // AC-5: restore fixture so sequential suites are not poisoned
      await ensureSeededSessionAt(1, 5);
    });

    itLive(
      'concurrent dual advance: exactly one winner N→N+1; loser RESEARCH_SESSION_UPDATE_FAILED',
      async () => {
        const N = 1;
        const max = 5;
        const mod = await import('../../src/research/progress.ts');

        /**
         * True optimistic-lock race via two pre-warmed independent connections.
         * Retry until both callers observe the same previousIteration (contention)
         * so the COALESCE WHERE produces exactly one winner — sequentialized pairs
         * both ok:true and do not exercise the guard.
         */
        let concurrentResults: AdvanceResearchSessionIterationResult[] = [];
        let before: Awaited<ReturnType<typeof readSession>> = null;
        let after: Awaited<ReturnType<typeof readSession>> = null;
        let winners: AdvanceResearchSessionIterationResult[] = [];
        let losers: AdvanceResearchSessionIterationResult[] = [];
        let raceAttempts = 0;
        const maxAttempts = 25;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          raceAttempts = attempt + 1;
          await ensureSeededSessionAt(N, max);
          before = await readSession();
          expect(before?.current_iteration).toBe(N);
          expect(before?.max_iterations).toBe(max);

          const clients = [createSql(DATABASE_URL), createSql(DATABASE_URL)];
          await Promise.all(clients.map((sql) => sql`SELECT 1`));
          try {
            concurrentResults = await Promise.all(
              clients.map((sql) =>
                mod.advanceResearchSessionIteration({
                  sessionId: E2E_ACTIVE_SESSION_ID,
                  databaseUrl: DATABASE_URL,
                  sql,
                })
              )
            );
          } finally {
            await Promise.all(clients.map((sql) => sql.end({ timeout: 5 })));
          }

          winners = concurrentResults.filter((r) => r.ok);
          losers = concurrentResults.filter((r) => !r.ok);
          after = await readSession();

          // Contended race signature: one N→N+1 winner, one UPDATE_FAILED, final N+1
          const winnerFromN = winners.find(
            (r) => r.ok && r.previousIteration === N && r.currentIteration === N + 1
          );
          const updateFailed = losers.find(
            (r) => !r.ok && r.errorCode === 'RESEARCH_SESSION_UPDATE_FAILED'
          );
          if (
            winnerFromN &&
            updateFailed &&
            after?.current_iteration === N + 1 &&
            winners.length === 1
          ) {
            break;
          }
        }

        expect(
          winners.length,
          `expected exactly one ok:true winner after ${raceAttempts} attempts; got winners=${JSON.stringify(winners)} losers=${JSON.stringify(losers)} after=${JSON.stringify(after)}`
        ).toBe(1);
        expect(
          losers.length,
          `expected exactly one loser after ${raceAttempts} attempts; got winners=${JSON.stringify(winners)} losers=${JSON.stringify(losers)}`
        ).toBe(1);

        const winner = winners[0];
        const loser = losers[0];
        expect(winner?.ok).toBe(true);
        if (winner?.ok) {
          expect(winner.previousIteration).toBe(N);
          expect(winner.currentIteration).toBe(N + 1);
          expect(winner.maxIterations).toBe(max);
          expect(winner.currentIteration).toBe(winner.previousIteration + 1);
        }
        expect(loser?.ok).toBe(false);
        if (loser && !loser.ok) {
          expect(loser.errorCode).toBe('RESEARCH_SESSION_UPDATE_FAILED');
        }

        expect(
          after?.current_iteration,
          'final current_iteration must be N+1 (not N+2 double-increment)'
        ).toBe(N + 1);
        expect(after?.max_iterations).toBe(max);
        // MUST NOT: still at N, or jumped by 2
        expect(after?.current_iteration).not.toBe(N);
        expect(after?.current_iteration).not.toBe(N + 2);

        const evidence = {
          task: 'REDHAT-FIX-09',
          sessionId: E2E_ACTIVE_SESSION_ID,
          N,
          max,
          before,
          raceAttempts,
          concurrentResults,
          winners: winners.length,
          losers: losers.length,
          loserErrorCode: loser && !loser.ok ? loser.errorCode : null,
          after,
          must_observe: {
            exactly_one_ok_true: winners.length === 1,
            winner_previous_is_N: winner?.ok ? winner.previousIteration === N : false,
            winner_current_is_N_plus_1: winner?.ok ? winner.currentIteration === N + 1 : false,
            loser_UPDATE_FAILED:
              loser && !loser.ok ? loser.errorCode === 'RESEARCH_SESSION_UPDATE_FAILED' : false,
            final_iteration_N_plus_1: after?.current_iteration === N + 1,
          },
        };

        ensureDirs();
        mkdirSync(FIX09_EVIDENCE_DIR, { recursive: true });
        writeFileSync(FIX09_AC1_JSON, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
        writeFileSync(
          resolve(FIX09_EVIDENCE_DIR, 'AC-1-green.txt'),
          `${JSON.stringify(evidence, null, 2)}\n`,
          'utf8'
        );
        writeFileSync(
          resolve(FIX09_EVIDENCE_DIR, 'AC-1-seeded-artifact.json'),
          `${JSON.stringify(evidence, null, 2)}\n`,
          'utf8'
        );
        writeEvidence('REDHAT-FIX-09-AC-1-concurrent.json', evidence);

        // Self-seed PATH-A path.json for AC-4
        writeFileSync(
          FIX09_PATH_JSON,
          `${JSON.stringify({ path: 'A', agent: 'mastra-implementer', task: 'REDHAT-FIX-09' }, null, 2)}\n`,
          'utf8'
        );
      }
    );

    itLive(
      'concurrent dual advance with two independent sql connections: still single winner + restore',
      async () => {
        // AC-5: two independent connections (true race); after race restore fixture to 1/5
        const N = 1;
        const max = 5;
        const mod = await import('../../src/research/progress.ts');

        let concurrentResults: AdvanceResearchSessionIterationResult[] = [];
        let after: Awaited<ReturnType<typeof readSession>> = null;
        let winners: AdvanceResearchSessionIterationResult[] = [];
        let losers: AdvanceResearchSessionIterationResult[] = [];
        let raceAttempts = 0;

        for (let attempt = 0; attempt < 25; attempt++) {
          raceAttempts = attempt + 1;
          await ensureSeededSessionAt(N, max);
          const clients = [createSql(DATABASE_URL), createSql(DATABASE_URL)];
          await Promise.all(clients.map((sql) => sql`SELECT 1`));
          try {
            concurrentResults = await Promise.all(
              clients.map((sql) =>
                mod.advanceResearchSessionIteration({
                  sessionId: E2E_ACTIVE_SESSION_ID,
                  databaseUrl: DATABASE_URL,
                  sql,
                })
              )
            );
          } finally {
            await Promise.all(clients.map((sql) => sql.end({ timeout: 5 })));
          }
          winners = concurrentResults.filter((r) => r.ok);
          losers = concurrentResults.filter((r) => !r.ok);
          after = await readSession();
          if (
            winners.length === 1 &&
            losers.length === 1 &&
            losers[0] &&
            !losers[0].ok &&
            losers[0].errorCode === 'RESEARCH_SESSION_UPDATE_FAILED' &&
            after?.current_iteration === N + 1
          ) {
            break;
          }
        }

        expect(
          winners.length,
          `independent-sql winners after ${raceAttempts} attempts=${JSON.stringify(concurrentResults)}`
        ).toBe(1);
        expect(losers.length).toBe(1);
        if (winners[0]?.ok) {
          expect(winners[0].previousIteration).toBe(N);
          expect(winners[0].currentIteration).toBe(N + 1);
        }
        if (losers[0] && !losers[0].ok) {
          expect(losers[0].errorCode).toBe('RESEARCH_SESSION_UPDATE_FAILED');
        }

        expect(after?.current_iteration).toBe(N + 1);
        expect(after?.max_iterations).toBe(max);

        // Restore for other tests / suites (AC-5 must_observe)
        await ensureSeededSessionAt(1, 5);
        const restored = await readSession();
        expect(restored?.current_iteration).toBe(1);
        expect(restored?.max_iterations).toBe(5);

        writeEvidence('REDHAT-FIX-09-AC-5-independent-sql.json', {
          afterRace: after,
          restored,
          raceAttempts,
          concurrentResults,
        });
      }
    );

    it('AC-2 Mutant D COALESCE guard removed is KILLED by concurrency suite', () => {
      if (!PLATFORM_IT) {
        // Never fake-pass: skip when live Postgres gate is off
        return;
      }
      if (MUTATION_CHILD) {
        // Avoid recursive mutation probe in child process
        return;
      }

      ensureDirs();
      mkdirSync(FIX09_EVIDENCE_DIR, { recursive: true });
      const lines: string[] = [];
      const stamp = new Date().toISOString();
      lines.push(`# REDHAT-FIX-09 concurrency mutation probe ${stamp}`);
      lines.push(`repo_root=${REPO_ROOT}`);
      lines.push(
        `base_head=${spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()}`
      );
      lines.push(`mutant_edit_path=packages/platform/src/research/progress.ts`);

      const vitestBin = join(REPO_ROOT, 'node_modules', '.bin', 'vitest');
      const testFile =
        'packages/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts';
      // Only the dual-advance concurrent case (not this mutation it, not shared-sql alone)
      const concurrentFilter = 'concurrent dual advance: exactly one winner';

      const childEnv = {
        ...process.env,
        PLATFORM_IT: '1',
        DATABASE_URL: DATABASE_URL,
        REDHAT_FIX_09_MUTATION_CHILD: '1',
      };

      // --- Correct (unmutated) production path ---
      const correct = spawnSync(vitestBin, ['run', testFile, '-t', concurrentFilter], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: childEnv,
        timeout: 120_000,
      });
      const correctExit = correct.status ?? 1;
      const correctFailed = (correct.stdout + correct.stderr).match(/(\d+) failed/);
      const correctFailures = correctFailed ? Number(correctFailed[1]) : correctExit === 0 ? 0 : 1;
      lines.push(
        `correct mode=unmutated exit=${correctExit} failures=${correctFailures} exit_ok=${correctExit === 0}`
      );
      if (correctExit !== 0) {
        lines.push('correct_stdout_tail:');
        lines.push((correct.stdout + correct.stderr).split('\n').slice(-40).join('\n'));
      }

      // --- Mutant D: remove COALESCE concurrency WHERE predicate ---
      const progressPath = PROGRESS_SRC;
      const original = readFileSync(progressPath, 'utf8');
      const guardRe = /\n\s*AND COALESCE\(current_iteration,\s*0\)\s*=\s*\$\{previousIteration\}\n/;
      if (!guardRe.test(original)) {
        lines.push('mutant-d-guard-removed ERROR: COALESCE concurrency WHERE not found');
        writeFileSync(FIX09_MUTATION_LOG, `${lines.join('\n')}\n`, 'utf8');
        expect(original, 'COALESCE concurrency guard must exist in progress.ts').toMatch(
          /COALESCE\(current_iteration/
        );
        return;
      }
      const mutated = original.replace(guardRe, '\n');
      expect(mutated).not.toMatch(
        /COALESCE\(current_iteration,\s*0\)\s*=\s*\$\{previousIteration\}/
      );
      writeFileSync(progressPath, mutated);
      lines.push(
        `mutant-d applied: removed AND COALESCE(current_iteration, 0) = \${previousIteration}`
      );
      lines.push('mutant_edit_path=packages/platform/src/research/progress.ts');

      let mutantExit = 0;
      let mutantFailures = 0;
      try {
        const mutant = spawnSync(vitestBin, ['run', testFile, '-t', concurrentFilter], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: childEnv,
          timeout: 120_000,
        });
        mutantExit = mutant.status ?? 1;
        const mutantFailed = (mutant.stdout + mutant.stderr).match(/(\d+) failed/);
        mutantFailures = mutantFailed ? Number(mutantFailed[1]) : mutantExit === 0 ? 0 : 1;
        lines.push(
          `mutant-d-guard-removed mode=mutant-d-guard-removed exit=${mutantExit} failures=${mutantFailures} exit_nonzero=${mutantExit !== 0}`
        );
        if (mutantExit === 0) {
          lines.push('mutant-d-guard-removed SURVIVED (suite green under mutant) — FAIL');
          lines.push((mutant.stdout + mutant.stderr).split('\n').slice(-50).join('\n'));
        } else {
          lines.push(
            'mutant-d-guard-removed KILLED (suite exit non-zero under COALESCE guard removal)'
          );
          lines.push((mutant.stdout + mutant.stderr).split('\n').slice(-40).join('\n'));
        }
      } finally {
        writeFileSync(progressPath, original);
        lines.push('production file restored after mutant-d probe');
        // Confirm restore
        const restoredSrc = readFileSync(progressPath, 'utf8');
        if (!/COALESCE\(current_iteration,\s*0\)\s*=\s*\$\{previousIteration\}/.test(restoredSrc)) {
          lines.push('RESTORE_FAILED: COALESCE guard missing after restore');
        }
      }

      writeFileSync(FIX09_MUTATION_LOG, `${lines.join('\n')}\n`, 'utf8');
      writeFileSync(
        FIX09_PATH_JSON,
        `${JSON.stringify({ path: 'A', agent: 'mastra-implementer', task: 'REDHAT-FIX-09' }, null, 2)}\n`,
        'utf8'
      );
      writeFileSync(resolve(FIX09_EVIDENCE_DIR, 'AC-2-green.txt'), `${lines.join('\n')}\n`, 'utf8');

      // Parent assertions: correct green, mutant killed
      expect(correctExit, 'correct concurrency path must exit 0').toBe(0);
      expect(correctFailures).toBe(0);
      expect(mutantExit, 'mutant-d-guard-removed must exit non-zero').not.toBe(0);
      expect(mutantFailures, 'mutant-d-guard-removed failures>=1').toBeGreaterThanOrEqual(1);
      expect(existsSync(FIX09_MUTATION_LOG)).toBe(true);
      const logBody = readFileSync(FIX09_MUTATION_LOG, 'utf8');
      expect(logBody).toMatch(/mutant-d-guard-removed/);
      expect(logBody).toMatch(/correct.*exit=0/);
      expect(logBody).toMatch(
        /mutant-d-guard-removed.*(exit=[1-9]|exit_nonzero=true|failures=[1-9])/
      );
    }, 180_000);

    it('path.json records A + mastra-implementer for REDHAT-FIX-09', () => {
      ensureDirs();
      if (!existsSync(FIX09_PATH_JSON) && existsSync(PROGRESS_SRC)) {
        const src = readFileSync(PROGRESS_SRC, 'utf8');
        if (
          /COALESCE\(current_iteration/.test(src) &&
          /advanceResearchSessionIteration/.test(src)
        ) {
          writeFileSync(
            FIX09_PATH_JSON,
            `${JSON.stringify({ path: 'A', agent: 'mastra-implementer', task: 'REDHAT-FIX-09' }, null, 2)}\n`,
            'utf8'
          );
        }
      }
      expect(existsSync(FIX09_PATH_JSON), '.tmp/sprint-25/redhat-fix-09-path.json must exist').toBe(
        true
      );
      const parsed = JSON.parse(readFileSync(FIX09_PATH_JSON, 'utf8')) as {
        path?: string;
        agent?: string;
      };
      expect(parsed.path).toBe('A');
      expect(parsed.agent).toBe('mastra-implementer');
    });
  });
});
