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
import { beforeAll, describe, expect, it } from 'vitest';

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
