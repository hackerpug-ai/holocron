/**
 * REDHAT-FIX-S29-H05 / REDHAT-FIX-S29-R2-C04 / REDHAT-FIX-S29-R3-H03 / UC-SYNC-04 —
 * executable data-plane rollback re-point through the serving control plane
 * with live acknowledgements from pre-existing serving generations.
 *
 * During read-only soak, operator may re-point the data plane back to the
 * frozen Convex deployment (Convex stays live/un-deleted). Eligibility ends
 * at the first accepted post-export production write (point of no return).
 *
 * R2-C04: success requires writing HOLO_DATA_PLANE to the durable secrets
 * control-plane that running Hono/MCP/worker modules re-read, plus at least
 * one live acknowledgement from a serving observer. Writing .tmp alone is
 * never sufficient for repointed:true.
 *
 * R3-H03: repointed:true requires acknowledgement from a process that was
 * already serving before this command — HTTP /health on an already-listening
 * base URL (HOLO_VERIFY_BASE_URL / HOLO_SOAK_BASE_URL / PLATFORM_URL) and/or a
 * pre-existing worker generation (stack pid alive before control-plane write).
 * Self-created createHonoApp().request, same-command cross-process spawns, and
 * cutover-cli process_generation must never authorize repointed:true.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot, resolveSecretsPathFromEnv } from '../config/secrets.ts';
import { defaultWatermarkReportPath } from './export-watermark.ts';
import {
  captureProcessGenerations,
  DATA_PLANE_ENV,
  defaultSoakStatePath,
  type ProcessGenerationUnit,
  ROLLBACK_TARGET_ENV,
  readDurableDataPlane,
  resolveVerifyBaseUrl,
  setMigrationReadOnlyEnv,
  writeDurableDataPlane,
} from './soak-fence.ts';

export const POST_EXPORT_WRITE_ACCEPTED = 'POST_EXPORT_WRITE_ACCEPTED';
export const ROLLBACK_INELIGIBLE = 'ROLLBACK_INELIGIBLE';
export const EXPORT_WATERMARK_MISSING = 'EXPORT_WATERMARK_MISSING';
export const LIVE_ACK_MISSING = 'LIVE_ACK_MISSING';
export const CONTROL_PLANE_WRITE_FAILED = 'CONTROL_PLANE_WRITE_FAILED';

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

/**
 * Live unit that observed the post-repoint data-plane target.
 * R3-H03: only preexisting:true network_health / process_generation authorize
 * repointed:true. Kinds serving_health / cross_process are retained only for
 * type compatibility with historical reports and must never set preexisting.
 */
export type RollbackAcknowledgement = {
  unit: string;
  kind: 'serving_health' | 'cross_process' | 'process_generation' | 'network_health';
  observed_data_plane: string;
  observed_target: string;
  observed_at: string;
  source: string;
  pid?: number;
  /**
   * True when the unit was proven listening/alive before the control-plane
   * write of this command. Required for authorizing repointed:true (R3-H03).
   */
  preexisting: boolean;
};

export type RollbackRepointReport = {
  ok: boolean;
  repointed: boolean;
  target: string;
  target_kind: 'convex';
  data_plane: 'convex';
  engaged_at: string;
  engaged_at_ms: number;
  /**
   * Absolute path or labeled control-plane id consumed by serving processes
   * (secrets.yaml via HOLO_SECRETS_PATH) — never .tmp-only audit mirrors.
   */
  configured_target: string;
  precondition: {
    ok: boolean;
    accepted_post_export_writes: number;
    export_watermark_ms: number | null;
    audit_path: string | null;
  };
  config: {
    /** Audit mirror path (.tmp) — NOT the success oracle. */
    path: string;
    digest_sha256: string;
    prior_target: string | null;
  };
  /** Live serving-unit acknowledgements; required length >= 1 for repointed:true. */
  acknowledgements: RollbackAcknowledgement[];
  report_path: string;
  error?: { code: string; message: string };
};

export function defaultRollbackRepointReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/rollback-repoint-report.json');
}

/**
 * Operator audit mirror for data-plane config (NOT the serving control-plane).
 * R2-C04: consumers of HOLO_DATA_PLANE live in secrets + runtime modules —
 * this path alone must never authorize repointed:true.
 */
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

function emptyAcks(): RollbackAcknowledgement[] {
  return [];
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

function matchesExpectedPlane(
  dataPlane: string | null | undefined,
  target: string | null | undefined,
  expectedPlane: string,
  expectedTarget: string
): boolean {
  return dataPlane === expectedPlane || target === expectedTarget;
}

/** Resolve deployed/already-running base URL for rollback serving acks (R3-H03). */
export function resolveRollbackBaseUrl(explicit?: string | null): string {
  return resolveVerifyBaseUrl(explicit);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * R3-H03: only pre-existing network_health / process_generation may authorize
 * repointed:true. Same-command createHonoApp, newly spawned children, and the
 * cutover CLI process itself are never authorizing.
 */
export function isAuthorizingRollbackAck(ack: RollbackAcknowledgement): boolean {
  if (!ack.preexisting) return false;
  if (ack.kind !== 'network_health' && ack.kind !== 'process_generation') return false;
  // Same-command CLI process can never authorize.
  if (ack.pid === process.pid) return false;
  if (ack.unit === 'cutover-cli' || ack.unit === 'hono-serving-health') return false;
  if (ack.unit === 'cross-process-secrets-reader') return false;
  if (ack.source.includes('createHonoApp')) return false;
  return true;
}

export function filterAuthorizingRollbackAcks(
  acks: RollbackAcknowledgement[]
): RollbackAcknowledgement[] {
  return acks.filter(isAuthorizingRollbackAck);
}

type HealthPlaneBody = {
  data_plane?: string | null;
  target?: string | null;
  rollback?: { target?: string | null; data_plane?: string | null };
};

/**
 * Prove a base URL is already listening (pre-existing serving process).
 * Any HTTP response (including 503) counts as listening.
 */
export async function probePreexistingServingListening(
  baseUrl: string,
  timeoutMs = 3_000
): Promise<{ listening: boolean; status?: number; error?: string }> {
  const trimmed = baseUrl.trim().replace(/\/$/, '');
  if (!trimmed) return { listening: false, error: 'empty base URL' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${trimmed}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    clearTimeout(timer);
    return { listening: true, status: res.status };
  } catch (err) {
    return {
      listening: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Capture serving generations that exist before control-plane write.
 * Excludes the cutover CLI process (never authorizing under R3-H03).
 */
export function capturePreexistingServingUnits(cwd: string): ProcessGenerationUnit[] {
  return captureProcessGenerations(cwd).filter(
    (u) =>
      u.id !== 'cutover-cli' &&
      typeof u.pid === 'number' &&
      u.pid > 0 &&
      u.pid !== process.pid &&
      isPidAlive(u.pid)
  );
}

/**
 * Collect live acknowledgements from pre-existing serving units only (R3-H03).
 *
 * Does NOT construct createHonoApp, spawn secrets-reader children, or treat
 * the current CLI process as a deployment ack. Requires:
 * - baseUrl proven listening before control-plane write (network_health), and/or
 * - pre-existing stack/worker pid still alive after write that observed the plane
 *   via the network health path (process_generation co-ack).
 */
export async function collectLiveDataPlaneAcknowledgements(options: {
  cwd: string;
  secretsPath: string;
  expectedDataPlane: string;
  expectedTarget: string;
  /** Optional live base URL (PLATFORM_URL / HOLO_SOAK_BASE_URL / HOLO_VERIFY_BASE_URL). */
  baseUrl?: string;
  /**
   * Must be true for network_health to authorize — base URL was listening
   * before the control-plane write of this command.
   */
  baseUrlPreexisting?: boolean;
  /** Stack/worker units captured before control-plane write. */
  preexistingUnits?: ProcessGenerationUnit[];
}): Promise<RollbackAcknowledgement[]> {
  const acks: RollbackAcknowledgement[] = [];
  const expectedPlane = options.expectedDataPlane;
  const expectedTarget = options.expectedTarget;
  const baseUrl = resolveRollbackBaseUrl(options.baseUrl);
  const preexistingUnits = options.preexistingUnits ?? [];
  const preexistingPidSet = new Set(
    preexistingUnits
      .map((u) => u.pid)
      .filter((p): p is number => typeof p === 'number' && p > 0 && p !== process.pid)
  );

  // Optional verify-pid from env (operator-declared pre-existing serving identity)
  const envPidRaw = process.env.HOLO_VERIFY_PID;
  const envPid =
    envPidRaw && envPidRaw.length > 0 && Number.isFinite(Number(envPidRaw))
      ? Number(envPidRaw)
      : undefined;
  if (envPid !== undefined && preexistingPidSet.has(envPid) === false && isPidAlive(envPid)) {
    // Only count env pid when it was also in the pre-write capture set OR we
    // treat a listening baseUrlPreexisting + matching HOLO_VERIFY_PID as pre-existing.
    // HOLO_VERIFY_PID alone without pre-write capture is accepted only when
    // baseUrlPreexisting is true (server was already answering /health).
    if (options.baseUrlPreexisting === true) {
      preexistingPidSet.add(envPid);
    }
  }

  // R3-H03: network /health on already-listening base URL (primary authorizing path)
  if (baseUrl && options.baseUrlPreexisting === true) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      clearTimeout(timer);
      if (res.ok || res.status === 503) {
        const body = (await res.json()) as HealthPlaneBody;
        const plane = body.data_plane ?? body.rollback?.data_plane ?? null;
        const target = body.target ?? body.rollback?.target ?? null;
        if (matchesExpectedPlane(plane, target, expectedPlane, expectedTarget)) {
          const observedAt = new Date().toISOString();
          const boundPid =
            envPid !== undefined && preexistingPidSet.has(envPid) && isPidAlive(envPid)
              ? envPid
              : undefined;
          acks.push({
            unit: 'network-serving-health',
            kind: 'network_health',
            observed_data_plane: plane ?? '',
            observed_target: target ?? '',
            observed_at: observedAt,
            source: `${baseUrl}/health`,
            pid: boundPid,
            preexisting: true,
          });
          // Co-ack: pre-existing worker/stack generation that matches verify pid
          // or any captured stack unit still alive (proves generation continuity).
          for (const unit of preexistingUnits) {
            if (typeof unit.pid !== 'number' || unit.pid === process.pid) continue;
            if (!isPidAlive(unit.pid)) continue;
            // Only co-ack when network already observed the plane (shared oracle).
            acks.push({
              unit: unit.id.startsWith('stack:') ? unit.id : `stack:${unit.id}`,
              kind: 'process_generation',
              observed_data_plane: plane ?? '',
              observed_target: target ?? '',
              observed_at: observedAt,
              source: `preexisting-generation:${unit.label ?? unit.id}`,
              pid: unit.pid,
              preexisting: true,
            });
          }
          if (
            boundPid !== undefined &&
            !acks.some((a) => a.kind === 'process_generation' && a.pid === boundPid)
          ) {
            acks.push({
              unit: `verify-pid:${boundPid}`,
              kind: 'process_generation',
              observed_data_plane: plane ?? '',
              observed_target: target ?? '',
              observed_at: observedAt,
              source: 'HOLO_VERIFY_PID+network_health',
              pid: boundPid,
              preexisting: true,
            });
          }
        }
      }
    } catch {
      // Pre-existing service may have died between preflight and post-write probe.
    }
  }

  // Intentionally omitted (R3-H03 — never authorize repointed:true):
  // - in-process createHonoApp().request (self-created serving_health)
  // - spawnSync secrets-reader child (same-command cross_process)
  // - cutover-cli process_generation (same-command CLI)

  return acks;
}

/**
 * UC-SYNC-04: re-point serving data plane to frozen Convex via control-plane.
 *
 * Preconditions:
 * - export watermark present
 * - accepted_post_export_writes == 0 (else POST_EXPORT_WRITE_ACCEPTED / ROLLBACK_INELIGIBLE)
 *
 * Side effects:
 * - writes HOLO_DATA_PLANE=convex + HOLO_ROLLBACK_TARGET to durable secrets (serving CP)
 * - writes audit mirrors under .tmp/D06-05 (not the success oracle)
 * - collects live acknowledgements from serving observers
 * - does NOT delete Convex deployment
 * - does NOT unset HOLO_MIGRATION_READ_ONLY (fence stays for soak integrity)
 *
 * repointed:true ONLY when ≥1 authorizing ack from a pre-existing serving unit
 * (R3-H03: network_health on already-listening base URL and/or pre-existing
 * worker generation — never self-created createHonoApp).
 */
export async function runRollbackRepoint(options?: {
  cwd?: string;
  reportPath?: string;
  /** Audit mirror path only — not the serving control-plane. */
  configPath?: string;
  auditPath?: string;
  watermarkPath?: string;
  /** Durable secrets control-plane path (defaults to resolveSecretsPathFromEnv). */
  secretsPath?: string;
  /** Override frozen target label (default TARGET_CONVEX_FROZEN). */
  target?: string;
  /** Optional live serving base URL for network health ack. */
  baseUrl?: string;
  /**
   * When true, also clear the new-stack soak fence env in-process so the
   * reciprocal of cutover:flip is observable. Default false — fence stays
   * armed; only data-plane target re-points (H-05 / UC-SYNC-04).
   */
  clearSoakFence?: boolean;
}): Promise<RollbackRepointReport> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const reportPath = options?.reportPath ?? defaultRollbackRepointReportPath(cwd);
  const configPath = options?.configPath ?? defaultDataPlaneConfigPath(cwd);
  const auditPath = options?.auditPath ?? defaultPostExportWriteAuditPath(cwd);
  const watermarkPath = options?.watermarkPath ?? defaultWatermarkReportPath(cwd);
  const secretsPath = options?.secretsPath ?? resolveSecretsPathFromEnv(process.env, cwd);
  const target = options?.target?.trim() || TARGET_CONVEX_FROZEN;
  const baseUrl = resolveRollbackBaseUrl(options?.baseUrl);

  // R3-H03: snapshot pre-existing serving generations BEFORE control-plane write
  const preexistingUnits = capturePreexistingServingUnits(cwd);
  let baseUrlPreexisting = false;
  if (baseUrl) {
    const preflight = await probePreexistingServingListening(baseUrl);
    baseUrlPreexisting = preflight.listening;
  }

  const engaged_at_ms = Date.now();
  const engaged_at = new Date(engaged_at_ms).toISOString();

  const baseFail = (partial: Partial<RollbackRepointReport>): RollbackRepointReport => ({
    ok: false,
    repointed: false,
    target,
    target_kind: 'convex',
    data_plane: 'convex',
    engaged_at: '',
    engaged_at_ms: 0,
    configured_target: secretsPath,
    precondition: {
      ok: false,
      accepted_post_export_writes: -1,
      export_watermark_ms: null,
      audit_path: null,
    },
    config: { path: configPath, digest_sha256: '', prior_target: null },
    acknowledgements: emptyAcks(),
    report_path: reportPath,
    ...partial,
  });

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
    const fail = baseFail({
      precondition: {
        ok: false,
        accepted_post_export_writes: -1,
        export_watermark_ms: null,
        audit_path: resolvedAuditPath,
      },
      error: {
        code: EXPORT_WATERMARK_MISSING,
        message:
          `cutover:rollback-repoint refuses: export watermark missing ` +
          `(looked at ${watermarkPath} and ${auditPath}). Capture watermark via cutover:run-etl first.`,
      },
    });
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  const effectiveAudit: PostExportWriteAudit = audit ?? {
    export_watermark_ms: exportWm,
    accepted_writes: [],
  };
  if (!effectiveAudit.export_watermark_ms) {
    effectiveAudit.export_watermark_ms = exportWm;
  }

  const accepted = countAcceptedPostExportWrites(effectiveAudit);
  if (accepted > 0) {
    const fail = baseFail({
      precondition: {
        ok: false,
        accepted_post_export_writes: accepted,
        export_watermark_ms: exportWm,
        audit_path: resolvedAuditPath ?? auditPath,
      },
      config: {
        path: configPath,
        digest_sha256: '',
        prior_target: readPriorTarget(configPath),
      },
      error: {
        code: POST_EXPORT_WRITE_ACCEPTED,
        message:
          `cutover:rollback-repoint refuses: ${accepted} accepted post-export production write(s) ` +
          `(point of no return / UC-SYNC-04). Convex re-point is ineligible; recover from Postgres/blob backups.`,
      },
    });
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  // ── Serving control-plane write (authoritative) ──────────────────────────
  const priorDurable = readDurableDataPlane(process.env, secretsPath);
  const prior_target = priorDurable.target ?? readPriorTarget(configPath);

  let durablePath: string;
  try {
    const durable = writeDurableDataPlane('convex', target, {
      secretsPath,
      engagedAt: engaged_at,
    });
    durablePath = durable.secretsPath;
  } catch (err) {
    const fail = baseFail({
      engaged_at,
      engaged_at_ms,
      precondition: {
        ok: true,
        accepted_post_export_writes: 0,
        export_watermark_ms: exportWm,
        audit_path: resolvedAuditPath,
      },
      config: { path: configPath, digest_sha256: '', prior_target },
      error: {
        code: CONTROL_PLANE_WRITE_FAILED,
        message:
          `cutover:rollback-repoint failed writing durable control-plane at ${secretsPath}: ` +
          (err instanceof Error ? err.message : String(err)),
      },
    });
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  // Confirm durable re-read (secrets file, not process.env alone)
  const prevEnvPlane = process.env[DATA_PLANE_ENV];
  const prevEnvTarget = process.env[ROLLBACK_TARGET_ENV];
  delete process.env[DATA_PLANE_ENV];
  delete process.env[ROLLBACK_TARGET_ENV];
  const durableConfirm = readDurableDataPlane(process.env, durablePath);
  if (prevEnvPlane !== undefined) process.env[DATA_PLANE_ENV] = prevEnvPlane;
  else process.env[DATA_PLANE_ENV] = 'convex';
  if (prevEnvTarget !== undefined) process.env[ROLLBACK_TARGET_ENV] = prevEnvTarget;
  else process.env[ROLLBACK_TARGET_ENV] = target;

  if (durableConfirm.data_plane !== 'convex') {
    const fail = baseFail({
      engaged_at,
      engaged_at_ms,
      configured_target: durablePath,
      precondition: {
        ok: true,
        accepted_post_export_writes: 0,
        export_watermark_ms: exportWm,
        audit_path: resolvedAuditPath,
      },
      config: { path: configPath, digest_sha256: '', prior_target },
      error: {
        code: CONTROL_PLANE_WRITE_FAILED,
        message:
          `durable control-plane re-read did not observe HOLO_DATA_PLANE=convex at ${durablePath} ` +
          `(got ${durableConfirm.data_plane ?? 'unset'})`,
      },
    });
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  // ── Audit mirrors only (.tmp) — never the success oracle ─────────────────
  const configBody = {
    data_plane: 'convex' as const,
    target,
    target_kind: 'convex' as const,
    convex_deployment_deleted: false,
    repointed_at: engaged_at,
    repointed_at_ms: engaged_at_ms,
    export_watermark_ms: exportWm,
    accepted_post_export_writes: 0,
    configured_target: durablePath,
    note: 'UC-SYNC-04 rollback re-point audit mirror; authoritative plane is HOLO_DATA_PLANE in secrets',
  };
  const configText = `${JSON.stringify(configBody, null, 2)}\n`;
  ensureParent(configPath);
  writeFileSync(configPath, configText, 'utf8');
  const digest_sha256 = sha256Of(configText);

  const soakStatePath = defaultSoakStatePath(cwd);
  try {
    const prev = existsSync(soakStatePath)
      ? (JSON.parse(readFileSync(soakStatePath, 'utf8')) as Record<string, unknown>)
      : {};
    ensureParent(soakStatePath);
    writeFileSync(
      soakStatePath,
      `${JSON.stringify(
        {
          ...prev,
          data_plane: 'convex',
          target,
          repointed_at: engaged_at,
          repointed_at_ms: engaged_at_ms,
          configured_target: durablePath,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  } catch {
    // non-fatal audit mirror
  }

  if (options?.clearSoakFence) {
    setMigrationReadOnlyEnv('0');
  }

  // ── Live acknowledgements from pre-existing serving units (R3-H03) ───────
  const acknowledgements = await collectLiveDataPlaneAcknowledgements({
    cwd,
    secretsPath: durablePath,
    expectedDataPlane: 'convex',
    expectedTarget: target,
    baseUrl: baseUrl || undefined,
    baseUrlPreexisting,
    preexistingUnits,
  });
  const authorizingAcks = filterAuthorizingRollbackAcks(acknowledgements);

  if (authorizingAcks.length < 1) {
    const preflightHint = baseUrl
      ? baseUrlPreexisting
        ? `base URL ${baseUrl} was listening before write but post-write /health did not observe data_plane=convex / target=${target}`
        : `base URL ${baseUrl} was not listening before control-plane write (not a pre-existing serving process)`
      : `no HOLO_VERIFY_BASE_URL / HOLO_SOAK_BASE_URL / PLATFORM_URL — cannot contact a pre-existing serving process`;
    const fail = baseFail({
      ok: false,
      repointed: false,
      engaged_at,
      engaged_at_ms,
      configured_target: durablePath,
      precondition: {
        ok: true,
        accepted_post_export_writes: 0,
        export_watermark_ms: exportWm,
        audit_path: resolvedAuditPath,
      },
      config: { path: configPath, digest_sha256, prior_target },
      acknowledgements,
      error: {
        code: LIVE_ACK_MISSING,
        message:
          `cutover:rollback-repoint wrote control-plane at ${durablePath} but no pre-existing ` +
          `serving unit acknowledged data_plane=convex / target=${target}. ` +
          `${preflightHint}. Self-created createHonoApp / same-command children do not authorize ` +
          `repointed:true (R3-H03). repointed remains false.`,
      },
    });
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  const report: RollbackRepointReport = {
    ok: true,
    repointed: true,
    target,
    target_kind: 'convex',
    data_plane: 'convex',
    engaged_at,
    engaged_at_ms,
    configured_target: durablePath,
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
    // Report only authorizing pre-existing acks (never self-created theatre).
    acknowledgements: authorizingAcks,
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
      `  acknowledgements: ${r.acknowledgements.length}`,
      `  report:        ${r.report_path}`,
    ].join('\n');
  }
  return [
    'holo cutover:rollback-repoint — data plane → frozen Convex (serving control-plane)',
    `  ok:                 ${r.ok}`,
    `  repointed:          ${r.repointed}`,
    `  target:             ${r.target}`,
    `  data_plane:         ${r.data_plane}`,
    `  engaged_at:         ${r.engaged_at}`,
    `  configured_target:  ${r.configured_target}`,
    `  acknowledgements:   ${r.acknowledgements.length}`,
    `  config_audit:       ${r.config.path}`,
    `  digest:             ${r.config.digest_sha256}`,
    `  report:             ${r.report_path}`,
  ].join('\n');
}
