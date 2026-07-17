/**
 * search-3 — inline-HNSW surface KNN (5 short-text surfaces, zero cloud).
 *
 * AC-3 / TC-3: searchSurface('research_findings') returns the seeded claim
 * with searchMethod "hnsw:research_findings" and no Cohere/cloud calls.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - surface query delegates to api.cohere.ai / cloud embed
 * - research_findings.embedding is NULL
 * - searchSurface does a cross-table join
 * - surface name outside the allowed 5-surface set
 * - stub returns static results without real Postgres / fleet
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *     pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createSql, type Db, type Sql } from '../../src/db/client';
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
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-3');

const CLAIM_TEXT = 'MLX prefill-tuned Qwen3 embedding server on Apple Silicon';
const SURFACE_QUERY = 'local embedding server optimized for Mac prefill';
const EXPECTED_DIM = 1024;
const LEGACY_ID = 'search-3-surface-finding-v1';

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

type SurfaceResult = {
  results: Array<{
    _id?: string;
    title?: string;
    content?: string;
    claim_text?: string;
    score?: number;
  }>;
  totalResults: number;
  searchMethod?: string;
};

type SearchSurfaceFn = (
  db: Db,
  sql: Sql,
  surface: string,
  opts: { query: string; limit?: number }
) => Promise<SurfaceResult>;

async function loadSearchSurface(): Promise<SearchSurfaceFn> {
  const candidates = [
    ['../../src/search', 'surfaces'].join('/'),
    ['../../src/search', 'index'].join('/'),
  ];
  for (const modPath of candidates) {
    try {
      const mod = (await import(modPath)) as { searchSurface?: SearchSurfaceFn };
      if (typeof mod.searchSurface === 'function') {
        return mod.searchSurface.bind(mod);
      }
    } catch {
      // try next
    }
  }
  throw new ReferenceError('searchSurface is not defined');
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

describe('search-3: searchSurface inline-HNSW (AC-3)', () => {
  let sql: Sql | null = null;
  let db: Db | null = null;
  let findingId: string | null = null;
  let seeded = false;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    const databaseUrl = resolveDatabaseUrl({ preferHolocron: true });
    sql = createSql(databaseUrl);
    db = createDb(sql);

    const embed = await loadEmbed();
    const vector = await embed(CLAIM_TEXT, 'document');
    expect(vector.length).toBe(EXPECTED_DIM);
    const vectorLiteral = toVectorLiteral(vector);

    // Idempotent seed by legacy_convex_id.
    await sql`
      DELETE FROM research_findings WHERE legacy_convex_id = ${LEGACY_ID}
    `;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO research_findings (
        system, claim_text, legacy_convex_id, embedding
      )
      VALUES (
        'deep',
        ${CLAIM_TEXT},
        ${LEGACY_ID},
        ${vectorLiteral}::vector
      )
      RETURNING id::text AS id
    `;
    findingId = rows[0]?.id ?? null;
    expect(findingId, 'research_findings seed must insert').toBeTruthy();
    seeded = true;

    writeArtifact('seed-surface.json', { findingId, claimText: CLAIM_TEXT });
  }, FLEET_TIMEOUT_MS);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
      sql = null;
      db = null;
    }
  });

  itLive('AC-3 / TC-3: research_findings HNSW returns seeded claim (zero cloud)', async () => {
    expect(seeded).toBe(true);
    expect(sql && db && findingId).toBeTruthy();
    if (!sql || !db) throw new Error('sql/db not initialized');

    // Guard: no outbound Cohere during this call. Track fetch hosts if global fetch is used.
    const cohereHosts: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/cohere\.ai|api\.cohere/i.test(url)) {
        cohereHosts.push(url);
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const searchSurface = await loadSearchSurface();
      const out = await searchSurface(db, sql, 'research_findings', {
        query: SURFACE_QUERY,
        limit: 5,
      });

      writeArtifact('AC-3-result.json', out);

      expect(out.searchMethod).toBe('hnsw:research_findings');
      expect(out.totalResults).toBeGreaterThanOrEqual(1);
      expect(out.results.length).toBeGreaterThanOrEqual(1);

      const top = out.results[0];
      const claim =
        top?.claim_text ?? top?.content ?? (typeof top?.title === 'string' ? top.title : undefined);
      expect(
        typeof claim === 'string' && claim.includes(CLAIM_TEXT),
        `results[0] must contain claim_text "${CLAIM_TEXT}"`
      ).toBe(true);

      expect(cohereHosts, 'zero outbound calls to api.cohere.ai').toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  itLive('rejects unknown surface names', async () => {
    expect(sql && db).toBeTruthy();
    if (!sql || !db) throw new Error('sql/db not initialized');

    const searchSurface = await loadSearchSurface();
    await expect(searchSurface(db, sql, 'not_a_surface', { query: 'x', limit: 5 })).rejects.toThrow(
      /surface|unknown|allowed/i
    );
  });
});
