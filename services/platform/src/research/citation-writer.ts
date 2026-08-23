/**
 * Citation writer — canonical per-claim ledger in `citations`, plus a display
 * subset projected into iteration.sources (via caller / insertResearchIteration).
 */
import { createSql, type Sql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import type { ResearchIterationSource } from './iteration-writer.ts';

type SqlOpts = {
  databaseUrl?: string;
  sql?: Sql;
};

export type InsertCitationInput = {
  sessionId: string;
  sourceUrl: string;
  sourceTitle?: string;
  sourceDomain?: string;
  claimText?: string;
  claimMarker?: string;
  sourceType?: string;
  credibilityScore?: number;
  evidenceType?: string;
  publishedDate?: string;
  authorCredentials?: string;
  documentId?: string;
  deepResearchSessionId?: string;
  metadataJson?: Record<string, unknown>;
} & SqlOpts;

export type InsertCitationResult =
  | {
      ok: true;
      citationId: string;
      displaySource: ResearchIterationSource;
    }
  | { ok: false; error: string };

function resolveSql(opts: SqlOpts, context: string): { sql: Sql; ownsSql: boolean } {
  if (opts.sql) return { sql: opts.sql, ownsSql: false };
  return {
    sql: createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: opts.databaseUrl,
        context,
      })
    ),
    ownsSql: true,
  };
}

function domainFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Write a citations row and return the display subset for iteration.sources.
 */
export async function insertCitation(input: InsertCitationInput): Promise<InsertCitationResult> {
  const sessionId = input.sessionId?.trim();
  const sourceUrl = input.sourceUrl?.trim();
  if (!sessionId) return { ok: false, error: 'sessionId is required' };
  if (!sourceUrl) return { ok: false, error: 'sourceUrl is required' };

  const { sql, ownsSql } = resolveSql(input, 'research citation insert');
  const sourceDomain = input.sourceDomain ?? domainFromUrl(sourceUrl) ?? null;
  const sourceTitle = input.sourceTitle ?? sourceUrl;

  try {
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO citations (
        session_id,
        document_id,
        deep_research_session_id,
        source_url,
        source_title,
        source_domain,
        claim_text,
        claim_marker,
        source_type,
        credibility_score,
        evidence_type,
        published_date,
        author_credentials,
        retrieved_at,
        metadata_json,
        created_at
      )
      VALUES (
        ${sessionId}::uuid,
        ${input.documentId ?? null}::uuid,
        ${input.deepResearchSessionId ?? sessionId}::uuid,
        ${sourceUrl},
        ${sourceTitle},
        ${sourceDomain},
        ${input.claimText ?? null},
        ${input.claimMarker ?? null},
        ${input.sourceType ?? 'web'},
        ${input.credibilityScore ?? null},
        ${input.evidenceType ?? null},
        ${input.publishedDate ?? null},
        ${input.authorCredentials ?? null},
        now(),
        ${input.metadataJson != null ? sql.json(toSqlJsonValue(input.metadataJson)) : null},
        now()
      )
      RETURNING id::text AS id
    `;

    const citationId = inserted[0]?.id;
    if (!citationId) return { ok: false, error: 'citations insert returned no id' };

    const displaySource: ResearchIterationSource = {
      title: sourceTitle,
      url: sourceUrl,
      domain: sourceDomain ?? undefined,
      citationId,
    };

    return { ok: true, citationId, displaySource };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}

/** Project citation display rows into the shape iteration.sources expects. */
export function citationsToIterationSources(
  citations: Array<{ citationId: string; title?: string; url: string; domain?: string }>
): ResearchIterationSource[] {
  return citations.map((c) => ({
    title: c.title ?? c.url,
    url: c.url,
    domain: c.domain,
    citationId: c.citationId,
  }));
}
