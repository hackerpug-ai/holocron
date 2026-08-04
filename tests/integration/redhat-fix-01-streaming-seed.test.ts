/**
 * REDHAT-FIX-01 — H1 fictional 'Streaming' seed conversation closeout.
 *
 * PATH-A (preferred): after `holo seed:e2e --reset`, Postgres has exactly one
 * conversation titled 'Streaming' with ≥1 chat_message, and Maestro
 * `visible: "Streaming"` asserts are non-optional.
 *
 * Real CLI + Postgres only — no mocks (TESTING-HIERARCHY).
 *
 * Run:
 *   holo seed:e2e --reset && pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const HOLO_CLI = join(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';

const NONPROD_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : 'postgres://127.0.0.1:5432/holocron_nonprod';

const PATH_JSON = join(REPO_ROOT, '.tmp/sprint-25/redhat-fix-01-path.json');
const SEED_E2E = join(REPO_ROOT, 'services/platform/src/db/seed-e2e.ts');
const SPRINT_MD = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md'
);
const GATE_RESULTS_MD = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/GATE-RESULTS.md'
);
const S_REACTIVE_01 = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md'
);

const MAESTRO_STREAMING_FLOWS = [
  'reconnect-exactly-once.yml',
  'last-event-id-gap-fill.yml',
  'token-streaming.yml',
  'exactly-one-final-message.yml',
] as const;

function runHolo(
  args: string[],
  options?: { timeoutMs?: number }
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: NONPROD_URL },
    timeout: options?.timeoutMs ?? 120_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

function psqlScalar(sql: string): number {
  const r = spawnSync('psql', [NONPROD_URL, '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (r.status !== 0) return -1;
  const n = Number((r.stdout ?? '').trim());
  return Number.isFinite(n) ? n : -1;
}

function readPathChoice(): 'A' | 'B' {
  if (!existsSync(PATH_JSON)) {
    throw new Error(`missing path record: ${PATH_JSON}`);
  }
  const raw = JSON.parse(readFileSync(PATH_JSON, 'utf8')) as { path?: string };
  if (raw.path !== 'A' && raw.path !== 'B') {
    throw new Error(`path.json path must be 'A' or 'B', got ${JSON.stringify(raw.path)}`);
  }
  return raw.path;
}

/** Count `optional: true` lines that sit on/near a visible: "Streaming" assert. */
function countOptionalStreamingAsserts(yml: string): number {
  const lines = yml.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!/visible:\s*["']Streaming["']/.test(line)) continue;
    // optional:true may be on same block (next few lines) or same line
    const window = lines.slice(i, i + 4).join('\n');
    if (/optional:\s*true/.test(window)) count += 1;
  }
  return count;
}

function countRequiredStreamingAsserts(yml: string): number {
  const lines = yml.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!/visible:\s*["']Streaming["']/.test(line)) continue;
    const window = lines.slice(i, i + 4).join('\n');
    if (!/optional:\s*true/.test(window)) count += 1;
  }
  return count;
}

function countVisibleStreamingAsserts(yml: string): number {
  return (yml.match(/visible:\s*["']Streaming["']/g) ?? []).length;
}

describe('REDHAT-FIX-01 Streaming seed closeout', () => {
  it('AC-1: after seed:e2e --reset, PATH-A Streaming count==1 with messages>=1 (or PATH-B recorded)', () => {
    mkdirSync(dirname(PATH_JSON), { recursive: true });
    // PATH-A preferred; record choice before observing seed rows.
    if (!existsSync(PATH_JSON)) {
      writeFileSync(PATH_JSON, `${JSON.stringify({ path: 'A' })}\n`, 'utf8');
    }
    const pathChoice = readPathChoice();
    expect(['A', 'B']).toContain(pathChoice);

    const seed = runHolo(['seed:e2e', '--reset', '--json'], { timeoutMs: 180_000 });
    expect(seed.status, `seed:e2e must exit 0: ${seed.combined}`).toBe(0);

    const streamingCount = psqlScalar(
      `SELECT count(*)::int FROM conversations WHERE title = 'Streaming'`
    );
    expect(streamingCount, 'psql conversations title Streaming count').toBeGreaterThanOrEqual(0);

    if (pathChoice === 'A') {
      expect(
        streamingCount,
        'PATH-A: conversations title=Streaming must equal 1 after seed:e2e --reset'
      ).toBe(1);

      const msgCount = psqlScalar(
        `SELECT count(*)::int FROM chat_messages m
         JOIN conversations c ON c.id::text = m.conversation_id
         WHERE c.title = 'Streaming'`
      );
      expect(
        msgCount,
        'PATH-A: chat_messages for Streaming conversation must be >= 1'
      ).toBeGreaterThanOrEqual(1);

      const totalConversations = psqlScalar(`SELECT count(*)::int FROM conversations`);
      expect(
        totalConversations,
        'PATH-A: conversations count must be 5 (Alpha/Beta/Gamma + Streaming + Sprint 20 reference)'
      ).toBe(5);
    } else {
      // PATH-B: fixture honesty — S-REACTIVE-01 AC-1 must not claim seeded Streaming
      const reactive = readFileSync(S_REACTIVE_01, 'utf8');
      expect(reactive).not.toMatch(/GIVEN:.*seeded 'Streaming'/i);
      const gate = readFileSync(GATE_RESULTS_MD, 'utf8');
      expect(gate).not.toMatch(/seeds the Streaming conversation/i);
    }
  }, 200_000);

  it('AC-2: PATH-A Maestro Streaming asserts are required (optional:true count==0)', () => {
    const pathChoice = readPathChoice();

    if (pathChoice === 'A') {
      const reconnect = readFileSync(
        join(REPO_ROOT, '.maestro/reactive/reconnect-exactly-once.yml'),
        'utf8'
      );
      const requiredInReconnect = countRequiredStreamingAsserts(reconnect);
      expect(
        requiredInReconnect,
        'PATH-A: reconnect-exactly-once.yml must have >=1 required Streaming assert'
      ).toBeGreaterThanOrEqual(1);

      let optionalTotal = 0;
      for (const flow of MAESTRO_STREAMING_FLOWS) {
        const yml = readFileSync(join(REPO_ROOT, '.maestro/reactive', flow), 'utf8');
        optionalTotal += countOptionalStreamingAsserts(yml);
      }
      expect(optionalTotal, 'PATH-A: optional:true adjacent to Streaming asserts must be 0').toBe(
        0
      );
    } else {
      let visibleTotal = 0;
      for (const flow of MAESTRO_STREAMING_FLOWS) {
        const yml = readFileSync(join(REPO_ROOT, '.maestro/reactive', flow), 'utf8');
        visibleTotal += countVisibleStreamingAsserts(yml);
      }
      expect(
        visibleTotal,
        'PATH-B: visible Streaming assert count must be 0 in .maestro/reactive/'
      ).toBe(0);
    }
  });

  it('AC-3: fixture + gate language matches seed reality for chosen path', () => {
    const pathChoice = readPathChoice();
    const seedSrc = readFileSync(SEED_E2E, 'utf8');
    const sprint = readFileSync(SPRINT_MD, 'utf8');
    const gate = readFileSync(GATE_RESULTS_MD, 'utf8');

    if (pathChoice === 'A') {
      const titleMatches = (seedSrc.match(/['"]Streaming['"]/g) ?? []).length;
      expect(
        titleMatches,
        "PATH-A: seed-e2e.ts must contain title 'Streaming' at least once"
      ).toBeGreaterThanOrEqual(1);
      expect(seedSrc).toMatch(/E2E_STREAMING_CONVERSATION_ID/);
      // The sprint names the Streaming fixture, while the human verdict binds
      // that claim to the real seed command and the exact reconnect flow whose
      // required Streaming assertion is checked in AC-2.
      expect(sprint).toMatch(/Streaming/);
      expect(gate).toMatch(/seed:e2e/i);
      expect(gate).toMatch(/reconnect-exactly-once/i);
    } else {
      expect(gate).not.toMatch(/seeds the Streaming conversation/i);
      const reactive = readFileSync(S_REACTIVE_01, 'utf8');
      expect(reactive).not.toMatch(/GIVEN:.*seeded 'Streaming'/i);
    }
  });
});
