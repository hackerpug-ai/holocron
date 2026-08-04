/** Sprint 14 ETL vector regeneration — documents → sources/passages → real fleet embeddings. */
import { createHash } from 'node:crypto';
import { createDb, type Sql } from '../db/client.ts';
import { chunkDocument, type PassageChunk } from '../inference/chunk.ts';
import { embed, RoleUnavailableError } from '../inference/embed.ts';
import { type EmbedFn, embedRun } from '../inference/embed-run.ts';
import { resolveModel } from '../inference/resolve-model.ts';
import { rrfHybridSearch } from '../search/index.ts';
import { deterministicUuidV7 } from './deterministic-uuidv7.ts';
import { loadLatestRunContext } from './latest-run.ts';

const PAST_8K_MARKER = 'UNIQUE_PAST_8K_MARKER';
const PAST_8K_QUERY =
  'Sprint 14 vector regeneration should retrieve this exact span UNIQUE_PAST_8K_MARKER';
const UNIT_NORM_TOLERANCE = 0.02;
// Bump whenever chunkDocument output or the persisted embedding input contract changes.
// The revision is stored with every passage so an ETL rerun can invalidate vectors
// produced for older passage text instead of silently ranking stale embeddings.
const PASSAGE_EMBEDDING_REVISION = 'chunk-document-v2-past-8k-anchor';
const PAST_8K_OFFSET = 8_000;
const ANCHOR_WORDS = 12;
const MAX_ANCHOR_QUERY_WORDS = 8;
const ANCHOR_QUERY_STOP_WORDS = new Set([
  'and',
  'any',
  'are',
  'for',
  'from',
  'not',
  'other',
  'that',
  'the',
  'this',
  'was',
  'with',
]);

export type Past8kRetrievalAnchor = {
  documentId: string;
  passageOrdinal: number;
  sourceOffset: number;
  marker: string;
  query: string;
};

export type EtlVectorRetrievalStatus = 'marker-found' | 'marker-missing' | 'empty-corpus';

export interface EtlVectorRunResult {
  ok: boolean;
  documentsProcessed: number;
  passagesInserted: number;
  embed: {
    processed: number;
    remainingNull: number;
    modelId: string;
    modelRevision: string;
    endpoint: string;
    provider: string;
    embeddingDimension: number;
  };
  markerFoundPast8k: boolean;
  fleetProbe: {
    endpoint: string;
    modelId: string;
    modelRevision: string;
    provider: string;
    embeddingDimension: number;
    probeVectorNorm: number;
    probeUnitNormOk: boolean;
  };
  unitNorm: {
    checked: number;
    violations: number;
    maxDeviation: number;
    tolerance: number;
  };
  retrieval: {
    query: string;
    querySha256: string | null;
    anchorMarkerSha256: string | null;
    anchorDocumentId: string | null;
    anchorSourceOffset: number | null;
    searchMethod: string | null;
    ok: boolean;
    status: EtlVectorRetrievalStatus;
    matchedMarker: boolean;
    hitDocumentId: string | null;
    hitPassageId: string | null;
    score: number | null;
  };
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function vectorNorm(vector: number[]): number {
  return Math.hypot(...vector);
}

function normalizeRetrievalText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function retrievalTokens(text: string): string[] {
  return [...text.matchAll(/[\p{L}\p{N}_'-]+/gu)].map((match) => match[0].toLocaleLowerCase());
}

export function passageContainsRetrievalAnchor(text: string, marker: string): boolean {
  const passage = retrievalTokens(text);
  const anchor = retrievalTokens(marker);
  if (anchor.length === 0 || passage.length < anchor.length) return false;
  for (let start = 0; start <= passage.length - anchor.length; start += 1) {
    if (anchor.every((token, offset) => passage[start + offset] === token)) return true;
  }
  return false;
}

function isRetrievalWordCharacter(character: string | undefined): boolean {
  return character != null && /[\p{L}\p{N}_'-]/u.test(character);
}

function buildAnchorQuery(words: readonly string[]): string {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const lower = word.toLocaleLowerCase();
    const hyphens = [...word].filter((character) => character === '-').length;
    if (
      word.length < 3 ||
      word.length > 32 ||
      word.includes('_') ||
      hyphens > 1 ||
      ANCHOR_QUERY_STOP_WORDS.has(lower)
    ) {
      continue;
    }
    // Opaque URL/video identifiers are poor websearch_to_tsquery terms. Keep
    // human words and pure numbers, but drop mixed alphanumeric IDs.
    if (/[\p{L}]/u.test(word) && /\p{N}/u.test(word)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    selected.push(word);
    if (selected.length >= MAX_ANCHOR_QUERY_WORDS) break;
  }
  return normalizeRetrievalText(selected.join(' '));
}

function retrievalAnchorDistinctiveness(anchor: Past8kRetrievalAnchor): number {
  const unique = [...new Set(retrievalTokens(anchor.query))];
  // Anchor windows have a bounded word count, so character-rich human terms
  // are a better proxy for selectivity than simply rewarding one more generic
  // token. Cubing bounded token lengths makes a phrase such as
  // "kestrel observability" outrank boilerplate such as "system output data".
  return unique.length * 100 + unique.reduce((sum, word) => sum + word.length ** 3, 0);
}

export function selectMostDistinctivePast8kAnchor(
  candidates: readonly Past8kRetrievalAnchor[]
): Past8kRetrievalAnchor | null {
  return (
    [...candidates].sort((left, right) => {
      const leftFixture = left.marker === PAST_8K_MARKER ? 1 : 0;
      const rightFixture = right.marker === PAST_8K_MARKER ? 1 : 0;
      if (leftFixture !== rightFixture) return rightFixture - leftFixture;
      const scoreDelta =
        retrievalAnchorDistinctiveness(right) - retrievalAnchorDistinctiveness(left);
      if (scoreDelta !== 0) return scoreDelta;
      if (left.sourceOffset !== right.sourceOffset) return left.sourceOffset - right.sourceOffset;
      return left.documentId.localeCompare(right.documentId);
    })[0] ?? null
  );
}

/**
 * Derive a deterministic retrieval oracle from the actual source document.
 *
 * The Sprint 14 fixture keeps its explicit marker, but production exports do
 * not need to contain fixture-only text. For real data, choose the most
 * distinctive word window whose source offset is at or beyond character 8K.
 */
export function selectPast8kRetrievalAnchor(
  documentId: string,
  chunks: readonly PassageChunk[]
): Past8kRetrievalAnchor | null {
  for (const chunk of chunks) {
    const markerIndex = chunk.text.indexOf(PAST_8K_MARKER);
    if (markerIndex >= 0 && chunk.startOffset + markerIndex >= PAST_8K_OFFSET) {
      return {
        documentId,
        passageOrdinal: chunk.ordinal,
        sourceOffset: chunk.startOffset + markerIndex,
        marker: PAST_8K_MARKER,
        query: PAST_8K_QUERY,
      };
    }
  }

  let best:
    | (Past8kRetrievalAnchor & {
        score: number;
      })
    | null = null;

  for (const chunk of chunks) {
    if (chunk.endOffset <= PAST_8K_OFFSET) continue;
    const relativeStart = Math.max(0, PAST_8K_OFFSET - chunk.startOffset);
    let scanStart = relativeStart;
    if (
      scanStart > 0 &&
      isRetrievalWordCharacter(chunk.text[scanStart - 1]) &&
      isRetrievalWordCharacter(chunk.text[scanStart])
    ) {
      while (scanStart < chunk.text.length && isRetrievalWordCharacter(chunk.text[scanStart])) {
        scanStart += 1;
      }
    }
    const tail = chunk.text.slice(scanStart);
    const matches = [...tail.matchAll(/[\p{L}\p{N}_'-]+/gu)];
    if (matches.length < 4) continue;

    for (let start = 0; start < matches.length; start += 1) {
      const selected = matches.slice(start, start + ANCHOR_WORDS);
      if (selected.length < 4) break;
      const words = selected.map((match) => match[0]);
      const marker = normalizeRetrievalText(words.join(' '));
      if (marker.length < 24) continue;
      const query = buildAnchorQuery(words);
      const queryWords = retrievalTokens(query);
      if (queryWords.length < 3) continue;
      const localOffset = scanStart + (selected[0]?.index ?? 0);
      const candidateBase: Past8kRetrievalAnchor = {
        documentId,
        passageOrdinal: chunk.ordinal,
        sourceOffset: chunk.startOffset + localOffset,
        marker,
        query,
      };
      const candidate = {
        ...candidateBase,
        score: retrievalAnchorDistinctiveness(candidateBase),
      };
      if (
        !best ||
        candidate.score > best.score ||
        (candidate.score === best.score && candidate.sourceOffset < best.sourceOffset)
      ) {
        best = candidate;
      }
    }
  }

  if (!best) return null;
  const { score: _score, ...anchor } = best;
  return anchor;
}

async function probeEmbedCapability(endpointOverride?: string) {
  const resolved = await resolveModel('embed', endpointOverride ? { endpointOverride } : undefined);
  const probeVector = await embed(
    'holocron etl:vectors fleet probe',
    'document',
    endpointOverride ? { endpointOverride } : undefined
  );

  const probeVectorNorm = vectorNorm(probeVector);
  return {
    endpoint: resolved.endpoint,
    modelId: resolved.litellmModelId,
    modelRevision: resolved.modelRevision,
    provider: resolved.provider,
    embeddingDimension: resolved.embeddingDimension ?? probeVector.length,
    probeVectorNorm,
    probeUnitNormOk: Math.abs(probeVectorNorm - 1) <= UNIT_NORM_TOLERANCE,
  };
}

async function verifyUnitNorm(sql: Sql) {
  const rows = await sql<
    Array<{
      checked: string;
      violations: string;
      max_deviation: string;
    }>
  >`
    SELECT
      count(*) FILTER (WHERE embedding IS NOT NULL)::text AS checked,
      count(*) FILTER (
        WHERE embedding IS NOT NULL
          AND abs(sqrt(greatest((embedding <#> embedding) * -1, 0)) - 1.0) > ${UNIT_NORM_TOLERANCE}
      )::text AS violations,
      COALESCE(
        max(abs(sqrt(greatest((embedding <#> embedding) * -1, 0)) - 1.0)),
        0
      )::text AS max_deviation
    FROM passages
  `;

  return {
    checked: Number(rows[0]?.checked ?? 0),
    violations: Number(rows[0]?.violations ?? 0),
    maxDeviation: Number(rows[0]?.max_deviation ?? 0),
    tolerance: UNIT_NORM_TOLERANCE,
  };
}

async function embedAllPassages(options: { sql: Sql; databaseUrl: string; embedFn: EmbedFn }) {
  const configured = Number.parseInt(process.env.ETL_EMBED_CONCURRENCY ?? '16', 10);
  const concurrency = Number.isFinite(configured) ? Math.min(32, Math.max(1, configured)) : 16;
  const workers = await Promise.all(
    Array.from({ length: concurrency }, () =>
      embedRun({
        databaseUrl: options.databaseUrl,
        embedFn: options.embedFn,
      })
    )
  );
  const remainingRows = await options.sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM passages WHERE embedding IS NULL
  `;
  return {
    processed: workers.reduce((total, worker) => total + worker.processed, 0),
    remainingNull: Number(remainingRows[0]?.count ?? 0),
  };
}

async function verifyPast8kRetrieval(
  sql: Sql,
  options?: {
    endpointOverride?: string;
    emptyCorpus?: boolean;
    anchor?: Past8kRetrievalAnchor | null;
  }
) {
  if (options?.emptyCorpus) {
    return {
      query: PAST_8K_QUERY,
      querySha256: sha256Text(PAST_8K_QUERY),
      anchorMarkerSha256: null,
      anchorDocumentId: null,
      anchorSourceOffset: null,
      searchMethod: null,
      ok: true,
      status: 'empty-corpus' as const,
      matchedMarker: false,
      hitDocumentId: null,
      hitPassageId: null,
      score: null,
    };
  }

  if (!options?.anchor) {
    return {
      query: '',
      querySha256: null,
      anchorMarkerSha256: null,
      anchorDocumentId: null,
      anchorSourceOffset: null,
      searchMethod: null,
      ok: false,
      status: 'marker-missing' as const,
      matchedMarker: false,
      hitDocumentId: null,
      hitPassageId: null,
      score: null,
    };
  }

  const db = createDb(sql);
  const result = await rrfHybridSearch(db, sql, {
    query: options.anchor.query,
    limit: 5,
    embed: (text, mode) =>
      embed(
        text,
        mode,
        options?.endpointOverride ? { endpointOverride: options.endpointOverride } : undefined
      ),
  });
  const normalizedMarker = normalizeRetrievalText(options.anchor.marker);
  const hit =
    result.results.find(
      (item) =>
        item.document_id === options.anchor?.documentId &&
        passageContainsRetrievalAnchor(item.content ?? '', normalizedMarker)
    ) ?? null;

  return {
    query: options.anchor.query,
    querySha256: sha256Text(options.anchor.query),
    anchorMarkerSha256: sha256Text(normalizedMarker),
    anchorDocumentId: options.anchor.documentId,
    anchorSourceOffset: options.anchor.sourceOffset,
    searchMethod: result.searchMethod ?? null,
    ok: hit != null,
    status: hit != null ? ('marker-found' as const) : ('marker-missing' as const),
    matchedMarker: hit != null,
    hitDocumentId: hit?.document_id ?? null,
    hitPassageId: hit?.passage_id ?? null,
    score: typeof hit?.score === 'number' ? hit.score : null,
  };
}

export async function runEtlVectors(options?: {
  databaseUrl?: string;
  exportDir?: string | null;
  catalogPath?: string;
}): Promise<EtlVectorRunResult> {
  const ctx = await loadLatestRunContext({
    databaseUrl: options?.databaseUrl,
    exportDir: options?.exportDir,
    catalogPath: options?.catalogPath,
  });
  const { sql } = ctx;
  try {
    const endpointOverride = process.env.FLEET_URL;
    const fleetProbe = await probeEmbedCapability(endpointOverride);

    const docs = await sql<
      Array<{
        id: string;
        legacy_convex_id: string | null;
        title: string | null;
        content: string | null;
        created_at_ms: string;
      }>
    >`
      SELECT
        id::text AS id,
        legacy_convex_id,
        title,
        content,
        extract(epoch FROM created_at) * 1000 AS created_at_ms
      FROM documents
      WHERE content IS NOT NULL AND btrim(content) <> ''
      ORDER BY created_at, id
    `;

    let passagesInserted = 0;
    const past8kCandidates: Past8kRetrievalAnchor[] = [];
    for (const doc of docs) {
      const createdAtMs = Number(doc.created_at_ms || 0);
      const sourceId = deterministicUuidV7(createdAtMs, `source:${doc.id}`);
      const contentHash = sha256Text(`${doc.id}\0${doc.content ?? ''}`);
      await sql`
        INSERT INTO sources (id, legacy_convex_id, source_kind, document_id, content_hash, title, metadata_json)
        VALUES (
          ${sourceId}::uuid,
          ${doc.legacy_convex_id},
          'document',
          ${doc.id},
          ${contentHash},
          ${doc.title},
          ${sql.json({ kind: 'etl_document_source' })}
        )
        ON CONFLICT (id) DO UPDATE
          SET document_id = EXCLUDED.document_id,
              content_hash = EXCLUDED.content_hash,
              title = EXCLUDED.title,
              metadata_json = EXCLUDED.metadata_json
      `;

      const chunks = chunkDocument(doc.content ?? '', {
        title: doc.title ?? 'Untitled',
      });
      const candidate = selectPast8kRetrievalAnchor(doc.id, chunks);
      if (candidate) past8kCandidates.push(candidate);
      for (const chunk of chunks) {
        const passageId = deterministicUuidV7(
          createdAtMs + chunk.ordinal,
          `passage:${doc.id}:${chunk.ordinal}`
        );
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
            ${`passage:${doc.legacy_convex_id ?? doc.id}:${chunk.ordinal}`},
            ${sourceId}::uuid,
            ${doc.id},
            ${chunk.ordinal},
            ${chunk.text},
            ${chunk.tokenCount},
            ${chunk.situatingHeader},
            NULL,
            ${sql.json({
              embedding: {
                role: 'embed',
                source: 'etl:vectors',
                passageRevision: PASSAGE_EMBEDDING_REVISION,
                dimension: fleetProbe.embeddingDimension,
                modelId: fleetProbe.modelId,
                modelRevision: fleetProbe.modelRevision,
                provider: fleetProbe.provider,
                endpoint: fleetProbe.endpoint,
              },
            })}
          )
          ON CONFLICT (id) DO UPDATE
            SET source_id = EXCLUDED.source_id,
                document_id = EXCLUDED.document_id,
                ordinal = EXCLUDED.ordinal,
                text = EXCLUDED.text,
                token_count = EXCLUDED.token_count,
                situating_header = EXCLUDED.situating_header,
                embedding = CASE
                  WHEN passages.text IS DISTINCT FROM EXCLUDED.text
                    OR passages.metadata_json -> 'embedding'
                      IS DISTINCT FROM EXCLUDED.metadata_json -> 'embedding'
                    THEN NULL
                  ELSE passages.embedding
                END,
                metadata_json = EXCLUDED.metadata_json
        `;
      }
      passagesInserted += chunks.length;
      await sql`
        DELETE FROM passages
        WHERE source_id = ${sourceId}::uuid
          AND ordinal >= ${chunks.length}
      `;
    }

    const past8kAnchor = selectMostDistinctivePast8kAnchor(past8kCandidates);
    const embedResult = await embedAllPassages({
      sql,
      databaseUrl: ctx.databaseUrl,
      embedFn: (text, mode) =>
        embed(text, mode, endpointOverride ? { endpointOverride } : undefined),
    });

    const unitNorm = await verifyUnitNorm(sql);
    const emptyCorpus = docs.length === 0 && passagesInserted === 0;
    const retrieval = await verifyPast8kRetrieval(sql, {
      endpointOverride,
      emptyCorpus,
      anchor: past8kAnchor,
    });
    const markerFoundPast8k = retrieval.status === 'marker-found';
    const retrievalSatisfied =
      retrieval.status === 'empty-corpus' ? retrieval.ok : markerFoundPast8k;

    return {
      ok:
        embedResult.remainingNull === 0 &&
        unitNorm.violations === 0 &&
        retrievalSatisfied &&
        fleetProbe.probeUnitNormOk &&
        Boolean(fleetProbe.modelId) &&
        Boolean(fleetProbe.modelRevision),
      documentsProcessed: docs.length,
      passagesInserted,
      embed: {
        ...embedResult,
        modelId: fleetProbe.modelId,
        modelRevision: fleetProbe.modelRevision,
        endpoint: fleetProbe.endpoint,
        provider: fleetProbe.provider,
        embeddingDimension: fleetProbe.embeddingDimension,
      },
      markerFoundPast8k,
      fleetProbe,
      unitNorm,
      retrieval,
    };
  } catch (error) {
    if (error instanceof RoleUnavailableError) {
      throw error;
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
