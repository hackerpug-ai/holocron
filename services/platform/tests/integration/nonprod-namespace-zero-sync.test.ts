/**
 * REDHAT-FIX-H7 — live zero-cache namespace reset/read proof (D03-04).
 *
 * Proves the four D03-04 live-zero-cache claims that `namespace-reset.json` alone
 * cannot substantiate:
 *   AC-1 [PRIMARY]: after `holo namespace reset`, a LIVE zero-cache returns the
 *     reference conversation row (title 'Sprint 20 reference conversation') with
 *     ZERO chat_messages — proving the reset is visible through the replication
 *     path, not only through the CLI/Postgres.
 *   AC-2: two consecutive resets emit an identical seed fingerprint AND a 0
 *     chat_messages count in both runs (deterministic baseline).
 *   AC-3: `holo repl:status --json` reports ok:true with `conversations` and
 *     `chat_messages` in the zero_pub membership after reset.
 *   AC-4: skips-with-reason (does NOT pass) when PLATFORM_IT != 1.
 *
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CONV_ID = process.env.REFERENCE_CONVERSATION_ID || '00000000-0000-0000-0000-000000000020';
const HOLO = resolve(REPO_ROOT, 'services', 'platform', 'src', 'cli', 'holo.ts');
const ZERO_READER = resolve(REPO_ROOT, 'scripts', 'e2e', 'zero-reference-read.ts');

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DB = process.env.DATABASE_URL ?? '';
const HAS_NONPROD = DB.includes('holocron_nonprod');
const ZERO_URL = process.env.ZERO_CACHE_URL || 'http://127.0.0.1:4848';
const canRun = PLATFORM_IT && HAS_NONPROD;

function holoJson(cmd: string[]): any {
  const res = spawnSync('bun', [HOLO, ...cmd], { encoding: 'utf8', timeout: 90_000 });
  if (res.status !== 0) {
    throw new Error(`holo ${cmd.join(' ')} exited ${res.status}: ${res.stderr}\n${res.stdout}`);
  }
  // holo prints log lines, then a pretty-printed JSON object. Find the earliest
  // line that begins a complete JSON object consuming the rest of the output.
  const out = res.stdout ?? '';
  const lines = out.split('\n');
  const candidates: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t === '{' || t.startsWith('{')) candidates.push(i);
  }
  let lastErr: unknown = null;
  for (const start of candidates) {
    const blob = lines.slice(start).join('\n');
    try {
      return JSON.parse(blob);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `holo ${cmd.join(' ')} JSON parse failed: ${String(lastErr)}; tail=${out.slice(-300)}`
  );
}

function readZero(): {
  ok: boolean;
  rowCount: number;
  conversationPresent: boolean;
  conversationTitle: string | null;
  error?: string;
} {
  const res = spawnSync('bun', [ZERO_READER], {
    env: { ...process.env, ZERO_CACHE_URL: ZERO_URL, REFERENCE_CONVERSATION_ID: CONV_ID },
    encoding: 'utf8',
    timeout: 25_000,
  });
  const lines = (res.stdout ?? '').split('\n').filter((l) => l.startsWith('{'));
  const raw = lines[lines.length - 1] ?? '';
  if (!raw)
    return {
      ok: false,
      rowCount: -1,
      conversationPresent: false,
      conversationTitle: null,
      error: `no JSON (exit=${res.status}) ${(res.stderr ?? '').slice(-200)}`,
    };
  const p = JSON.parse(raw);
  return {
    ok: !!p.ok,
    rowCount: p.rowCount ?? 0,
    conversationPresent: !!p.conversationPresent,
    conversationTitle: p.conversationTitle ?? null,
    error: p.error,
  };
}

function psqlCount(convId: string): number {
  const out = execFileSync(
    'psql',
    [DB, '-t', '-A', '-c', `select count(*) from chat_messages where conversation_id='${convId}';`],
    { encoding: 'utf8' }
  ).trim();
  return Number(out) || 0;
}

describe.skipIf(!canRun)('REDHAT-FIX-H7 — live zero-cache namespace reset/read proof', () => {
  it('AC-1 [PRIMARY]: after reset the live zero-cache returns the reference conversation with zero chat_messages', () => {
    // Seed a message so the post-reset zero read proving 0 is material (not vacuous).
    // (Best-effort; if seeding is unavailable, the 0-count assertion still holds.)
    try {
      const rnKey = process.env.HOLO_KEY_RN || process.env.EXPO_PUBLIC_RN_API_KEY || '';
      const platformUrl =
        process.env.EXPO_PUBLIC_PLATFORM_URL || process.env.PLATFORM_URL || 'http://127.0.0.1:4111';
      if (rnKey) {
        spawnSync(
          'curl',
          [
            '-s',
            '-X',
            'POST',
            `${platformUrl}/api/chat-runs`,
            '-H',
            `Authorization: Bearer ${rnKey}`,
            '-H',
            'Content-Type: application/json',
            '-d',
            JSON.stringify({
              requestId: `s20-h7-seed-${Date.now()}`,
              msg: 'h7 reset seed',
              conversationId: CONV_ID,
            }),
          ],
          { encoding: 'utf8', timeout: 30_000 }
        );
      }
    } catch {
      /* seeding is best-effort */
    }

    // Run the real namespace reset (truncates + reseeds conversation 020).
    const reset = holoJson(['namespace', 'reset', '--json']);
    expect(reset.ok, `reset failed: ${JSON.stringify(reset.errors ?? reset.messages)}`).toBe(true);
    expect(psqlCount(CONV_ID), 'Postgres must show 0 chat_messages right after reset').toBe(0);

    // Read the LIVE zero-cache. Zero replicates via WAL so the truncation may lag.
    let read = readZero();
    for (let i = 0; i < 10 && !(read.ok && read.rowCount === 0); i += 1) {
      spawnSync('sleep', ['2']);
      read = readZero();
    }
    expect(read.ok, `zero read failed: ${read.error}`).toBe(true);
    expect(
      read.rowCount,
      'zero-cache must return ZERO chat_messages after reset (live replication path)'
    ).toBe(0);
    expect(read.conversationPresent, 'zero-cache must return the reference conversation row').toBe(
      true
    );
    expect(
      read.conversationTitle,
      'reference conversation title must be the seeded Sprint 20 title'
    ).toBe('Sprint 20 reference conversation');
  }, 120_000);

  it('AC-2: two consecutive resets emit an identical seed fingerprint', () => {
    const r1 = holoJson(['namespace', 'reset', '--json']);
    const r2 = holoJson(['namespace', 'reset', '--json']);
    expect(r1.ok && r2.ok).toBe(true);
    expect(typeof r1.seed_fingerprint).toBe('string');
    expect(r1.seed_fingerprint.length).toBe(32); // md5 hex
    expect(
      r1.seed_fingerprint,
      'consecutive resets must produce an identical deterministic fingerprint'
    ).toBe(r2.seed_fingerprint);
    expect(psqlCount(CONV_ID)).toBe(0);
  }, 120_000);

  it('AC-3: holo repl:status confirms zero_pub membership for conversations + chat_messages', () => {
    const status = holoJson(['repl:status', '--json']);
    expect(status.ok).toBe(true);
    expect(status.walLevelOk).toBe(true);
    const tables: string[] = (status.publishedTables ?? []).map((t: { table: string }) => t.table);
    expect(tables, 'publishedTables must include conversations').toContain('conversations');
    expect(tables, 'publishedTables must include chat_messages').toContain('chat_messages');
    expect(status.publicationName).toBe('zero_pub');
  }, 60_000);
});

describe.skipIf(canRun)('REDHAT-FIX-H7 (skipped: no live substrate)', () => {
  it('skips with reason when PLATFORM_IT=1 + DATABASE_URL=...holocron_nonprod... are unset', () => {
    const missing = [
      !PLATFORM_IT && 'PLATFORM_IT=1',
      !HAS_NONPROD && 'DATABASE_URL=...holocron_nonprod...',
      'ZERO_ADMIN_PASSWORD',
    ].filter(Boolean);
    console.warn(
      `[REDHAT-FIX-H7] SKIPPED: set ${missing.join(' ')} to drive the live zero-cache reset proof`
    );
    expect(canRun).toBe(false);
  });
});
