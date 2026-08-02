/**
 * REDHAT-FIX-S29-H05 / UC-SYNC-04 — executable data-plane rollback re-point.
 *
 * During read-only soak, operator may re-point the data plane back to the
 * frozen Convex deployment (Convex stays live/un-deleted). Eligibility ends
 * at the first accepted post-export production write (point of no return).
 *
 * This is a real control-plane/config write — not a docs-only runbook.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import { defaultWatermarkReportPath } from './export-watermark.ts';
import { defaultSoakStatePath, setMigrationReadOnlyEnv } from './soak-fence.ts';

export const POST_EXPORT_WRITE_ACCEPTED = 'POST_EXPORT_WRITE_ACCEPTED';
export const ROLLBACK_INELIGIBLE = 'ROLLBACK_INELIGIBLE';
export const EXPORT_WATERMARK_MISSING = 'EXPORT_WATERMARK_MISSING';

/** Frozen Convex data-plane target identity (UC-SYNC-04). */
export const TARGET_CONVEX_FROZEN = 'convex-frozen';

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
};

export type RollbackRepointReport = {
  ok: boolean;
  repointed: boolean;
  target: string;
  target_kind: 'convex';
  data_plane: 'convex';
  engaged_at: string;
  engaged_at_ms: number;
  precondition: {
    ok: boolean;
    accepted_post_export_writes: number;
    export_watermark_ms: number | null;
    audit_path: string | null;
  };
  config: {
    path: string;
    digest_sha256: string;
    prior_target: string | null;
  };
  report_path: string;
  error?: { code: string; message: string };
};

export function defaultRollbackRepointReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/rollback-repoint-report.json');
}

/** Durable data-plane config written by rollback-repoint (and readable by soak). */
export function defaultDataPlaneConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/data-plane-config.json');
}

/** Operator/fixture ledger of accepted post-export production writes. */
export function defaultPostExportWriteAuditPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/post-export-write-audit.json');
}

function ensureParent(path: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
}

function sha256Of(text: string): string {
  return createHash('sha256').update(text).digest('hex');
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
 * Load (or synthesize empty) post-export write audit.
 * When the audit file is missing, treat as zero accepted writes but still
 * require an export watermark for a successful re-point.
 */
export function loadPostExportWriteAudit(options?: {
  cwd?: string;
  auditPath?: string;
  watermarkPath?: string;
}): { audit: PostExportWriteAudit | null; path: string | null } {
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
        },
        path,
      };
    } catch {
      return { audit: null, path };
    }
  }
  // No audit file: synthesize from watermark with zero accepted writes
  const wm = loadExportWatermarkMs({ cwd, watermarkPath: options?.watermarkPath });
  if (wm == null) return { audit: null, path: null };
  return {
    audit: { export_watermark_ms: wm, accepted_writes: [] },
    path: null,
  };
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

/**
 * Seed/update the post-export write audit ledger (tests + operator tooling).
 */
export function writePostExportWriteAudit(audit: PostExportWriteAudit, path: string): void {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

/**
 * UC-SYNC-04: re-point data plane config to frozen Convex.
 *
 * Preconditions:
 * - export watermark present
 * - accepted_post_export_writes == 0 (else POST_EXPORT_WRITE_ACCEPTED / ROLLBACK_INELIGIBLE)
 *
 * Side effects:
 * - writes data-plane-config.json (target convex-frozen)
 * - updates soak-state.json data_plane fields when present
 * - does NOT delete Convex deployment
 * - does NOT unset HOLO_MIGRATION_READ_ONLY (fence stays for soak integrity)
 */
export function runRollbackRepoint(options?: {
  cwd?: string;
  reportPath?: string;
  configPath?: string;
  auditPath?: string;
  watermarkPath?: string;
  /**
   * When true, also clear the new-stack soak fence env in-process so the
   * reciprocal of cutover:flip is observable. Default false — fence stays
   * armed; only data-plane target re-points (H-05 / UC-SYNC-04).
   */
  clearSoakFence?: boolean;
}): RollbackRepointReport {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const reportPath = options?.reportPath ?? defaultRollbackRepointReportPath(cwd);
  const configPath = options?.configPath ?? defaultDataPlaneConfigPath(cwd);
  const auditPath = options?.auditPath ?? defaultPostExportWriteAuditPath(cwd);
  const watermarkPath = options?.watermarkPath ?? defaultWatermarkReportPath(cwd);

  const engaged_at_ms = Date.now();
  const engaged_at = new Date(engaged_at_ms).toISOString();

  const { audit, path: resolvedAuditPath } = loadPostExportWriteAudit({
    cwd,
    auditPath,
    watermarkPath,
  });

  const exportWm =
    audit?.export_watermark_ms && audit.export_watermark_ms > 0
      ? audit.export_watermark_ms
      : loadExportWatermarkMs({ cwd, watermarkPath });

  if (exportWm == null || exportWm <= 0) {
    const fail: RollbackRepointReport = {
      ok: false,
      repointed: false,
      target: TARGET_CONVEX_FROZEN,
      target_kind: 'convex',
      data_plane: 'convex',
      engaged_at: '',
      engaged_at_ms: 0,
      precondition: {
        ok: false,
        accepted_post_export_writes: -1,
        export_watermark_ms: null,
        audit_path: resolvedAuditPath,
      },
      config: { path: configPath, digest_sha256: '', prior_target: null },
      report_path: reportPath,
      error: {
        code: EXPORT_WATERMARK_MISSING,
        message:
          `cutover:rollback-repoint refuses: export watermark missing ` +
          `(looked at ${watermarkPath} and ${auditPath}). Capture watermark via cutover:run-etl first.`,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  const effectiveAudit: PostExportWriteAudit = audit ?? {
    export_watermark_ms: exportWm,
    accepted_writes: [],
  };
  // Prefer watermark from file when audit lacked it
  if (!effectiveAudit.export_watermark_ms) {
    effectiveAudit.export_watermark_ms = exportWm;
  }

  const accepted = countAcceptedPostExportWrites(effectiveAudit);
  if (accepted > 0) {
    const fail: RollbackRepointReport = {
      ok: false,
      repointed: false,
      target: TARGET_CONVEX_FROZEN,
      target_kind: 'convex',
      data_plane: 'convex',
      engaged_at: '',
      engaged_at_ms: 0,
      precondition: {
        ok: false,
        accepted_post_export_writes: accepted,
        export_watermark_ms: exportWm,
        audit_path: resolvedAuditPath ?? auditPath,
      },
      config: { path: configPath, digest_sha256: '', prior_target: readPriorTarget(configPath) },
      report_path: reportPath,
      error: {
        code: POST_EXPORT_WRITE_ACCEPTED,
        message:
          `cutover:rollback-repoint refuses: ${accepted} accepted post-export production write(s) ` +
          `(point of no return / UC-SYNC-04). Convex re-point is ineligible; recover from Postgres/blob backups.`,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  // Executable config re-point — write durable data-plane target to frozen Convex
  const prior_target = readPriorTarget(configPath);
  const configBody = {
    data_plane: 'convex' as const,
    target: TARGET_CONVEX_FROZEN,
    target_kind: 'convex' as const,
    // Convex cloud deployment remains live (never deleted as rollback)
    convex_deployment_deleted: false,
    repointed_at: engaged_at,
    repointed_at_ms: engaged_at_ms,
    export_watermark_ms: exportWm,
    accepted_post_export_writes: 0,
    note: 'UC-SYNC-04 rollback re-point: data plane → frozen Convex under read-only soak',
  };
  const configText = `${JSON.stringify(configBody, null, 2)}\n`;
  ensureParent(configPath);
  writeFileSync(configPath, configText, 'utf8');
  const digest_sha256 = sha256Of(configText);

  // Update soak-state if present (shared surface with D06-05 flip)
  const soakStatePath = defaultSoakStatePath(cwd);
  if (existsSync(soakStatePath)) {
    try {
      const prev = JSON.parse(readFileSync(soakStatePath, 'utf8')) as Record<string, unknown>;
      writeFileSync(
        soakStatePath,
        `${JSON.stringify(
          {
            ...prev,
            data_plane: 'convex',
            target: TARGET_CONVEX_FROZEN,
            repointed_at: engaged_at,
            repointed_at_ms: engaged_at_ms,
          },
          null,
          2
        )}\n`,
        'utf8'
      );
    } catch {
      // non-fatal
    }
  } else {
    ensureParent(soakStatePath);
    writeFileSync(
      soakStatePath,
      `${JSON.stringify(
        {
          data_plane: 'convex',
          target: TARGET_CONVEX_FROZEN,
          repointed_at: engaged_at,
          repointed_at_ms: engaged_at_ms,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  }

  if (options?.clearSoakFence) {
    setMigrationReadOnlyEnv('0');
  }

  const report: RollbackRepointReport = {
    ok: true,
    repointed: true,
    target: TARGET_CONVEX_FROZEN,
    target_kind: 'convex',
    data_plane: 'convex',
    engaged_at,
    engaged_at_ms,
    precondition: {
      ok: true,
      accepted_post_export_writes: 0,
      export_watermark_ms: exportWm,
      audit_path: resolvedAuditPath,
    },
    config: {
      path: configPath,
      digest_sha256,
      prior_target,
    },
    report_path: reportPath,
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function readPriorTarget(configPath: string): string | null {
  if (!existsSync(configPath)) return null;
  try {
    const j = JSON.parse(readFileSync(configPath, 'utf8')) as { target?: string };
    return typeof j.target === 'string' ? j.target : null;
  } catch {
    return null;
  }
}

export function formatRollbackRepointText(r: RollbackRepointReport): string {
  if (!r.ok) {
    return [
      'holo cutover:rollback-repoint — FAILED',
      `  error.code:    ${r.error?.code ?? ROLLBACK_INELIGIBLE}`,
      `  error.message: ${r.error?.message ?? ''}`,
      `  repointed:     ${r.repointed}`,
      `  accepted_post_export_writes: ${r.precondition.accepted_post_export_writes}`,
      `  report:        ${r.report_path}`,
    ].join('\n');
  }
  return [
    'holo cutover:rollback-repoint — data plane → frozen Convex',
    `  ok:            ${r.ok}`,
    `  repointed:     ${r.repointed}`,
    `  target:        ${r.target}`,
    `  engaged_at:    ${r.engaged_at}`,
    `  config:        ${r.config.path}`,
    `  digest:        ${r.config.digest_sha256}`,
    `  report:        ${r.report_path}`,
  ].join('\n');
}
