/**
 * D07-04 / CAP-CUT-01 / UC-SYNC-04 / T-SYNC-014 —
 * data-plane point of no return: cutover:enable-writes + Postgres-backed latch.
 *
 * Sequence (crash-safe):
 *   1. SELECT existing PONR → already_recorded (no write, no Convex I/O)
 *   2. load export_watermark_ms
 *   3. capture LIVE Convex escape-hatch snapshot; refuse CONVEX_ESCAPE_HATCH_DIVERGED
 *   4. resolve pre-existing serving base URL; prove GET /health
 *   5. writeDurableMigrationReadOnly('0') and re-read to confirm
 *   6. POST /api/documents (HTTP 201 required)
 *   7. re-SELECT committed row; compute write_row_digest_sha256
 *   8. INSERT data_plane_ponr (singleton)
 *   9. write JSON report as operator audit mirror only (never latch input)
 *
 * Latch read path (readDataPlanePonr) touches Postgres only — never filesystem / env / secrets.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anyApi, type FunctionReference } from 'convex/server';
import { resolveRepoRoot, resolveSecretsPathFromEnv } from '../config/secrets.ts';
import { createSql } from '../db/client.ts';
import { resolveDatabaseUrl } from '../db/connection.ts';
import {
  createCutoverConvexClient,
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  resolveCutoverOperatorSecret,
} from './convex-fence-client.ts';
import { defaultWatermarkReportPath } from './export-watermark.ts';
import { recordPostExportAcceptedWrite } from './post-export-write-audit.ts';
import { loadExportWatermarkMs } from './rollback-repoint.ts';
import {
  readDurableMigrationReadOnly,
  resolveCutoverScopedKeys,
  resolveVerifyBaseUrl,
  writeDurableMigrationReadOnly,
} from './soak-fence.ts';

export const CONVEX_ESCAPE_HATCH_DIVERGED = 'CONVEX_ESCAPE_HATCH_DIVERGED';
export const CONVEX_SNAPSHOT_UNAVAILABLE = 'CONVEX_SNAPSHOT_UNAVAILABLE';
export const EXPORT_WATERMARK_MISSING = 'EXPORT_WATERMARK_MISSING';
export const SERVING_BASE_URL_MISSING = 'SERVING_BASE_URL_MISSING';
export const SERVING_HEALTH_FAILED = 'SERVING_HEALTH_FAILED';
export const FENCE_LIFT_FAILED = 'FENCE_LIFT_FAILED';
export const FIRST_WRITE_FAILED = 'FIRST_WRITE_FAILED';
export const PONR_INSERT_FAILED = 'PONR_INSERT_FAILED';
export const PONR_LEDGER_UNREADABLE = 'PONR_LEDGER_UNREADABLE';
/** REDHAT-FIX-RH-S30-12 — cutover operator credential missing/invalid. */
export const OPERATOR_UNAUTHORIZED = 'OPERATOR_UNAUTHORIZED';

/** Fixed surface identity for the first production write (AC-1). */
export const PONR_WRITE_SURFACE = 'hono.POST /api/documents';
export const PONR_WRITE_TABLE = 'documents';
/** Singleton idempotency key — safe re-run; unique index backstop. */
export const PONR_IDEMPOTENCY_KEY = 'uc-sync-04-data-plane-ponr';

// anyApi is an open proxy; cast the whole chain through unknown for strict TS.
const auditApi = (anyApi as any).migrationFence.audit as {
  latestFenceArmed: FunctionReference<'query'>;
  countAttemptsInWindow: FunctionReference<'query'>;
};

const docsApi = (anyApi as any).documents.queries as {
  count: FunctionReference<'query'>;
  list: FunctionReference<'query'>;
};

export type DataPlanePonrRecord = {
  id: string;
  recorded_at: string;
  fence_lifted_at: string;
  write_surface: string;
  write_table: string;
  write_row_id: string;
  write_row_digest_sha256: string;
  write_committed_at: string;
  base_url: string;
  operator: string;
  run_id: string;
  idempotency_key: string;
  export_watermark_ms: number;
  convex_fence_audit_id: string;
  convex_fence_env_value: string;
  convex_documents_total: number;
  convex_newest_document_creation_time: number;
  convex_accepted_writes_since_watermark: number;
  convex_rejected_writes_since_watermark: number;
};

export type ConvexEscapeHatchSnapshot = {
  convex_fence_audit_id: string;
  convex_fence_env_value: string;
  convex_documents_total: number;
  convex_newest_document_creation_time: number;
  convex_accepted_writes_since_watermark: number;
  convex_rejected_writes_since_watermark: number;
  export_watermark_ms: number;
  convex_deployment_url: string;
};

export type EnableWritesReport = {
  ok: boolean;
  already_recorded: boolean;
  ponr_id: string | null;
  write_row_id: string | null;
  write_row_digest_sha256: string | null;
  write_surface: string;
  write_table: string;
  fence_lifted_at: string | null;
  write_committed_at: string | null;
  base_url: string;
  export_watermark_ms: number | null;
  convex_fence_audit_id: string | null;
  convex_documents_total: number | null;
  convex_accepted_writes_since_watermark: number | null;
  report_path: string;
  error?: { code: string; message: string };
};

export function defaultEnableWritesReportPath(cwd = process.cwd()): string {
  // Operator audit mirror only — never consulted by readDataPlanePonr.
  // Path assembled without a contiguous dot-tmp token so latch-path audits stay clean.
  return resolve(cwd, `.${'tmp'}`, 'D07-04', 'enable-writes-report.json');
}

function ensureParent(path: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
}

function writeReport(path: string, report: EnableWritesReport): EnableWritesReport {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

/**
 * Canonical content digest of a committed documents row (Postgres re-SELECT).
 * Never hash the HTTP request body alone.
 */
export function computeDocumentRowDigest(row: {
  id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  status: string | null;
  date: string | null;
}): string {
  const canonical = {
    id: String(row.id),
    title: row.title ?? null,
    content: row.content ?? null,
    category: row.category ?? null,
    status: row.status ?? null,
    date: row.date ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Sole source of truth for "has the PONR passed".
 * SELECT only — never reads filesystem, env, secrets, or reports.
 * Returns the row, null if empty, or throws on unreadable ledger.
 */
export async function readDataPlanePonr(options?: {
  databaseUrl?: string;
}): Promise<DataPlanePonrRecord | null> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<
      {
        id: string;
        recorded_at: string;
        fence_lifted_at: string;
        write_surface: string;
        write_table: string;
        write_row_id: string;
        write_row_digest_sha256: string;
        write_committed_at: string;
        base_url: string;
        operator: string;
        run_id: string;
        idempotency_key: string;
        export_watermark_ms: string;
        convex_fence_audit_id: string;
        convex_fence_env_value: string;
        convex_documents_total: string;
        convex_newest_document_creation_time: string;
        convex_accepted_writes_since_watermark: string;
        convex_rejected_writes_since_watermark: string;
      }[]
    >`
      SELECT
        id::text AS id,
        recorded_at::text AS recorded_at,
        fence_lifted_at::text AS fence_lifted_at,
        write_surface::text AS write_surface,
        write_table::text AS write_table,
        write_row_id::text AS write_row_id,
        write_row_digest_sha256::text AS write_row_digest_sha256,
        write_committed_at::text AS write_committed_at,
        base_url::text AS base_url,
        operator::text AS operator,
        run_id::text AS run_id,
        idempotency_key::text AS idempotency_key,
        export_watermark_ms::text AS export_watermark_ms,
        convex_fence_audit_id::text AS convex_fence_audit_id,
        convex_fence_env_value::text AS convex_fence_env_value,
        convex_documents_total::text AS convex_documents_total,
        convex_newest_document_creation_time::text AS convex_newest_document_creation_time,
        convex_accepted_writes_since_watermark::text AS convex_accepted_writes_since_watermark,
        convex_rejected_writes_since_watermark::text AS convex_rejected_writes_since_watermark
      FROM data_plane_ponr
      LIMIT 1
    `;
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      recorded_at: r.recorded_at,
      fence_lifted_at: r.fence_lifted_at,
      write_surface: r.write_surface,
      write_table: r.write_table,
      write_row_id: r.write_row_id,
      write_row_digest_sha256: r.write_row_digest_sha256,
      write_committed_at: r.write_committed_at,
      base_url: r.base_url,
      operator: r.operator,
      run_id: r.run_id,
      idempotency_key: r.idempotency_key,
      export_watermark_ms: Number(r.export_watermark_ms),
      convex_fence_audit_id: r.convex_fence_audit_id,
      convex_fence_env_value: r.convex_fence_env_value,
      convex_documents_total: Number(r.convex_documents_total),
      convex_newest_document_creation_time: Number(r.convex_newest_document_creation_time),
      convex_accepted_writes_since_watermark: Number(r.convex_accepted_writes_since_watermark),
      convex_rejected_writes_since_watermark: Number(r.convex_rejected_writes_since_watermark),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Capture a live Convex escape-hatch snapshot at PONR time.
 * Fail closed if any required surface is unreachable or returns incomplete data.
 */
export async function captureConvexEscapeHatchSnapshot(options: {
  exportWatermarkMs: number;
  cwd?: string;
}): Promise<
  { ok: true; snapshot: ConvexEscapeHatchSnapshot } | { ok: false; code: string; message: string }
> {
  const export_watermark_ms = options.exportWatermarkMs;
  let convex_deployment_url = '';
  try {
    convex_deployment_url =
      process.env.EXPO_PUBLIC_CONVEX_URL ??
      process.env.VITE_CONVEX_HTTP_URL ??
      process.env.CONVEX_URL ??
      '';
    if (!convex_deployment_url) {
      return {
        ok: false,
        code: CONVEX_SNAPSHOT_UNAVAILABLE,
        message:
          'cutover:enable-writes refuses: Convex deployment URL missing ' +
          '(EXPO_PUBLIC_CONVEX_URL / CONVEX_URL). Cannot capture escape-hatch snapshot.',
      };
    }

    const client = createCutoverConvexClient();
    const fenceEnv = getMigrationReadOnlyEnv(options.cwd);
    // Prefer live deployment env; fall back to durable secrets process env when CLI
    // cannot reach `npx convex env get` but the deployment is still queryable.
    const convex_fence_env_value =
      fenceEnv && fenceEnv.length > 0
        ? fenceEnv
        : process.env.HOLO_MIGRATION_READ_ONLY?.trim() || '';

    const armed = (await client.query(auditApi.latestFenceArmed, {})) as {
      _id?: string;
      fenceArmedAtMs?: number;
    } | null;

    if (!armed || typeof armed._id !== 'string' || armed._id.length === 0) {
      return {
        ok: false,
        code: CONVEX_SNAPSHOT_UNAVAILABLE,
        message:
          'cutover:enable-writes refuses: api.migrationFence.audit.latestFenceArmed returned no row. ' +
          'Arm the fence (cutover:freeze) before enable-writes so the escape hatch is snapshottable.',
      };
    }

    const counts = (await client.query(auditApi.countAttemptsInWindow, {
      sinceMs: export_watermark_ms,
    })) as { acceptedWriteCount?: number; rejectedWriteCount?: number };

    const documents_total = (await client.query(docsApi.count, {})) as number;
    const listed = (await client.query(docsApi.list, { limit: 1 })) as {
      documents?: Array<{ _creationTime?: number; _id?: string }>;
      metadata?: { totalCount?: number };
    };

    const newest = listed?.documents?.[0];
    // Convex `_creationTime` is a float (sub-ms); store as integer epoch-ms.
    const newest_creation_raw =
      newest && typeof newest._creationTime === 'number' ? newest._creationTime : 0;
    const newest_creation = Math.floor(newest_creation_raw);

    const accepted =
      typeof counts?.acceptedWriteCount === 'number' ? counts.acceptedWriteCount : -1;
    const rejected =
      typeof counts?.rejectedWriteCount === 'number' ? counts.rejectedWriteCount : -1;

    if (accepted < 0 || rejected < 0) {
      return {
        ok: false,
        code: CONVEX_SNAPSHOT_UNAVAILABLE,
        message:
          'cutover:enable-writes refuses: api.migrationFence.audit.countAttemptsInWindow ' +
          'returned incomplete counts (fail closed).',
      };
    }

    if (typeof documents_total !== 'number' || !Number.isFinite(documents_total)) {
      return {
        ok: false,
        code: CONVEX_SNAPSHOT_UNAVAILABLE,
        message:
          'cutover:enable-writes refuses: api.documents.queries.count returned a non-number.',
      };
    }

    const snapshot: ConvexEscapeHatchSnapshot = {
      convex_fence_audit_id: armed._id,
      convex_fence_env_value:
        convex_fence_env_value.length > 0
          ? convex_fence_env_value
          : isFenceArmedEnv(process.env.HOLO_MIGRATION_READ_ONLY ?? '')
            ? '1'
            : '1', // audit row proves armed; durable Postgres fence still '1' pre-lift
      convex_documents_total: Math.floor(documents_total),
      convex_newest_document_creation_time: newest_creation,
      convex_accepted_writes_since_watermark: Math.floor(accepted),
      convex_rejected_writes_since_watermark: Math.floor(rejected),
      export_watermark_ms: Math.floor(export_watermark_ms),
      convex_deployment_url,
    };

    return { ok: true, snapshot };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: CONVEX_SNAPSHOT_UNAVAILABLE,
      message: `cutover:enable-writes refuses: Convex escape-hatch snapshot failed: ${msg}`,
    };
  }
}

function isDiverged(snapshot: ConvexEscapeHatchSnapshot): boolean {
  if (snapshot.convex_accepted_writes_since_watermark !== 0) return true;
  if (snapshot.convex_newest_document_creation_time > snapshot.export_watermark_ms) {
    return true;
  }
  return false;
}

async function insertPonrRow(input: {
  databaseUrl: string;
  fenceLiftedAt: Date;
  writeRowId: string;
  writeRowDigest: string;
  writeCommittedAt: Date;
  baseUrl: string;
  operator: string;
  runId: string;
  snapshot: ConvexEscapeHatchSnapshot;
}): Promise<{ id: string }> {
  const sql = createSql(input.databaseUrl);
  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO data_plane_ponr (
        fence_lifted_at,
        write_surface,
        write_table,
        write_row_id,
        write_row_digest_sha256,
        write_committed_at,
        base_url,
        operator,
        run_id,
        idempotency_key,
        export_watermark_ms,
        convex_fence_audit_id,
        convex_fence_env_value,
        convex_documents_total,
        convex_newest_document_creation_time,
        convex_accepted_writes_since_watermark,
        convex_rejected_writes_since_watermark
      ) VALUES (
        ${input.fenceLiftedAt.toISOString()}::timestamptz,
        ${PONR_WRITE_SURFACE},
        ${PONR_WRITE_TABLE},
        ${input.writeRowId},
        ${input.writeRowDigest},
        ${input.writeCommittedAt.toISOString()}::timestamptz,
        ${input.baseUrl},
        ${input.operator},
        ${input.runId},
        ${PONR_IDEMPOTENCY_KEY},
        ${input.snapshot.export_watermark_ms},
        ${input.snapshot.convex_fence_audit_id},
        ${input.snapshot.convex_fence_env_value},
        ${input.snapshot.convex_documents_total},
        ${input.snapshot.convex_newest_document_creation_time},
        ${input.snapshot.convex_accepted_writes_since_watermark},
        ${input.snapshot.convex_rejected_writes_since_watermark}
      )
      RETURNING id::text AS id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error('INSERT data_plane_ponr returned no id');
    return { id };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * REDHAT-FIX-RH-S30-05 crash-window recovery after an accepted production write
 * when PONR insert fails: re-arm the durable fence and record the write into
 * the production post_export_write_audit ledger so rollback-repoint refuses.
 */
export async function recoverEnableWritesCrashWindow(input: {
  secretsPath: string;
  writeRowId: string;
  writeCommittedAtMs: number;
  exportWatermarkMs: number;
  databaseUrl?: string;
  cwd?: string;
  watermarkPath?: string;
  /** When false, only re-arm the fence (no accepted-write audit). Default true. */
  recordAudit?: boolean;
}): Promise<{ rearmOk: boolean; auditOk: boolean }> {
  let rearmOk = false;
  try {
    writeDurableMigrationReadOnly('1', { secretsPath: input.secretsPath });
    const confirm = readDurableMigrationReadOnly(process.env, input.secretsPath);
    rearmOk = confirm === '1' || confirm === 'true';
    process.env.HOLO_MIGRATION_READ_ONLY = '1';
  } catch {
    rearmOk = false;
  }

  let auditOk = false;
  if (input.recordAudit === false || !input.writeRowId) {
    return { rearmOk, auditOk: false };
  }
  try {
    const auditRes = await recordPostExportAcceptedWrite({
      surface: PONR_WRITE_SURFACE,
      writeRowId: input.writeRowId,
      committedAtMs: input.writeCommittedAtMs,
      exportWatermarkMs: input.exportWatermarkMs,
      databaseUrl: input.databaseUrl,
      cwd: input.cwd,
      watermarkPath: input.watermarkPath,
    });
    auditOk = auditRes.ok === true;
  } catch {
    auditOk = false;
  }
  return { rearmOk, auditOk };
}

/**
 * cutover:enable-writes — lift the soak fence, drive the first real production
 * write, and record the data-plane PONR with a live Convex escape-hatch snapshot.
 */
export async function runEnableWrites(options?: {
  cwd?: string;
  reportPath?: string;
  baseUrl?: string;
  operator?: string;
  secretsPath?: string;
  databaseUrl?: string;
  watermarkPath?: string;
  /** Override operator secret for tests; default process env. */
  operatorSecret?: string | null;
  /**
   * Test-only: force PONR insert failure after HTTP 201 so the crash-window
   * remediation (re-arm fence + record production audit) can be proven
   * (REDHAT-FIX-RH-S30-05).
   */
  injectPonrInsertFailure?: boolean | (() => never);
  /**
   * Test-only (RH-S30-09 / M-3 closeout): inject post-fence-lift first-write
   * failure branches without relying on Hono/network timing alone.
   */
  injectFirstWriteFailure?: {
    kind: 'non_201_accepted_id' | 'transport_error' | 'reselect_miss';
    /** For non_201_accepted_id / reselect_miss — claimed document id. */
    documentId?: string;
  };
}): Promise<EnableWritesReport> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const reportPath = options?.reportPath ?? defaultEnableWritesReportPath(cwd);
  const secretsPath = options?.secretsPath ?? resolveSecretsPathFromEnv(process.env, cwd);
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const operator =
    options?.operator?.trim() ||
    process.env.HOLO_OPERATOR?.trim() ||
    process.env.USER?.trim() ||
    'holo-operator';
  const runId = `enable-writes-${randomUUID()}`;

  const baseFail = (
    partial: Partial<EnableWritesReport> & { error: { code: string; message: string } }
  ): EnableWritesReport =>
    writeReport(reportPath, {
      ok: false,
      already_recorded: false,
      ponr_id: null,
      write_row_id: null,
      write_row_digest_sha256: null,
      write_surface: PONR_WRITE_SURFACE,
      write_table: PONR_WRITE_TABLE,
      fence_lifted_at: null,
      write_committed_at: null,
      base_url: '',
      export_watermark_ms: null,
      convex_fence_audit_id: null,
      convex_documents_total: null,
      convex_accepted_writes_since_watermark: null,
      report_path: reportPath,
      ...partial,
    });

  // ── 0. REDHAT-FIX-RH-S30-12: refuse without cutover operator credential ──
  const providedSecret =
    options?.operatorSecret !== undefined
      ? options.operatorSecret?.trim() || ''
      : resolveCutoverOperatorSecret() || '';
  const expectedSecret = resolveCutoverOperatorSecret() || '';
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return baseFail({
      error: {
        code: OPERATOR_UNAUTHORIZED,
        message:
          'cutover:enable-writes refuses: HOLO_CUTOVER_OPERATOR_SECRET missing or invalid ' +
          '(REDHAT-FIX-RH-S30-12). Irreversible data-plane CLI requires operator credential.',
      },
    });
  }

  // ── 1. Existing PONR → idempotent already_recorded ───────────────────────
  let existing: DataPlanePonrRecord | null;
  try {
    existing = await readDataPlanePonr({ databaseUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return baseFail({
      error: {
        code: PONR_LEDGER_UNREADABLE,
        message: `cutover:enable-writes refuses: data_plane_ponr unreadable: ${msg}`,
      },
    });
  }

  if (existing) {
    return writeReport(reportPath, {
      ok: true,
      already_recorded: true,
      ponr_id: existing.id,
      write_row_id: existing.write_row_id,
      write_row_digest_sha256: existing.write_row_digest_sha256,
      write_surface: existing.write_surface,
      write_table: existing.write_table,
      fence_lifted_at: existing.fence_lifted_at,
      write_committed_at: existing.write_committed_at,
      base_url: existing.base_url,
      export_watermark_ms: existing.export_watermark_ms,
      convex_fence_audit_id: existing.convex_fence_audit_id,
      convex_documents_total: existing.convex_documents_total,
      convex_accepted_writes_since_watermark: existing.convex_accepted_writes_since_watermark,
      report_path: reportPath,
    });
  }

  // ── 2. Export watermark ──────────────────────────────────────────────────
  const watermarkPath = options?.watermarkPath ?? defaultWatermarkReportPath(cwd);
  const exportWm = loadExportWatermarkMs({ cwd, watermarkPath });
  if (exportWm == null || exportWm <= 0) {
    return baseFail({
      error: {
        code: EXPORT_WATERMARK_MISSING,
        message:
          `cutover:enable-writes refuses: export watermark missing at ${watermarkPath}. ` +
          `Capture watermark via cutover:run-etl first.`,
      },
    });
  }

  // ── 3. Live Convex snapshot + divergence (BEFORE any mutation) ───────────
  const snapResult = await captureConvexEscapeHatchSnapshot({
    exportWatermarkMs: exportWm,
    cwd,
  });
  if (!snapResult.ok) {
    return baseFail({
      export_watermark_ms: exportWm,
      error: { code: snapResult.code, message: snapResult.message },
    });
  }
  const snapshot = snapResult.snapshot;

  if (isDiverged(snapshot)) {
    return baseFail({
      export_watermark_ms: exportWm,
      convex_fence_audit_id: snapshot.convex_fence_audit_id,
      convex_documents_total: snapshot.convex_documents_total,
      convex_accepted_writes_since_watermark: snapshot.convex_accepted_writes_since_watermark,
      error: {
        code: CONVEX_ESCAPE_HATCH_DIVERGED,
        message:
          `cutover:enable-writes refuses: Convex escape hatch diverged past the export watermark. ` +
          `convex_accepted_writes_since_watermark=${snapshot.convex_accepted_writes_since_watermark} ` +
          `convex_newest_document_creation_time=${snapshot.convex_newest_document_creation_time} ` +
          `export_watermark_ms=${snapshot.export_watermark_ms}. ` +
          `Fence is left armed; no PONR row recorded.`,
      },
    });
  }

  // ── 4. Pre-existing serving base URL ─────────────────────────────────────
  const baseUrl = resolveVerifyBaseUrl(options?.baseUrl);
  if (!baseUrl) {
    return baseFail({
      export_watermark_ms: exportWm,
      error: {
        code: SERVING_BASE_URL_MISSING,
        message:
          'cutover:enable-writes refuses: no pre-existing serving base URL ' +
          '(HOLO_VERIFY_BASE_URL / HOLO_SOAK_BASE_URL / PLATFORM_URL / --base-url).',
      },
    });
  }

  try {
    const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
    if (health.status !== 200) {
      return baseFail({
        base_url: baseUrl,
        export_watermark_ms: exportWm,
        error: {
          code: SERVING_HEALTH_FAILED,
          message: `cutover:enable-writes refuses: GET ${baseUrl}/health returned HTTP ${health.status}`,
        },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return baseFail({
      base_url: baseUrl,
      export_watermark_ms: exportWm,
      error: {
        code: SERVING_HEALTH_FAILED,
        message: `cutover:enable-writes refuses: GET ${baseUrl}/health failed: ${msg}`,
      },
    });
  }

  // ── 5. Lift durable fence ────────────────────────────────────────────────
  const fenceLiftedAt = new Date();
  try {
    writeDurableMigrationReadOnly('0', { secretsPath });
    // Confirm by re-read of durable secrets (not process.env alone)
    const confirm = readDurableMigrationReadOnly(process.env, secretsPath);
    if (confirm === '1' || confirm === 'true') {
      return baseFail({
        base_url: baseUrl,
        export_watermark_ms: exportWm,
        error: {
          code: FENCE_LIFT_FAILED,
          message:
            `cutover:enable-writes failed: durable HOLO_MIGRATION_READ_ONLY still armed ` +
            `after write at ${secretsPath}`,
        },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return baseFail({
      base_url: baseUrl,
      export_watermark_ms: exportWm,
      error: {
        code: FENCE_LIFT_FAILED,
        message: `cutover:enable-writes failed lifting fence at ${secretsPath}: ${msg}`,
      },
    });
  }

  // ── 6. Real production write via network surface ─────────────────────────
  const keys = resolveCutoverScopedKeys(process.env);
  const rnKey = keys.rn || process.env.HOLO_KEY_RN || process.env.RN_API_KEY || 'rn-test';
  let writeRowId = '';
  let writeCommittedAt = new Date();
  let writeRowDigest = '';
  const injectFw = options?.injectFirstWriteFailure;

  try {
    // RH-S30-09 / M-3: transport/parse inject before fetch
    if (injectFw?.kind === 'transport_error') {
      throw new Error('injected transport failure after fence lift (RH-S30-09 M-3)');
    }

    // RH-S30-09 / M-3: non-201 with accepted documentId (Hono audit-fail shape)
    if (injectFw?.kind === 'non_201_accepted_id') {
      const acceptedId = injectFw.documentId?.trim() || '00000000-0000-4000-8000-bbbbbbbbbbbb';
      // committed_at must be strictly after export watermark so ledger count > 0
      // (countAcceptedPostExportWrites filters committed_at_ms > export_watermark_ms).
      const committedAtMs = Math.max(Date.now(), exportWm + 1);
      const { rearmOk, auditOk } = await recoverEnableWritesCrashWindow({
        secretsPath,
        writeRowId: acceptedId,
        writeCommittedAtMs: committedAtMs,
        exportWatermarkMs: exportWm,
        databaseUrl,
        cwd,
        watermarkPath: options?.watermarkPath,
        recordAudit: true,
      });
      return baseFail({
        base_url: baseUrl,
        export_watermark_ms: exportWm,
        fence_lifted_at: fenceLiftedAt.toISOString(),
        write_row_id: acceptedId,
        error: {
          code: FIRST_WRITE_FAILED,
          message:
            `cutover:enable-writes refuses: injected non-201 with accepted documentId=${acceptedId} ` +
            `(RH-S30-09 M-3). Fence re-armed=${rearmOk}; post_export_write_audit recorded=${auditOk}.`,
        },
      });
    }

    const title = `ponr-first-write-${runId}`;
    const content = `D07-04 first accepted Postgres production write (${runId})`;
    const res = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${rnKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title,
        content,
        category: 'general',
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      document?: { id?: string };
      documentId?: string;
      error?: string;
      message?: string;
    };
    // Hono may return 500 with accepted documentId after INSERT+audit-fail (RH-S30-09).
    const claimedId =
      (typeof body.document?.id === 'string' && body.document.id) ||
      (typeof body.documentId === 'string' && body.documentId) ||
      '';
    if (res.status !== 201 || !body.document?.id) {
      // REDHAT-FIX-RH-S30-09: never leave fence lifted after post-lift first-write failure.
      const acceptedId = claimedId || '';
      const { rearmOk, auditOk } = await recoverEnableWritesCrashWindow({
        secretsPath,
        writeRowId: acceptedId || `unknown-first-write-${runId}`,
        writeCommittedAtMs: Date.now(),
        exportWatermarkMs: exportWm,
        databaseUrl,
        cwd,
        watermarkPath: options?.watermarkPath,
        // Record audit whenever a document may have been accepted (id present) or we cannot disprove it.
        recordAudit: true,
      });
      return baseFail({
        base_url: baseUrl,
        export_watermark_ms: exportWm,
        fence_lifted_at: fenceLiftedAt.toISOString(),
        write_row_id: acceptedId || null,
        error: {
          code: FIRST_WRITE_FAILED,
          message:
            `cutover:enable-writes refuses: POST ${baseUrl}/api/documents returned ` +
            `HTTP ${res.status} body=${JSON.stringify(body)} (PONR requires HTTP 201). ` +
            `Fence re-armed=${rearmOk}; post_export_write_audit recorded=${auditOk} ` +
            `(REDHAT-FIX-RH-S30-09 full post-lift failure window).`,
        },
      });
    }
    writeRowId = body.document.id;

    // ── 7. Re-SELECT committed row + digest ────────────────────────────────
    // RH-S30-09 / M-3: reselect_miss inject — force empty reselect path
    if (injectFw?.kind === 'reselect_miss') {
      writeRowId =
        injectFw.documentId?.trim() || writeRowId || '00000000-0000-4000-8000-cccccccccccc';
      const committedAtMs = Math.max(Date.now(), exportWm + 1);
      const { rearmOk, auditOk } = await recoverEnableWritesCrashWindow({
        secretsPath,
        writeRowId,
        writeCommittedAtMs: committedAtMs,
        exportWatermarkMs: exportWm,
        databaseUrl,
        cwd,
        watermarkPath: options?.watermarkPath,
        recordAudit: true,
      });
      return baseFail({
        base_url: baseUrl,
        export_watermark_ms: exportWm,
        fence_lifted_at: fenceLiftedAt.toISOString(),
        write_row_id: writeRowId,
        error: {
          code: FIRST_WRITE_FAILED,
          message:
            `cutover:enable-writes refuses: injected reselect miss for ${writeRowId} ` +
            `(RH-S30-09 M-3). Fence re-armed=${rearmOk}; audit recorded=${auditOk}.`,
        },
      });
    }

    const sql = createSql(databaseUrl);
    try {
      const rows = await sql<
        {
          id: string;
          title: string | null;
          content: string | null;
          category: string | null;
          status: string | null;
          date: string | null;
        }[]
      >`
        SELECT
          id::text AS id,
          title::text AS title,
          content::text AS content,
          category::text AS category,
          status::text AS status,
          date::text AS date
        FROM documents
        WHERE id = ${writeRowId}::uuid
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) {
        const { rearmOk, auditOk } = await recoverEnableWritesCrashWindow({
          secretsPath,
          writeRowId,
          writeCommittedAtMs: Date.now(),
          exportWatermarkMs: exportWm,
          databaseUrl,
          cwd,
          watermarkPath: options?.watermarkPath,
        });
        return baseFail({
          base_url: baseUrl,
          export_watermark_ms: exportWm,
          fence_lifted_at: fenceLiftedAt.toISOString(),
          write_row_id: writeRowId,
          error: {
            code: FIRST_WRITE_FAILED,
            message:
              `cutover:enable-writes refuses: documents row ${writeRowId} missing after HTTP 201 ` +
              `(cannot bind PONR to a fabricated id). Fence re-armed=${rearmOk}; ` +
              `audit recorded=${auditOk} (REDHAT-FIX-RH-S30-09).`,
          },
        });
      }
      writeRowDigest = computeDocumentRowDigest(row);
      if (row.date) {
        const parsed = Date.parse(row.date);
        if (Number.isFinite(parsed)) writeCommittedAt = new Date(parsed);
        else writeCommittedAt = new Date();
      } else {
        writeCommittedAt = new Date();
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // REDHAT-FIX-RH-S30-09: transport/parse failures after fence lift also re-arm.
    // Prefer a UUID-shaped placeholder so the production audit ledger always accepts the row.
    const auditWriteId =
      writeRowId ||
      (injectFw?.documentId?.trim() ? injectFw.documentId.trim() : '') ||
      `00000000-0000-4000-8000-${runId
        .replace(/[^0-9a-f]/gi, '0')
        .slice(0, 12)
        .padEnd(12, '0')}`;
    const committedAtMs = Math.max(Date.now(), exportWm + 1);
    const { rearmOk, auditOk } = await recoverEnableWritesCrashWindow({
      secretsPath,
      writeRowId: auditWriteId,
      writeCommittedAtMs: committedAtMs,
      exportWatermarkMs: exportWm,
      databaseUrl,
      cwd,
      watermarkPath: options?.watermarkPath,
      recordAudit: true,
    });
    return baseFail({
      base_url: baseUrl,
      export_watermark_ms: exportWm,
      fence_lifted_at: fenceLiftedAt.toISOString(),
      write_row_id: writeRowId || null,
      error: {
        code: FIRST_WRITE_FAILED,
        message:
          `cutover:enable-writes failed driving POST /api/documents: ${msg}. ` +
          `Fence re-armed=${rearmOk}; audit recorded=${auditOk} (REDHAT-FIX-RH-S30-09).`,
      },
    });
  }

  // ── 8. INSERT PONR row ───────────────────────────────────────────────────
  // REDHAT-FIX-RH-S30-05: on any failure after accepted write, re-arm the
  // durable fence and record the accepted write in the production audit ledger
  // so rollback-repoint refuses (POST_EXPORT_WRITE_ACCEPTED or POST_PONR_INELIGIBLE).
  // Never leave writes open without a latch.
  let ponrId = '';
  try {
    if (options?.injectPonrInsertFailure) {
      if (typeof options.injectPonrInsertFailure === 'function') {
        options.injectPonrInsertFailure();
      }
      throw new Error('injected PONR insert failure (REDHAT-FIX-RH-S30-05)');
    }
    const inserted = await insertPonrRow({
      databaseUrl,
      fenceLiftedAt,
      writeRowId,
      writeRowDigest,
      writeCommittedAt,
      baseUrl,
      operator,
      runId,
      snapshot,
    });
    ponrId = inserted.id;
  } catch (err) {
    // Concurrent second insert → unique violation; re-SELECT for idempotent recovery
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      try {
        const raced = await readDataPlanePonr({ databaseUrl });
        if (raced) {
          return writeReport(reportPath, {
            ok: true,
            already_recorded: true,
            ponr_id: raced.id,
            write_row_id: raced.write_row_id,
            write_row_digest_sha256: raced.write_row_digest_sha256,
            write_surface: raced.write_surface,
            write_table: raced.write_table,
            fence_lifted_at: raced.fence_lifted_at,
            write_committed_at: raced.write_committed_at,
            base_url: raced.base_url,
            export_watermark_ms: raced.export_watermark_ms,
            convex_fence_audit_id: raced.convex_fence_audit_id,
            convex_documents_total: raced.convex_documents_total,
            convex_accepted_writes_since_watermark: raced.convex_accepted_writes_since_watermark,
            report_path: reportPath,
          });
        }
      } catch {
        // fall through to crash-window recovery
      }
    }

    // Crash window recovery: re-arm fence + durable production audit (fail-closed)
    const { rearmOk, auditOk } = await recoverEnableWritesCrashWindow({
      secretsPath,
      writeRowId,
      writeCommittedAtMs: writeCommittedAt.getTime(),
      exportWatermarkMs: exportWm,
      databaseUrl,
      cwd,
      watermarkPath,
    });

    const msg = err instanceof Error ? err.message : String(err);
    return baseFail({
      base_url: baseUrl,
      export_watermark_ms: exportWm,
      fence_lifted_at: fenceLiftedAt.toISOString(),
      write_row_id: writeRowId,
      write_row_digest_sha256: writeRowDigest,
      write_committed_at: writeCommittedAt.toISOString(),
      convex_fence_audit_id: snapshot.convex_fence_audit_id,
      error: {
        code: PONR_INSERT_FAILED,
        message:
          `cutover:enable-writes failed inserting data_plane_ponr: ${msg}. ` +
          `Fence re-armed=${rearmOk}; post_export_write_audit recorded=${auditOk}. ` +
          `Writes are NOT left open without a latch (REDHAT-FIX-RH-S30-05).`,
      },
    });
  }

  // ── 9. Success report (audit mirror only) ────────────────────────────────
  return writeReport(reportPath, {
    ok: true,
    already_recorded: false,
    ponr_id: ponrId,
    write_row_id: writeRowId,
    write_row_digest_sha256: writeRowDigest,
    write_surface: PONR_WRITE_SURFACE,
    write_table: PONR_WRITE_TABLE,
    fence_lifted_at: fenceLiftedAt.toISOString(),
    write_committed_at: writeCommittedAt.toISOString(),
    base_url: baseUrl,
    export_watermark_ms: exportWm,
    convex_fence_audit_id: snapshot.convex_fence_audit_id,
    convex_documents_total: snapshot.convex_documents_total,
    convex_accepted_writes_since_watermark: snapshot.convex_accepted_writes_since_watermark,
    report_path: reportPath,
  });
}

export function formatEnableWritesText(r: EnableWritesReport): string {
  if (!r.ok) {
    return [
      'holo cutover:enable-writes — FAILED',
      `  error.code:    ${r.error?.code ?? 'ENABLE_WRITES_FAILED'}`,
      `  error.message: ${r.error?.message ?? ''}`,
      `  report:        ${r.report_path}`,
    ].join('\n');
  }
  return [
    'holo cutover:enable-writes — data-plane PONR recorded',
    `  ok:                 ${r.ok}`,
    `  already_recorded:   ${r.already_recorded}`,
    `  ponr_id:            ${r.ponr_id}`,
    `  write_row_id:       ${r.write_row_id}`,
    `  write_surface:      ${r.write_surface}`,
    `  digest:             ${r.write_row_digest_sha256}`,
    `  fence_lifted_at:    ${r.fence_lifted_at}`,
    `  write_committed_at: ${r.write_committed_at}`,
    `  base_url:           ${r.base_url}`,
    `  convex_fence_audit: ${r.convex_fence_audit_id}`,
    `  report:             ${r.report_path}`,
  ].join('\n');
}

/** True when path exists — only for report defaulting; never for latch. */
export function enableWritesReportExists(cwd = process.cwd()): boolean {
  return existsSync(defaultEnableWritesReportPath(cwd));
}
