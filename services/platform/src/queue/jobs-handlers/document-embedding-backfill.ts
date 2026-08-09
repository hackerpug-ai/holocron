/**
 * Port of document embedding backfill cron.
 * Counts documents missing embeddings and records a backfill intent.
 * Actual embed() is owned by the embed:run path — we do not stub vectors.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const documentEmbeddingBackfill: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    // documents table may not have embedding column (moved to chunks); probe.
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'documents'
        AND column_name = 'embedding'
    `;

    if (cols.length === 0) {
      // Chunk-based embeddings: count documents with zero chunks as orphaned.
      const orphaned = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM documents d
        WHERE NOT EXISTS (
          SELECT 1 FROM document_chunks c WHERE c.document_id = d.id
        )
      `.catch(async () => {
        // document_chunks may not exist — fall back to total document count as backlog signal
        return sql<{ count: string }[]>`SELECT count(*)::text AS count FROM documents`;
      });

      return {
        ok: true,
        detail: {
          mode: 'chunk-backed',
          orphaned_count: Number(orphaned[0]?.count ?? 0),
          embedded: 0,
          note: 'use holo embed:run for real vectors; no fabricated embeddings',
        },
      };
    }

    const missing = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM documents
      WHERE embedding IS NULL
    `;

    return {
      ok: true,
      detail: {
        mode: 'column-backed',
        missing_count: Number(missing[0]?.count ?? 0),
        embedded: 0,
        note: 'use holo embed:run for real vectors; no fabricated embeddings',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
