/** Shared file_objects upsert helper for ETL + upload CAS writers. */
import type { Sql } from '../db/client.ts';
import { deterministicUuidV7 } from '../etl/deterministic-uuidv7.ts';

export interface UpsertFileObjectInput {
  contentHash: string;
  legacyConvexId?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  storagePath?: string | null;
  originalName?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpsertFileObjectResult {
  id: string;
  legacyConvexId: string | null;
}

function canonicalFileObjectId(contentHash: string): string {
  return deterministicUuidV7(0, `blob:${contentHash}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  return [
    ...new Set([...values].filter((value): value is string => typeof value === 'string')),
  ].sort();
}

function readMetadataStringArray(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  if (Array.isArray(value)) {
    return uniqueStrings(value);
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

function normalizeFileObjectMetadata(
  metadata: Record<string, unknown> | null | undefined,
  legacyConvexId: string | null
): Record<string, unknown> {
  const normalized = isRecord(metadata) ? { ...metadata } : {};

  const legacyIds = uniqueStrings([
    ...readMetadataStringArray(normalized, 'legacyIds'),
    legacyConvexId,
  ]);
  if (legacyIds.length > 0) {
    normalized.legacyIds = legacyIds;
  }

  const sourceRefs = readMetadataStringArray(normalized, 'sourceRefs');
  if (sourceRefs.length > 0) {
    normalized.sourceRefs = sourceRefs;
  }

  const dispositions = readMetadataStringArray(normalized, 'dispositions');
  if (dispositions.length > 0) {
    normalized.dispositions = dispositions;
  }

  const producers = readMetadataStringArray(normalized, 'producers');
  if (producers.length > 0) {
    normalized.producers = producers;
  }

  return normalized;
}

export async function upsertFileObject(
  sql: Sql,
  input: UpsertFileObjectInput
): Promise<UpsertFileObjectResult> {
  const metadata = normalizeFileObjectMetadata(input.metadata, input.legacyConvexId ?? null);
  const rows = await sql.unsafe<Array<{ id: string; legacy_convex_id: string | null }>>(
    `
      INSERT INTO "file_objects" (
        "id",
        "legacy_convex_id",
        "content_hash",
        "mime_type",
        "byte_size",
        "storage_path",
        "original_name",
        "metadata_json"
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT ("content_hash") DO UPDATE SET
        "mime_type" = COALESCE(EXCLUDED."mime_type", "file_objects"."mime_type"),
        "byte_size" = COALESCE(EXCLUDED."byte_size", "file_objects"."byte_size"),
        "storage_path" = COALESCE(EXCLUDED."storage_path", "file_objects"."storage_path"),
        "original_name" = COALESCE(EXCLUDED."original_name", "file_objects"."original_name"),
        "legacy_convex_id" = CASE
          WHEN "file_objects"."legacy_convex_id" IS NULL THEN EXCLUDED."legacy_convex_id"
          WHEN EXCLUDED."legacy_convex_id" IS NULL THEN "file_objects"."legacy_convex_id"
          WHEN "file_objects"."legacy_convex_id" = EXCLUDED."legacy_convex_id"
            THEN "file_objects"."legacy_convex_id"
          ELSE "file_objects"."legacy_convex_id"
        END,
        "metadata_json" = (
          COALESCE("file_objects"."metadata_json", '{}'::jsonb)
          || COALESCE(EXCLUDED."metadata_json", '{}'::jsonb)
          || jsonb_build_object(
            'legacyIds',
            (
              SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
              FROM (
                SELECT DISTINCT legacy_value AS value
                FROM jsonb_array_elements_text(
                  COALESCE("file_objects"."metadata_json"->'legacyIds', '[]'::jsonb)
                  || COALESCE(EXCLUDED."metadata_json"->'legacyIds', '[]'::jsonb)
                ) AS legacy(legacy_value)
              ) AS legacy_values
            ),
            'sourceRefs',
            (
              SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
              FROM (
                SELECT DISTINCT source_ref_value AS value
                FROM jsonb_array_elements_text(
                  COALESCE("file_objects"."metadata_json"->'sourceRefs', '[]'::jsonb)
                  || COALESCE(EXCLUDED."metadata_json"->'sourceRefs', '[]'::jsonb)
                ) AS source_refs(source_ref_value)
              ) AS source_ref_values
            ),
            'dispositions',
            (
              SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
              FROM (
                SELECT DISTINCT disposition_value AS value
                FROM jsonb_array_elements_text(
                  COALESCE("file_objects"."metadata_json"->'dispositions', '[]'::jsonb)
                  || COALESCE(EXCLUDED."metadata_json"->'dispositions', '[]'::jsonb)
                ) AS dispositions(disposition_value)
              ) AS disposition_values
            ),
            'producers',
            (
              SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
              FROM (
                SELECT DISTINCT producer_value AS value
                FROM jsonb_array_elements_text(
                  COALESCE("file_objects"."metadata_json"->'producers', '[]'::jsonb)
                  || COALESCE(EXCLUDED."metadata_json"->'producers', '[]'::jsonb)
                ) AS producers(producer_value)
              ) AS producer_values
            )
          )
        )
      RETURNING "id"::text AS id, "legacy_convex_id"
    `,
    [
      canonicalFileObjectId(input.contentHash),
      input.legacyConvexId ?? null,
      input.contentHash,
      input.mimeType ?? null,
      input.byteSize ?? null,
      input.storagePath ?? null,
      input.originalName ?? null,
      metadata,
    ]
  );

  const row = rows[0];
  if (!row?.id) {
    throw new Error(`file_objects upsert did not return id for ${input.contentHash}`);
  }

  return {
    id: row.id,
    legacyConvexId: row.legacy_convex_id,
  };
}
