/**
 * Inline-HNSW surface search — single-table KNN over the 5 short-text surfaces.
 *
 * search-3 / CAP-EMB-01 / T-DATA-015 / UC-DATA-04:
 *   research_findings, research_iterations, subscription_content,
 *   toolbelt_tools, improvement_requests each carry an inline vector(1024)
 *   with HNSW (vector_cosine_ops). Query is embedded via fleet QUERY mode;
 *   NO Cohere / cloud embedding dependency.
 */

import type { Db, Sql } from '../db/client';
import { embed as fleetEmbed } from '../inference/embed';
import { EMBEDDING_DIM, type EmbedFn } from './rrf';

/** The five inline-HNSW surfaces (passages is hybrid RRF, not listed here). */
export const INLINE_HNSW_SURFACES = [
  'research_findings',
  'research_iterations',
  'subscription_content',
  'toolbelt_tools',
  'improvement_requests',
] as const;

export type InlineHnswSurface = (typeof INLINE_HNSW_SURFACES)[number];

type SurfaceConfig = {
  table: InlineHnswSurface;
  /** Primary text / claim column selected into results. */
  textColumn: string;
  /** Optional title column. */
  titleColumn: string | null;
  /** Extra columns projected onto each result (surface-specific keys). */
  extraColumns: readonly string[];
};

const SURFACE_CONFIG: Record<InlineHnswSurface, SurfaceConfig> = {
  research_findings: {
    table: 'research_findings',
    textColumn: 'claim_text',
    titleColumn: null,
    extraColumns: ['claim_text'],
  },
  research_iterations: {
    table: 'research_iterations',
    textColumn: 'findings_summary',
    titleColumn: 'summary',
    extraColumns: ['findings_summary', 'summary'],
  },
  subscription_content: {
    table: 'subscription_content',
    textColumn: 'title',
    titleColumn: 'title',
    extraColumns: ['title', 'url'],
  },
  toolbelt_tools: {
    table: 'toolbelt_tools',
    textColumn: 'description',
    titleColumn: 'title',
    extraColumns: ['title', 'description', 'content'],
  },
  improvement_requests: {
    table: 'improvement_requests',
    textColumn: 'description',
    titleColumn: 'title',
    extraColumns: ['title', 'description', 'summary'],
  },
};

export type SearchSurfaceOptions = {
  query: string;
  limit?: number;
  /** Optional embed override; production uses fleet embed() QUERY mode. */
  embed?: EmbedFn;
};

export type SurfaceSearchResultItem = {
  _id: string;
  title?: string;
  content?: string;
  score?: number;
  claim_text?: string;
  [key: string]: string | number | null | undefined;
};

export type SearchSurfaceResult = {
  results: SurfaceSearchResultItem[];
  totalResults: number;
  searchMethod: `hnsw:${InlineHnswSurface}`;
};

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function isInlineSurface(name: string): name is InlineHnswSurface {
  return (INLINE_HNSW_SURFACES as readonly string[]).includes(name);
}

/**
 * Single-table HNSW cosine KNN over a named inline surface.
 *
 * @throws when `surface` is not one of the allowed 5 inline-HNSW surfaces
 * @throws when the query embedding is wrong-dim or all-zero
 */
export async function searchSurface(
  _db: Db,
  sql: Sql,
  surface: string,
  options: SearchSurfaceOptions
): Promise<SearchSurfaceResult> {
  if (!isInlineSurface(surface)) {
    throw new Error(
      `searchSurface: unknown surface "${surface}" — allowed: ${INLINE_HNSW_SURFACES.join(', ')}`
    );
  }

  const config = SURFACE_CONFIG[surface];
  const query = options.query?.trim() ?? '';
  if (!query) {
    return {
      results: [],
      totalResults: 0,
      searchMethod: `hnsw:${surface}`,
    };
  }

  const limit = Math.max(1, options.limit ?? 10);
  const embedFn: EmbedFn = options.embed ?? ((text, mode) => fleetEmbed(text, mode));

  const queryVector = await embedFn(query, 'query');
  if (!Array.isArray(queryVector) || queryVector.length !== EMBEDDING_DIM) {
    throw new Error(
      `searchSurface: query embedding dimension mismatch: got ${
        Array.isArray(queryVector) ? queryVector.length : 0
      }, expected ${EMBEDDING_DIM}`
    );
  }
  if (queryVector.every((v) => v === 0)) {
    throw new Error('searchSurface: refused all-zero query embedding');
  }

  const vectorLiteral = toVectorLiteral(queryVector);

  // Single-table HNSW KNN — never a cross-table join, never Cohere.
  // Table/column identifiers are fixed allow-list strings (not user input).
  const titleSelect = config.titleColumn ? `${config.titleColumn} AS title` : 'NULL::text AS title';
  const textSelect = `${config.textColumn} AS content`;
  const extras = config.extraColumns.map((c) => `${c}`).join(', ');
  const extraSelect = extras.length > 0 ? `, ${extras}` : '';

  const sqlText = `
    SELECT
      id::text AS _id,
      ${titleSelect},
      ${textSelect}
      ${extraSelect},
      (1.0 - (embedding <=> $1::vector)) AS score
    FROM ${config.table}
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;

  const rows = (await sql.unsafe(sqlText, [vectorLiteral, limit])) as Array<
    Record<string, unknown>
  >;

  const results: SurfaceSearchResultItem[] = (rows ?? []).map((row) => {
    const scoreRaw = row.score;
    const score =
      typeof scoreRaw === 'number' ? scoreRaw : scoreRaw != null ? Number(scoreRaw) : undefined;
    const item: SurfaceSearchResultItem = {
      _id: String(row._id ?? ''),
      title: row.title != null ? String(row.title) : undefined,
      content: row.content != null ? String(row.content) : undefined,
      score: score !== undefined && Number.isFinite(score) ? score : undefined,
    };
    for (const col of config.extraColumns) {
      if (row[col] != null) {
        item[col] = typeof row[col] === 'number' ? (row[col] as number) : String(row[col]);
      }
    }
    // Ensure claim_text is present for research_findings even if column aliasing differs.
    if (surface === 'research_findings' && item.claim_text == null && item.content) {
      item.claim_text = item.content;
    }
    return item;
  });

  return {
    results,
    totalResults: results.length,
    searchMethod: `hnsw:${surface}`,
  };
}
