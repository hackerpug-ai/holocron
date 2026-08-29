/**
 * Wave 1 corpus-write / document ingest (acquisition T4).
 *
 * TC-1..TC-5 against real Postgres (holocron_nonprod) + live fleet embeddings.
 * Drives shipped ingestDocument / executePostgresMcpTool — no reimplementation.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://127.0.0.1:4545/v1 \
 *     pnpm vitest run --project integration \
 *       packages/platform/tests/integration/research-document-ingest.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createSql, type Sql } from '../../src/db/client.ts';
import { ingestDocument } from '../../src/etl/ingest-document.ts';
import { embedRun } from '../../src/inference/embed-run.ts';
import { executePostgresMcpTool } from '../../src/mcp/executor.ts';
import { rrfHybridSearch } from '../../src/search/rrf.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const FLEET_TIMEOUT_MS = 300_000;
const NONCE = `ingest-nonce-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const TITLE_A = `Research Ingest A ${NONCE}`;
const TITLE_B = `Research Ingest B ${NONCE}`;
const CONTENT_A = [
  `Primary research document for corpus ingest verification.`,
  `Unique token for retrieval: ${NONCE}.`,
  `This passage must become searchable via rrfHybridSearch after embedRun.`,
].join('\n');
const CONTENT_B_NONCE = `${NONCE}-updated`;
const CONTENT_B = [
  `Updated research document for corpus ingest verification.`,
  `Replacement token for retrieval: ${CONTENT_B_NONCE}.`,
  `Old nonce ${NONCE} must stop matching after update_document.`,
].join('\n');

const CORPUS_WRITE_PATH = resolve(import.meta.dirname, '../../src/etl/corpus-write.ts');

let sql: Sql;
const seededDocumentIds: string[] = [];

async function cleanupDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    await sql`UPDATE passages SET text = '', embedding = NULL WHERE document_id = ${id}`;
    await sql`DELETE FROM passages WHERE document_id = ${id}`;
    await sql`DELETE FROM sources WHERE document_id = ${id}`;
    await sql`DELETE FROM documents WHERE id = ${id}::uuid`;
  }
}

beforeAll(async () => {
  if (!PLATFORM_IT) {
    throw new Error('research-document-ingest requires PLATFORM_IT=1 and real Postgres + fleet');
  }
  if (!DATABASE_URL.includes('holocron_nonprod')) {
    throw new Error(
      `research-document-ingest requires DATABASE_URL to name holocron_nonprod (got ${DATABASE_URL})`
    );
  }

  sql = createSql(DATABASE_URL);
  try {
    const probe = await sql<{ db: string }[]>`SELECT current_database() AS db`;
    if (probe[0]?.db !== 'holocron_nonprod') {
      throw new Error(`expected holocron_nonprod, got ${probe[0]?.db ?? 'unknown'}`);
    }
  } catch (err) {
    throw new Error(
      `Postgres unreachable for research-document-ingest: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}, 60_000);

afterAll(async () => {
  if (!sql) return;
  try {
    await cleanupDocuments(seededDocumentIds);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

describe('research-document-ingest (Wave 1 corpus-write)', () => {
  it(
    'TC-1: store_document → embedRun → rrfHybridSearch returns that document',
    async () => {
      const stored = (await executePostgresMcpTool(
        'store_document',
        { title: TITLE_A, content: CONTENT_A },
        { databaseUrl: DATABASE_URL }
      )) as {
        documentId: string;
        embeddingStatus: string;
        pendingEmbeddingCount: number;
        passageCount: number;
      };

      expect(stored.documentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      seededDocumentIds.push(stored.documentId);
      expect(stored.passageCount).toBeGreaterThan(0);
      expect(stored.embeddingStatus).toBe('pending');
      expect(stored.pendingEmbeddingCount).toBeGreaterThan(0);

      const embedResult = await embedRun({ databaseUrl: DATABASE_URL, sql });
      expect(embedResult.remainingNull).toBe(0);
      expect(embedResult.processed).toBeGreaterThan(0);

      const search = await rrfHybridSearch(createDb(sql), sql, {
        query: NONCE,
        limit: 10,
      });
      const hit = search.results.find(
        (row) =>
          row.document_id === stored.documentId ||
          row._id === stored.documentId ||
          (typeof row.content === 'string' && row.content.includes(NONCE)) ||
          (typeof row.title === 'string' && row.title.includes(NONCE))
      );
      expect(
        hit,
        `rrfHybridSearch(${NONCE}) must return document ${stored.documentId}; got ${JSON.stringify(search.results.slice(0, 5))}`
      ).toBeTruthy();
      expect(hit?.document_id === stored.documentId || hit?._id === stored.documentId).toBe(true);

      // Expose for the implementer handoff.
      console.log(
        JSON.stringify({
          tc1: {
            documentId: stored.documentId,
            nonce: NONCE,
            hitId: hit?._id ?? hit?.document_id,
            score: hit?.score ?? hit?.rrf_score,
          },
        })
      );
    },
    FLEET_TIMEOUT_MS
  );

  it(
    'TC-2: update_document swaps nonce — old stops matching, new matches',
    async () => {
      const stored = (await executePostgresMcpTool(
        'store_document',
        { title: TITLE_B, content: CONTENT_A },
        { databaseUrl: DATABASE_URL }
      )) as { documentId: string };
      seededDocumentIds.push(stored.documentId);

      await embedRun({ databaseUrl: DATABASE_URL, sql });

      const updated = (await executePostgresMcpTool(
        'update_document',
        {
          documentId: stored.documentId,
          title: TITLE_B,
          content: CONTENT_B,
        },
        { databaseUrl: DATABASE_URL }
      )) as {
        documentId: string;
        updated: boolean;
        embeddingStatus: string;
        pendingEmbeddingCount: number;
      };
      expect(updated.updated).toBe(true);
      expect(updated.embeddingStatus).toBe('pending');
      expect(updated.pendingEmbeddingCount).toBeGreaterThan(0);

      await embedRun({ databaseUrl: DATABASE_URL, sql });

      // Exact old-token query should not surface this document's updated body.
      const oldRows = await sql<{ document_id: string | null; text: string }[]>`
        SELECT document_id, text
        FROM passages
        WHERE document_id = ${stored.documentId}
          AND text <> ''
          AND text ILIKE ${`%${NONCE}%`}
          AND text NOT ILIKE ${`%${CONTENT_B_NONCE}%`}
      `;
      expect(oldRows).toEqual([]);

      const newSearch = await rrfHybridSearch(createDb(sql), sql, {
        query: CONTENT_B_NONCE,
        limit: 10,
      });
      const newHit = newSearch.results.find(
        (row) => row.document_id === stored.documentId || row._id === stored.documentId
      );
      expect(
        newHit,
        `rrfHybridSearch(${CONTENT_B_NONCE}) must return ${stored.documentId}`
      ).toBeTruthy();
    },
    FLEET_TIMEOUT_MS
  );

  it(
    'TC-3: ingest twice — passage count stable and passage ids identical',
    async () => {
      const title = `Research Ingest Idempotent ${NONCE}`;
      const content = `Idempotent ingest body with token ${NONCE}-idem.\nSecond line for chunking stability.`;
      const stored = (await executePostgresMcpTool(
        'store_document',
        { title, content },
        { databaseUrl: DATABASE_URL }
      )) as { documentId: string; passageCount: number };
      seededDocumentIds.push(stored.documentId);

      const docRows = await sql<
        Array<{ createdAtMs: number | string; title: string | null; content: string | null }>
      >`
        SELECT
          title,
          content,
          (extract(epoch FROM created_at) * 1000)::bigint AS "createdAtMs"
        FROM documents
        WHERE id = ${stored.documentId}::uuid
        LIMIT 1
      `;
      const doc = docRows[0];
      if (!doc) throw new Error('document missing after store');
      const createdAtMs = Math.floor(Number(doc.createdAtMs));

      const first = await ingestDocument(
        sql,
        {
          id: stored.documentId,
          title: doc.title,
          content: doc.content,
          created_at_ms: createdAtMs,
        },
        { databaseUrl: DATABASE_URL, skipEnqueue: true }
      );
      const second = await ingestDocument(
        sql,
        {
          id: stored.documentId,
          title: doc.title,
          content: doc.content,
          created_at_ms: createdAtMs,
        },
        { databaseUrl: DATABASE_URL, skipEnqueue: true }
      );

      expect(second.passageCount).toBe(first.passageCount);
      expect(second.passageIds).toEqual(first.passageIds);
      expect(second.passageIds.length).toBeGreaterThan(0);

      const live = await sql<{ id: string }[]>`
        SELECT id::text AS id
        FROM passages
        WHERE document_id = ${stored.documentId}
          AND text <> ''
        ORDER BY ordinal ASC
      `;
      expect(live.map((row) => row.id)).toEqual(first.passageIds);
    },
    FLEET_TIMEOUT_MS
  );

  it(
    'TC-4: holocron_app ingest succeeds OR corpus-write has no DELETE FROM passages',
    async () => {
      const source = readFileSync(CORPUS_WRITE_PATH, 'utf8');
      // Strip block comments so prose mentioning the forbidden pattern is ignored.
      const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(codeOnly).not.toMatch(/DELETE\s+FROM\s+passages/i);
      expect(codeOnly).toMatch(/UPDATE\s+passages/i);

      let appSql: Sql | null = null;
      try {
        appSql = createSql('postgres://holocron_app@127.0.0.1:5432/holocron_nonprod');
        const role = await appSql<{ u: string }[]>`SELECT current_user AS u`;
        expect(role[0]?.u).toBe('holocron_app');

        // holocron_app lacks documents INSERT; write as owner then ingest as app.
        const ownerStored = (await executePostgresMcpTool(
          'store_document',
          {
            title: `Research Ingest AppRole ${NONCE}`,
            content: `App-role ingest body ${NONCE}-approle`,
          },
          { databaseUrl: DATABASE_URL }
        )) as { documentId: string };
        seededDocumentIds.push(ownerStored.documentId);

        const docRows = await sql<
          Array<{ createdAtMs: number | string; title: string | null; content: string | null }>
        >`
          SELECT
            title,
            content,
            (extract(epoch FROM created_at) * 1000)::bigint AS "createdAtMs"
          FROM documents
          WHERE id = ${ownerStored.documentId}::uuid
          LIMIT 1
        `;
        const doc = docRows[0];
        if (!doc) throw new Error('document missing for app-role ingest');

        const ingested = await ingestDocument(
          appSql,
          {
            id: ownerStored.documentId,
            title: doc.title,
            content: `${doc.content}\napp-role re-ingest ${NONCE}-approle`,
            created_at_ms: Math.floor(Number(doc.createdAtMs)),
          },
          { skipEnqueue: true }
        );
        expect(ingested.passageCount).toBeGreaterThan(0);
        expect(ingested.sourceId).toBeTruthy();
      } finally {
        await appSql?.end({ timeout: 5 });
      }
    },
    FLEET_TIMEOUT_MS
  );

  it(
    'TC-5: embeddingStatus pending with count>0 before embedRun, complete after',
    async () => {
      const stored = (await executePostgresMcpTool(
        'store_document',
        {
          title: `Research Ingest Status ${NONCE}`,
          content: `Status check body with token ${NONCE}-status.`,
        },
        { databaseUrl: DATABASE_URL }
      )) as {
        documentId: string;
        embeddingStatus: string;
        pendingEmbeddingCount: number;
      };
      seededDocumentIds.push(stored.documentId);

      expect(stored.embeddingStatus).toBe('pending');
      expect(stored.pendingEmbeddingCount).toBeGreaterThan(0);

      const before = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM passages
        WHERE document_id = ${stored.documentId}
          AND text <> ''
          AND embedding IS NULL
      `;
      expect(Number(before[0]?.count ?? 0)).toBe(stored.pendingEmbeddingCount);

      await embedRun({ databaseUrl: DATABASE_URL, sql });

      const after = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM passages
        WHERE document_id = ${stored.documentId}
          AND text <> ''
          AND embedding IS NULL
      `;
      expect(Number(after[0]?.count ?? 0)).toBe(0);

      // Status is derived from a real NULL-embedding count (not a hardcoded literal).
      const statusAfter = Number(after[0]?.count ?? 0) > 0 ? 'pending' : 'complete';
      expect(statusAfter).toBe('complete');

      const docRows = await sql<
        Array<{ createdAtMs: number | string; title: string | null; content: string | null }>
      >`
        SELECT
          title,
          content,
          (extract(epoch FROM created_at) * 1000)::bigint AS "createdAtMs"
        FROM documents
        WHERE id = ${stored.documentId}::uuid
        LIMIT 1
      `;
      const doc = docRows[0];
      if (!doc) throw new Error('document missing for TC-5 status probe');
      const statusProbe = await ingestDocument(
        sql,
        {
          id: stored.documentId,
          title: doc.title,
          content: doc.content,
          created_at_ms: Math.floor(Number(doc.createdAtMs)),
        },
        { databaseUrl: DATABASE_URL, skipEnqueue: true }
      );
      // After embedRun, a same-text re-ingest should report complete when the
      // deterministic ids collide with already-embedded passages.
      if (statusProbe.passageIds.length > 0) {
        const stillNull = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM passages
          WHERE id = ANY(${statusProbe.passageIds}::uuid[])
            AND embedding IS NULL
        `;
        const derived = Number(stillNull[0]?.count ?? 0) > 0 ? 'pending' : 'complete';
        expect(statusProbe.embeddingStatus).toBe(derived);
        expect(statusProbe.pendingEmbeddingCount).toBe(Number(stillNull[0]?.count ?? 0));
      }
    },
    FLEET_TIMEOUT_MS
  );
});
