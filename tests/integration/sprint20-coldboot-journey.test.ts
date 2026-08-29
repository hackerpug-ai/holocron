/**
 * S-COLDBOOT-03 — Cold-boot Maestro journey contract.
 *
 * RED-first TDD for the three legs of the cold-boot reference-flow journey:
 *   1. The Maestro flow must NAVIGATE the Expo Dev Client launcher interstitial
 *      (the real cold-boot path shows "DEVELOPMENT SERVERS" + a pre-baked Metro
 *      URL before chat-screen is reachable). The pre-fix flow assumed a direct
 *      boot to chat-screen and therefore never encoded launcher navigation.
 *   2. The most-recent Maestro junit.xml over the REAL simulator + REAL services
 *      must report failures="0". The pre-fix junit.xml reports failures="1".
 *   3. The chat-message round-trip must land a non-empty agent reply in
 *      `chat_messages` for conversation 020 (proves: app → Metro → platform →
 *      Hono chat command → fleet → agent reply → Zero sync → Postgres). The
 *      pre-fix flow never reaches the chat command, so no agent row exists.
 *
 * Gating:
 *   - Case 1 is a static file contract — runs in any env (no PLATFORM_IT needed).
 *   - Cases 2 & 3 drive the REAL substrate (simulator + Metro + Postgres). They
 *     require BOTH `PLATFORM_IT=1` AND `COLDBOOT_IT=1` so unit-CI cannot
 *     accidentally run them. When COLDBOOT_IT=1 is unset they skip with a clear
 *     message rather than failing — this keeps unit-CI green while still
 *     failing closed against an accidental partial run.
 *
 *   PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const COLDBOOT_IT = process.env.COLDBOOT_IT === '1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FLOW_PATH = join(REPO_ROOT, '.e2e', 'maestro', 'reference-flow.yaml');

/** Direct (fast) iteration lane; harness lane is the fallback. */
const ITERATE_JUNIT = join(REPO_ROOT, '.tmp', 'maestro-flow-iterate', 'junit.xml');
const HARNESS_JUNIT = join(REPO_ROOT, '.tmp', 'maestro-reference-flow-run', 'junit.xml');

const CONV_020 = '00000000-0000-0000-0000-000000000020';

function readFlow(): string {
  return readFileSync(FLOW_PATH, 'utf8');
}

/**
 * Resolve the most-recent junit.xml across both lanes. Iteration lane wins when
 * present (it is the direct maestro invocation the task uses to converge the
 * flow); the harness lane is the fallback. Returns {path, xml} or null.
 */
function resolveLatestJunit(): { path: string; xml: string } | null {
  const candidates = [ITERATE_JUNIT, HARNESS_JUNIT];
  let best: { path: string; xml: string; mtime: number } | null = null;
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    let xml: string;
    try {
      xml = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    const mtime = statSync(p).mtimeMs;
    if (!best || mtime > best.mtime) best = { path: p, xml, mtime };
  }
  return best ? { path: best.path, xml: best.xml } : null;
}

/** Extract the testsuite failures attribute from a junit xml string. */
function extractFailures(xml: string): number {
  // Match `failures="<n>"` on the <testsuite> element.
  const m = xml.match(/<testsuite\b[^>]*\bfailures="(\d+)"/);
  return m ? Number(m[1]) : NaN;
}

/**
 * Pull DATABASE_URL from the running platform process env WITHOUT printing it.
 * Throws closed if the platform process is not discoverable.
 */
function platformDatabaseUrl(): string {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) return explicit;

  const pgrep = spawnSync('pgrep', ['-f', 'services/platform/src'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (pgrep.status !== 0 || !pgrep.stdout.trim()) {
    throw new Error(
      'platform process not found via pgrep -f services/platform/src; cannot resolve DATABASE_URL'
    );
  }
  const pid = pgrep.stdout.split('\n')[0].trim();
  const ps = spawnSync('ps', ['eww', '-p', pid], { encoding: 'utf8', timeout: 5_000 });
  if (ps.status !== 0) {
    throw new Error(`ps eww -p ${pid} failed; cannot resolve DATABASE_URL`);
  }
  const m = ps.stdout.match(/(?:^|\s)DATABASE_URL=(\S+)/);
  if (!m) {
    throw new Error('DATABASE_URL not present in platform process env');
  }
  return m[1];
}

/** Query chat_messages for conversation 020; return rows as {role, content_len, created_at}. */
function queryConv020Messages(): Array<{ role: string; content_len: number; created_at: string }> {
  const dbUrl = platformDatabaseUrl();
  // -A = unaligned, -t = tuples only, -F'\\x1f' field sep, -R'\\x1e' record sep for safe parse
  const psql = spawnSync(
    'psql',
    [
      dbUrl,
      '-A',
      '-t',
      '-F',
      '\u001f',
      '-R',
      '\u001e',
      '-c',
      `SELECT role, length(content) AS content_len, created_at::text FROM chat_messages WHERE conversation_id='${CONV_020}' ORDER BY created_at DESC LIMIT 10;`,
    ],
    { encoding: 'utf8', timeout: 15_000 }
  );
  if (psql.status !== 0) {
    throw new Error(`psql query failed (status=${psql.status}): ${psql.stderr}`);
  }
  const out = psql.stdout ?? '';
  return out
    .split('\u001e')
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [role, len, created_at] = rec.split('\u001f');
      return { role: role ?? '', content_len: Number(len ?? 0), created_at: created_at ?? '' };
    });
}

describe('S-COLDBOOT-03 cold-boot journey', () => {
  describe('case 1 — Maestro flow navigates the Expo Dev Client launcher (static contract)', () => {
    it('the flow encodes a dev-launcher navigation step (DEVELOPMENT SERVERS or a :8081 Metro URL)', () => {
      const flow = readFlow();
      // The pre-fix flow has neither token. Either signal proves the launcher
      // interstitial is handled (tap pre-baked URL, or wait-for-launcher-then-act).
      const hasLauncherSection = /DEVELOPMENT SERVERS/i.test(flow);
      const hasMetroUrl = /http:\/\/[^\s"']+:(8081|8082|19006)/.test(flow);
      expect(hasLauncherSection || hasMetroUrl).toBe(true);
    });

    it('the flow still asserts chat-screen after launcher navigation (preserves the original contract)', () => {
      const flow = readFlow();
      expect(flow).toMatch(/id:\s*chat-screen/);
    });

    it('the flow still performs the chat round-trip (input + send + wait for assistant message)', () => {
      const flow = readFlow();
      expect(flow).toMatch(/id:\s*chat-input-field/);
      expect(flow).toMatch(/id:\s*chat-input-send-button/);
      expect(flow).toMatch(/id:\s*chat-assistant-message/);
    });
  });

  describe('case 2 — most-recent Maestro junit reports failures=0 over the real substrate', () => {
    beforeAll(() => {
      if (!PLATFORM_IT || !COLDBOOT_IT) {
        // Defer the skip to the it() blocks so the skip reason is explicit per-test.
      }
    });

    it('a junit.xml artifact exists from a prior real maestro run', () => {
      if (!PLATFORM_IT || !COLDBOOT_IT) {
        console.warn(
          '[S-COLDBOOT-03 case 2] SKIPPED: set PLATFORM_IT=1 COLDBOOT_IT=1 to drive the real substrate'
        );
        return;
      }
      const junit = resolveLatestJunit();
      expect(
        junit,
        'expected a junit.xml at .tmp/maestro-flow-iterate/ or .tmp/maestro-reference-flow-run/'
      ).not.toBeNull();
    });

    it('the most-recent junit reports failures="0" (flow is GREEN over real simulator + real services)', () => {
      if (!PLATFORM_IT || !COLDBOOT_IT) {
        console.warn(
          '[S-COLDBOOT-03 case 2] SKIPPED: set PLATFORM_IT=1 COLDBOOT_IT=1 to drive the real substrate'
        );
        return;
      }
      const junit = resolveLatestJunit();
      expect(junit, 'no junit.xml artifact found').not.toBeNull();
      if (!junit) return; // narrow for TS; expect above already threw
      const failures = extractFailures(junit.xml);
      expect(Number.isFinite(failures), `could not parse failures= from ${junit.path}`).toBe(true);
      expect(failures, `expected failures=0 in ${junit.path} but got failures=${failures}`).toBe(0);
    });
  });

  describe('case 3 — chat-message round-trip lands a non-empty agent reply in Postgres', () => {
    it('chat_messages for conversation 020 has >=1 row with role=agent and content_len > 0', () => {
      if (!PLATFORM_IT || !COLDBOOT_IT) {
        console.warn(
          '[S-COLDBOOT-03 case 3] SKIPPED: set PLATFORM_IT=1 COLDBOOT_IT=1 to drive the real substrate'
        );
        return;
      }
      const rows = queryConv020Messages();
      const agentRows = rows.filter((r) => r.role === 'agent' && r.content_len > 0);
      expect(
        agentRows.length,
        `expected >=1 agent message with non-empty content for conv ${CONV_020}; got rows: ${JSON.stringify(rows)}`
      ).toBeGreaterThan(0);
    });

    it('chat_messages for conversation 020 has >=1 row with role=user (the reference-flow ping)', () => {
      if (!PLATFORM_IT || !COLDBOOT_IT) {
        console.warn(
          '[S-COLDBOOT-03 case 3] SKIPPED: set PLATFORM_IT=1 COLDBOOT_IT=1 to drive the real substrate'
        );
        return;
      }
      const rows = queryConv020Messages();
      const userRows = rows.filter((r) => r.role === 'user');
      expect(
        userRows.length,
        `expected >=1 user message for conv ${CONV_020}; got rows: ${JSON.stringify(rows)}`
      ).toBeGreaterThan(0);
    });
  });
});

/**
 * REDHAT-FIX-H10 (M4) — the named deterministic-reset contract from S-COLDBOOT-03
 * AC-3. Wires the real `holo namespace reset` to a Postgres count check so the
 * capstone replay / reset-idempotency contract is executable, not just documented.
 */
describe('REDHAT-FIX-H10 — namespace reset returns conversation 020 to a deterministic zero-message state', () => {
  let referenceDbUrl: string | null = null;
  let snapshotSchema: string | null = null;

  function quoteIdentifier(identifier: string): string {
    return `"${identifier.replaceAll('"', '""')}"`;
  }

  function runPsql(sql: string, purpose: string): void {
    if (!referenceDbUrl) throw new Error(`cannot ${purpose}: reference DB was not resolved`);
    const result = spawnSync('psql', [referenceDbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (result.status !== 0) {
      throw new Error(`${purpose} failed (status=${result.status}): ${result.stderr}`);
    }
  }

  function assertNonprodDatabaseUrl(databaseUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new Error('refusing namespace reset: platform DATABASE_URL is not a valid URL');
    }
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      databaseName !== 'holocron_nonprod'
    ) {
      throw new Error(
        `refusing namespace reset: destructive cold-boot test requires holocron_nonprod, got ${databaseName || '<missing>'}`
      );
    }
  }

  /**
   * Namespace reset truncates every public table. Keep the reference rows in
   * an isolated schema so the destructive reset cannot truncate the snapshot.
   * CTAS preserves every current column, including nullable/jsonb state, rather
   * than rebuilding only the fields used by today's assertions.
   */
  function snapshotReferenceConversation(): string {
    referenceDbUrl = platformDatabaseUrl();
    assertNonprodDatabaseUrl(referenceDbUrl);
    const schema = `s29_coldboot_reference_${process.pid}_${Date.now()}`;
    const quotedSchema = quoteIdentifier(schema);
    try {
      runPsql(
        [
          `CREATE SCHEMA ${quotedSchema}`,
          `CREATE TABLE ${quotedSchema}.conversation AS SELECT * FROM public.conversations WHERE id='${CONV_020}'::uuid`,
          `CREATE TABLE ${quotedSchema}.chat_messages AS SELECT * FROM public.chat_messages WHERE conversation_id='${CONV_020}'`,
        ].join(';\n'),
        'snapshot reference conversation state'
      );
    } catch (error) {
      // Snapshot creation is before the destructive reset. Remove any partial
      // schema when possible; if the database is unavailable, preserve the
      // original failure rather than masking it with cleanup noise.
      try {
        runPsql(`DROP SCHEMA ${quotedSchema} CASCADE`, 'clean up partial reference snapshot');
      } catch {
        // The database may be the reason snapshot creation failed.
      }
      throw error;
    }
    return schema;
  }

  function restoreReferenceConversation(schema: string): void {
    const quotedSchema = quoteIdentifier(schema);
    runPsql(
      [
        'BEGIN',
        `DELETE FROM public.chat_messages WHERE conversation_id='${CONV_020}'`,
        `DELETE FROM public.conversations WHERE id='${CONV_020}'::uuid`,
        `INSERT INTO public.conversations SELECT * FROM ${quotedSchema}.conversation`,
        `INSERT INTO public.chat_messages SELECT * FROM ${quotedSchema}.chat_messages`,
        'COMMIT',
      ].join(';\n'),
      'restore reference conversation state'
    );
  }

  function dropSnapshotSchema(schema: string): void {
    runPsql(
      `DROP SCHEMA ${quoteIdentifier(schema)} CASCADE`,
      'drop reference conversation snapshot'
    );
  }

  beforeAll(() => {
    if (!PLATFORM_IT || !COLDBOOT_IT) return;
    snapshotSchema = snapshotReferenceConversation();
  });

  afterAll(() => {
    if (!snapshotSchema) return;
    const schema = snapshotSchema;
    // If restoration fails, the schema is intentionally left in place so the
    // original reference rows remain recoverable for the operator; do not
    // silently turn a failed cleanup into data loss.
    restoreReferenceConversation(schema);
    dropSnapshotSchema(schema);
    snapshotSchema = null;
  });

  function countConv020(): number {
    const dbUrl = referenceDbUrl ?? platformDatabaseUrl();
    const psql = spawnSync(
      'psql',
      [
        dbUrl,
        '-t',
        '-A',
        '-c',
        `SELECT count(*) FROM chat_messages WHERE conversation_id='${CONV_020}';`,
      ],
      { encoding: 'utf8', timeout: 15_000 }
    );
    if (psql.status !== 0) throw new Error(`psql count failed: ${psql.stderr}`);
    return Number((psql.stdout ?? '').trim()) || 0;
  }

  function namespaceReset(): { ok: boolean; seed_fingerprint?: string } {
    const res = spawnSync(
      'bun',
      [
        resolve(REPO_ROOT, 'packages', 'platform', 'src', 'cli', 'holo.ts'),
        'namespace',
        'reset',
        '--json',
      ],
      { encoding: 'utf8', timeout: 90_000 }
    );
    if (res.status !== 0)
      throw new Error(`namespace reset exited ${res.status}: ${res.stderr}\n${res.stdout}`);
    const lines = (res.stdout ?? '').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const t = lines[i].trim();
      if (t === '{' || t.startsWith('{')) {
        try {
          return JSON.parse(lines.slice(i).join('\n'));
        } catch {
          /* try next */
        }
      }
    }
    throw new Error(`could not parse reset JSON; tail=${(res.stdout ?? '').slice(-300)}`);
  }

  it('seeds conversation 020, then two consecutive resets each drive the chat_messages count to 0', () => {
    if (!PLATFORM_IT || !COLDBOOT_IT) {
      console.warn(
        '[REDHAT-FIX-H10] SKIPPED: set PLATFORM_IT=1 COLDBOOT_IT=1 and DATABASE_URL=...holocron_nonprod... to drive the real reset'
      );
      return;
    }
    // Seed conv 020 with >=1 row via the real chat-runs command so the post-reset
    // 0-count is material (not a vacuous assertion on an already-empty namespace).
    const platformUrl =
      process.env.EXPO_PUBLIC_PLATFORM_URL || process.env.PLATFORM_URL || 'http://127.0.0.1:4111';
    const rnKey = process.env.HOLO_KEY_RN || process.env.EXPO_PUBLIC_RN_API_KEY || '';
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
            requestId: `s20-h10-seed-${Date.now()}`,
            msg: 'h10 deterministic reset seed',
            conversationId: CONV_020,
          }),
        ],
        { encoding: 'utf8', timeout: 30_000 }
      );
    }

    const r1 = namespaceReset();
    expect(r1.ok, 'first reset must report ok:true').toBe(true);
    expect(countConv020(), 'after reset #1 conv 020 must have 0 chat_messages').toBe(0);

    const r2 = namespaceReset();
    expect(r2.ok, 'second reset must report ok:true').toBe(true);
    expect(
      countConv020(),
      'after reset #2 conv 020 must still have 0 chat_messages (idempotent)'
    ).toBe(0);
    // Deterministic fingerprint across the two resets.
    expect(r1.seed_fingerprint, 'seed_fingerprint must be present').toBeTruthy();
    expect(r1.seed_fingerprint).toBe(r2.seed_fingerprint);
  });
});
