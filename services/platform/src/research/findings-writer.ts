/**
 * Research findings writer — INSERT research_findings with real sub-scores + citation_ids.
 */
import { createSql, type Sql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';

type SqlOpts = {
  databaseUrl?: string;
  sql?: Sql;
};

export type InsertResearchFindingInput = {
  sessionId: string;
  claimText: string;
  citationIds: string[];
  iterationId?: string;
  claimCategory?: string;
  sourceCredibilityScore: number;
  evidenceQualityScore: number;
  corroborationScore: number;
  recencyScore: number;
  expertConsensusScore: number;
  confidenceScore: number;
  confidenceLevel?: string;
  confidenceFactors?: unknown;
  caveats?: unknown;
  warnings?: unknown;
  system?: 'simple' | 'deep';
} & SqlOpts;

export type InsertResearchFindingResult =
  | {
      ok: true;
      findingId: string;
      citationIds: string[];
      scores: {
        sourceCredibilityScore: number;
        evidenceQualityScore: number;
        corroborationScore: number;
        recencyScore: number;
        expertConsensusScore: number;
        confidenceScore: number;
      };
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

function requireScore(name: string, value: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${name} must be a finite number`;
  }
  return null;
}

export async function insertResearchFinding(
  input: InsertResearchFindingInput
): Promise<InsertResearchFindingResult> {
  const sessionId = input.sessionId?.trim();
  const claimText = input.claimText?.trim();
  if (!sessionId) return { ok: false, error: 'sessionId is required' };
  if (!claimText) return { ok: false, error: 'claimText is required' };
  if (!Array.isArray(input.citationIds)) {
    return { ok: false, error: 'citationIds must be an array' };
  }

  for (const [name, value] of [
    ['sourceCredibilityScore', input.sourceCredibilityScore],
    ['evidenceQualityScore', input.evidenceQualityScore],
    ['corroborationScore', input.corroborationScore],
    ['recencyScore', input.recencyScore],
    ['expertConsensusScore', input.expertConsensusScore],
    ['confidenceScore', input.confidenceScore],
  ] as const) {
    const err = requireScore(name, value);
    if (err) return { ok: false, error: err };
  }

  const { sql, ownsSql } = resolveSql(input, 'research findings insert');
  const system = input.system ?? 'deep';

  try {
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO research_findings (
        system,
        session_id,
        iteration_id,
        claim_text,
        claim_category,
        source_credibility_score,
        evidence_quality_score,
        corroboration_score,
        recency_score,
        expert_consensus_score,
        confidence_score,
        confidence_level,
        citation_ids,
        confidence_factors,
        caveats,
        warnings,
        created_at
      )
      VALUES (
        ${system},
        ${sessionId}::uuid,
        ${input.iterationId ?? null}::uuid,
        ${claimText},
        ${input.claimCategory ?? null},
        ${input.sourceCredibilityScore},
        ${input.evidenceQualityScore},
        ${input.corroborationScore},
        ${input.recencyScore},
        ${input.expertConsensusScore},
        ${input.confidenceScore},
        ${input.confidenceLevel ?? null},
        ${sql.json(toSqlJsonValue(input.citationIds))},
        ${input.confidenceFactors != null ? sql.json(toSqlJsonValue(input.confidenceFactors)) : null},
        ${input.caveats != null ? sql.json(toSqlJsonValue(input.caveats)) : null},
        ${input.warnings != null ? sql.json(toSqlJsonValue(input.warnings)) : null},
        now()
      )
      RETURNING id::text AS id
    `;

    const findingId = inserted[0]?.id;
    if (!findingId) return { ok: false, error: 'research_findings insert returned no id' };

    return {
      ok: true,
      findingId,
      citationIds: input.citationIds,
      scores: {
        sourceCredibilityScore: input.sourceCredibilityScore,
        evidenceQualityScore: input.evidenceQualityScore,
        corroborationScore: input.corroborationScore,
        recencyScore: input.recencyScore,
        expertConsensusScore: input.expertConsensusScore,
        confidenceScore: input.confidenceScore,
      },
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}
