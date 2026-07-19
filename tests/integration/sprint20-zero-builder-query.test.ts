/**
 * S-COLDBOOT-02 — Zero builder-query contract (cold-boot unblock).
 *
 * RED-first TDD for the three contracts that, when green, prove the chat
 * read-side is unblocked for the cold-boot reference flow:
 *
 *   1. Static contract: `app/zero/queries.ts` MUST NOT use `defineQuery` or
 *      `defineQueries`. Zero 1.8.0 zero-cache cannot evaluate custom/named
 *      queries without a separate ZERO_QUERY_URL server, and that server is
 *      not part of the sprint-20 substrate. Pre-refactor: FAILS (defineQuery
 *      and defineQueries are both present).
 *
 *   2. Static contract: `app/zero/queries.ts` MUST export a builder-returning
 *      function named `chatMessagesByConversation` that zero-cache can
 *      evaluate without a ZERO_QUERY_URL. The consumer calls it with the
 *      conversationId at the call site. Pre-refactor: FAILS (the export does
 *      not exist; the file exports a `queries` registry instead).
 *
 *   3. Integration contract (COLDBOOT_IT=1 PLATFORM_IT=1 gated): the most
 *      recent `.tmp/coldboot-02/junit.xml` produced by `maestro test
 *      .e2e/maestro/reference-flow.yaml` over the real simulator + real
 *      services MUST report `failures="0"`. Pre-refactor: FAILS (prior runs
 *      fail at chat-assistant-message visibility because zero-cache returns
 *      0 rows for the chatMessages.byConversation named query).
 *
 * Gating:
 *   - Cases 1 & 2 are static file contracts — run in any env (no live
 *     substrate needed).
 *   - Case 3 drives the REAL substrate (simulator + Metro + Postgres). It
 *     requires BOTH `PLATFORM_IT=1` AND `COLDBOOT_IT=1` so unit-CI cannot
 *     accidentally run it. When either flag is unset it skips with a clear
 *     console.warn rather than failing — this keeps unit-CI green while
 *     still failing closed against an accidental partial run.
 *
 *   PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-zero-builder-query.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const COLDBOOT_IT = process.env.COLDBOOT_IT === '1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const QUERIES_PATH = join(REPO_ROOT, 'app', 'zero', 'queries.ts');
const COLDBOOT_JUNIT = join(REPO_ROOT, '.tmp', 'coldboot-02', 'junit.xml');

function readQueries(): string {
  return readFileSync(QUERIES_PATH, 'utf8');
}

/** Extract the testsuite failures attribute from a junit xml string. */
function extractFailures(xml: string): number {
  const m = xml.match(/<testsuite\b[^>]*\bfailures="(\d+)"/);
  return m ? Number(m[1]) : NaN;
}

describe('S-COLDBOOT-02 Zero builder-query contract', () => {
  describe('case 1 — queries.ts MUST NOT use defineQuery / defineQueries (no ZERO_QUERY_URL)', () => {
    it('app/zero/queries.ts contains no defineQuery import or call', () => {
      const src = readQueries();
      // `\bdefineQuery\b` matches the exact token, not `defineQueries` or
      // `defineQueryWithType`. If this fails, zero-cache cannot evaluate the
      // query without a separate ZERO_QUERY_URL server (which is not deployed
      // in the sprint-20 substrate).
      expect(
        src,
        'defineQuery must be removed from app/zero/queries.ts; zero-cache cannot evaluate it'
      ).not.toMatch(/\bdefineQuery\b/);
    });

    it('app/zero/queries.ts contains no defineQueries import or call', () => {
      const src = readQueries();
      expect(
        src,
        'defineQueries must be removed from app/zero/queries.ts; zero-cache cannot evaluate the resulting named queries'
      ).not.toMatch(/\bdefineQueries\b/);
    });
  });

  describe('case 2 — queries.ts exports a builder-returning chatMessagesByConversation', () => {
    it('app/zero/queries.ts exports `chatMessagesByConversation`', () => {
      const src = readQueries();
      expect(
        src,
        'expected an export named `chatMessagesByConversation` (builder-returning function)'
      ).toMatch(/export\s+(?:const|function)\s+chatMessagesByConversation\b/);
    });

    it('chatMessagesByConversation delegates to a chat_messages builder chain (conversation_id filter, created_at asc order)', () => {
      const src = readQueries();
      // The builder chain that the exported function returns MUST filter on
      // conversation_id and order by created_at ascending — these are the
      // contract guarantees the consumer (chat/reference.tsx) and the
      // integration test rely on.
      expect(src).toMatch(/builder\.chat_messages\b/);
      expect(src).toMatch(/\.where\(\s*['"]conversation_id['"]/);
      expect(src).toMatch(/\.orderBy\(\s*['"]created_at['"]/);
    });
  });

  describe('case 3 — cold-boot maestro flow over real substrate reports failures=0', () => {
    it('a .tmp/coldboot-02/junit.xml artifact exists from a real maestro run', () => {
      if (!PLATFORM_IT || !COLDBOOT_IT) {
        console.warn(
          '[S-COLDBOOT-02 case 3] SKIPPED: set PLATFORM_IT=1 COLDBOOT_IT=1 to drive the real substrate'
        );
        return;
      }
      expect(
        existsSync(COLDBOOT_JUNIT),
        `no junit.xml found at ${COLDBOOT_JUNIT}; run the cold-boot maestro flow first (see .e2e/maestro/reference-flow.yaml)`
      ).toBe(true);
    });

    it('the most-recent coldboot-02 junit reports failures="0" (chat-assistant-message mounts over real services)', () => {
      if (!PLATFORM_IT || !COLDBOOT_IT) {
        console.warn(
          '[S-COLDBOOT-02 case 3] SKIPPED: set PLATFORM_IT=1 COLDBOOT_IT=1 to drive the real substrate'
        );
        return;
      }
      if (!existsSync(COLDBOOT_JUNIT)) {
        // The previous `it()` already failed with a clear message; bail out
        // of this assertion rather than masking it with a parse error.
        return;
      }
      const xml = readFileSync(COLDBOOT_JUNIT, 'utf8');
      const failures = extractFailures(xml);
      expect(
        Number.isFinite(failures),
        `could not parse failures= from ${COLDBOOT_JUNIT}`
      ).toBe(true);
      expect(
        failures,
        `expected failures=0 in ${COLDBOOT_JUNIT} but got failures=${failures}`
      ).toBe(0);
    });
  });
});
