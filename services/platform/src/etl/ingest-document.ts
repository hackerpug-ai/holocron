/**
 * Document ingest for MCP store_document / update_document.
 *
 * Writes sources + passages via writeDocumentCorpus, then enqueues
 * document-embedding-backfill (background lane). Embedding is never
 * performed inline — callers/tests may invoke embedRun() themselves.
 */
import type { Sql } from '../db/client.ts';
import { enqueue } from '../queue/priority.ts';
import {
  type CorpusDocument,
  type WriteDocumentCorpusResult,
  writeDocumentCorpus,
} from './corpus-write.ts';

export type IngestDocumentInput = {
  id: string;
  title: string | null;
  content: string | null;
  legacy_convex_id?: string | null;
  /** Epoch ms for deterministic UUIDv7; defaults to Date.now() when omitted. */
  created_at_ms?: number;
};

export type IngestDocumentResult = WriteDocumentCorpusResult & {
  documentId: string;
  embeddingStatus: 'pending' | 'complete';
  pendingEmbeddingCount: number;
  embeddingJobId: string | null;
};

/**
 * Chunk + write corpus rows for an already-persisted document, then enqueue
 * background embedding. embeddingStatus is derived from a real NULL-embedding
 * count — never a hardcoded 'pending'.
 */
export async function ingestDocument(
  sql: Sql,
  input: IngestDocumentInput,
  options?: { databaseUrl?: string; skipEnqueue?: boolean }
): Promise<IngestDocumentResult> {
  const createdAtMs =
    typeof input.created_at_ms === 'number' && Number.isFinite(input.created_at_ms)
      ? Math.floor(input.created_at_ms)
      : Date.now();

  const doc: CorpusDocument = {
    id: input.id,
    legacy_convex_id: input.legacy_convex_id ?? null,
    title: input.title,
    content: input.content,
    created_at_ms: createdAtMs,
  };

  const written = await writeDocumentCorpus(sql, doc, {
    embeddingMetaSource: 'ingest:document',
  });

  const pendingEmbeddingCount = written.nullEmbeddingCount;
  const embeddingStatus: 'pending' | 'complete' =
    pendingEmbeddingCount > 0 ? 'pending' : 'complete';

  let embeddingJobId: string | null = null;
  if (pendingEmbeddingCount > 0 && options?.skipEnqueue !== true) {
    // Unique key per enqueue so re-ingest after text change does not collide
    // with a prior pending/completed queue_jobs row for the same document.
    const job = await enqueue({
      name: 'document-embedding-backfill',
      lane: 'background',
      databaseUrl: options?.databaseUrl,
      payload: {
        documentId: input.id,
        sourceId: written.sourceId,
        pendingEmbeddingCount,
      },
      key: `document-embedding-backfill:${input.id}:${Date.now()}`,
    });
    embeddingJobId = job.id;
  }

  return {
    ...written,
    documentId: input.id,
    embeddingStatus,
    pendingEmbeddingCount,
    embeddingJobId,
  };
}
