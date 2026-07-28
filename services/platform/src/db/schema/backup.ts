/**
 * CAP-BAK-01 / D04-03 — backup_heartbeat table.
 *
 * last_success_at is set ONLY after pgBackRest confirms the WAL segment /
 * base backup landed in R2 (anti-fake-healthy). Idempotent upsert on job_name.
 */
import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { timestamptz } from '../columns';

/** Known backup job names written by wal-archive / base-backup jobs. */
export const BACKUP_JOB_NAMES = ['wal_archive', 'base_backup'] as const;
export type BackupJobName = (typeof BACKUP_JOB_NAMES)[number];

/**
 * backup_heartbeat — one row per job, updated after real R2 confirmation.
 *
 * Columns match the D04-03 contract (+ trace_id for OTel correlation).
 */
export const backupHeartbeat = pgTable(
  'backup_heartbeat',
  {
    jobName: text('job_name').primaryKey().notNull(),
    lastSuccessAt: timestamptz('last_success_at'),
    lastWalSegment: text('last_wal_segment'),
    lastSnapshotId: text('last_snapshot_id'),
    objectCount: bigint('object_count', { mode: 'number' }),
    status: text('status'),
    /** Hex trace id of the root span backup:wal_archive / backup:base_backup. */
    traceId: text('trace_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .default(sql`now()`)
      .notNull(),
  },
  (t) => [
    check(
      'backup_heartbeat_status_check',
      sql`${t.status} IS NULL OR ${t.status} IN ('success', 'failed', 'running', 'overdue')`
    ),
  ]
);

export type BackupHeartbeatRow = typeof backupHeartbeat.$inferSelect;
export type BackupHeartbeatInsert = typeof backupHeartbeat.$inferInsert;
