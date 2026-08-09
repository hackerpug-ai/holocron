/**
 * S-REACTIVE-02 — Live research progress via Zero-synced Postgres rows.
 *
 * Static + live-Postgres contracts (no mocks):
 *   AC-2: research_sessions is zero_pub full-table; researchSessionById exists;
 *         schema exposes current_iteration/max_iterations.
 *   AC-1 (unit of binding): useResearchProgress + progress surface bind to those columns.
 *   AC-3: SafeAreaView + research-progress-bar testID present in progress surface.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const E2E_ACTIVE_SESSION_ID = '00000000-0000-4000-8000-e00000000033';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function psqlJson(sql: string): unknown {
  const out = execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
  }).trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function psqlExec(sql: string): void {
  execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  });
}

describe('S-REACTIVE-02 research progress Zero seam', () => {
  it('AC-2: research_sessions is a zero_pub full-table member', () => {
    const src = read('services/platform/src/db/schema/zero-pub.ts');
    expect(src).toMatch(/['"]research_sessions['"]/);
    // Must not be only listed under ZERO_PUB_EXCLUDED_TABLES
    const fullTablesBlock = src.slice(
      src.indexOf('ZERO_PUB_FULL_TABLES'),
      src.indexOf('ZERO_PUB_COLUMN_LIST') > 0 ? src.indexOf('ZERO_PUB_COLUMN_LIST') : src.length
    );
    expect(fullTablesBlock).toMatch(/research_sessions/);
  });

  it('AC-2: app/zero/queries.ts exports researchSessionById over research_sessions', () => {
    const src = read('app/zero/queries.ts');
    expect(src).toMatch(/export const researchSessionById/);
    expect(src).toMatch(
      /researchSessionById[\s\S]*?builder\.research_sessions\.where\(\s*['"]id['"]/
    );
  });

  it('TC-2: Zero schema publishes current_iteration and max_iterations on research_sessions', () => {
    const src = read('app/zero/schema.ts');
    expect(src).toMatch(/research_sessions|researchSessions/);
    expect(src).toMatch(/current_iteration:\s*number/);
    expect(src).toMatch(/max_iterations:\s*number/);
  });

  it('AC-1 binding: useResearchProgress uses researchSessionById via Zero useQuery', () => {
    const hookPath = join(REPO_ROOT, 'hooks/useResearchProgress.ts');
    expect(existsSync(hookPath), 'hooks/useResearchProgress.ts must exist').toBe(true);
    const src = read('hooks/useResearchProgress.ts');
    expect(src).toMatch(/from\s+['"]@rocicorp\/zero\/react['"]/);
    expect(src).toMatch(/researchSessionById/);
    expect(src).toMatch(/current_iteration|currentIteration/);
    expect(src).toMatch(/max_iterations|maxIterations/);
    // Must NOT hardcode a 3/5 progress value
    expect(src.includes("'3/5'") || src.includes('"3/5"')).toBe(false);
  });

  it('AC-3: progress surface has research-progress-bar testID + SafeAreaView', () => {
    // Live surface only — deleted orphans are not valid coverage.
    const liveSurface = 'components/deep-research/DeepResearchDetailView.tsx';
    expect(existsSync(join(REPO_ROOT, liveSurface)), `${liveSurface} must exist`).toBe(true);
    const src = read(liveSurface);
    expect(src).toMatch(/research-progress-bar/);
    expect(src).toMatch(/SafeAreaView/);
    expect(src).toMatch(/useResearchProgress/);
  });

  it('Maestro flow exists for live 1/5 → 3/5 advances', () => {
    const flow = join(REPO_ROOT, '.maestro/reactive/research-progress-advances.yml');
    expect(existsSync(flow)).toBe(true);
    const src = read('.maestro/reactive/research-progress-advances.yml');
    expect(src).toMatch(/research-progress-bar/);
    expect(src).toMatch(/3\/5/);
    expect(src).toMatch(/1\/5/);
  });

  it('live Postgres: research_sessions row can advance current_iteration (engine write surface)', () => {
    let before: { current_iteration: number | null; max_iterations: number | null } | null = null;
    try {
      before = psqlJson(
        `SELECT json_build_object('current_iteration', current_iteration, 'max_iterations', max_iterations)
         FROM research_sessions WHERE id = '${E2E_ACTIVE_SESSION_ID}'`
      ) as { current_iteration: number | null; max_iterations: number | null } | null;
    } catch (err) {
      if (process.env.PLATFORM_IT === '1') throw err;
      console.warn('skip live Postgres advance check: cannot connect', err);
      return;
    }

    if (!before) {
      if (process.env.PLATFORM_IT === '1') {
        // Self-seed: earlier namespace-reset suites truncate research_sessions.
        // Insert the deterministic e2e active session so this test is order-independent.
        try {
          psqlExec(
            `INSERT INTO research_sessions (id, status, current_iteration, max_iterations, created_at, updated_at)
             VALUES ('${E2E_ACTIVE_SESSION_ID}'::uuid, 'running', 0, 5, now(), now())
             ON CONFLICT (id) DO UPDATE SET
               status = 'running', current_iteration = 0, max_iterations = 5, updated_at = now()`
          );
          before = psqlJson(
            `SELECT json_build_object('current_iteration', current_iteration, 'max_iterations', max_iterations)
             FROM research_sessions WHERE id = '${E2E_ACTIVE_SESSION_ID}'`
          ) as { current_iteration: number | null; max_iterations: number | null } | null;
        } catch (seedErr) {
          throw new Error(
            `seeded-research-session missing: ${E2E_ACTIVE_SESSION_ID} — run holo seed:e2e --reset; self-seed failed: ${String(seedErr)}`
          );
        }
        if (!before) {
          throw new Error(
            `seeded-research-session missing after self-seed: ${E2E_ACTIVE_SESSION_ID}`
          );
        }
      } else {
        console.warn('skip: e2e research session not seeded');
        return;
      }
    }

    psqlExec(
      `UPDATE research_sessions
       SET current_iteration = 1, max_iterations = 5, status = 'running', updated_at = now()
       WHERE id = '${E2E_ACTIVE_SESSION_ID}'`
    );
    psqlExec(
      `UPDATE research_sessions
       SET current_iteration = 3, max_iterations = 5, updated_at = now()
       WHERE id = '${E2E_ACTIVE_SESSION_ID}'`
    );

    const after = psqlJson(
      `SELECT json_build_object('current_iteration', current_iteration, 'max_iterations', max_iterations)
       FROM research_sessions WHERE id = '${E2E_ACTIVE_SESSION_ID}'`
    ) as { current_iteration: number | null; max_iterations: number | null };

    expect(after.current_iteration).toBe(3);
    expect(after.max_iterations).toBe(5);
  });
});
