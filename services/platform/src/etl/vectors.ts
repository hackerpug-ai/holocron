/** Sprint 14 ETL vector regeneration — documents → sources/passages → real fleet embeddings. */
import { createHash } from 'node:crypto';
import { createDb, type Sql } from '../db/client.ts';
import { chunkDocument } from '../inference/chunk.ts';
import { embed, RoleUnavailableError } from '../inference/embed.ts';
import { embedRun } from '../inference/embed-run.ts';
import { resolveModel } from '../inference/resolve-model.ts';
import { rrfHybridSearch } from '../search/index.ts';
import { deterministicUuidV7 } from './deterministic-uuidv7.ts';
import { loadLatestRunContext } from './latest-run.ts';

const PAST_8K_MARKER = 'UNIQUE_PAST_8K_MARKER';
const PAST_8K_QUERY =
  'Sprint 14 vector regeneration should retrieve this exact span UNIQUE_PAST_8K_MARKER';
const UNIT_NORM_TOLERANCE = 0.02;

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

async function verifyPast8kRetrieval(
  sql: Sql,
  options?: {
    endpointOverride?: string;
    emptyCorpus?: boolean;
  }
) {
  if (options?.emptyCorpus) {
    return {
      query: PAST_8K_QUERY,
      searchMethod: null,
      ok: true,
      status: 'empty-corpus' as const,
      matchedMarker: false,
      hitDocumentId: null,
      hitPassageId: null,
      score: null,
    };
  }

  const db = createDb(sql);
  const result = await rrfHybridSearch(db, sql, {
    query: PAST_8K_QUERY,
    limit: 5,
    embed: (text, mode) =>
      embed(
        text,
        mode,
        options?.endpointOverride ? { endpointOverride: options.endpointOverride } : undefined
      ),
  });
  const hit = result.results.find((item) => (item.content ?? '').includes(PAST_8K_MARKER)) ?? null;

  return {
    query: PAST_8K_QUERY,
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

      const chunks = chunkDocument(doc.content ?? '', { title: doc.title ?? 'Untitled' });
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

    const embedResult = await embedRun({
      sql,
      embedFn: (text, mode) =>
        embed(text, mode, endpointOverride ? { endpointOverride } : undefined),
    });

    const unitNorm = await verifyUnitNorm(sql);
    const emptyCorpus = docs.length === 0 && passagesInserted === 0;
    const retrieval = await verifyPast8kRetrieval(sql, { endpointOverride, emptyCorpus });
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
