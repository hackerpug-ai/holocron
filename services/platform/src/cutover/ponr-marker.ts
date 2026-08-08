/**
 * Exact C-3 marker lifecycle. The marker is a disposable probe row only; it
 * must never be confused with legitimate data_plane_ponr or audit history.
 */
import { createHash } from 'node:crypto';
import { createSql, type Sql, type TransactionSql } from '../db/client.ts';
import {
  type DatabaseTargetIdentity,
  databaseTargetIdentitiesEqual,
  parseDatabaseTargetIdentity,
} from '../db/connection.ts';

export const REQUIRED_PONR_TRIGGER_NAMES = [
  'data_plane_ponr_reject_mutation',
  'data_plane_ponr_reject_truncate',
] as const;

export const EXACT_PONR_MARKER = {
  write_surface: 'probe.seed',
  write_table: 'documents',
  write_row_id: '00000000-0000-4000-8000-aaaaaaaaaaaa',
  write_row_digest_sha256: 'ab'.repeat(32),
  base_url: 'http://127.0.0.1:9',
  operator: 'probe-seed',
  run_id: 's30-marker-miss-seed',
  idempotency_key: 's30-marker-miss-seed-idem',
  convex_fence_audit_id: 'seed',
  convex_fence_env_value: '1',
  convex_documents_total: 0,
  convex_newest_document_creation_time: 0,
  convex_accepted_writes_since_watermark: 0,
  convex_rejected_writes_since_watermark: 0,
} as const;

type MarkerRow = typeof EXACT_PONR_MARKER & { id: string };
type AuditSnapshot = { count: number; digest: string };
type TriggerState = { name: string; enabled: string };
type SqlLike = Sql | TransactionSql;

export type PonrMarkerReport = {
  ok: boolean;
  gate_database_target: DatabaseTargetIdentity;
  marker_database_target: DatabaseTargetIdentity;
  marker_before_count: number;
  marker_after_count: number;
  match_disposition: 'zero_rows' | 'exact_one' | 'foreign_or_multiple' | 'error';
  audit_before: AuditSnapshot;
  audit_after: AuditSnapshot;
  trigger_before: TriggerState[];
  trigger_after: TriggerState[];
  disabled_triggers: string[];
  delete_count: number;
  error?: { code: string; message: string };
  restoration_error?: { code: string; message: string };
};

function matchesExactMarker(row: Record<string, unknown>): boolean {
  return (Object.keys(EXACT_PONR_MARKER) as Array<keyof typeof EXACT_PONR_MARKER>).every((key) => {
    const value = row[key];
    const expected = EXACT_PONR_MARKER[key];
    if (typeof expected === 'number') return Number(value) === expected;
    return String(value ?? '') === expected;
  });
}

async function readMarkerRows(sql: SqlLike): Promise<MarkerRow[]> {
  const rows = await sql<MarkerRow[]>`
    SELECT
      id::text AS id,
      write_surface::text AS write_surface,
      write_table::text AS write_table,
      write_row_id::text AS write_row_id,
      write_row_digest_sha256::text AS write_row_digest_sha256,
      base_url::text AS base_url,
      operator::text AS operator,
      run_id::text AS run_id,
      idempotency_key::text AS idempotency_key,
      convex_fence_audit_id::text AS convex_fence_audit_id,
      convex_fence_env_value::text AS convex_fence_env_value,
      convex_documents_total::bigint AS convex_documents_total,
      convex_newest_document_creation_time::bigint AS convex_newest_document_creation_time,
      convex_accepted_writes_since_watermark::bigint AS convex_accepted_writes_since_watermark,
      convex_rejected_writes_since_watermark::bigint AS convex_rejected_writes_since_watermark
    FROM public.data_plane_ponr
    ORDER BY id::text
  `;
  return rows;
}

async function readTriggerStates(sql: SqlLike): Promise<TriggerState[]> {
  const rows = await sql<TriggerState[]>`
    SELECT tgname AS name, tgenabled AS enabled
    FROM pg_trigger
    WHERE tgrelid = 'public.data_plane_ponr'::regclass
      AND NOT tgisinternal
      AND (
        tgname = ${REQUIRED_PONR_TRIGGER_NAMES[0]}
        OR tgname = ${REQUIRED_PONR_TRIGGER_NAMES[1]}
      )
    ORDER BY tgname
  `;
  return rows;
}

function requiredTriggersAreEnabled(states: TriggerState[]): boolean {
  return REQUIRED_PONR_TRIGGER_NAMES.every((name) =>
    states.some((state) => state.name === name && state.enabled === 'O')
  );
}

async function readAuditSnapshot(sql: SqlLike): Promise<AuditSnapshot> {
  const rows = await sql<
    Array<{
      id: string;
      committed_at_ms: string;
      surface: string;
      write_row_id: string | null;
      export_watermark_ms: string;
      recorded_at: string;
    }>
  >`
    SELECT
      id::text AS id,
      committed_at_ms::text AS committed_at_ms,
      surface::text AS surface,
      write_row_id::text AS write_row_id,
      export_watermark_ms::text AS export_watermark_ms,
      recorded_at::text AS recorded_at
    FROM public.post_export_write_audit
    ORDER BY id::text
  `;
  const canonical = JSON.stringify(rows);
  return { count: rows.length, digest: createHash('sha256').update(canonical).digest('hex') };
}

function emptyAuditSnapshot(): AuditSnapshot {
  return { count: 0, digest: createHash('sha256').update('[]').digest('hex') };
}

function emptyTriggerState(): TriggerState[] {
  return [];
}

function reportBase(
  gate_database_target: DatabaseTargetIdentity,
  marker_database_target: DatabaseTargetIdentity
): PonrMarkerReport {
  return {
    ok: false,
    gate_database_target,
    marker_database_target,
    marker_before_count: 0,
    marker_after_count: 0,
    match_disposition: 'error',
    audit_before: emptyAuditSnapshot(),
    audit_after: emptyAuditSnapshot(),
    trigger_before: emptyTriggerState(),
    trigger_after: emptyTriggerState(),
    disabled_triggers: [],
    delete_count: 0,
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('DATABASE_TARGET_')) return error.message;
  return 'marker operation failed; database state was preserved';
}

/** Seed the exact marker on a validated marker DB; never seed the gate DB. */
export async function seedExactPonrMarker(options: {
  gateDatabaseUrl: string;
  markerDatabaseUrl: string;
}): Promise<{ inserted: boolean; count: number }> {
  const gateTarget = parseDatabaseTargetIdentity(options.gateDatabaseUrl);
  const target = parseDatabaseTargetIdentity(options.markerDatabaseUrl);
  if (databaseTargetIdentitiesEqual(gateTarget, target)) {
    throw new Error('DATABASE_TARGET_EQUAL: gate and marker database targets must differ');
  }
  const sql = createSql(options.markerDatabaseUrl);
  try {
    const rows = await readMarkerRows(sql);
    const row = rows[0];
    if (rows.length === 1 && row && matchesExactMarker(row)) return { inserted: false, count: 1 };
    if (rows.length !== 0) throw new Error('PONR_MARKER_FOREIGN_OR_MULTIPLE');
    await sql`
      INSERT INTO public.data_plane_ponr (
        fence_lifted_at, write_surface, write_table, write_row_id,
        write_row_digest_sha256, write_committed_at, base_url, operator,
        run_id, idempotency_key, export_watermark_ms, convex_fence_audit_id,
        convex_fence_env_value, convex_documents_total,
        convex_newest_document_creation_time,
        convex_accepted_writes_since_watermark,
        convex_rejected_writes_since_watermark
      ) VALUES (
        now(), ${EXACT_PONR_MARKER.write_surface}, ${EXACT_PONR_MARKER.write_table},
        ${EXACT_PONR_MARKER.write_row_id}, ${EXACT_PONR_MARKER.write_row_digest_sha256}, now(),
        ${EXACT_PONR_MARKER.base_url}, ${EXACT_PONR_MARKER.operator}, ${EXACT_PONR_MARKER.run_id},
        ${EXACT_PONR_MARKER.idempotency_key}, (extract(epoch from now()) * 1000)::bigint,
        ${EXACT_PONR_MARKER.convex_fence_audit_id}, ${EXACT_PONR_MARKER.convex_fence_env_value},
        ${EXACT_PONR_MARKER.convex_documents_total}, ${EXACT_PONR_MARKER.convex_newest_document_creation_time},
        ${EXACT_PONR_MARKER.convex_accepted_writes_since_watermark},
        ${EXACT_PONR_MARKER.convex_rejected_writes_since_watermark}
      )
    `;
    return { inserted: true, count: 1 };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Remove zero or one exact marker. Foreign/multiple rows fail closed before
 * DELETE. Trigger changes are transactional and verified after every outcome.
 */
export async function cleanupExactPonrMarker(options: {
  gateDatabaseUrl: string;
  markerDatabaseUrl: string;
}): Promise<PonrMarkerReport> {
  const gateTarget = parseDatabaseTargetIdentity(options.gateDatabaseUrl);
  const markerTarget = parseDatabaseTargetIdentity(options.markerDatabaseUrl);
  const report = reportBase(gateTarget, markerTarget);
  if (databaseTargetIdentitiesEqual(gateTarget, markerTarget)) {
    report.error = {
      code: 'DATABASE_TARGET_EQUAL',
      message: 'gate and marker database targets must differ',
    };
    return report;
  }

  const sql = createSql(options.markerDatabaseUrl);
  let operationError: unknown;
  try {
    await sql.begin(async (tx) => {
      const triggerBefore = await readTriggerStates(tx);
      report.trigger_before = triggerBefore;
      if (!requiredTriggersAreEnabled(triggerBefore)) {
        throw new Error('PONR_MARKER_REQUIRED_TRIGGER_NOT_ENABLED');
      }
      const markerRows = await readMarkerRows(tx);
      report.marker_before_count = markerRows.length;
      const auditBefore = await readAuditSnapshot(tx);
      report.audit_before = auditBefore;
      if (markerRows.length === 0) {
        report.match_disposition = 'zero_rows';
        report.marker_after_count = 0;
        report.audit_after = auditBefore;
        return;
      }
      const markerRow = markerRows[0];
      if (markerRows.length !== 1 || !markerRow || !matchesExactMarker(markerRow)) {
        report.match_disposition = 'foreign_or_multiple';
        throw new Error('PONR_MARKER_FOREIGN_OR_MULTIPLE');
      }

      report.match_disposition = 'exact_one';
      report.disabled_triggers = [...REQUIRED_PONR_TRIGGER_NAMES];
      await tx`ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation`;
      await tx`ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate`;
      const deleted = await tx`
        DELETE FROM public.data_plane_ponr
        WHERE id = ${markerRow.id}::uuid
          AND write_surface = ${EXACT_PONR_MARKER.write_surface}
          AND write_table = ${EXACT_PONR_MARKER.write_table}
          AND write_row_id = ${EXACT_PONR_MARKER.write_row_id}
          AND write_row_digest_sha256 = ${EXACT_PONR_MARKER.write_row_digest_sha256}
          AND base_url = ${EXACT_PONR_MARKER.base_url}
          AND operator = ${EXACT_PONR_MARKER.operator}
          AND run_id = ${EXACT_PONR_MARKER.run_id}
          AND idempotency_key = ${EXACT_PONR_MARKER.idempotency_key}
          AND convex_fence_audit_id = ${EXACT_PONR_MARKER.convex_fence_audit_id}
          AND convex_fence_env_value = ${EXACT_PONR_MARKER.convex_fence_env_value}
          AND convex_documents_total = ${EXACT_PONR_MARKER.convex_documents_total}
          AND convex_newest_document_creation_time = ${EXACT_PONR_MARKER.convex_newest_document_creation_time}
          AND convex_accepted_writes_since_watermark = ${EXACT_PONR_MARKER.convex_accepted_writes_since_watermark}
          AND convex_rejected_writes_since_watermark = ${EXACT_PONR_MARKER.convex_rejected_writes_since_watermark}
        RETURNING id
      `;
      if (deleted.length !== 1) throw new Error('PONR_MARKER_DELETE_COUNT_INVALID');
      report.delete_count = deleted.length;
      await tx`ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation`;
      await tx`ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate`;
      const auditAfter = await readAuditSnapshot(tx);
      report.audit_after = auditAfter;
      if (auditAfter.count !== auditBefore.count || auditAfter.digest !== auditBefore.digest) {
        throw new Error('PONR_MARKER_AUDIT_CHANGED');
      }
      report.marker_after_count = (await readMarkerRows(tx)).length;
      if (report.marker_after_count !== 0) throw new Error('PONR_MARKER_DELETE_COUNT_INVALID');
    });
    report.ok = true;
  } catch (error) {
    operationError = error;
    report.ok = false;
    report.error = {
      code:
        error instanceof Error && error.message.startsWith('PONR_MARKER_')
          ? error.message
          : 'PONR_MARKER_CLEANUP_FAILED',
      message: safeErrorMessage(error),
    };
  } finally {
    try {
      const afterReadErrors: string[] = [];
      try {
        report.trigger_after = await readTriggerStates(sql);
      } catch {
        afterReadErrors.push('PONR_MARKER_TRIGGER_STATE_UNREADABLE');
      }
      try {
        report.marker_after_count = (await readMarkerRows(sql)).length;
      } catch {
        afterReadErrors.push('PONR_MARKER_AFTER_COUNT_UNREADABLE');
      }
      try {
        report.audit_after = await readAuditSnapshot(sql);
      } catch {
        afterReadErrors.push('PONR_MARKER_AUDIT_AFTER_UNREADABLE');
      }

      const restorationErrors = [...afterReadErrors];
      if (!requiredTriggersAreEnabled(report.trigger_after)) {
        restorationErrors.push('PONR_MARKER_TRIGGER_RESTORATION_FAILED');
      }
      if (
        report.audit_after.count !== report.audit_before.count ||
        report.audit_after.digest !== report.audit_before.digest
      ) {
        restorationErrors.push('PONR_MARKER_AUDIT_CHANGED');
      }
      if (restorationErrors.length > 0) {
        const firstRestorationError = restorationErrors[0] ?? 'PONR_MARKER_POSTCONDITION_FAILED';
        report.ok = false;
        report.restoration_error = {
          code: firstRestorationError,
          message: 'marker cleanup postcondition verification failed',
        };
        if (!operationError) report.error = report.restoration_error;
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  return report;
}

export async function cleanupExactPonrMarkerFromEnv(): Promise<PonrMarkerReport> {
  const gateDatabaseUrl = process.env.DATABASE_URL?.trim();
  const markerDatabaseUrl = process.env.HOLO_PROBE_MARKER_MISS_DATABASE_URL?.trim();
  if (!gateDatabaseUrl || !markerDatabaseUrl)
    throw new Error('DATABASE_TARGET_INVALID: gate and marker URLs are required');
  return cleanupExactPonrMarker({ gateDatabaseUrl, markerDatabaseUrl });
}
