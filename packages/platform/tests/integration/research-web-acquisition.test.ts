/**
 * Wave 2 — Jina-primary / Exa-fallback web acquisition + research_web_calls ledger.
 *
 * Fail-closed: beforeAll THROWS if Postgres unreachable, DATABASE_URL lacks
 * holocron_nonprod, or JINA_API_KEY / EXA_API_KEY missing. NO it.skip.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   FLEET_URL=http://127.0.0.1:4545/v1 \
 *   pnpm vitest run --project integration \
 *     packages/platform/tests/integration/research-web-acquisition.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSecretValue } from '../../src/config/secrets.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createWebCallLedger } from '../../src/research/web-call-ledger.ts';
import { exaSearch } from '../../src/web/exa.ts';
import { WEB_FETCH_NOT_OK } from '../../src/web/http.ts';
import { jinaRead, jinaSearch } from '../../src/web/jina.ts';
import { ladderSearch } from '../../src/web/provider.ts';
import type { SearchHit } from '../../src/web/types.ts';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';

const SEARCH_QUERY = 'qwen3 reranker';
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T/;

function assertNeverUndefinedPublishedAt(hits: SearchHit[]): void {
  for (const hit of hits) {
    expect(Object.hasOwn(hit, 'publishedAt'), `publishedAt missing on ${hit.url}`).toBe(true);
    expect(hit.publishedAt === null || typeof hit.publishedAt === 'string').toBe(true);
    expect(hit.publishedAt).not.toBeUndefined();
    if (typeof hit.publishedAt === 'string') {
      expect(hit.publishedAt).toMatch(ISO_LIKE);
    }
  }
}

describe('Wave 2 research web acquisition', () => {
  let sql: Sql;
  let runId: string;

  beforeAll(async () => {
    if (!DATABASE_URL.includes('holocron_nonprod')) {
      throw new Error(
        `DATABASE_URL must target holocron_nonprod (got ${DATABASE_URL}). Refusing to run.`
      );
    }
    const jina = getSecretValue('JINA_API_KEY');
    const exa = getSecretValue('EXA_API_KEY');
    if (!jina) throw new Error('JINA_API_KEY missing — refuse silent skip');
    if (!exa) throw new Error('EXA_API_KEY missing — refuse silent skip');

    try {
      sql = createSql(DATABASE_URL);
      await sql`SELECT 1`;
    } catch (err) {
      throw new Error(
        `Postgres unreachable for ${DATABASE_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    const table = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'research_web_calls'
      ) AS exists
    `;
    if (!table[0]?.exists) {
      throw new Error('research_web_calls missing — apply migration 0039 first');
    }

    // session_id FK requires a real research_sessions row when we pass a UUID runId.
    runId = randomUUID();
    await sql`
      INSERT INTO research_sessions (id, system, status, query)
      VALUES (${runId}::uuid, 'simple', 'pending', ${'wave2-web-acq'})
    `;
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    try {
      if (runId) {
        await sql`DELETE FROM research_web_calls WHERE session_id = ${runId}::uuid`;
        await sql`DELETE FROM research_sessions WHERE id = ${runId}::uuid`;
      }
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
  });

  it('TC-1: search both Jina and Exa → ≥3 hits; ≥1 non-null publishedAt; never undefined', async () => {
    const ledger = createWebCallLedger(sql);
    const jina = await jinaSearch({
      query: SEARCH_QUERY,
      runId,
      ledger,
      num: 8,
    });
    const exa = await exaSearch({
      query: SEARCH_QUERY,
      runId,
      ledger,
      numResults: 5,
    });

    expect(jina.hits.length).toBeGreaterThanOrEqual(3);
    expect(exa.hits.length).toBeGreaterThanOrEqual(3);

    assertNeverUndefinedPublishedAt(jina.hits);
    assertNeverUndefinedPublishedAt(exa.hits);

    const corpus = [...jina.hits, ...exa.hits];
    const dated = corpus.filter((h) => h.publishedAt != null);
    expect(
      dated.length,
      `expected ≥1 dated hit across providers; jina=${jina.hits
        .map((h) => h.publishedAt)
        .join('|')} exa=${exa.hits.map((h) => h.publishedAt).join('|')}`
    ).toBeGreaterThanOrEqual(1);

    expect(jina.call.webCallId).toBeTruthy();
    expect(exa.call.webCallId).toBeTruthy();
    expect(jina.call.provider).toBe('jina');
    expect(exa.call.provider).toBe('exa');
  }, 120_000);

  it('TC-2 date parity: publishedAt is string|null (ISO-like when present) on both rungs', async () => {
    const ledger = createWebCallLedger(sql);
    const jina = await jinaSearch({ query: SEARCH_QUERY, runId, ledger, num: 5 });
    const exa = await exaSearch({ query: SEARCH_QUERY, runId, ledger, numResults: 3 });
    assertNeverUndefinedPublishedAt(jina.hits);
    assertNeverUndefinedPublishedAt(exa.hits);
  }, 90_000);

  it('TC-3: read a URL that 404s → WEB_FETCH_NOT_OK, never ranked as a source', async () => {
    const ledger = createWebCallLedger(sql);
    let caught: unknown;
    try {
      await jinaRead({
        url: 'https://httpstat.us/404',
        runId,
        ledger,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, 'expected WEB_FETCH_NOT_OK on 404 read').toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(new RegExp(`^${WEB_FETCH_NOT_OK}:`));
  }, 60_000);

  it('TC-4: absurd query returns [] without throwing and without descending', async () => {
    const ledger = createWebCallLedger(sql);
    // site: on a non-existent TLD reliably yields zero hits (Jina soft-422 / Exa []).
    const nonce = `site:this-domain-definitely-does-not-exist-zzz.invalid xyzzyplugh_${randomUUID().replaceAll('-', '')}`;
    const result = await ladderSearch(nonce, { runId, ledger });
    expect(result.hits).toEqual([]);
    expect(result.ladderTrace.length).toBeGreaterThanOrEqual(1);
    expect(result.ladderTrace[0]?.outcome).toBe('empty');
    // Must NOT have descended to a second provider on honest empty.
    expect(result.ladderTrace.every((t) => t.outcome !== 'transport_error')).toBe(true);
    expect(result.ladderTrace.filter((t) => t.outcome === 'empty').length).toBe(1);
    expect(result.ladderTrace.length).toBe(1);
  }, 60_000);

  it('TC-5: persist — research_web_calls row count equals HTTP calls for this runId', async () => {
    // Fresh session so the count is exactly the calls we make here.
    const localRunId = randomUUID();
    await sql`
      INSERT INTO research_sessions (id, system, status, query)
      VALUES (${localRunId}::uuid, 'simple', 'pending', ${'wave2-web-acq-tc5'})
    `;
    const ledger = createWebCallLedger(sql);

    try {
      const jina = await jinaSearch({
        query: SEARCH_QUERY,
        runId: localRunId,
        ledger,
        num: 3,
      });
      const exa = await exaSearch({
        query: SEARCH_QUERY,
        runId: localRunId,
        ledger,
        numResults: 3,
      });
      const expectedCalls = 2; // one HTTP search each
      expect(jina.call.webCallId).toBeTruthy();
      expect(exa.call.webCallId).toBeTruthy();

      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM research_web_calls
        WHERE session_id = ${localRunId}::uuid
      `;
      expect(Number(rows[0]?.count ?? 0)).toBe(expectedCalls);

      const kinds = await sql<{ call_kind: string; provider: string }[]>`
        SELECT call_kind, provider
        FROM research_web_calls
        WHERE session_id = ${localRunId}::uuid
        ORDER BY provider
      `;
      expect(kinds.map((k) => `${k.provider}:${k.call_kind}`).sort()).toEqual([
        'exa:search',
        'jina:search',
      ]);
    } finally {
      await sql`DELETE FROM research_web_calls WHERE session_id = ${localRunId}::uuid`;
      await sql`DELETE FROM research_sessions WHERE id = ${localRunId}::uuid`;
    }
  }, 90_000);
});
