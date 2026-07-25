/**
 * REDHAT-FIX-02 — production writer for research_sessions.current_iteration (PATH-A)
 * or honest re-scope (PATH-B). Prefer PATH-A.
 *
 * AC-1: advanceResearchSessionIteration advances seeded session 1→3 without advance-server.py
 * AC-2: Zero binding non-regression (s-reactive-02 suite — run separately)
 * AC-3: greppable production writer under services/platform/src (not seed/tests/migrations/maestro)
 * AC-4: fail-closed on unknown session and over-max iteration
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-02');
const SPRINT25_DIR = resolve(REPO_ROOT, '.tmp/sprint-25');
const PATH_JSON = resolve(SPRINT25_DIR, 'redhat-fix-02-path.json');

/** Seeded active research session (e2eUuid('e', 51) → e00000000033). */
const E2E_ACTIVE_SESSION_ID = '00000000-0000-4000-8000-e00000000033';

const PROGRESS_SRC = resolve(REPO_ROOT, 'services/platform/src/research/progress.ts');
const PLATFORM_SRC = resolve(REPO_ROOT, 'services/platform/src');

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

describe('REDHAT-FIX-02 research_sessions.current_iteration production writer', () => {
  beforeAll(() => {
    ensureDirs();
    process.env.DATABASE_URL = DATABASE_URL;
  });

  describe('AC-1: PATH-A production writer advances 1→3', () => {
    itLive(
      'advances seeded session 1→2→3 via production module (not advance-server.py)',
      async () => {
        // Prefer PATH-A: production writer under services/platform/src/research/progress.ts
        expect(
          existsSync(PROGRESS_SRC),
          'PATH-A requires services/platform/src/research/progress.ts'
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

        // Production import path under services/platform/src (not .maestro/)
        const progressSrc = readFileSync(PROGRESS_SRC, 'utf8');
        expect(progressSrc).toMatch(/current_iteration\s*=/);
        expect(progressSrc).not.toMatch(/advance-server\.py/);

        // Product-lens honesty: real production workflow/CLI call sites must exist
        // (definition-only writer is NOT PATH-A complete).
        const callSites = countProductionAdvanceCallSites();
        expect(
          callSites.count,
          `expected advanceResearchSessionIteration( call sites under services/platform/src (mission/CLI); got:\n${callSites.matches.join('\n')}`
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
        const holo = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
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
        `expected greppable production current_iteration writer under services/platform/src; got:\n${matches.join('\n')}`
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
});
