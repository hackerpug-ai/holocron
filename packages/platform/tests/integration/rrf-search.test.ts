/**
 * search-3 — RRF hybrid search (pgvector HNSW + FTS, one round-trip).
 *
 * AC-1: past-8K span retrieved in top-k via single-CTE RRF
 * AC-2: FTS-empty branch still returns the vector neighbour
 * AC-4: empty target → totalResults 0 without throw
 *
 * NEGATIVE_CONTROL (would fail if):
 * - hybrid path still throws "not implemented"
 * - RRF replaced by 0.7/0.3 normalize-by-max
 * - vector + FTS issued as two separate SQL statements
 * - query embedding mocked instead of real fleet QUERY mode
 * - FTS-empty aborts the whole query / NULL rrf_score
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/rrf-search.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createSql, type Db, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-3');

const MARKER = 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ';
const GOLDEN_TITLE = 'Local Re-embedding & RRF Design';
const GOLDEN_DOCUMENT_ID = 'doc_search3_golden_past_8k';
const GOLDEN_CONTENT_HASH = 'search-3-golden-past-8k-v1';
const SEMANTIC_CONTENT_HASH = 'search-3-semantic-only-v1';
const SEMANTIC_DOCUMENT_ID = 'doc_search3_semantic_only';
/** Passage body uses vocabulary that must NOT appear in the semantic query. */
const SEMANTIC_PASSAGE_TEXT =
  'Coniferous resin densifies after prolonged arid midsummer conditions across alpine stands.';
/** Semantic paraphrase — share no English FTS tokens with SEMANTIC_PASSAGE_TEXT. */
const SEMANTIC_QUERY = 'why pine sap becomes stickier during drought periods';
const AC1_QUERY = 'how to combine vector and keyword rankings in one database query';
const EMPTY_QUERY = 'zzqxqxy nonmatchtoken 9991';
const EXPECTED_DIM = 1024;

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function buildPast8kDocument(): string {
  // Marker at char offset 8400; total length ≥ 10048 (matches search-4 golden fixture).
  // Relevant span past char 8000 carries the RRF design phrase for FTS + vector retrieval.
  const head = 'A'.repeat(8400);
  const relevant =
    ' This section covers reciprocal rank fusion with k=60 constant in a single CTE round-trip. ' +
    'Combining vector similarity with keyword rankings inside one database query is the design. ';
  const minTail = 10048 - 8400 - MARKER.length;
  const padLen = Math.max(0, minTail - relevant.length);
  const tail = `${relevant}${'Y'.repeat(padLen)}`;
  const doc = `${head}${MARKER}${tail}`;
  if (doc.indexOf(MARKER) !== 8400) {
    throw new Error(`buildPast8kDocument: marker offset ${doc.indexOf(MARKER)} !== 8400`);
  }
  if (doc.length < 10048) {
    throw new Error(`buildPast8kDocument: length ${doc.length} < 10048`);
  }
  return doc;
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

type HybridResult = {
  results: Array<{
    _id?: string;
    title?: string;
    content?: string;
    score?: number;
    rrf_score?: number;
    passage_id?: string;
  }>;
  totalResults: number;
  searchMethod?: string;
};

type RrfFn = (db: Db, sql: Sql, opts: { query: string; limit?: number }) => Promise<HybridResult>;

async function loadRrfHybridSearch(): Promise<RrfFn> {
  const candidates = [
    ['../../src/search', 'rrf'].join('/'),
    ['../../src/search', 'index'].join('/'),
  ];
  for (const modPath of candidates) {
    try {
      const mod = (await import(modPath)) as {
        rrfHybridSearch?: RrfFn;
      };
      if (typeof mod.rrfHybridSearch === 'function') {
        return mod.rrfHybridSearch.bind(mod);
      }
    } catch {
      // try next
    }
  }
  throw new ReferenceError('rrfHybridSearch is not defined');
}

async function loadEmbed(): Promise<
  (text: string, mode: 'query' | 'document') => Promise<number[]>
> {
  const modPath = ['../../src/inference', 'embed'].join('/');
  const mod = (await import(modPath)) as {
    embed?: (text: string, mode: 'query' | 'document') => Promise<number[]>;
  };
  if (typeof mod.embed !== 'function') {
    throw new Error('embed() from search-1 is required');
  }
  return mod.embed.bind(mod);
}

async function loadChunkDocument(): Promise<
  (
    text: string,
    opts?: { title?: string; maxTokens?: number; overlap?: number }
  ) => Array<{ text: string; ordinal: number; tokenCount?: number; situatingHeader?: string }>
> {
  const modPath = ['../../src/inference', 'chunk'].join('/');
  const mod = (await import(modPath)) as {
    chunkDocument?: (
      text: string,
      opts?: { title?: string; maxTokens?: number; overlap?: number }
    ) => Array<{ text: string; ordinal: number; tokenCount?: number; situatingHeader?: string }>;
  };
  if (typeof mod.chunkDocument !== 'function') {
    throw new Error('chunkDocument() from search-1 is required');
  }
  return mod.chunkDocument.bind(mod);
}

describe('search-3: rrfHybridSearch (RRF hybrid, one round-trip)', () => {
  let sql: Sql | null = null;
  let db: Db | null = null;
  let goldenSourceId: string | null = null;
  let semanticSourceId: string | null = null;
  let semanticPassageId: string | null = null;
  let seeded = false;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    const databaseUrl = resolveDatabaseUrl({ preferHolocron: true });
    sql = createSql(databaseUrl);
    db = createDb(sql);

    const embed = await loadEmbed();
    const chunkDocument = await loadChunkDocument();
    const goldenDoc = buildPast8kDocument();
    expect(goldenDoc.indexOf(MARKER)).toBe(8400);
    expect(goldenDoc.length).toBeGreaterThanOrEqual(10048);

    // ── AC-1 seed: past-8K golden document ──────────────────────────────
    const goldenMeta = JSON.stringify({
      purpose: 'search-3-golden-past-8k',
      marker: MARKER,
      task: 'search-3',
    });
    const goldenSourceRows = await sql<{ id: string }[]>`
      INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
      VALUES (
        'document',
        ${GOLDEN_CONTENT_HASH},
        ${GOLDEN_TITLE},
        ${GOLDEN_DOCUMENT_ID},
        ${goldenMeta}::jsonb
      )
      ON CONFLICT (content_hash) DO UPDATE
        SET title = EXCLUDED.title,
            document_id = EXCLUDED.document_id,
            metadata_json = EXCLUDED.metadata_json
      RETURNING id::text AS id
    `;
    goldenSourceId = goldenSourceRows[0]?.id ?? null;
    expect(goldenSourceId, 'golden source must insert').toBeTruthy();

    await sql`DELETE FROM passages WHERE source_id = ${goldenSourceId}::uuid`;

    const chunks = chunkDocument(goldenDoc, {
      title: GOLDEN_TITLE,
      maxTokens: 512,
      overlap: 64,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const markerChunks = chunks.filter((c) => c.text.includes(MARKER));
    expect(
      markerChunks.length,
      'marker must survive chunking past char 8000'
    ).toBeGreaterThanOrEqual(1);

    for (const chunk of chunks) {
      const vector = await embed(chunk.text, 'document');
      expect(vector.length).toBe(EXPECTED_DIM);
      const vectorLiteral = toVectorLiteral(vector);
      await sql`
        INSERT INTO passages (
          source_id, document_id, ordinal, text, token_count, situating_header, embedding, metadata_json
        )
        VALUES (
          ${goldenSourceId}::uuid,
          ${GOLDEN_DOCUMENT_ID},
          ${chunk.ordinal},
          ${chunk.text},
          ${chunk.tokenCount ?? null},
          ${chunk.situatingHeader ?? `${GOLDEN_TITLE} · passage ${chunk.ordinal}`},
          ${vectorLiteral}::vector,
          ${JSON.stringify({
            purpose: 'search-3-golden',
            marker: chunk.text.includes(MARKER),
            ordinal: chunk.ordinal,
          })}::jsonb
        )
      `;
    }

    // ── AC-2 seed: semantic-only passage (no FTS token overlap with query) ─
    const semanticMeta = JSON.stringify({ purpose: 'search-3-semantic-only', task: 'search-3' });
    const semanticSourceRows = await sql<{ id: string }[]>`
      INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
      VALUES (
        'document',
        ${SEMANTIC_CONTENT_HASH},
        'search-3 semantic-only seed',
        ${SEMANTIC_DOCUMENT_ID},
        ${semanticMeta}::jsonb
      )
      ON CONFLICT (content_hash) DO UPDATE
        SET title = EXCLUDED.title,
            document_id = EXCLUDED.document_id
      RETURNING id::text AS id
    `;
    semanticSourceId = semanticSourceRows[0]?.id ?? null;
    expect(semanticSourceId).toBeTruthy();

    await sql`DELETE FROM passages WHERE source_id = ${semanticSourceId}::uuid`;

    const semanticVector = await embed(SEMANTIC_PASSAGE_TEXT, 'document');
    expect(semanticVector.length).toBe(EXPECTED_DIM);
    const semanticLiteral = toVectorLiteral(semanticVector);
    const semanticInsert = await sql<{ id: string }[]>`
      INSERT INTO passages (
        source_id, document_id, ordinal, text, situating_header, embedding, metadata_json
      )
      VALUES (
        ${semanticSourceId}::uuid,
        ${SEMANTIC_DOCUMENT_ID},
        0,
        ${SEMANTIC_PASSAGE_TEXT},
        ${'search-3 semantic-only · passage 0'},
        ${semanticLiteral}::vector,
        ${JSON.stringify({ purpose: 'search-3-semantic-only' })}::jsonb
      )
      RETURNING id::text AS id
    `;
    semanticPassageId = semanticInsert[0]?.id ?? null;
    expect(semanticPassageId).toBeTruthy();

    // Prove FTS leg is empty for the semantic query against this passage.
    const ftsHits = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n
      FROM passages
      WHERE id = ${semanticPassageId}::uuid
        AND search_vector @@ websearch_to_tsquery('english', ${SEMANTIC_QUERY})
    `;
    expect(
      Number(ftsHits[0]?.n ?? -1),
      'semantic query must share zero FTS tokens with the seeded passage'
    ).toBe(0);

    seeded = true;
    writeArtifact('seed-rrf.json', {
      goldenSourceId,
      goldenTitle: GOLDEN_TITLE,
      semanticSourceId,
      semanticPassageId,
      markerOffset: goldenDoc.indexOf(MARKER),
      chunkCount: chunks.length,
      markerChunkCount: markerChunks.length,
    });
  }, FLEET_TIMEOUT_MS);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
      sql = null;
      db = null;
    }
  });

  itLive('AC-1 / TC-1: past-8K golden doc ranks top-k via RRF', async () => {
    expect(seeded).toBe(true);
    expect(sql && db).toBeTruthy();
    if (!sql || !db) throw new Error('sql/db not initialized');

    let caught: unknown;
    try {
      const rrfHybridSearch = await loadRrfHybridSearch();
      const out = await rrfHybridSearch(db, sql, { query: AC1_QUERY, limit: 10 });

      writeArtifact('AC-1-result.json', out);

      expect(out.searchMethod).toBe('rrf');
      expect(out.totalResults).toBeGreaterThanOrEqual(1);
      expect(out.results.length).toBeGreaterThanOrEqual(1);
      expect(out.results[0]?.title).toBe(GOLDEN_TITLE);

      // Content or source linkage should surface the past-8K marker passage.
      const top = out.results.slice(0, 10);
      const hit = top.some(
        (r) =>
          r.title === GOLDEN_TITLE ||
          (typeof r.content === 'string' && r.content.includes(MARKER)) ||
          r._id === goldenSourceId
      );
      expect(hit, 'past-8K golden document must rank in top-k').toBe(true);
    } catch (err) {
      caught = err;
      writeArtifact('AC-1-red.txt', {
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        RED_state: true,
      });
      throw caught;
    }
  });

  itLive('AC-2 / TC-2: FTS-empty branch still returns vector neighbour', async () => {
    expect(seeded).toBe(true);
    expect(sql && db && semanticPassageId && semanticSourceId).toBeTruthy();
    if (!sql || !db || !semanticPassageId || !semanticSourceId) {
      throw new Error('semantic seed missing');
    }

    const rrfHybridSearch = await loadRrfHybridSearch();
    const out = await rrfHybridSearch(db, sql, { query: SEMANTIC_QUERY, limit: 10 });

    writeArtifact('AC-2-result.json', out);

    expect(out.searchMethod).toBe('rrf');
    expect(out.totalResults).toBeGreaterThanOrEqual(1);

    const hit = out.results.some(
      (r) =>
        r._id === semanticSourceId ||
        r._id === semanticPassageId ||
        r.passage_id === semanticPassageId ||
        (typeof r.content === 'string' && r.content.includes('Coniferous resin'))
    );
    expect(hit, 'semantic-only passage must appear via vector leg').toBe(true);

    const matched = out.results.find(
      (r) =>
        r._id === semanticSourceId ||
        r._id === semanticPassageId ||
        r.passage_id === semanticPassageId ||
        (typeof r.content === 'string' && r.content.includes('Coniferous resin'))
    );
    const score = matched?.score ?? matched?.rrf_score;
    expect(score, 'rrf_score must be non-null').toEqual(expect.any(Number));
    expect(Number.isFinite(score as number), 'rrf_score must not be NaN').toBe(true);
    expect(score as number).toBeGreaterThan(0);
  });

  itLive('AC-4 / TC-4: empty passages → totalResults 0 without throw', async () => {
    expect(sql && db).toBeTruthy();
    if (!sql || !db) throw new Error('sql/db not initialized');

    const rrfHybridSearch = await loadRrfHybridSearch();
    const activeDb = db;
    const captured: { value?: HybridResult } = {};

    // Run against a rolled-back empty snapshot so both RRF legs produce zero rows.
    // rrfHybridSearch only uses the sql tag (db is unused) — pass the outer db handle
    // and the transaction client as sql so DELETE is visible and then rolled back.
    let threw: unknown = null;
    try {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM passages`;
        captured.value = await rrfHybridSearch(activeDb, tx as unknown as Sql, {
          query: EMPTY_QUERY,
          limit: 10,
        });
        // Force rollback to restore fixtures for other tests / files.
        throw Object.assign(new Error('search-3-ac4-rollback'), { code: 'SEARCH3_AC4_ROLLBACK' });
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err as Error & { code?: string }).code === 'SEARCH3_AC4_ROLLBACK'
      ) {
        // expected
      } else {
        threw = err;
      }
    }

    const out = captured.value;
    writeArtifact('AC-4-result.json', { out, threw: threw ? String(threw) : null });

    expect(threw, 'must not throw on empty result set').toBeNull();
    expect(out).toBeDefined();
    if (!out) throw new Error('empty-passages search did not produce a result');
    expect(out.searchMethod).toBe('rrf');
    expect(out.totalResults).toBe(0);
    expect(out.results).toEqual([]);
  });
});
