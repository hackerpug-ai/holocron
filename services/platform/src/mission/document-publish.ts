/**
 * Idempotent document publish for standing missions (pipes-3 AC-4 / TC-4).
 *
 * Atomic path: INSERT … ON CONFLICT (source_run_id) DO NOTHING / read-back.
 */
import { randomUUID } from 'node:crypto';
import type { Sql } from '../db/client.ts';

export type PublishDocumentInput = {
  sourceRunId: string;
  title: string;
  content: string;
  category?: string;
  filePath?: string;
  fileType?: string;
  /** Stable idempotency key; defaults to mission-run:<sourceRunId>. */
  idempotencyKey?: string;
  status?: string;
};

export type PublishDocumentResult = {
  documentId: string;
  sourceRunId: string;
  publishedAt: string;
  created: boolean;
  idempotencyKey: string;
};

type SqlExecutor = Sql | import('postgres').TransactionSql;

export async function publishDocumentForRun(
  sql: SqlExecutor,
  input: PublishDocumentInput
): Promise<PublishDocumentResult> {
  const sourceRunId = input.sourceRunId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(sourceRunId)) {
    throw new Error(`publishDocumentForRun requires uuid sourceRunId; got ${sourceRunId}`);
  }
  const idempotencyKey = (input.idempotencyKey ?? `mission-run:${sourceRunId}`).trim();
  if (!idempotencyKey) {
    throw new Error('publishDocumentForRun requires non-empty idempotency key');
  }
  const title = input.title.trim() || `Mission document ${sourceRunId}`;
  const content = input.content;
  if (!content || content.trim().length === 0) {
    throw new Error('publishDocumentForRun refuses empty content (fail-closed)');
  }
  const category = input.category ?? 'subscriptions';
  const status = input.status ?? 'published';
  const documentId = randomUUID();

  const inserted = await sql.unsafe<
    Array<{ id: string; source_run_id: string; published_at: string | Date }>
  >(
    `INSERT INTO documents (
        id, title, content, category, file_path, file_type, status, source_run_id, published_at, publish_idempotency_key
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid, now(), $9
      )
      ON CONFLICT (source_run_id) DO NOTHING
      RETURNING id::text AS id, source_run_id::text AS source_run_id, published_at`,
    [
      documentId,
      title,
      content,
      category,
      input.filePath ?? null,
      input.fileType ?? null,
      status,
      sourceRunId,
      idempotencyKey,
    ]
  );

  if (inserted[0]) {
    return {
      documentId: inserted[0].id,
      sourceRunId: inserted[0].source_run_id ?? sourceRunId,
      publishedAt: toIso(inserted[0].published_at),
      created: true,
      idempotencyKey,
    };
  }

  // Idempotent retry: return existing row for this source_run_id.
  const existing = await sql.unsafe<
    Array<{ id: string; source_run_id: string; published_at: string | Date }>
  >(
    `SELECT id::text AS id, source_run_id::text AS source_run_id, published_at
       FROM documents
      WHERE source_run_id::text = $1
      LIMIT 1`,
    [sourceRunId]
  );
  const found = existing[0];
  if (!found) {
    // Secondary key path (idempotency key unique).
    const byKey = await sql.unsafe<
      Array<{ id: string; source_run_id: string; published_at: string | Date }>
    >(
      `SELECT id::text AS id, source_run_id::text AS source_run_id, published_at
         FROM documents
        WHERE publish_idempotency_key = $1
        LIMIT 1`,
      [idempotencyKey]
    );
    const k = byKey[0];
    if (!k) {
      throw new Error(`document publish failed for source_run_id=${sourceRunId}`);
    }
    return {
      documentId: k.id,
      sourceRunId: k.source_run_id ?? sourceRunId,
      publishedAt: toIso(k.published_at),
      created: false,
      idempotencyKey,
    };
  }

  return {
    documentId: found.id,
    sourceRunId: found.source_run_id ?? sourceRunId,
    publishedAt: toIso(found.published_at),
    created: false,
    idempotencyKey,
  };
}

function toIso(value: string | Date | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}
