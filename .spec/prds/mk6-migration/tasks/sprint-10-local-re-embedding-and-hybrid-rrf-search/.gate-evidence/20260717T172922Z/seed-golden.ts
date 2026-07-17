#!/usr/bin/env bun
/**
 * QA PRECONDITION SEED — Sprint 10 Human Testing Gate.
 *
 * Replicates the golden document that the search-3 integration test seeds in its
 * beforeAll (services/platform/tests/integration/rrf-search.test.ts). This is
 * ENVIRONMENT SETUP (like running migrations), NOT a gate step. The 7 gate steps
 * verify the operator experience; this script ensures the DB has the test data
 * the SPRINT.md gate narrative describes ("Seed a golden doc with the answer
 * past char-8000").
 *
 * Passages are inserted with NULL embeddings so that gate step 1 (`holo embed:run`)
 * performs REAL embedding via the fleet — exercising the actual production path.
 *
 * Idempotent on content_hash; safe to re-run.
 */
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
// Walk up to find project root (directory containing package.json)
let ROOT = import.meta.dir;
for (let i = 0; i < 10; i++) {
  if (existsSync(resolve(ROOT, 'package.json'))) break;
  ROOT = resolve(ROOT, '..');
}
const { resolveDatabaseUrl } = await import(resolve(ROOT, 'services/platform/src/db/connection.ts'));
const { createSql } = await import(resolve(ROOT, 'services/platform/src/db/client.ts'));

const MARKER = 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ';
const GOLDEN_TITLE = 'Local Re-embedding & RRF Design';
const GOLDEN_DOCUMENT_ID = 'doc_search3_golden_past_8k';
const GOLDEN_CONTENT_HASH = 'search-3-golden-past-8k-v1';
const SEMANTIC_CONTENT_HASH = 'search-3-semantic-only-v1';
const SEMANTIC_DOCUMENT_ID = 'doc_search3_semantic_only';
const SEMANTIC_TITLE = 'search-3 semantic-only seed';
const SEMANTIC_PASSAGE_TEXT =
  'Coniferous resin densifies after prolonged arid midsummer conditions across alpine stands.';

function buildPast8kDocument(): string {
  const head = 'A'.repeat(8400);
  const relevant =
    ' This section covers reciprocal rank fusion with k=60 constant in a single CTE round-trip. ' +
    'Combining vector similarity with keyword rankings inside one database query is the design. ';
  const minTail = 10048 - 8400 - MARKER.length;
  const padLen = Math.max(0, minTail - relevant.length);
  const tail = `${relevant}${'Y'.repeat(padLen)}`;
  return `${head}${MARKER}${tail}`;
}

async function loadChunkDocument() {
  const mod = await import(
    resolve(ROOT, 'services/platform/src/inference/chunk.ts')
  );
  if (typeof mod.chunkDocument !== 'function') {
    throw new Error('chunkDocument is not defined');
  }
  return mod.chunkDocument;
}

async function main() {
  const databaseUrl = resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const chunkDocument = await loadChunkDocument();

  const goldenDoc = buildPast8kDocument();
  if (goldenDoc.indexOf(MARKER) !== 8400) {
    throw new Error(`marker offset ${goldenDoc.indexOf(MARKER)} !== 8400`);
  }
  if (goldenDoc.length < 10048) {
    throw new Error(`doc length ${goldenDoc.length} < 10048`);
  }

  // ── Golden source (past-8K RRF design doc) ──────────────────────────
  const goldenSourceRows = await sql<{ id: string }[]>`
    INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
    VALUES (
      'document',
      ${GOLDEN_CONTENT_HASH},
      ${GOLDEN_TITLE},
      ${GOLDEN_DOCUMENT_ID},
      ${JSON.stringify({ purpose: 'search-3-golden-past-8k', marker: MARKER, task: 'search-3' })}::jsonb
    )
    ON CONFLICT (content_hash) DO UPDATE
      SET title = EXCLUDED.title,
          document_id = EXCLUDED.document_id,
          metadata_json = EXCLUDED.metadata_json
    RETURNING id::text AS id
  `;
  const goldenSourceId = goldenSourceRows[0]?.id;
  if (!goldenSourceId) throw new Error('golden source insert failed');

  // Clear old passages for re-seed
  await sql`DELETE FROM passages WHERE source_id = ${goldenSourceId}::uuid`;

  // Chunk the golden doc (same params as search-3 test)
  const chunks = chunkDocument(goldenDoc, {
    title: GOLDEN_TITLE,
    maxTokens: 512,
    overlap: 64,
  });
  const markerChunks = chunks.filter((c: { text: string }) => c.text.includes(MARKER));
  console.log(`Golden doc: ${goldenDoc.length} chars → ${chunks.length} chunks (${markerChunks.length} with marker)`);

  // Insert passages with NULL embedding (embed:run will fill them)
  for (const chunk of chunks) {
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
        NULL,
        ${JSON.stringify({ purpose: 'search-3-golden', marker: chunk.text.includes(MARKER), ordinal: chunk.ordinal })}::jsonb
      )
    `;
  }

  // ── Semantic distractor source (no FTS token overlap with the query) ──
  const semanticSourceRows = await sql<{ id: string }[]>`
    INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
    VALUES (
      'document',
      ${SEMANTIC_CONTENT_HASH},
      ${SEMANTIC_TITLE},
      ${SEMANTIC_DOCUMENT_ID},
      ${JSON.stringify({ purpose: 'search-3-semantic-only', task: 'search-3' })}::jsonb
    )
    ON CONFLICT (content_hash) DO UPDATE
      SET title = EXCLUDED.title,
          document_id = EXCLUDED.document_id,
          metadata_json = EXCLUDED.metadata_json
    RETURNING id::text AS id
  `;
  const semanticSourceId = semanticSourceRows[0]?.id;
  if (!semanticSourceId) throw new Error('semantic source insert failed');

  await sql`DELETE FROM passages WHERE source_id = ${semanticSourceId}::uuid`;
  await sql`
    INSERT INTO passages (
      source_id, document_id, ordinal, text, situating_header, embedding, metadata_json
    )
    VALUES (
      ${semanticSourceId}::uuid,
      ${SEMANTIC_DOCUMENT_ID},
      0,
      ${SEMANTIC_PASSAGE_TEXT},
      ${`${SEMANTIC_TITLE} · passage 0`},
      NULL,
      ${JSON.stringify({ purpose: 'search-3-semantic-only', ordinal: 0 })}::jsonb
    )
  `;

  // Verify
  const passageCount = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM passages WHERE embedding IS NULL
  `;
  console.log(`Seed complete. NULL passages ready for embed:run: ${passageCount[0]?.count}`);

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
