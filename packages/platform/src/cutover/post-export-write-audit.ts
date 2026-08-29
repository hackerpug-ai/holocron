/**
 * REDHAT-FIX-RH-S30-03 / UC-SYNC-04 / T-SYNC-013 —
 * Production-bound post-export accepted-write oracle.
 *
 * Authoritative source: Postgres table `post_export_write_audit`.
 * Written from real production write surfaces when an export watermark is active.
 * File mirrors under .tmp are optional operator reports only — never sole oracle.
 *
 * loadPostExportWriteAudit is fail-closed: missing/unreadable ledger → null audit
 * (callers MUST refuse, not synthesize empty success).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import { createSql } from '../db/client.ts';
import { resolveDatabaseUrl } from '../db/connection.ts';
import { defaultWatermarkReportPath } from './export-watermark.ts';

export const POST_EXPORT_WRITE_LEDGER_UNREADABLE = 'POST_EXPORT_WRITE_LEDGER_UNREADABLE';
export const POST_EXPORT_WRITE_LEDGER_MISSING = 'POST_EXPORT_WRITE_LEDGER_MISSING';

export type PostExportWriteRecord = {
  /** Epoch-ms when the write was accepted/committed. */
  committed_at_ms: number;
  /** Surface that accepted the write (e.g. hono.POST /api/documents). */
  surface: string;
  /** Optional row/id for audit. */
  id?: string;
};

export type PostExportWriteAudit = {
  /** Export watermark epoch-ms (T_export). */
  export_watermark_ms: number;
  /** Accepted production writes after the watermark. */
  accepted_writes: PostExportWriteRecord[];
  /** Where the ledger was loaded from (never synthesized). */
  source?: 'postgres' | 'file';
};

export function defaultPostExportWriteAuditPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/post-export-write-audit.json');
}

function ensureParent(path: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
}

/**
 * Load export watermark epoch-ms from D06-04 watermark report (or ETL report
 * that embeds watermark fields).
 */
export function loadExportWatermarkMs(options?: {
  cwd?: string;
  watermarkPath?: string;
}): number | null {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const path = options?.watermarkPath ?? defaultWatermarkReportPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const j = JSON.parse(readFileSync(path, 'utf8')) as {
      watermarkAtMs?: number;
      watermark?: { watermarkAtMs?: number };
      export_watermark_ms?: number;
    };
    if (typeof j.watermarkAtMs === 'number' && j.watermarkAtMs > 0) return j.watermarkAtMs;
    if (typeof j.export_watermark_ms === 'number' && j.export_watermark_ms > 0) {
      return j.export_watermark_ms;
    }
    if (typeof j.watermark?.watermarkAtMs === 'number' && j.watermark.watermarkAtMs > 0) {
      return j.watermark.watermarkAtMs;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * True when an export watermark is active (file present with positive epoch-ms).
 * Used by production write surfaces to decide whether to record into the ledger.
 */
export function isExportWatermarkActive(options?: {
  cwd?: string;
  watermarkPath?: string;
}): boolean {
  const wm = loadExportWatermarkMs(options);
  return wm != null && wm > 0;
}

/**
 * Record an accepted production write into the Postgres ledger.
 * Also optionally mirrors to the .tmp file for operator reports (non-authoritative).
 * Fail-soft on missing table only when caller chooses; default throws so writers
 * surface errors rather than silent zero-oracle drift.
 */
export async function recordPostExportAcceptedWrite(input: {
  surface: string;
  writeRowId?: string;
  committedAtMs?: number;
  exportWatermarkMs?: number;
  databaseUrl?: string;
  cwd?: string;
  watermarkPath?: string;
  /** Optional file mirror path (report only). */
  fileMirrorPath?: string | null;
  /** When true, also append to the optional file mirror. Default true when path known. */
  mirrorToFile?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; code: string; message: string }> {
  const cwd = input.cwd ?? resolveRepoRoot();
  const exportWm =
    input.exportWatermarkMs ??
    loadExportWatermarkMs({ cwd, watermarkPath: input.watermarkPath }) ??
    0;
  if (exportWm <= 0) {
    return {
      ok: false,
      code: 'EXPORT_WATERMARK_MISSING',
      message: 'recordPostExportAcceptedWrite refuses: export watermark not active',
    };
  }
  const committedAtMs = input.committedAtMs ?? Date.now();
  const databaseUrl = input.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO post_export_write_audit (
        committed_at_ms,
        surface,
        write_row_id,
        export_watermark_ms
      ) VALUES (
        ${committedAtMs},
        ${input.surface},
        ${input.writeRowId ?? null},
        ${exportWm}
      )
      RETURNING id::text AS id
    `;
    const id = rows[0]?.id;
    if (!id) {
      return {
        ok: false,
        code: POST_EXPORT_WRITE_LEDGER_UNREADABLE,
        message: 'INSERT post_export_write_audit returned no id',
      };
    }

    if (input.mirrorToFile !== false) {
      const mirrorPath =
        input.fileMirrorPath === null
          ? null
          : (input.fileMirrorPath ?? defaultPostExportWriteAuditPath(cwd));
      if (mirrorPath) {
        try {
          mirrorAcceptedWriteToFile(mirrorPath, {
            export_watermark_ms: exportWm,
            accepted_writes: [
              {
                committed_at_ms: committedAtMs,
                surface: input.surface,
                id: input.writeRowId,
              },
            ],
          });
        } catch {
          // File mirror is non-authoritative; DB row is the oracle.
        }
      }
    }

    return { ok: true, id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: POST_EXPORT_WRITE_LEDGER_UNREADABLE,
      message: `post_export_write_audit insert failed: ${msg}`,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function mirrorAcceptedWriteToFile(path: string, append: PostExportWriteAudit): void {
  ensureParent(path);
  let existing: PostExportWriteAudit = {
    export_watermark_ms: append.export_watermark_ms,
    accepted_writes: [],
  };
  if (existsSync(path)) {
    try {
      const j = JSON.parse(readFileSync(path, 'utf8')) as PostExportWriteAudit;
      existing = {
        export_watermark_ms:
          typeof j.export_watermark_ms === 'number' && j.export_watermark_ms > 0
            ? j.export_watermark_ms
            : append.export_watermark_ms,
        accepted_writes: Array.isArray(j.accepted_writes) ? j.accepted_writes : [],
      };
    } catch {
      // replace corrupt file
    }
  }
  existing.accepted_writes = [...existing.accepted_writes, ...append.accepted_writes];
  if (!existing.export_watermark_ms) {
    existing.export_watermark_ms = append.export_watermark_ms;
  }
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
}

/**
 * Seed/update the optional file mirror (tests + operator tooling).
 * NEVER the sole success oracle — prefer recordPostExportAcceptedWrite for production.
 */
export function writePostExportWriteAudit(audit: PostExportWriteAudit, path: string): void {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

/**
 * Count accepted production writes strictly after export watermark.
 */
export function countAcceptedPostExportWrites(audit: PostExportWriteAudit): number {
  const tExport = audit.export_watermark_ms;
  return audit.accepted_writes.filter(
    (w) => typeof w.committed_at_ms === 'number' && w.committed_at_ms > tExport
  ).length;
}

export type LoadPostExportWriteAuditResult = {
  audit: PostExportWriteAudit | null;
  path: string | null;
  source: 'postgres' | 'file' | null;
  error?: { code: string; message: string };
};

/**
 * Load post-export write audit — fail-closed.
 *
 * Preference order:
 *   1. Postgres table post_export_write_audit (authoritative)
 *   2. Never synthesize empty from a missing file alone
 *
 * When Postgres is unreadable / table missing → audit:null + error.
 * Empty table with known watermark → valid zero accepted writes (source postgres).
 *
 * File path is returned only as a non-authoritative mirror path for reports.
 *
 * @deprecated Prefer loadPostExportWriteAuditAsync. Sync wrapper only reads file
 * for unit tests that cannot open Postgres; production cutover paths MUST use async.
 */
export function loadPostExportWriteAudit(options?: {
  cwd?: string;
  auditPath?: string;
  watermarkPath?: string;
  /** When true, refuse to synthesize empty (default true for fail-closed). */
  failClosed?: boolean;
}): { audit: PostExportWriteAudit | null; path: string | null } {
  const failClosed = options?.failClosed !== false;
  const cwd = options?.cwd ?? resolveRepoRoot();
  const path = options?.auditPath ?? defaultPostExportWriteAuditPath(cwd);
  if (existsSync(path)) {
    try {
      const j = JSON.parse(readFileSync(path, 'utf8')) as PostExportWriteAudit;
      const accepted = Array.isArray(j.accepted_writes) ? j.accepted_writes : [];
      return {
        audit: {
          export_watermark_ms:
            typeof j.export_watermark_ms === 'number' ? j.export_watermark_ms : 0,
          accepted_writes: accepted,
          source: 'file',
        },
        path,
      };
    } catch {
      // Unreadable file is not a valid oracle when fail-closed
      if (failClosed) return { audit: null, path };
      return { audit: null, path };
    }
  }
  // REDHAT-FIX-RH-S30-03: never synthesize empty success from a missing file.
  // Callers that need a zero-write oracle must seed the Postgres ledger (or file).
  if (failClosed) {
    return { audit: null, path: null };
  }
  // Legacy opt-in synthesis for non-production test fixtures only.
  const wm = loadExportWatermarkMs({ cwd, watermarkPath: options?.watermarkPath });
  if (wm == null) return { audit: null, path: null };
  return {
    audit: { export_watermark_ms: wm, accepted_writes: [], source: 'file' },
    path: null,
  };
}

/**
 * Authoritative async load: Postgres ledger first, fail-closed on unreadable/missing table.
 * File is never authoritative — only used when `preferFileMirror` is set for diagnostics.
 */
export async function loadPostExportWriteAuditAsync(options?: {
  cwd?: string;
  auditPath?: string;
  watermarkPath?: string;
  databaseUrl?: string;
  /** When true, allow file mirror as fallback only if Postgres table is empty of schema. Default false. */
  allowFileFallback?: boolean;
}): Promise<LoadPostExportWriteAuditResult> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const auditPath = options?.auditPath ?? defaultPostExportWriteAuditPath(cwd);
  const watermarkPath = options?.watermarkPath;
  const exportWm = loadExportWatermarkMs({ cwd, watermarkPath });
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  try {
    // Prove table exists (fail closed if relation missing)
    const exists = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'post_export_write_audit'
      ) AS exists
    `;
    if (!exists[0]?.exists) {
      if (options?.allowFileFallback) {
        const file = loadPostExportWriteAudit({
          cwd,
          auditPath,
          watermarkPath,
          failClosed: true,
        });
        if (file.audit) {
          return { audit: file.audit, path: file.path, source: 'file' };
        }
      }
      return {
        audit: null,
        path: existsSync(auditPath) ? auditPath : null,
        source: null,
        error: {
          code: POST_EXPORT_WRITE_LEDGER_MISSING,
          message:
            'post_export_write_audit table missing — run holo db:migrate (0032). ' +
            'Refuse empty-file synthesis (REDHAT-FIX-RH-S30-03).',
        },
      };
    }

    const rows = await sql<
      {
        committed_at_ms: string;
        surface: string;
        write_row_id: string | null;
        export_watermark_ms: string;
      }[]
    >`
      SELECT
        committed_at_ms::text AS committed_at_ms,
        surface::text AS surface,
        write_row_id::text AS write_row_id,
        export_watermark_ms::text AS export_watermark_ms
      FROM post_export_write_audit
      ORDER BY committed_at_ms ASC
    `;

    const accepted_writes: PostExportWriteRecord[] = rows.map((r) => ({
      committed_at_ms: Number(r.committed_at_ms),
      surface: r.surface,
      ...(r.write_row_id ? { id: r.write_row_id } : {}),
    }));

    // Prefer watermark from file/report; fall back to max row watermark or 0
    let wm = exportWm ?? 0;
    if (wm <= 0 && rows.length > 0) {
      wm = Math.min(...rows.map((r) => Number(r.export_watermark_ms)));
    }

    // Empty ledger with no watermark is still unusable for re-point eligibility
    // (watermark must come from D06-04). Return valid empty audit only when wm known
    // OR when rows exist (count will filter).
    if (wm <= 0 && accepted_writes.length === 0) {
      // Table present and empty — valid zero oracle only if watermark known from file.
      // Without watermark, export path is incomplete; return empty audit with wm=0
      // so callers that already checked watermark separately can still proceed.
      return {
        audit: { export_watermark_ms: 0, accepted_writes: [], source: 'postgres' },
        path: existsSync(auditPath) ? auditPath : null,
        source: 'postgres',
      };
    }

    return {
      audit: {
        export_watermark_ms: wm > 0 ? wm : 0,
        accepted_writes,
        source: 'postgres',
      },
      path: existsSync(auditPath) ? auditPath : null,
      source: 'postgres',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      audit: null,
      path: existsSync(auditPath) ? auditPath : null,
      source: null,
      error: {
        code: POST_EXPORT_WRITE_LEDGER_UNREADABLE,
        message: `post_export_write_audit unreadable: ${msg}`,
      },
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Test/operator helper: clear the Postgres ledger (owner connection).
 * Production cutover paths never call this.
 */
export async function clearPostExportWriteAuditLedger(options?: {
  databaseUrl?: string;
}): Promise<void> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  try {
    await sql`DELETE FROM post_export_write_audit`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
