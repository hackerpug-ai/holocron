/**
 * Shared document → sources/passages corpus write.
 *
 * Extracted from etl/vectors.ts so MCP store_document / update_document and
 * runEtlVectors share ONE implementation. Takes an already-open Sql — no
 * database-URL resolution (callers own the connection).
 *
 * Stale ordinal shrink uses UPDATE (text='', embedding=NULL). Prefer UPDATE
 * shrink over adding a DELETE grant for holocron_app (INSERT/SELECT/UPDATE only).
 */
import { createHash } from 'node:crypto';
import type { Sql } from '../db/client.ts';
import { chunkDocument, type PassageChunk } from '../inference/chunk.ts';
import { resolveModel } from '../inference/resolve-model.ts';
import { deterministicUuidV7 } from './deterministic-uuidv7.ts';

/** Bump when chunkDocument output or the persisted embedding input contract changes. */
export const PASSAGE_EMBEDDING_REVISION = 'chunk-document-v2-past-8k-anchor';

export type CorpusDocument = {
  id: string;
  legacy_convex_id?: string | null;
  title: string | null;
  content: string | null;
  /** Epoch milliseconds used for deterministic UUIDv7 derivation. */
  created_at_ms: number;
};

export type EmbeddingMetaProbe = {
  embeddingDimension: number;
  modelId: string | null;
  modelRevision: string | null;
  provider: string;
  endpoint: string | null;
};

export type WriteDocumentCorpusOptions = {
  /** metadata_json.embedding.source tag (default ingest:document). */
  embeddingMetaSource?: string;
  /** Optional pre-probed fleet embed metadata (ETL passes its live probe). */
  embeddingMeta?: EmbeddingMetaProbe;
};

export type WriteDocumentCorpusResult = {
  sourceId: string;
  passageCount: number;
  passageIds: string[];
  nullEmbeddingCount: number;
  chunks: PassageChunk[];
};

export function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Upsert source + passages for one document. Deterministic ids match ETL:
 *   sourceId  = deterministicUuidV7(createdAtMs, `source:${doc.id}`)
 *   passageId = deterministicUuidV7(createdAtMs + ordinal, `passage:${doc.id}:${ordinal}`)
 *
 * sources upsert on content_hash (unique), and always sets url.
 * Stale ordinals are shrunk via UPDATE (clear text + null embedding).
 */
export async function writeDocumentCorpus(
  sql: Sql,
  doc: CorpusDocument,
  options?: WriteDocumentCorpusOptions
): Promise<WriteDocumentCorpusResult> {
  // Floor to integer ms — float8 epoch extracts must not drift UUID seeds.
  const createdAtMs = Math.floor(Number(doc.created_at_ms || 0));
  const sourceId = deterministicUuidV7(createdAtMs, `source:${doc.id}`);
  const contentHash = sha256Text(`${doc.id}\0${doc.content ?? ''}`);
  const sourceUrl = `holocron://document/${doc.id}`;
  const embeddingMetaSource = options?.embeddingMetaSource ?? 'ingest:document';

  let modelId: string | null = options?.embeddingMeta?.modelId ?? null;
  let modelRevision: string | null = options?.embeddingMeta?.modelRevision ?? null;
  let provider = options?.embeddingMeta?.provider ?? 'fleet';
  let endpoint: string | null = options?.embeddingMeta?.endpoint ?? null;
  let embeddingDimension = options?.embeddingMeta?.embeddingDimension ?? 1024;
  if (!options?.embeddingMeta) {
    try {
      const resolved = await resolveModel('embed', { skipHealth: true });
      modelId = resolved.litellmModelId;
      modelRevision = resolved.modelRevision;
      provider = resolved.provider;
      endpoint = resolved.endpoint;
      embeddingDimension = resolved.embeddingDimension ?? 1024;
    } catch {
      // Metadata is best-effort; passage rows still land with NULL embeddings.
    }
  }

  const legacyConvexId = typeof doc.legacy_convex_id === 'string' ? doc.legacy_convex_id : null;
  const title = typeof doc.title === 'string' ? doc.title : null;
  // Serialize jsonb as text + ::jsonb — avoids postgres.js sql.json helper
  // edge cases when the same Sql client is reused across Vitest cases.
  const sourceMetadataJson = JSON.stringify({ kind: 'document_corpus_source' });

  // content_hash embeds doc.id (`${doc.id}\0${content}`), so it is unique per
  // document. Prefer UPDATE by deterministic id (covers content changes that
  // rewrite the hash); otherwise INSERT with ON CONFLICT (content_hash) like
  // registerDoc — never ON CONFLICT (id), which misses the unique hash index.
  const byId = await sql<{ id: string }[]>`
    UPDATE sources
    SET
      legacy_convex_id = ${legacyConvexId},
      source_kind = 'document',
      document_id = ${doc.id},
      content_hash = ${contentHash},
      title = ${title},
      url = ${sourceUrl},
      metadata_json = ${sourceMetadataJson}::jsonb
    WHERE id = ${sourceId}::uuid
    RETURNING id::text AS id
  `;

  let resolvedSourceId = byId[0]?.id ?? null;
  if (!resolvedSourceId) {
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO sources (
        id, legacy_convex_id, source_kind, document_id, content_hash, title, url, metadata_json
      )
      VALUES (
        ${sourceId}::uuid,
        ${legacyConvexId},
        'document',
        ${doc.id},
        ${contentHash},
        ${title},
        ${sourceUrl},
        ${sourceMetadataJson}::jsonb
      )
      ON CONFLICT (content_hash) DO UPDATE
        SET document_id = EXCLUDED.document_id,
            source_kind = EXCLUDED.source_kind,
            title = EXCLUDED.title,
            url = EXCLUDED.url,
            legacy_convex_id = COALESCE(EXCLUDED.legacy_convex_id, sources.legacy_convex_id),
            metadata_json = EXCLUDED.metadata_json
      RETURNING id::text AS id
    `;
    resolvedSourceId = inserted[0]?.id ?? null;
  }
  if (!resolvedSourceId) {
    throw new Error(`writeDocumentCorpus: failed to upsert source for document ${doc.id}`);
  }

  const chunks = chunkDocument(doc.content ?? '', {
    title: title ?? 'Untitled',
  });

  const passageIds: string[] = [];
  for (const chunk of chunks) {
    const passageId = deterministicUuidV7(
      createdAtMs + chunk.ordinal,
      `passage:${doc.id}:${chunk.ordinal}`
    );
    passageIds.push(passageId);
    const passageMetadataJson = JSON.stringify({
      embedding: {
        role: 'embed',
        source: embeddingMetaSource,
        passageRevision: PASSAGE_EMBEDDING_REVISION,
        dimension: embeddingDimension,
        modelId,
        modelRevision,
        provider,
        endpoint,
      },
    });
    await sql`
      INSERT INTO passages (
        id,
        legacy_convex_id,
        source_id,
        document_id,
        ordinal,
        text,
        token_count,
        situating_header,
        embedding,
        metadata_json
      )
      VALUES (
        ${passageId}::uuid,
        ${`passage:${legacyConvexId ?? doc.id}:${chunk.ordinal}`},
        ${resolvedSourceId}::uuid,
        ${doc.id},
        ${chunk.ordinal},
        ${chunk.text},
        ${chunk.tokenCount},
        ${chunk.situatingHeader},
        NULL,
        ${passageMetadataJson}::jsonb
      )
      ON CONFLICT (id) DO UPDATE
        SET source_id = EXCLUDED.source_id,
            document_id = EXCLUDED.document_id,
            ordinal = EXCLUDED.ordinal,
            text = EXCLUDED.text,
            token_count = EXCLUDED.token_count,
            situating_header = EXCLUDED.situating_header,
            -- Invalidate only when passage text or revision changes. Endpoint /
            -- modelId probe noise must not wipe good embeddings on re-ingest.
            embedding = CASE
              WHEN passages.text IS DISTINCT FROM EXCLUDED.text
                OR passages.metadata_json #>> '{embedding,passageRevision}'
                  IS DISTINCT FROM EXCLUDED.metadata_json #>> '{embedding,passageRevision}'
                THEN NULL
              ELSE passages.embedding
            END,
            metadata_json = EXCLUDED.metadata_json
    `;
  }

  // Shrink stale ordinals (UPDATE clear — holocron_app has no DELETE grant).
  await sql`
    UPDATE passages
    SET text = '', embedding = NULL
    WHERE source_id = ${resolvedSourceId}::uuid
      AND ordinal >= ${chunks.length}
  `;

  const nullRows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM passages
    WHERE source_id = ${resolvedSourceId}::uuid
      AND ordinal < ${chunks.length}
      AND embedding IS NULL
  `;
  const nullEmbeddingCount = Number(nullRows[0]?.count ?? 0);

  return {
    sourceId: resolvedSourceId,
    passageCount: chunks.length,
    passageIds,
    nullEmbeddingCount,
    chunks,
  };
}
