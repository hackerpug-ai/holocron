/**
 * CAP-CUT-01 / D07-04 / UC-SYNC-04 — data_plane_ponr ledger.
 *
 * Append-only singleton row binding the first accepted Postgres production write
 * to a live Convex escape-hatch snapshot. Immutability is enforced in migration
 * 0030 (grants + BEFORE UPDATE/DELETE trigger), not in application code.
 */
import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from '../columns';

export const dataPlanePonr = pgTable(
  'data_plane_ponr',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    recordedAt: timestamptz('recorded_at').default(sql`now()`).notNull(),
    fenceLiftedAt: timestamptz('fence_lifted_at').notNull(),
    writeSurface: text('write_surface').notNull(),
    writeTable: text('write_table').notNull(),
    writeRowId: text('write_row_id').notNull(),
    writeRowDigestSha256: text('write_row_digest_sha256').notNull(),
    writeCommittedAt: timestamptz('write_committed_at').notNull(),
    baseUrl: text('base_url').notNull(),
    operator: text('operator').notNull(),
    runId: text('run_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    exportWatermarkMs: bigint('export_watermark_ms', { mode: 'number' }).notNull(),
    convexFenceAuditId: text('convex_fence_audit_id').notNull(),
    convexFenceEnvValue: text('convex_fence_env_value').notNull(),
    convexDocumentsTotal: bigint('convex_documents_total', { mode: 'number' }).notNull(),
    convexNewestDocumentCreationTime: bigint('convex_newest_document_creation_time', {
      mode: 'number',
    }).notNull(),
    convexAcceptedWritesSinceWatermark: bigint('convex_accepted_writes_since_watermark', {
      mode: 'number',
    }).notNull(),
    convexRejectedWritesSinceWatermark: bigint('convex_rejected_writes_since_watermark', {
      mode: 'number',
    }).notNull(),
  },
  (t) => [
    check('data_plane_ponr_digest_hex_check', sql`${t.writeRowDigestSha256} ~ '^[0-9a-f]{64}$'`),
    check('data_plane_ponr_accepted_zero_check', sql`${t.convexAcceptedWritesSinceWatermark} = 0`),
  ]
);

export type DataPlanePonrRow = typeof dataPlanePonr.$inferSelect;
export type DataPlanePonrInsert = typeof dataPlanePonr.$inferInsert;
