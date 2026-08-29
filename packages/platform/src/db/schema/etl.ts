/**
 * Sprint 14 ETL / upload runtime tables.
 *
 * - etl_runs: immutable-archive provenance + checkpoints
 * - etl_stage: raw staged JSONB rows from the export
 * - upload_intents: authoritative upload init/PUT/finalize state machine
 */
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, timestamptz, typedJsonb, updatedAtColumn } from '../columns';

export const etlRuns = pgTable(
  'etl_runs',
  {
    id: idColumn(),
    exportRoot: text('export_root').notNull(),
    exportHash: text('export_hash').notNull(),
    catalogPath: text('catalog_path').notNull(),
    catalogVersion: text('catalog_version').notNull(),
    checkpoint: text('checkpoint').notNull().default('created'),
    status: text('status').notNull().default('running'),
    errorReason: text('error_reason'),
    manifestJson: typedJsonb('manifest_json'),
    summaryJson: typedJsonb('summary_json'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
  },
  (t) => [index('etl_runs_export_hash_idx').on(t.exportHash)]
);

export const etlStage = pgTable(
  'etl_stage',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => etlRuns.id, { onDelete: 'cascade' }),
    sourceTable: text('source_table').notNull(),
    legacyId: text('legacy_id').notNull(),
    creationTimeMs: text('creation_time_ms'),
    rowHash: text('row_hash').notNull(),
    rowJson: typedJsonb('row_json').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index('etl_stage_run_id_idx').on(t.runId),
    index('etl_stage_source_table_idx').on(t.sourceTable),
    uniqueIndex('etl_stage_run_table_legacy_uidx').on(t.runId, t.sourceTable, t.legacyId),
  ]
);

export const uploadIntents = pgTable(
  'upload_intents',
  {
    id: idColumn(),
    idempotencyKey: text('idempotency_key').notNull(),
    kind: text('kind').notNull(),
    targetId: uuid('target_id').notNull(),
    declaredSha256: text('declared_sha256').notNull(),
    declaredByteLength: integer('declared_byte_length').notNull(),
    declaredMimeType: text('declared_mime_type').notNull(),
    originalName: text('original_name'),
    status: text('status').notNull().default('initiated'),
    stagedPath: text('staged_path'),
    stagedByteLength: integer('staged_byte_length'),
    actualSha256: text('actual_sha256'),
    actualMimeType: text('actual_mime_type'),
    actualByteLength: integer('actual_byte_length'),
    resultBlobId: text('result_blob_id'),
    resultFileObjectId: text('result_file_object_id'),
    resultJson: typedJsonb('result_json'),
    errorReason: text('error_reason'),
    expiresAt: timestamptz('expires_at'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    finalizedAt: timestamptz('finalized_at'),
  },
  (t) => [uniqueIndex('upload_intents_idempotency_uidx').on(t.idempotencyKey)]
);
