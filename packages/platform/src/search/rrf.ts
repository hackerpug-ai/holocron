/**
 * RRF hybrid search — single-CTE fusion of pgvector HNSW KNN + FTS.
 *
 * search-3 / CAP-EMB-01 / T-DATA-013 / UC-DATA-04:
 *   Embed the query via fleet embed(..., 'query'), then issue ONE Postgres
 *   CTE that fuses HNSW cosine KNN over passages.embedding with FTS over
 *   passages.search_vector using reciprocal-rank fusion k=60
 *   (1.0/(60+rank) per leg — NEVER the old Convex 0.7/0.3 normalize-by-max).
 *
 * Passage hits are aggregated up to the source/document for display.
 */

import type { Db, Sql } from '../db/client';
import { type EmbedMode, embed as fleetEmbed } from '../inference/embed';

/** Reciprocal-rank constant (Cormack et al.). NEVER normalize-by-max. */
export const RRF_K = 60;

/** Qwen3-Embedding dimension — reject any other length. */
export const EMBEDDING_DIM = 1024;

export type EmbedFn = (text: string, mode: EmbedMode) => Promise<number[]>;

export type RrfHybridSearchOptions = {
  query: string;
  /** Max document-level results (default 10). */
  limit?: number;
  /**
   * Optional embed override. Production / integration tests leave this unset
   * so the shared fleet embed() helper is used (QUERY mode).
   */
  embed?: EmbedFn;
  /** Candidate pool size per leg before fusion (default max(limit*5, 50)). */
  candidateLimit?: number;
};

export type RrfSearchResultItem = {
  _id: string;
  title?: string;
  content?: string;
  score?: number;
  /** Best-matching passage id (source-level aggregation still exposes it). */
  passage_id?: string;
  document_id?: string | null;
  /** Alias of score — explicit RRF sum of 1/(k+rank) legs. */
  rrf_score?: number;
};

export type RrfHybridSearchResult = {
  results: RrfSearchResultItem[];
  totalResults: number;
  searchMethod: 'rrf';
};

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

type RawRrfRow = {
  _id: string;
  title: string | null;
  content: string | null;
  score: number | string;
  passage_id: string;
  document_id: string | null;
};

/**
 * Hybrid retrieval: fleet QUERY embed → single CTE (vec FULL OUTER JOIN fts)
 * → document/source aggregation → top-k by RRF score.
 *
 * Empty legs are fine: COALESCE(1.0/(60+rank), 0) keeps single-leg hits.
 * Empty result set resolves to { results: [], totalResults: 0, searchMethod: 'rrf' }.
 */
export async function rrfHybridSearch(
  _db: Db,
  sql: Sql,
  options: RrfHybridSearchOptions
): Promise<RrfHybridSearchResult> {
  const query = options.query?.trim() ?? '';
  if (!query) {
    return { results: [], totalResults: 0, searchMethod: 'rrf' };
  }

  const limit = Math.max(1, options.limit ?? 10);
  const candidateLimit = Math.max(options.candidateLimit ?? limit * 5, 50);
  const embedFn: EmbedFn = options.embed ?? ((text, mode) => fleetEmbed(text, mode));

  // MUST embed in QUERY mode (prefixPolicy.query) before the SQL leg.
  const queryVector = await embedFn(query, 'query');
  if (!Array.isArray(queryVector) || queryVector.length !== EMBEDDING_DIM) {
    throw new Error(
      `rrfHybridSearch: query embedding dimension mismatch: got ${
        Array.isArray(queryVector) ? queryVector.length : 0
      }, expected ${EMBEDDING_DIM}`
    );
  }
  if (queryVector.every((v) => v === 0)) {
    throw new Error('rrfHybridSearch: refused all-zero query embedding');
  }

  const vectorLiteral = toVectorLiteral(queryVector);

  // ONE round-trip: vector KNN + FTS fused via 1.0/(60+rank) inside a single CTE.
  // NEVER two sequential SQL statements. NEVER 0.7/0.3 normalize-by-max.
  const rows = await sql<RawRrfRow[]>`
    WITH vec AS (
      SELECT
        p.id,
        p.source_id,
        p.document_id,
        p.text,
        ROW_NUMBER() OVER (
          ORDER BY p.embedding <=> ${vectorLiteral}::vector
        ) AS rank
      FROM passages p
      WHERE p.embedding IS NOT NULL
      ORDER BY p.embedding <=> ${vectorLiteral}::vector
      LIMIT ${candidateLimit}
    ),
    fts AS (
      SELECT
        p.id,
        p.source_id,
        p.document_id,
        p.text,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(
            p.search_vector,
            websearch_to_tsquery('english', ${query})
          ) DESC
        ) AS rank
      FROM passages p
      WHERE p.search_vector @@ websearch_to_tsquery('english', ${query})
      ORDER BY ts_rank_cd(
        p.search_vector,
        websearch_to_tsquery('english', ${query})
      ) DESC
      LIMIT ${candidateLimit}
    ),
    fused AS (
      SELECT
        COALESCE(v.id, f.id) AS passage_id,
        COALESCE(v.source_id, f.source_id) AS source_id,
        COALESCE(v.document_id, f.document_id) AS document_id,
        COALESCE(v.text, f.text) AS text,
        COALESCE(1.0 / (${RRF_K} + v.rank), 0)
          + COALESCE(1.0 / (${RRF_K} + f.rank), 0) AS rrf_score
      FROM vec v
      FULL OUTER JOIN fts f ON v.id = f.id
    ),
    doc_best AS (
      SELECT
        f.passage_id,
        f.source_id,
        f.document_id,
        f.text,
        f.rrf_score,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(
            f.source_id::text,
            f.document_id,
            f.passage_id::text
          )
          ORDER BY f.rrf_score DESC
        ) AS rn
      FROM fused f
    )
    SELECT
      COALESCE(s.id::text, d.source_id::text, d.passage_id::text) AS _id,
      s.title AS title,
      d.text AS content,
      d.rrf_score AS score,
      d.passage_id::text AS passage_id,
      d.document_id AS document_id
    FROM doc_best d
    LEFT JOIN sources s ON s.id = d.source_id
    WHERE d.rn = 1
    ORDER BY d.rrf_score DESC
    LIMIT ${limit}
  `;

  const results: RrfSearchResultItem[] = (rows ?? []).map((row) => {
    const score = typeof row.score === 'number' ? row.score : Number(row.score);
    return {
      _id: row._id,
      title: row.title ?? undefined,
      content: row.content ?? undefined,
      score: Number.isFinite(score) ? score : 0,
      rrf_score: Number.isFinite(score) ? score : 0,
      passage_id: row.passage_id,
      document_id: row.document_id,
    };
  });

  return {
    results,
    totalResults: results.length,
    searchMethod: 'rrf',
  };
}
