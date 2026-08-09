/**
 * backup_heartbeat upsert + read (D04-03 / CAP-BAK-01).
 *
 * STRICT: last_success_at is set by callers ONLY after R2 confirmation —
 * this module never invents success. Upsert is idempotent ON CONFLICT (job_name).
 */
import { createSql, type Sql } from '../db/client.ts';
import type { BackupJobName } from '../db/schema/backup.ts';

export type HeartbeatStatus = 'success' | 'failed' | 'running' | 'overdue';

export type BackupHeartbeatRecord = {
  job_name: string;
  last_success_at: string | null;
  last_wal_segment: string | null;
  last_snapshot_id: string | null;
  object_count: number | null;
  status: string | null;
  trace_id: string | null;
  updated_at: string | null;
};

export type UpsertHeartbeatInput = {
  jobName: BackupJobName | string;
  status: HeartbeatStatus;
  /**
   * When status=success, set last_success_at to this ISO timestamp (or now).
   * Callers MUST only supply this after R2 confirmation.
   */
  lastSuccessAt?: Date | string | null;
  lastWalSegment?: string | null;
  lastSnapshotId?: string | null;
  objectCount?: number | null;
  traceId?: string | null;
  /** When true and status≠success, set last_success_at NULL (failure seed). */
  forceClearSuccess?: boolean;
};

/**
 * Fail-closed assert: backup_heartbeat must already exist via `holo db:migrate`
 * (0029_backup_heartbeat). Runtime table bootstrap is prohibited — divergent
 * CHECK-less schemas previously raced with idempotent bootstrap helpers.
 */
export async function ensureBackupHeartbeatTable(sql?: Sql): Promise<void> {
  const client = sql ?? createSql();
  const owns = !sql;
  try {
    const rows = await client<{ exists: boolean }[]>`
      SELECT to_regclass('public.backup_heartbeat') IS NOT NULL AS exists
    `;
    if (!rows[0]?.exists) {
      throw new Error(
        'backup_heartbeat table is missing — run `holo db:migrate` (migration 0029_backup_heartbeat) before backup heartbeats; schema is migrate-owned only'
      );
    }
  } finally {
    if (owns) await client.end({ timeout: 5 });
  }
}

/** Alias for callers that prefer assert naming. */
export const assertBackupHeartbeatTable = ensureBackupHeartbeatTable;

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapRow(row: BackupHeartbeatRecord): BackupHeartbeatRecord {
  return {
    ...row,
    object_count:
      row.object_count === null || row.object_count === undefined ? null : Number(row.object_count),
  };
}

/**
 * Idempotent upsert: INSERT … ON CONFLICT (job_name) DO UPDATE.
 * Never invents success — callers must only pass lastSuccessAt after R2 confirm.
 */
export async function upsertBackupHeartbeat(
  input: UpsertHeartbeatInput,
  sql?: Sql
): Promise<BackupHeartbeatRecord> {
  const client = sql ?? createSql();
  const owns = !sql;
  try {
    await ensureBackupHeartbeatTable(client);

    const jobName = input.jobName;
    const status = input.status;
    const lastWal = input.lastWalSegment ?? null;
    const lastSnap = input.lastSnapshotId ?? null;
    const objectCount =
      input.objectCount === undefined || input.objectCount === null
        ? null
        : Math.trunc(Number(input.objectCount));
    const traceId = input.traceId ?? null;

    let successIso: string | null = null;
    let touchSuccess = false;
    if (status === 'success') {
      touchSuccess = true;
      successIso = toIso(input.lastSuccessAt ?? new Date()) ?? new Date().toISOString();
    } else if (input.forceClearSuccess) {
      touchSuccess = true;
      successIso = null;
    } else if (input.lastSuccessAt !== undefined) {
      touchSuccess = true;
      successIso = toIso(input.lastSuccessAt);
    }

    // Two-path upsert keeps the SQL free of boolean CASE injection quirks.
    let rows: BackupHeartbeatRecord[];
    if (touchSuccess) {
      rows = await client<BackupHeartbeatRecord[]>`
        INSERT INTO backup_heartbeat AS bh (
          job_name, last_success_at, last_wal_segment, last_snapshot_id,
          object_count, status, trace_id, updated_at
        ) VALUES (
          ${jobName}, ${successIso}, ${lastWal}, ${lastSnap},
          ${objectCount}, ${status}, ${traceId}, now()
        )
        ON CONFLICT (job_name) DO UPDATE SET
          last_success_at = EXCLUDED.last_success_at,
          last_wal_segment = COALESCE(EXCLUDED.last_wal_segment, bh.last_wal_segment),
          last_snapshot_id = COALESCE(EXCLUDED.last_snapshot_id, bh.last_snapshot_id),
          object_count = COALESCE(EXCLUDED.object_count, bh.object_count),
          status = EXCLUDED.status,
          trace_id = COALESCE(EXCLUDED.trace_id, bh.trace_id),
          updated_at = now()
        RETURNING
          job_name,
          last_success_at::text,
          last_wal_segment,
          last_snapshot_id,
          object_count::float8 AS object_count,
          status,
          trace_id,
          updated_at::text
      `;
    } else {
      rows = await client<BackupHeartbeatRecord[]>`
        INSERT INTO backup_heartbeat AS bh (
          job_name, last_success_at, last_wal_segment, last_snapshot_id,
          object_count, status, trace_id, updated_at
        ) VALUES (
          ${jobName}, NULL, ${lastWal}, ${lastSnap},
          ${objectCount}, ${status}, ${traceId}, now()
        )
        ON CONFLICT (job_name) DO UPDATE SET
          last_wal_segment = COALESCE(EXCLUDED.last_wal_segment, bh.last_wal_segment),
          last_snapshot_id = COALESCE(EXCLUDED.last_snapshot_id, bh.last_snapshot_id),
          object_count = COALESCE(EXCLUDED.object_count, bh.object_count),
          status = EXCLUDED.status,
          trace_id = COALESCE(EXCLUDED.trace_id, bh.trace_id),
          updated_at = now()
        RETURNING
          job_name,
          last_success_at::text,
          last_wal_segment,
          last_snapshot_id,
          object_count::float8 AS object_count,
          status,
          trace_id,
          updated_at::text
      `;
    }

    const row = rows[0];
    if (!row) {
      throw new Error(`backup_heartbeat upsert returned no row for job_name=${jobName}`);
    }
    return mapRow(row);
  } finally {
    if (owns) await client.end({ timeout: 5 });
  }
}

export async function getBackupHeartbeat(
  jobName: string,
  sql?: Sql
): Promise<BackupHeartbeatRecord | null> {
  const client = sql ?? createSql();
  const owns = !sql;
  try {
    await ensureBackupHeartbeatTable(client);
    const rows = await client<BackupHeartbeatRecord[]>`
      SELECT
        job_name,
        last_success_at::text,
        last_wal_segment,
        last_snapshot_id,
        object_count::float8 AS object_count,
        status,
        trace_id,
        updated_at::text
      FROM backup_heartbeat
      WHERE job_name = ${jobName}
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  } finally {
    if (owns) await client.end({ timeout: 5 });
  }
}

export async function listBackupHeartbeats(sql?: Sql): Promise<BackupHeartbeatRecord[]> {
  const client = sql ?? createSql();
  const owns = !sql;
  try {
    await ensureBackupHeartbeatTable(client);
    const rows = await client<BackupHeartbeatRecord[]>`
      SELECT
        job_name,
        last_success_at::text,
        last_wal_segment,
        last_snapshot_id,
        object_count::float8 AS object_count,
        status,
        trace_id,
        updated_at::text
      FROM backup_heartbeat
      ORDER BY job_name
    `;
    return rows.map(mapRow);
  } finally {
    if (owns) await client.end({ timeout: 5 });
  }
}
