/**
 * Persist a research report as a documents row, ingest passages, and stamp
 * research_sessions.document_id. Idempotent on source_run_id = sessionId.
 */
import { randomUUID } from 'node:crypto';
import { createSql, type Sql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { ingestDocument } from '../etl/ingest-document.ts';

export type PublishResearchReportInput = {
  sessionId: string;
  title: string;
  content: string;
  sql?: Sql;
  databaseUrl?: string;
  /** Skip queue enqueue so callers can embedRun inline (tests / live gate). */
  skipEnqueue?: boolean;
};

export type PublishResearchReportResult =
  | {
      ok: true;
      documentId: string;
      created: boolean;
      passageCount: number;
      embeddingStatus: 'pending' | 'complete';
    }
  | { ok: false; error: string };

function resolveSql(input: PublishResearchReportInput): { sql: Sql; ownsSql: boolean } {
  if (input.sql) return { sql: input.sql, ownsSql: false };
  return {
    sql: createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: input.databaseUrl,
        context: 'research publish report',
      }),
      { max: 1 }
    ),
    ownsSql: true,
  };
}

export async function publishResearchReport(
  input: PublishResearchReportInput
): Promise<PublishResearchReportResult> {
  const sessionId = input.sessionId.trim();
  const title = input.title.trim() || `Research ${sessionId}`;
  const content = input.content.trim();
  if (!sessionId) return { ok: false, error: 'sessionId is required' };
  if (!content) return { ok: false, error: 'refusing empty research report content' };

  const { sql, ownsSql } = resolveSql(input);
  try {
    const existing = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM documents
      WHERE source_run_id = ${sessionId}::uuid
      LIMIT 1
    `;
    let documentId = existing[0]?.id;
    let created = false;

    if (!documentId) {
      documentId = randomUUID();
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO documents (
          id, title, content, category, status, is_public,
          research_type, source_run_id, published_at, publish_idempotency_key
        ) VALUES (
          ${documentId}::uuid,
          ${title},
          ${content},
          'research',
          'published',
          false,
          'deep',
          ${sessionId}::uuid,
          now(),
          ${`research-session:${sessionId}`}
        )
        ON CONFLICT (source_run_id) DO NOTHING
        RETURNING id::text AS id
      `;
      if (inserted[0]?.id) {
        documentId = inserted[0].id;
        created = true;
      } else {
        const raced = await sql<{ id: string }[]>`
          SELECT id::text AS id FROM documents
          WHERE source_run_id = ${sessionId}::uuid
          LIMIT 1
        `;
        documentId = raced[0]?.id;
        created = false;
      }
    } else {
      await sql`
        UPDATE documents
        SET title = ${title},
            content = ${content},
            category = 'research',
            status = 'published',
            published_at = COALESCE(published_at, now())
        WHERE id = ${documentId}::uuid
      `;
    }

    if (!documentId) {
      return { ok: false, error: `document publish failed for session ${sessionId}` };
    }

    const createdAtRows = await sql<{ createdAtMs: string | number | Date }[]>`
      SELECT (extract(epoch FROM created_at) * 1000)::bigint AS "createdAtMs"
      FROM documents WHERE id = ${documentId}::uuid LIMIT 1
    `;
    const createdAtMs = Math.floor(Number(createdAtRows[0]?.createdAtMs ?? Date.now()));

    const ingested = await ingestDocument(
      sql,
      {
        id: documentId,
        title,
        content,
        created_at_ms: createdAtMs,
      },
      {
        databaseUrl: input.databaseUrl,
        skipEnqueue: input.skipEnqueue === true,
      }
    );

    await sql`
      UPDATE research_sessions
      SET document_id = ${documentId}::uuid,
          plan = COALESCE(plan, '{}'::jsonb) || ${sql.json(
            toSqlJsonValue({ documentId, publishedAt: new Date().toISOString() })
          )},
          updated_at = now()
      WHERE id = ${sessionId}::uuid
    `;

    return {
      ok: true,
      documentId,
      created,
      passageCount: ingested.passageCount,
      embeddingStatus: ingested.embeddingStatus,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
