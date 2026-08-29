/**
 * search-4 AC-2 / AC-3 — RED: past-8K retrieval + recall@10 baseline.
 *
 * Seeds a golden past-8K document via REAL Postgres INSERT in beforeAll.
 * AC-2 fails with ReferenceError: chunkDocument is not defined (empty chunk.ts).
 * AC-3 fails showing "received 0 results" against absent hybridSearch/rrfHybridSearch.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Test does not seed the past-8K document and asserts on an empty table
 * - Test mocks hybridSearch to return the golden passage (false green)
 * - Test never asserts on the marker span at offset 8400
 * - recall asserts ≥ 0 (trivially satisfiable by returning nothing)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/search-recall.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 180_000;
const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-4');

const MARKER = 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ';
const DOCUMENT_ID = 'doc_golden_001';
const GOLDEN_TITLE = 'Local Re-embedding & RRF Design';
const CONTENT_HASH = 'search-4-golden-past-8k-v1';
/** T-DATA-010 recall@10 baseline — at least the golden doc must rank in top-10. */
const RECALL_BASELINE = 1;
// websearch_to_tsquery treats underscores as phrase operators. The leading
// marker touches the synthetic A-prefix, so use its unique numeric token plus
// the neighboring retrieval terms; the result oracle still requires MARKER.
const RECALL_QUERY = '8400 reciprocal rank fusion';

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function buildPast8kDocument(): string {
  // Marker at char offset 8400; total length = 10048 (fixture golden-past-8k-doc).
  // MARKER length is 28 → tail = 10048 - 8400 - 28 = 1620.
  const head = 'A'.repeat(8400);
  const tail =
    ' This section covers reciprocal rank fusion with k=60 constant in a single CTE round-trip. ' +
    'Y'.repeat(1528);
  const doc = `${head}${MARKER}${tail}`;
  // Exact construction always places marker at 8400.
  return doc.length >= 10048 && doc.indexOf(MARKER) === 8400
    ? doc
    : `${'A'.repeat(8400)}${MARKER}${'B'.repeat(1620)}`;
}

async function loadChunkDocument(): Promise<
  (
    text: string,
    opts?: { title?: string; maxTokens?: number; overlap?: number }
  ) => Array<{ text: string; ordinal: number; tokenCount?: number; situatingHeader?: string }>
> {
  const modPath = ['../../src/inference', 'chunk'].join('/');
  try {
    const mod = (await import(modPath)) as {
      chunkDocument?: (
        text: string,
        opts?: { title?: string; maxTokens?: number; overlap?: number }
      ) => Array<{ text: string; ordinal: number; tokenCount?: number; situatingHeader?: string }>;
    };
    if (typeof mod.chunkDocument !== 'function') {
      throw new ReferenceError('chunkDocument is not defined');
    }
    return mod.chunkDocument.bind(mod);
  } catch (err) {
    if (
      err instanceof ReferenceError ||
      (err instanceof Error &&
        (/Cannot find|Failed to resolve|Cannot resolve|ERR_MODULE_NOT_FOUND/i.test(err.message) ||
          err.message.includes('chunkDocument is not defined')))
    ) {
      const refErr = new ReferenceError('chunkDocument is not defined');
      refErr.cause = err instanceof ReferenceError ? err.cause : err;
      throw refErr;
    }
    throw err;
  }
}

type HybridResult = {
  results: Array<{ _id?: string; title?: string; content?: string; score?: number }>;
  totalResults: number;
  searchMethod?: string;
};

/**
 * Load rrfHybridSearch / hybridSearch when present.
 * Missing impl is NOT thrown here — callers treat absence as 0 results (AC-3 RED).
 */
async function tryLoadHybridSearch(): Promise<
  ((args: { query: string; limit?: number }) => Promise<HybridResult>) | null
> {
  const candidates = [
    ['../../src/search', 'rrf'].join('/'),
    ['../../src/search', 'index'].join('/'),
    ['../../src/search', 'hybrid'].join('/'),
  ];
  for (const modPath of candidates) {
    try {
      const mod = (await import(modPath)) as {
        rrfHybridSearch?: (...args: unknown[]) => Promise<HybridResult>;
        hybridSearch?: (...args: unknown[]) => Promise<HybridResult>;
      };
      const fn = mod.rrfHybridSearch ?? mod.hybridSearch;
      if (typeof fn === 'function') {
        return async (args) => {
          // Support both (opts) and (db, sql, opts) signatures once GREEN.
          try {
            return await (fn as (a: unknown) => Promise<HybridResult>)(args);
          } catch {
            const { createSql: mk, createDb } = await import('../../src/db/client');
            const sql = mk(resolveDatabaseUrl({ preferHolocron: true }));
            try {
              const db = createDb(sql);
              return await (fn as (db: unknown, sql: unknown, a: unknown) => Promise<HybridResult>)(
                db,
                sql,
                args
              );
            } finally {
              await sql.end({ timeout: 5 });
            }
          }
        };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

describe('search-4 AC-2/AC-3: past-8K retrieval + recall baseline (RED)', () => {
  let sql: Sql | null = null;
  let sourceId: string | null = null;
  let goldenDocText = '';
  let seeded = false;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    goldenDocText = buildPast8kDocument();
    expect(goldenDocText.length).toBeGreaterThanOrEqual(10048);
    expect(goldenDocText.indexOf(MARKER)).toBe(8400);

    // Owner/raw connection: holocron_app lacks DELETE on passages for re-seed.
    const databaseUrl = resolveDatabaseUrl({ preferHolocron: true });
    sql = createSql(databaseUrl);

    // Real DB seed (never view-injection). Idempotent on content_hash.
    const sourceRows = await sql<{ id: string }[]>`
      INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
      VALUES (
        'document',
        ${CONTENT_HASH},
        ${GOLDEN_TITLE},
        ${DOCUMENT_ID},
        ${sql.json({
          purpose: 'search-4-golden-past-8k',
          marker: MARKER,
          markerOffset: 8400,
          task: 'search-4',
        })}
      )
      ON CONFLICT (content_hash) DO UPDATE
        SET title = EXCLUDED.title,
            document_id = EXCLUDED.document_id,
            metadata_json = EXCLUDED.metadata_json
      RETURNING id::text AS id
    `;
    sourceId = sourceRows[0]?.id ?? null;
    expect(sourceId, 'golden source must be inserted into real Postgres').toBeTruthy();

    // Ensure at least one passage row exists for the golden source so the table
    // is not empty (recall must fail on missing hybrid search, not empty seed).
    // Full chunk+embed is search-1/search-2; here we store a marker-bearing tail
    // passage with NULL embedding so GREEN path can re-chunk/re-embed later.
    const existing = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM passages
      WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
      LIMIT 1
    `;
    if (existing.length === 0) {
      const markerStart = Math.max(0, 8400 - 200);
      const markerPassage = goldenDocText.slice(markerStart, markerStart + 800);
      await sql`
        INSERT INTO passages (
          source_id, document_id, ordinal, text, situating_header, embedding, metadata_json
        )
        VALUES (
          ${sourceId},
          ${DOCUMENT_ID},
          0,
          ${markerPassage},
          ${`${GOLDEN_TITLE} · past-8K marker passage`},
          NULL,
          ${sql.json({ purpose: 'search-4-seed', marker: MARKER, offset: 8400 })}
        )
      `;
    }

    const countRows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM passages
      WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
    `;
    const passageCount = Number(countRows[0]?.count ?? 0);
    expect(passageCount, 'seeded golden passage count must be ≥ 1').toBeGreaterThanOrEqual(1);
    seeded = true;

    writeArtifact('AC-2-seed-golden-past-8k.json', {
      sourceId,
      documentId: DOCUMENT_ID,
      title: GOLDEN_TITLE,
      docLength: goldenDocText.length,
      markerOffset: goldenDocText.indexOf(MARKER),
      passageCount,
      seeded,
    });
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
      sql = null;
    }
  });

  itLive('past-8K span ranks top-k', async () => {
    expect(seeded, 'beforeAll must seed golden past-8K doc').toBe(true);
    expect(goldenDocText.indexOf(MARKER)).toBe(8400);

    let caught: unknown;
    try {
      // RED: chunkDocument is not defined (search-1 not landed).
      // GREEN path: chunk → embed → search → marker ranks top-k.
      const chunkDocument = await loadChunkDocument();
      const passages = chunkDocument(goldenDocText, {
        title: GOLDEN_TITLE,
        maxTokens: 512,
        overlap: 64,
      });
      expect(passages.length).toBeGreaterThanOrEqual(2);
      const markerPassages = passages.filter((p) => p.text.includes(MARKER));
      expect(
        markerPassages.length,
        'marker ZZZ_RELEVANT_SPAN_AT_8400_ZZZ must survive chunking past char 8000'
      ).toBeGreaterThanOrEqual(1);

      const hybrid = await tryLoadHybridSearch();
      if (!hybrid) {
        throw new ReferenceError('rrfHybridSearch is not defined');
      }
      const out = await hybrid({
        query: 'reciprocal rank fusion single CTE round-trip past 8K',
        limit: 10,
      });
      expect(out.totalResults).toBeGreaterThanOrEqual(1);
      const top = out.results.slice(0, 10);
      const hit = top.some(
        (r) =>
          r.title === GOLDEN_TITLE ||
          (typeof r.content === 'string' && r.content.includes(MARKER)) ||
          r._id === sourceId
      );
      expect(hit, 'past-8K golden document must rank in top-k').toBe(true);
    } catch (err) {
      caught = err;
      writeArtifact('AC-2-red-against-start.txt', {
        test: 'past-8K span ranks top-k',
        error:
          caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
        RED_state: true,
        must_observe: 'ReferenceError: chunkDocument is not defined',
        seeded,
        sourceId,
      });
      if (caught instanceof ReferenceError) {
        expect(caught.message).toMatch(/chunkDocument is not defined/);
        throw caught;
      }
      throw caught;
    }
  });

  itLive('recall@10 >= baseline', async () => {
    expect(seeded, 'beforeAll must seed golden set').toBe(true);

    const hybrid = await tryLoadHybridSearch();
    let results: HybridResult['results'] = [];
    let totalResults = 0;

    if (hybrid) {
      const out = await hybrid({ query: RECALL_QUERY, limit: 10 });
      results = out.results ?? [];
      totalResults = out.totalResults ?? results.length;
    } else {
      // Empty impl → zero results (AC-3 RED signature).
      results = [];
      totalResults = 0;
    }

    writeArtifact('AC-3-red-against-start.txt', {
      test: 'recall@10 >= baseline',
      resultCount: results.length,
      totalResults,
      baseline: RECALL_BASELINE,
      hybridImplemented: hybrid !== null,
      RED_state: results.length < RECALL_BASELINE,
      must_observe: 'received 0 results',
    });

    // Fail with the exact observed phrase when empty (must_observe for AC-3).
    expect(
      results.length,
      `received ${results.length} results (totalResults=${totalResults}, baseline=${RECALL_BASELINE})`
    ).toBeGreaterThanOrEqual(RECALL_BASELINE);

    // GREEN: golden title or marker appears in top-10.
    const top10 = results.slice(0, 10);
    const recalled = top10.some(
      (r) =>
        r.title === GOLDEN_TITLE || (typeof r.content === 'string' && r.content.includes(MARKER))
    );
    expect(recalled, 'recall@10 must include the golden past-8K document').toBe(true);
  });
});
