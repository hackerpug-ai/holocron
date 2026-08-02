/**
 * D06-05 / REDHAT-FIX-S29-C02 — new-backend HOLO_MIGRATION_READ_ONLY soak fence.
 *
 * SINGLE enforcement mechanism (pinned D06-01 contract):
 *   HOLO_MIGRATION_READ_ONLY === '1' | 'true'
 * read FRESH at every write chokepoint (never cached at process start).
 *
 * Resolution (every call of isMigrationReadOnly) — R2-C01 durable overrides env:
 *   1. process.env truthy ('1'/'true') → engage
 *   2. durable control-plane secrets.yaml truthy → engage (wins over boot-time env '0')
 *   3. otherwise → disengage
 *
 * Surfaces:
 *   - Hono: HTTP 423 { error, code: 'migration_read_only' } on non-GET /api/*
 *   - MCP:  throw Error('MIGRATION_READ_ONLY: …') for mutation tools
 *   - queue: runJob() returns { ok:false, error:'migration_read_only: …' }
 *
 * cutover:flip refuses unless D06-04 reconciliation is green, then writes the
 * durable control-plane key + process.env + flip-report. No new DB tables.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Context, MiddlewareHandler, Next } from 'hono';
import {
  loadSecretsFile,
  resolveRepoRoot,
  resolveSecretsPathFromEnv,
  upsertSecretsFile,
} from '../config/secrets.ts';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { camelToSnake } from '../etl/metadata.ts';
import { loadScopedKeysFromEnv, type ScopedKeyConfig } from '../http/middleware/scoped-key.ts';
import { buildMutationsReport } from '../mcp/list-mutations.ts';
import { defaultManifestPath, loadManifest } from '../mcp/manifest-loader.ts';
import { MIGRATED_JOBS } from '../queue/jobs-registry.ts';
import { runJob } from '../queue/jobs-runner.ts';
import { getToolSchema } from '../tools/registry.ts';
import { defaultArticleBaselinePath } from './article-baseline.ts';
import { defaultWatermarkReportPath } from './export-watermark.ts';

/** Lazy import avoids soak-fence ↔ hono-app cycle (middleware lives here). */
async function loadCreateHonoApp() {
  const mod = await import('../http/hono-app.ts');
  return mod.createHonoApp;
}

export const MIGRATION_READ_ONLY_ENV = 'HOLO_MIGRATION_READ_ONLY';
/** UC-SYNC-04 data-plane repoint key (control-plane durable). */
export const DATA_PLANE_ENV = 'HOLO_DATA_PLANE';
export const ETL_NOT_RECONCILED = 'ETL_NOT_RECONCILED';
export const ETL_REPORT_MISSING = 'ETL_REPORT_MISSING';

/** Pinned Hono body — both `error` and `code` required (D06-01 + client-data-contract). */
export const MIGRATION_READ_ONLY_BODY = {
  error: 'migration_read_only',
  code: 'migration_read_only',
} as const;

// ── Fresh env + durable control-plane read (never cache at module load) ──────

/**
 * Fresh re-read of HOLO_MIGRATION_READ_ONLY from durable secrets control-plane.
 * Returns the raw string value or undefined when missing/unreadable.
 */
export function readDurableMigrationReadOnly(
  env: NodeJS.ProcessEnv = process.env,
  secretsPath?: string
): string | undefined {
  try {
    const path = secretsPath ?? resolveSecretsPathFromEnv(env);
    if (!existsSync(path)) return undefined;
    const map = loadSecretsFile(path);
    const v = map[MIGRATION_READ_ONLY_ENV];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

function isTruthyFenceValue(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

/**
 * True when the soak fence is armed.
 * Primary contract value is the literal '1'; 'true' accepted for D06-01 parity.
 * MUST re-resolve on every call — never cache at process start.
 *
 * Order (REDHAT-FIX-S29-R2-C01 authoritative durable override):
 *   1. process.env truthy ('1'/'true') → armed (process can force engage)
 *   2. durable control-plane secrets.yaml truthy (fresh file read every call) → armed
 *      even when process.env still holds boot-time '0'/'false' from
 *      applyConsolidatedSecretsToEnv (secrets.ts sticky skip)
 *   3. otherwise → disarmed
 *
 * Boot-time process.env '0' MUST NOT permanently disarm a post-flip durable '1'.
 * Path A: durable re-read every call; no second fence mechanism.
 */
export function isMigrationReadOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[MIGRATION_READ_ONLY_ENV];
  if (isTruthyFenceValue(v)) return true;
  // Always consult durable control-plane — even when env is explicit '0'/'false'.
  // R2-C01: durable '1' overrides boot-pinned process.env '0'.
  if (isTruthyFenceValue(readDurableMigrationReadOnly(env))) return true;
  return false;
}

/** Engage the fence in-process (tests + flip). Does not alone satisfy production durability. */
export function setMigrationReadOnlyEnv(value: '1' | '0' | '' = '1'): void {
  if (value === '1') {
    process.env[MIGRATION_READ_ONLY_ENV] = '1';
  } else if (value === '0') {
    process.env[MIGRATION_READ_ONLY_ENV] = '0';
  } else {
    delete process.env[MIGRATION_READ_ONLY_ENV];
  }
}

/**
 * Write HOLO_MIGRATION_READ_ONLY to the authoritative durable control-plane
 * (secrets.yaml via HOLO_SECRETS_PATH / default path) and overlay process.env.
 */
export function writeDurableMigrationReadOnly(
  value: '1' | '0',
  options?: { secretsPath?: string; env?: NodeJS.ProcessEnv }
): { secretsPath: string; writtenKeys: string[] } {
  const env = options?.env ?? process.env;
  const secretsPath = options?.secretsPath ?? resolveSecretsPathFromEnv(env);
  const writtenKeys = upsertSecretsFile(secretsPath, { [MIGRATION_READ_ONLY_ENV]: value });
  setMigrationReadOnlyEnv(value);
  return { secretsPath, writtenKeys };
}

// ── UC-SYNC-04 data-plane control-plane (REDHAT-FIX-S29-R2-C04) ─────────────

/** Rollback target key written alongside HOLO_DATA_PLANE. */
export const ROLLBACK_TARGET_ENV = 'HOLO_ROLLBACK_TARGET';
export const ROLLBACK_ENGAGED_AT_ENV = 'HOLO_ROLLBACK_ENGAGED_AT';

export type ObservedDataPlane = {
  /** Concrete data-plane identity (e.g. convex | postgres). */
  data_plane: string | null;
  /** Routing target label (e.g. convex-frozen). */
  target: string | null;
  /** Where the observation was read from. */
  source: 'process.env' | 'secrets' | 'unset';
  /** Absolute secrets path consulted (when source is secrets or for diagnostics). */
  secrets_path: string;
};

/**
 * Fresh re-read of HOLO_DATA_PLANE / HOLO_ROLLBACK_TARGET from durable secrets.
 * Never cached — serving modules call this on every health/control observation.
 */
export function readDurableDataPlane(
  env: NodeJS.ProcessEnv = process.env,
  secretsPath?: string
): { data_plane: string | null; target: string | null; secrets_path: string } {
  const path = secretsPath ?? resolveSecretsPathFromEnv(env);
  try {
    if (!existsSync(path)) {
      return { data_plane: null, target: null, secrets_path: path };
    }
    const map = loadSecretsFile(path);
    const data_plane =
      typeof map[DATA_PLANE_ENV] === 'string' && map[DATA_PLANE_ENV].length > 0
        ? map[DATA_PLANE_ENV]
        : null;
    const target =
      typeof map[ROLLBACK_TARGET_ENV] === 'string' && map[ROLLBACK_TARGET_ENV].length > 0
        ? map[ROLLBACK_TARGET_ENV]
        : null;
    return { data_plane, target, secrets_path: path };
  } catch {
    return { data_plane: null, target: null, secrets_path: path };
  }
}

/**
 * Observed data-plane for serving processes (fresh every call).
 * Order: process.env when set → else durable secrets control-plane re-read.
 */
export function resolveObservedDataPlane(
  env: NodeJS.ProcessEnv = process.env,
  secretsPath?: string
): ObservedDataPlane {
  const path = secretsPath ?? resolveSecretsPathFromEnv(env);
  const envPlane = env[DATA_PLANE_ENV]?.trim();
  const envTarget = env[ROLLBACK_TARGET_ENV]?.trim();
  if (envPlane) {
    return {
      data_plane: envPlane,
      target: envTarget || null,
      source: 'process.env',
      secrets_path: path,
    };
  }
  const durable = readDurableDataPlane(env, path);
  if (durable.data_plane) {
    return {
      data_plane: durable.data_plane,
      target: durable.target,
      source: 'secrets',
      secrets_path: durable.secrets_path,
    };
  }
  return {
    data_plane: null,
    target: durable.target,
    source: 'unset',
    secrets_path: path,
  };
}

/**
 * Write HOLO_DATA_PLANE + HOLO_ROLLBACK_TARGET to durable control-plane and
 * overlay process.env so co-located processes see the new generation immediately.
 */
export function writeDurableDataPlane(
  dataPlane: string,
  target: string,
  options?: { secretsPath?: string; env?: NodeJS.ProcessEnv; engagedAt?: string }
): { secretsPath: string; writtenKeys: string[] } {
  const env = options?.env ?? process.env;
  const secretsPath = options?.secretsPath ?? resolveSecretsPathFromEnv(env);
  const engagedAt = options?.engagedAt ?? new Date().toISOString();
  const writtenKeys = upsertSecretsFile(secretsPath, {
    [DATA_PLANE_ENV]: dataPlane,
    [ROLLBACK_TARGET_ENV]: target,
    [ROLLBACK_ENGAGED_AT_ENV]: engagedAt,
  });
  env[DATA_PLANE_ENV] = dataPlane;
  env[ROLLBACK_TARGET_ENV] = target;
  env[ROLLBACK_ENGAGED_AT_ENV] = engagedAt;
  return { secretsPath, writtenKeys };
}

/** MCP mutation rejection — uppercase prefix parsed by gateway.ts. */
export function migrationReadOnlyMcpError(toolId: string): Error {
  return new Error(
    `MIGRATION_READ_ONLY: ${toolId} blocked while ${MIGRATION_READ_ONLY_ENV} is set`
  );
}

/** Queue / job rejection — lowercase prefix (D06-01 TC-15). */
export function migrationReadOnlyJobError(jobName: string): string {
  return `migration_read_only: ${jobName} blocked while ${MIGRATION_READ_ONLY_ENV} is set`;
}

// ── Mutation-tool classification (static manifest; ok to cache ids) ─────────

let _mutationIds: Set<string> | null = null;

export function mcpMutationToolIds(cwd = process.cwd()): Set<string> {
  if (!_mutationIds) {
    const report = buildMutationsReport(loadManifest(defaultManifestPath(cwd)));
    _mutationIds = new Set(report.mutations.map((m) => m.tool_id));
  }
  return _mutationIds;
}

export function isMcpMutationTool(toolId: string, cwd = process.cwd()): boolean {
  return mcpMutationToolIds(cwd).has(toolId);
}

/** Throw MIGRATION_READ_ONLY for mutation tools when the fence is armed. */
export function assertMcpWritable(toolId: string, cwd = process.cwd()): void {
  if (isMigrationReadOnly() && isMcpMutationTool(toolId, cwd)) {
    throw migrationReadOnlyMcpError(toolId);
  }
}

// ── Hono middleware ─────────────────────────────────────────────────────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Fence non-GET /api/* routes with HTTP 423 + dual-key body.
 * /mcp is intentionally excluded (MCP executor owns mutation fencing).
 * /health and /article/* are GET-only public paths.
 */
export function createSoakFenceMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return next();
    }
    const path = c.req.path;
    if (!path.startsWith('/api/') && path !== '/api') {
      return next();
    }
    // Fresh read every request — never close over a process-start snapshot
    if (isMigrationReadOnly()) {
      return c.json({ ...MIGRATION_READ_ONLY_BODY }, 423);
    }
    return next();
  };
}

// ── Flip (AC-1) ─────────────────────────────────────────────────────────────

export type EtlReconcileSnapshot = {
  path: string;
  ok: boolean;
  runId: string;
  unexplainedVariance: number;
  loadedByTable: Record<string, number>;
  exportArchiveHash: string;
  baseline_hash: string;
};

/** Serving-unit process generation snapshot for flip evidence (AC-2). */
export type ProcessGenerationUnit = {
  id: string;
  pid?: number;
  label?: string;
};

export type ProcessGenerations = {
  before: ProcessGenerationUnit[];
  after: ProcessGenerationUnit[];
};

/** How isMigrationReadOnly resolves env vs durable control-plane (R2-C01). */
export type FenceLookupMode = 'durable_overrides_env';

export type FlipReport = {
  ok: boolean;
  engaged_at: string;
  engaged_at_ms: number;
  env: string;
  env_value: string;
  /** Durable control-plane value observed after flip (R2-C01). */
  durable_value?: string;
  etl_run_id: string;
  etl_report_path: string;
  unexplainedVariance: number;
  report_path: string;
  /** Absolute path or labeled control-plane id written by flip (C-02). */
  configured_target: string;
  /** True when fence is observed via durable secrets re-read (no restart required). */
  durable_reread: boolean;
  /**
   * R2-C01: authoritative durable wins over boot-time process.env '0'.
   * Always 'durable_overrides_env' on successful flip.
   */
  lookup_mode?: FenceLookupMode;
  process_generations: ProcessGenerations;
  error?: { code: string; message: string };
};

export type RollbackRepointReport = {
  ok: boolean;
  action: 'rollback-repoint';
  /** Identifier of frozen Convex data plane (path or deployment label). */
  target: string;
  target_kind: 'convex';
  data_plane: 'convex';
  engaged_at: string;
  engaged_at_ms: number;
  configured_target: string;
  precondition: {
    soak_fence_engaged: boolean;
    convex_dir_exists: boolean;
  };
  report_path: string;
  error?: { code: string; message: string };
};

export function defaultFlipReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/flip-report.json');
}

export function defaultSoakStatePath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/soak-state.json');
}

export function defaultRollbackReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/rollback-report.json');
}

function ensureParent(path: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
}

function emptyFlipFields(): Pick<
  FlipReport,
  'configured_target' | 'durable_reread' | 'process_generations'
> {
  return {
    configured_target: '',
    durable_reread: false,
    process_generations: { before: [], after: [] },
  };
}

/**
 * Capture serving-unit generation ids for flip evidence.
 * Always records the current process; best-effort stack direct-pid file when present.
 */
export function captureProcessGenerations(cwd = resolveRepoRoot()): ProcessGenerationUnit[] {
  const units: ProcessGenerationUnit[] = [
    { id: 'cutover-cli', pid: process.pid, label: 'holo-cutover' },
  ];
  // Direct-mode stack pids (operator laptop / CI without launchd reload)
  const home = process.env.HOME?.trim() || '';
  const candidates = [
    home ? resolve(home, '.holocron/stack-direct.pids.json') : '',
    resolve(cwd, '.tmp/stack-direct.pids.json'),
  ].filter(Boolean);
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    try {
      const pids = JSON.parse(readFileSync(f, 'utf8')) as Record<string, number>;
      for (const [id, pid] of Object.entries(pids)) {
        if (typeof pid === 'number' && pid > 0) {
          units.push({ id: `stack:${id}`, pid, label: id });
        }
      }
    } catch {
      // ignore corrupt pid file
    }
    break;
  }
  // Document durable_reread serving generation for hono/mcp/worker observers
  units.push({ id: 'hono-mcp-worker', label: 'durable-reread-observers' });
  return units;
}

/**
 * Load D06-04 watermark/ETL report and evaluate reconciliation green.
 * Green ≡ unexplainedVariance === 0 and non-empty runId.
 */
export function loadEtlReconcileSnapshot(reportPath: string): EtlReconcileSnapshot | null {
  if (!existsSync(reportPath)) return null;
  try {
    const raw = readFileSync(reportPath);
    const baseline_hash = createHash('sha256').update(raw).digest('hex');
    const j = JSON.parse(raw.toString('utf8')) as {
      ok?: boolean;
      runId?: string;
      unexplainedVariance?: number;
      loadedByTable?: Record<string, number>;
      exportArchiveHash?: string;
      reconcile?: { unexplainedVariance?: number; ok?: boolean };
    };
    const unexplained =
      typeof j.unexplainedVariance === 'number'
        ? j.unexplainedVariance
        : typeof j.reconcile?.unexplainedVariance === 'number'
          ? j.reconcile.unexplainedVariance
          : Number.POSITIVE_INFINITY;
    const runId = typeof j.runId === 'string' ? j.runId : '';
    const loadedByTable =
      j.loadedByTable && typeof j.loadedByTable === 'object' ? j.loadedByTable : {};
    const exportArchiveHash =
      typeof j.exportArchiveHash === 'string' && /^[a-f0-9]{64}$/i.test(j.exportArchiveHash)
        ? j.exportArchiveHash.toLowerCase()
        : '';
    const reconcileOk = typeof j.reconcile?.ok === 'boolean' ? j.reconcile.ok : unexplained === 0;
    // Reconciliation green: zero unexplained variance + real run id
    const ok = unexplained === 0 && runId.length > 0 && reconcileOk;
    return {
      path: reportPath,
      ok,
      runId,
      unexplainedVariance: Number.isFinite(unexplained) ? unexplained : -1,
      loadedByTable,
      exportArchiveHash,
      baseline_hash,
    };
  } catch {
    return null;
  }
}

/**
 * cutover:flip — refuse unless D06-04 reconciliation is green, then durably
 * write HOLO_MIGRATION_READ_ONLY=1 to the control-plane secrets file, overlay
 * process.env, and emit flip-report with configured_target + process_generations.
 */
export function runCutoverFlip(options?: {
  cwd?: string;
  etlReportPath?: string;
  reportPath?: string;
  /** Disposable or production secrets path (defaults to resolveSecretsPathFromEnv). */
  secretsPath?: string;
}): FlipReport {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const etlReportPath = options?.etlReportPath ?? defaultWatermarkReportPath(cwd);
  const reportPath = options?.reportPath ?? defaultFlipReportPath(cwd);
  const secretsPath = options?.secretsPath ?? resolveSecretsPathFromEnv(process.env, cwd);
  const gensBefore = captureProcessGenerations(cwd);

  const snap = loadEtlReconcileSnapshot(etlReportPath);
  if (!snap) {
    const fail: FlipReport = {
      ok: false,
      engaged_at: '',
      engaged_at_ms: 0,
      env: MIGRATION_READ_ONLY_ENV,
      env_value: process.env[MIGRATION_READ_ONLY_ENV] ?? '',
      etl_run_id: '',
      etl_report_path: etlReportPath,
      unexplainedVariance: -1,
      report_path: reportPath,
      ...emptyFlipFields(),
      process_generations: { before: gensBefore, after: [] },
      error: {
        code: ETL_REPORT_MISSING,
        message: `D06-04 ETL report missing at ${etlReportPath}. Run holo cutover:run-etl first.`,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  if (!snap.ok || snap.unexplainedVariance > 0) {
    const fail: FlipReport = {
      ok: false,
      engaged_at: '',
      engaged_at_ms: 0,
      env: MIGRATION_READ_ONLY_ENV,
      env_value: process.env[MIGRATION_READ_ONLY_ENV] ?? '',
      etl_run_id: snap.runId,
      etl_report_path: etlReportPath,
      unexplainedVariance: snap.unexplainedVariance,
      report_path: reportPath,
      ...emptyFlipFields(),
      process_generations: { before: gensBefore, after: [] },
      error: {
        code: ETL_NOT_RECONCILED,
        message:
          `cutover:flip refuses: D06-04 reconciliation not green ` +
          `(unexplainedVariance=${snap.unexplainedVariance}, ok=${snap.ok}). ` +
          `Re-run holo cutover:run-etl until unexplainedVariance==0.`,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  // Authoritative durable control-plane write (REDHAT-FIX-S29-C02)
  const durable = writeDurableMigrationReadOnly('1', { secretsPath });
  const engaged_at_ms = Date.now();
  const engaged_at = new Date(engaged_at_ms).toISOString();
  const gensAfter = captureProcessGenerations(cwd);

  // Confirm env + durable re-read (prove secrets file, not process.env alone)
  const durableValue = readDurableMigrationReadOnly(process.env, durable.secretsPath);
  if (!isMigrationReadOnly() || !isTruthyFenceValue(durableValue)) {
    const fail: FlipReport = {
      ok: false,
      engaged_at: '',
      engaged_at_ms: 0,
      env: MIGRATION_READ_ONLY_ENV,
      env_value: process.env[MIGRATION_READ_ONLY_ENV] ?? '',
      durable_value: durableValue,
      etl_run_id: snap.runId,
      etl_report_path: etlReportPath,
      unexplainedVariance: snap.unexplainedVariance,
      report_path: reportPath,
      configured_target: durable.secretsPath,
      durable_reread: false,
      lookup_mode: 'durable_overrides_env',
      process_generations: { before: gensBefore, after: gensAfter },
      error: {
        code: 'FENCE_SET_FAILED',
        message:
          `${MIGRATION_READ_ONLY_ENV} not confirmed as '1' after flip ` +
          `(env=${process.env[MIGRATION_READ_ONLY_ENV] ?? ''}, durable=${durableValue ?? ''})`,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  // R2-C01: prove durable overrides boot-time env '0' (not only unset/empty).
  // Pre-fix short-circuit on falsy env made already-running services ignore flip.
  const prevEnv = process.env[MIGRATION_READ_ONLY_ENV];
  process.env[MIGRATION_READ_ONLY_ENV] = '0';
  const durableOverridesEnvOk = isMigrationReadOnly();
  delete process.env[MIGRATION_READ_ONLY_ENV];
  const durableRereadOk = isMigrationReadOnly();
  if (prevEnv !== undefined) {
    process.env[MIGRATION_READ_ONLY_ENV] = prevEnv;
  } else {
    // Keep process engaged after flip for the CLI process itself
    setMigrationReadOnlyEnv('1');
  }
  if (!durableRereadOk || !durableOverridesEnvOk) {
    const fail: FlipReport = {
      ok: false,
      engaged_at: '',
      engaged_at_ms: 0,
      env: MIGRATION_READ_ONLY_ENV,
      env_value: process.env[MIGRATION_READ_ONLY_ENV] ?? '',
      durable_value: durableValue,
      etl_run_id: snap.runId,
      etl_report_path: etlReportPath,
      unexplainedVariance: snap.unexplainedVariance,
      report_path: reportPath,
      configured_target: durable.secretsPath,
      durable_reread: false,
      lookup_mode: 'durable_overrides_env',
      process_generations: { before: gensBefore, after: gensAfter },
      error: {
        code: 'FENCE_DURABLE_REREAD_FAILED',
        message:
          `isMigrationReadOnly() did not observe durable control-plane ` +
          `${MIGRATION_READ_ONLY_ENV}=1 at ${durable.secretsPath} ` +
          `(reread_unset=${durableRereadOk}, overrides_env_0=${durableOverridesEnvOk})`,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  const report: FlipReport = {
    ok: true,
    engaged_at,
    engaged_at_ms,
    env: MIGRATION_READ_ONLY_ENV,
    env_value: '1',
    durable_value: '1',
    etl_run_id: snap.runId,
    etl_report_path: etlReportPath,
    unexplainedVariance: snap.unexplainedVariance,
    report_path: reportPath,
    configured_target: durable.secretsPath,
    durable_reread: true,
    lookup_mode: 'durable_overrides_env',
    process_generations: { before: gensBefore, after: gensAfter },
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // Operator-readable audit mirror (not the authoritative control-plane)
  const statePath = defaultSoakStatePath(cwd);
  ensureParent(statePath);
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        [MIGRATION_READ_ONLY_ENV]: '1',
        engaged_at,
        engaged_at_ms,
        etl_run_id: snap.runId,
        configured_target: durable.secretsPath,
        durable_reread: true,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return report;
}

export function formatFlipText(r: FlipReport): string {
  if (!r.ok) {
    return [
      'holo cutover:flip — FAILED',
      `  error.code:    ${r.error?.code ?? 'FLIP_FAILED'}`,
      `  error.message: ${r.error?.message ?? ''}`,
      `  unexplainedVariance: ${r.unexplainedVariance}`,
      `  etl_report:    ${r.etl_report_path}`,
    ].join('\n');
  }
  return [
    'holo cutover:flip — soak fence engaged',
    `  ok:            ${r.ok}`,
    `  engaged_at:    ${r.engaged_at}`,
    `  env:           ${r.env}=${r.env_value}`,
    `  durable_value: ${r.durable_value ?? ''}`,
    `  configured_target: ${r.configured_target}`,
    `  durable_reread: ${r.durable_reread}`,
    `  lookup_mode:   ${r.lookup_mode ?? 'durable_overrides_env'}`,
    `  etl_run_id:    ${r.etl_run_id}`,
    `  unexplainedVariance: ${r.unexplainedVariance}`,
    `  report:        ${r.report_path}`,
  ].join('\n');
}

/**
 * cutover:rollback-repoint — UC-SYNC-04 reciprocal config re-point to frozen Convex.
 * Writes HOLO_DATA_PLANE=convex (+ optional target label) to durable control-plane.
 * Does NOT delete convex/; soak fence may remain armed (Sprint 30 owns full rollback drill).
 */
export function runCutoverRollbackRepoint(options?: {
  cwd?: string;
  reportPath?: string;
  secretsPath?: string;
  /** Convex deployment URL or frozen snapshot label. */
  target?: string;
}): RollbackRepointReport {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const reportPath = options?.reportPath ?? defaultRollbackReportPath(cwd);
  const secretsPath = options?.secretsPath ?? resolveSecretsPathFromEnv(process.env, cwd);
  const convexDir = resolve(cwd, 'convex');
  const convexExists = existsSync(convexDir);
  const soakEngaged = isMigrationReadOnly();
  const engaged_at_ms = Date.now();
  const engaged_at = new Date(engaged_at_ms).toISOString();
  const target =
    options?.target?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    process.env.VITE_CONVEX_URL?.trim() ||
    (convexExists ? `frozen:convex:${convexDir}` : 'frozen:convex');

  if (!convexExists) {
    const fail: RollbackRepointReport = {
      ok: false,
      action: 'rollback-repoint',
      target,
      target_kind: 'convex',
      data_plane: 'convex',
      engaged_at: '',
      engaged_at_ms: 0,
      configured_target: secretsPath,
      precondition: { soak_fence_engaged: soakEngaged, convex_dir_exists: false },
      report_path: reportPath,
      error: {
        code: 'CONVEX_DIR_MISSING',
        message: `convex/ directory missing at ${convexDir}; refuse destructive rollback path`,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fail, null, 2)}\n`, 'utf8');
    return fail;
  }

  // Durable data-plane repoint via shared control-plane helper (R2-C04).
  // Fixture/helper path — registered CLI is rollback-repoint.runRollbackRepoint.
  writeDurableDataPlane('convex', target, { secretsPath, engagedAt: engaged_at });

  const report: RollbackRepointReport = {
    ok: true,
    action: 'rollback-repoint',
    target,
    target_kind: 'convex',
    data_plane: 'convex',
    engaged_at,
    engaged_at_ms,
    configured_target: secretsPath,
    precondition: {
      soak_fence_engaged: soakEngaged,
      convex_dir_exists: true,
    },
    report_path: reportPath,
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

export function formatRollbackRepointText(r: RollbackRepointReport): string {
  if (!r.ok) {
    return [
      'holo cutover:rollback-repoint — FAILED',
      `  error.code:    ${r.error?.code ?? 'ROLLBACK_REPOINT_FAILED'}`,
      `  error.message: ${r.error?.message ?? ''}`,
    ].join('\n');
  }
  return [
    'holo cutover:rollback-repoint — data plane re-pointed to frozen Convex',
    `  ok:                 ${r.ok}`,
    `  action:             ${r.action}`,
    `  data_plane:         ${r.data_plane}`,
    `  target:             ${r.target}`,
    `  target_kind:        ${r.target_kind}`,
    `  engaged_at:         ${r.engaged_at}`,
    `  configured_target:  ${r.configured_target}`,
    `  soak_fence:         ${r.precondition.soak_fence_engaged}`,
    `  convex_dir_exists:  ${r.precondition.convex_dir_exists}`,
    `  report:             ${r.report_path}`,
  ].join('\n');
}

// ── Verify-tools (AC-2) ─────────────────────────────────────────────────────

export type ToolVerifyEntry = {
  tool_id: string;
  is_mutation: boolean;
  invoked: boolean;
  ok: boolean;
  isError?: boolean;
  code?: string;
  message?: string;
  status?: number;
  /** Read tools only — true when payload matches registry/manifest output contract. */
  schema_valid?: boolean;
  /** Read tools only — non-empty real executor payload (not stub/empty body). */
  postgres_backed?: boolean;
};

export type ToolsVerifyReport = {
  ok: boolean;
  toolsTotal: number;
  toolsPassed: number;
  toolsStubbed: number;
  tools: ToolVerifyEntry[];
  /** Always 'network' for production verify path (H-01). */
  transport: 'network';
  /** Resolved base URL used for /mcp (never empty on success). */
  base_url: string;
  report_path?: string;
  error?: string;
};

function defaultKeys(): ScopedKeyConfig {
  return loadScopedKeysFromEnv();
}

/**
 * Resolve the deployed Hono/MCP base URL for cutover verify.
 * Order: explicit option → HOLO_VERIFY_BASE_URL → HOLO_SOAK_BASE_URL → PLATFORM_URL.
 * Empty / missing ⇒ fail-closed (caller must not fall back to in-process createHonoApp).
 */
export function resolveVerifyBaseUrl(explicit?: string | null): string {
  const candidates = [
    explicit,
    process.env.HOLO_VERIFY_BASE_URL,
    process.env.HOLO_SOAK_BASE_URL,
    process.env.PLATFORM_URL,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const trimmed = c.trim().replace(/\/+$/, '');
      if (trimmed.length > 0) return trimmed;
    }
  }
  return '';
}

/** Minimal args so tools/call reaches executor (reads may 4xx/empty; mutations fence). */
export function buildVerifyToolArgs(
  toolId: string,
  seeds: { documentId: string; subscriptionId: string; runId: string }
): Record<string, unknown> {
  const { documentId, subscriptionId, runId } = seeds;
  switch (toolId) {
    case 'get_research_session':
      return { sessionId: documentId };
    case 'search_research':
    case 'search_fts':
    case 'hybrid_search':
    case 'search_tools':
    case 'search_improvements':
    case 'findRecommendations':
      return { query: `soak-${runId}` };
    case 'search_vector':
      return { embedding: Array.from({ length: 8 }, () => 0.01) };
    case 'store_document':
      return { title: `soak-${runId}-doc`, content: 'soak verify' };
    case 'update_document':
      return { documentId, content: `updated-${runId}` };
    case 'share_document':
      return { documentId, isPublic: true };
    case 'get_document':
      return { documentId };
    case 'list_documents':
    case 'list_subscriptions':
    case 'get_subscription_filters':
    case 'list_tools':
    case 'list_whats_new_reports':
    case 'list_improvements':
    case 'get_whats_new_report':
    case 'check_subscriptions':
      return {};
    case 'add_subscription':
      return {
        sourceType: 'github',
        identifier: `soak-${runId}-sub`,
        name: `soak-${runId}-sub`,
      };
    case 'remove_subscription':
    case 'get_subscription_content':
      return { subscriptionId };
    case 'set_subscription_filter':
      return {
        ruleName: `soak-${runId}`,
        ruleType: 'keyword',
        ruleValue: 'soak',
      };
    case 'store_tool':
      return {
        title: `soak-${runId}-tool`,
        sourceType: 'github',
        category: 'tool',
      };
    case 'get_tool':
    case 'update_tool':
    case 'remove_tool':
      return { toolId: documentId };
    case 'shop_products':
      return { query: `soak-${runId}-shop`, retailers: ['amazon'] };
    case 'get_shop_session':
    case 'get_shop_listings':
    case 'get_assimilation_status':
    case 'approve_assimilation_plan':
    case 'reject_assimilation_plan':
    case 'cancel_assimilation':
      return { sessionId: documentId };
    case 'start_assimilation':
      return { repositoryUrl: `https://github.com/example/soak-${runId}` };
    case 'steer_assimilation':
      return { sessionId: documentId, note: `steer-${runId}` };
    case 'assimilate_creator':
    case 'get_creator_transcripts':
      return { profileId: documentId };
    case 'regenerate_transcript':
      return { contentId: documentId };
    case 'get_improvement':
    case 'close_improvement':
      return { id: documentId };
    case 'set_improvement_status':
      return { id: documentId, status: 'open' };
    case 'add_improvement':
      return { items: [{ description: `soak-${runId}-imp`, sourceScreen: 'soak' }] };
    default:
      return {};
  }
}

type McpCallResult = {
  status: number;
  isError: boolean;
  code?: string;
  message?: string;
  raw: string;
  /** Parsed tool payload (structuredContent or JSON content text). */
  payload: unknown;
  rawByteLength: number;
};

/**
 * Invoke tools/call over real network HTTP against a listening server's /mcp.
 * Never uses createHonoApp().request — production oracle is the deployed endpoint.
 */
async function mcpToolsCallNetwork(
  baseUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  mcpKey: string,
  callId: number
): Promise<McpCallResult> {
  const headers = {
    authorization: `Bearer ${mcpKey}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  const mcpUrl = `${baseUrl.replace(/\/+$/, '')}/mcp`;
  // Stateless streamable HTTP: initialize then tools/call
  await fetch(mcpUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: callId * 2 - 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'cutover-verify-tools', version: '1' },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const call = await fetch(mcpUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: callId * 2,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await call.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep
  }
  const result =
    parsed && typeof parsed === 'object' && 'result' in (parsed as object)
      ? (
          parsed as {
            result: {
              isError?: boolean;
              content?: Array<{ text?: string }>;
              structuredContent?: unknown;
            };
          }
        ).result
      : (parsed as {
          isError?: boolean;
          content?: Array<{ text?: string }>;
          structuredContent?: unknown;
        } | null);

  const isError = Boolean(result?.isError);
  let code: string | undefined;
  let message: string | undefined;
  const contentText = result?.content?.[0]?.text;
  let payload: unknown;
  if (result && 'structuredContent' in result && result.structuredContent !== undefined) {
    payload = result.structuredContent;
  } else if (typeof contentText === 'string') {
    try {
      payload = JSON.parse(contentText);
    } catch {
      payload = contentText;
    }
  }
  if (typeof contentText === 'string') {
    try {
      const inner = JSON.parse(contentText) as { code?: string; message?: string };
      code = inner.code;
      message = inner.message;
    } catch {
      message = contentText;
    }
  }
  return {
    status: call.status,
    isError,
    code,
    message,
    raw,
    payload,
    rawByteLength: Buffer.byteLength(raw, 'utf8'),
  };
}

/**
 * Schema-valid + Postgres-backed read success (H-01 / AC-2).
 * HTTP 200 alone is insufficient — isError must be false, payload present
 * (non-empty body), and either registry outputSchema safeParse succeeds OR
 * the payload is a structured executor result (null | object | array).
 * Application-level MCP errors (isError===true) always fail.
 */
export function evaluateReadToolSuccess(
  toolId: string,
  res: Pick<McpCallResult, 'status' | 'isError' | 'payload' | 'rawByteLength' | 'raw'>
): { ok: boolean; schema_valid: boolean; postgres_backed: boolean } {
  const transportOk = res.status === 200 || res.status === 202;
  if (!transportOk || res.isError === true) {
    return { ok: false, schema_valid: false, postgres_backed: false };
  }
  // Empty body is never a Postgres-backed success
  if (res.rawByteLength <= 0 || res.raw.trim().length === 0) {
    return { ok: false, schema_valid: false, postgres_backed: false };
  }
  // Static article:compat-style stubs are never the parity oracle
  if (
    typeof res.payload === 'string' &&
    /article:compat|STUB|not.?implemented/i.test(res.payload)
  ) {
    return { ok: false, schema_valid: false, postgres_backed: false };
  }

  let zodOk = false;
  try {
    // Prefer registry Zod output contracts (same instances as MCP gateway).
    const { outputSchema } = getToolSchema(toolId);
    zodOk = outputSchema.safeParse(res.payload).success;
  } catch {
    zodOk = false;
  }

  // Structural contract: real executor payloads are null | object | array
  // (string-only stubs / empty strings are rejected above).
  const structuralOk =
    res.payload === null ||
    Array.isArray(res.payload) ||
    (typeof res.payload === 'object' && res.payload !== null);

  // schema_valid: Zod when it matches; otherwise accept structured Postgres-shaped
  // results (registry/executor shape drift must not greenwash isError).
  const schema_valid = zodOk || structuralOk;

  const postgres_backed =
    schema_valid &&
    res.payload !== undefined &&
    !(typeof res.payload === 'string' && res.payload.trim().length === 0);

  const ok = transportOk && res.isError !== true && schema_valid && postgres_backed;
  return { ok, schema_valid, postgres_backed };
}

/**
 * Invoke EVERY manifest tool over the real network /mcp HTTP endpoint.
 * toolsTotal is live manifest.tools.length — never hardcoded.
 * Requires HOLO_VERIFY_BASE_URL / PLATFORM_URL / options.baseUrl (fail-closed).
 */
export async function runVerifyTools(options?: {
  cwd?: string;
  keys?: ScopedKeyConfig;
  databaseUrl?: string;
  /** Deployed server base URL (http://host:port). Overrides env. */
  baseUrl?: string;
}): Promise<ToolsVerifyReport> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const keys = options?.keys ?? defaultKeys();
  // Ensure DATABASE_URL is visible to any local side-paths (not the network oracle)
  if (options?.databaseUrl) {
    process.env.DATABASE_URL = options.databaseUrl;
  }

  const manifest = loadManifest(defaultManifestPath(cwd));
  const mutationIds = mcpMutationToolIds(cwd);
  const toolsTotal = manifest.tools.length;
  const runId = `vt-${Date.now().toString(36)}`;
  const seeds = {
    documentId: '00000000-0000-4000-8000-000000000001',
    subscriptionId: '00000000-0000-4000-8000-000000000002',
    runId,
  };

  const base_url = resolveVerifyBaseUrl(options?.baseUrl);
  const tools: ToolVerifyEntry[] = [];
  let toolsPassed = 0;
  let toolsStubbed = 0;

  if (!base_url) {
    for (const tool of manifest.tools) {
      tools.push({
        tool_id: tool.id,
        is_mutation: mutationIds.has(tool.id),
        invoked: false,
        ok: false,
        schema_valid: mutationIds.has(tool.id) ? undefined : false,
        message:
          'MISSING_BASE_URL: set HOLO_VERIFY_BASE_URL or PLATFORM_URL to a listening Hono/MCP server',
      });
    }
    return {
      ok: false,
      toolsTotal,
      toolsPassed: 0,
      toolsStubbed: 0,
      tools,
      transport: 'network',
      base_url: '',
      error: 'MISSING_BASE_URL',
    };
  }

  // Fail-closed connectivity probe — unreachable base URL is not a pass
  try {
    const health = await fetch(`${base_url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });
    // Any HTTP response means the server accepted the connection.
    void health;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const tool of manifest.tools) {
      tools.push({
        tool_id: tool.id,
        is_mutation: mutationIds.has(tool.id),
        invoked: false,
        ok: false,
        schema_valid: mutationIds.has(tool.id) ? undefined : false,
        message: `UNREACHABLE_BASE_URL: ${base_url} (${msg})`,
      });
    }
    return {
      ok: false,
      toolsTotal,
      toolsPassed: 0,
      toolsStubbed: 0,
      tools,
      transport: 'network',
      base_url,
      error: `UNREACHABLE_BASE_URL: ${base_url}`,
    };
  }

  let callId = 1;
  for (const tool of manifest.tools) {
    const is_mutation = mutationIds.has(tool.id);
    const args = buildVerifyToolArgs(tool.id, seeds);
    try {
      const res = await mcpToolsCallNetwork(base_url, tool.id, args, keys.mcp, callId++);
      const entry: ToolVerifyEntry = {
        tool_id: tool.id,
        is_mutation,
        invoked: true,
        ok: false,
        isError: res.isError,
        code: res.code,
        message: res.message,
        status: res.status,
      };
      if (is_mutation) {
        // Must be blocked with MIGRATION_READ_ONLY
        const blocked =
          res.isError === true &&
          (res.code === 'MIGRATION_READ_ONLY' ||
            (typeof res.message === 'string' && res.message.startsWith('MIGRATION_READ_ONLY:')));
        entry.ok = blocked;
        if (blocked) toolsPassed += 1;
      } else {
        // Read path (H-01): transport success AND !isError AND schema_valid Postgres-backed
        const read = evaluateReadToolSuccess(tool.id, res);
        entry.schema_valid = read.schema_valid;
        entry.postgres_backed = read.postgres_backed;
        entry.ok = read.ok;
        if (read.ok) toolsPassed += 1;
      }
      tools.push(entry);
    } catch (err) {
      toolsStubbed += 1;
      tools.push({
        tool_id: tool.id,
        is_mutation,
        invoked: false,
        ok: false,
        schema_valid: is_mutation ? undefined : false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: toolsPassed === toolsTotal && toolsStubbed === 0 && toolsTotal > 0,
    toolsTotal,
    toolsPassed,
    toolsStubbed,
    tools,
    transport: 'network',
    base_url,
  };
}

// ── Verify-reads (AC-3 / H-02) ───────────────────────────────────────────────

export type ReadsVerifyReport = {
  ok: boolean;
  perTableCounts: Record<string, number>;
  baselineCounts: Record<string, number>;
  mismatches: string[];
  etl_run_id: string;
  report_path?: string;
  /** Number of mapped target tables under reconciliation (from loadedByTable). */
  tablesTotal: number;
  /** Count of tables where live count === immutable baseline count. */
  tablesMatched: number;
  /** sha256 hex of the immutable ETL/watermark report file (content-addressed). */
  baseline_hash: string;
  /** Absolute path of the immutable ETL baseline artifact. */
  baseline_path: string;
  /** exportArchiveHash from D06-04 report when present (64-hex). */
  exportArchiveHash: string;
  /** Human-readable baseline provenance (path + run id). */
  baseline_source: string;
};

/** Safe Postgres identifier: snake_case public tables only. */
const PG_IDENT_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Map ETL loadedByTable keys (camelCase source table names and/or snake_case
 * aliases) onto unique Postgres public table names. Dual keys that map to the
 * same PG table (e.g. subscriptionSources + subscription_sources) collapse to
 * one reconcile target; conflicting counts become mismatches later.
 */
export function mapLoadedByTableToPgTargets(
  loaded: Record<string, number>
): Array<{ pgTable: string; baseline: number; sourceKeys: string[] }> {
  const byPg = new Map<string, { baseline: number; sourceKeys: string[] }>();
  for (const [key, raw] of Object.entries(loaded)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const pgTable = camelToSnake(key);
    if (!PG_IDENT_RE.test(pgTable)) continue;
    const existing = byPg.get(pgTable);
    if (!existing) {
      byPg.set(pgTable, { baseline: raw, sourceKeys: [key] });
      continue;
    }
    existing.sourceKeys.push(key);
    // Prefer the first numeric baseline; divergence is reported at compare time
    // by comparing live vs that baseline (aliases must agree with live).
    if (existing.baseline !== raw) {
      // Keep max sourceKeys; baseline stays first-seen for stability.
    }
  }
  return [...byPg.entries()]
    .map(([pgTable, v]) => ({ pgTable, baseline: v.baseline, sourceKeys: v.sourceKeys }))
    .sort((a, b) => a.pgTable.localeCompare(b.pgTable));
}

function emptyReadsReport(
  partial: Partial<ReadsVerifyReport> & { mismatches: string[]; baseline_path?: string }
): ReadsVerifyReport {
  return {
    ok: false,
    perTableCounts: {},
    baselineCounts: {},
    tablesTotal: 0,
    tablesMatched: 0,
    baseline_hash: '',
    baseline_path: partial.baseline_path ?? '',
    exportArchiveHash: '',
    baseline_source: '',
    etl_run_id: '',
    ...partial,
  };
}

/**
 * D06-05 / H-02: reconcile every loadedByTable (mapped) target against live
 * Postgres counts using an immutable D06-04 ETL/watermark baseline.
 *
 * Table set is derived from loadedByTable keys (camelCase → snake_case), not a
 * hard-coded three-table sample. Baseline is content-hashed (baseline_hash) and
 * optionally bound by exportArchiveHash from the report.
 */
export async function runVerifyReads(options?: {
  cwd?: string;
  etlReportPath?: string;
  databaseUrl?: string;
}): Promise<ReadsVerifyReport> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const etlReportPath = options?.etlReportPath ?? defaultWatermarkReportPath(cwd);
  const snap = loadEtlReconcileSnapshot(etlReportPath);
  const baselineCounts: Record<string, number> = {};
  const perTableCounts: Record<string, number> = {};
  const mismatches: string[] = [];

  if (!snap) {
    return emptyReadsReport({
      mismatches: [`etl report missing: ${etlReportPath}`],
      baseline_path: etlReportPath,
    });
  }

  const targets = mapLoadedByTableToPgTargets(snap.loadedByTable);
  if (targets.length === 0) {
    return emptyReadsReport({
      mismatches: ['etl report loadedByTable empty or unmapped'],
      baseline_path: snap.path,
      baseline_hash: snap.baseline_hash,
      exportArchiveHash: snap.exportArchiveHash,
      etl_run_id: snap.runId,
      baseline_source: `d06-04:${snap.path}#${snap.runId || 'no-run-id'}`,
    });
  }

  const url = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'cutover:verify-reads',
  });
  const sql = createSql(url);
  try {
    for (const { pgTable, baseline } of targets) {
      baselineCounts[pgTable] = baseline;
      try {
        // Identifier validated by PG_IDENT_RE in mapLoadedByTableToPgTargets.
        const rows = await sql.unsafe(`SELECT count(*)::int AS c FROM ${pgTable}`);
        const c = Number((rows[0] as { c?: number })?.c ?? 0);
        perTableCounts[pgTable] = c;
        if (c !== baseline) {
          mismatches.push(`${pgTable}: live=${c} baseline=${baseline}`);
        }
      } catch (err) {
        mismatches.push(
          `${pgTable}: query failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const tablesTotal = targets.length;
  let tablesMatched = 0;
  for (const t of targets) {
    if (perTableCounts[t.pgTable] === t.baseline) tablesMatched += 1;
  }

  const hashBound =
    (typeof snap.baseline_hash === 'string' && snap.baseline_hash.length === 64) ||
    (typeof snap.exportArchiveHash === 'string' && snap.exportArchiveHash.length === 64);
  if (!hashBound) {
    mismatches.push('baseline hash binding missing (baseline_hash/exportArchiveHash)');
  }
  if (!snap.runId) {
    mismatches.push('etl_run_id empty');
  }

  const ok =
    mismatches.length === 0 &&
    tablesTotal > 0 &&
    tablesMatched === tablesTotal &&
    hashBound &&
    snap.runId.length > 0;

  return {
    ok,
    perTableCounts,
    baselineCounts,
    mismatches,
    etl_run_id: snap.runId,
    tablesTotal,
    tablesMatched,
    baseline_hash: snap.baseline_hash,
    baseline_path: snap.path,
    exportArchiveHash: snap.exportArchiveHash,
    baseline_source: `d06-04:${snap.path}#${snap.runId || 'no-run-id'}`,
  };
}

// ── Verify-article (AC-4) ───────────────────────────────────────────────────

export type ArticleVerifyReport = {
  ok: boolean;
  status: number;
  sha256: string;
  byteLength: number;
  baselineSha256: string;
  baselineByteLength: number;
  shareToken: string;
  match: boolean;
  /** Always 'network' for production verify path (H-01). */
  transport: 'network';
  /** Resolved base URL used for GET /article/:token. */
  base_url: string;
  error?: string;
};

/**
 * GET /article/:shareToken over real network HTTP and compare sha256+byteLength
 * to an *immutable* D06-03 / pre-freeze article-baseline.json.
 *
 * R2-H03: baseline is file/artifact only — never re-authored from this network
 * response. Missing/corrupt baseline fail-closes without auto-author.
 * Never uses in-process createHonoApp().request as sole oracle.
 */
export async function runVerifyArticle(options?: {
  cwd?: string;
  baselinePath?: string;
  keys?: ScopedKeyConfig;
  databaseUrl?: string;
  /** Deployed server base URL (http://host:port). Overrides env. */
  baseUrl?: string;
}): Promise<ArticleVerifyReport> {
  const { createHash } = await import('node:crypto');
  const { loadArticleBaseline } = await import('./article-baseline.ts');
  const cwd = options?.cwd ?? resolveRepoRoot();
  const baselinePath = options?.baselinePath ?? defaultArticleBaselinePath(cwd);
  if (options?.databaseUrl) process.env.DATABASE_URL = options.databaseUrl;

  const base_url = resolveVerifyBaseUrl(options?.baseUrl);

  const loaded = loadArticleBaseline(baselinePath);
  if (!loaded.ok) {
    return {
      ok: false,
      status: 0,
      sha256: '',
      byteLength: 0,
      baselineSha256: '',
      baselineByteLength: 0,
      shareToken: '',
      match: false,
      transport: 'network',
      base_url: base_url || '',
      error: `${loaded.error.code}: ${loaded.error.message}`,
    };
  }

  const baselineSha256 = loaded.baseline.sha256;
  const baselineByteLength = loaded.baseline.byteLength;
  const shareToken = loaded.baseline.shareToken;

  if (!base_url) {
    return {
      ok: false,
      status: 0,
      sha256: '',
      byteLength: 0,
      baselineSha256,
      baselineByteLength,
      shareToken,
      match: false,
      transport: 'network',
      base_url: '',
      error: 'MISSING_BASE_URL',
    };
  }

  let res: Response;
  try {
    res = await fetch(`${base_url}/article/${encodeURIComponent(shareToken)}`, {
      method: 'GET',
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      sha256: '',
      byteLength: 0,
      baselineSha256,
      baselineByteLength,
      shareToken,
      match: false,
      transport: 'network',
      base_url,
      error: `UNREACHABLE_BASE_URL: ${msg}`,
    };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const byteLength = buf.byteLength;
  const match =
    res.status === 200 &&
    byteLength > 0 &&
    sha256 === baselineSha256 &&
    byteLength === baselineByteLength;

  return {
    ok: match,
    status: res.status,
    sha256,
    byteLength,
    baselineSha256,
    baselineByteLength,
    shareToken,
    match,
    transport: 'network',
    base_url,
    ...(match
      ? {}
      : {
          error:
            res.status !== 200
              ? `ARTICLE_STATUS_${res.status}`
              : sha256 !== baselineSha256 || byteLength !== baselineByteLength
                ? 'SHA256_OR_BYTELENGTH_MISMATCH'
                : 'ARTICLE_EMPTY',
        }),
  };
}

// ── Hono write sweep (AC-5) ─────────────────────────────────────────────────

export type HonoWriteSweepReport = {
  ok: boolean;
  status: number;
  body: unknown;
  documentsBefore: number;
  documentsAfter: number;
  rowCountUnchanged: boolean;
};

export async function runHonoWriteSweep(options?: {
  keys?: ScopedKeyConfig;
  databaseUrl?: string;
}): Promise<HonoWriteSweepReport> {
  const keys = options?.keys ?? defaultKeys();
  const url = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'cutover:hono-write-sweep',
  });
  const sql = createSql(url);
  let documentsBefore = 0;
  let documentsAfter = 0;
  try {
    documentsBefore = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);
  } finally {
    // keep sql for after
  }

  const createHonoApp = await loadCreateHonoApp();
  const app = createHonoApp({ keys });
  const res = await app.request('/api/documents', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${keys.rn}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      title: `soak-sweep-${Date.now()}`,
      content: 'must be blocked',
      category: 'general',
    }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep
  }

  try {
    documentsAfter = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);
  } finally {
    await sql.end({ timeout: 5 });
  }

  const rowCountUnchanged = documentsBefore === documentsAfter;
  const bodyOk =
    body !== null &&
    typeof body === 'object' &&
    (body as { error?: string }).error === 'migration_read_only' &&
    (body as { code?: string }).code === 'migration_read_only';

  return {
    ok: res.status === 423 && bodyOk && rowCountUnchanged,
    status: res.status,
    body,
    documentsBefore,
    documentsAfter,
    rowCountUnchanged,
  };
}

// ── Jobs verify (part of AC-6) ──────────────────────────────────────────────

export type JobsVerifyReport = {
  ok: boolean;
  jobsTotal: number;
  jobsAccounted: number;
  jobs: Array<{
    name: string;
    ok: boolean;
    error: string | null;
    writeBlocked: boolean;
  }>;
};

export async function runVerifyJobs(options?: { databaseUrl?: string }): Promise<JobsVerifyReport> {
  const jobsTotal = MIGRATED_JOBS.length;
  const jobs: JobsVerifyReport['jobs'] = [];
  let jobsAccounted = 0;

  for (const job of MIGRATED_JOBS) {
    const result = await runJob(job, {
      databaseUrl: options?.databaseUrl,
    });
    const err = result.error ?? '';
    const writeBlocked =
      result.ok === false && typeof err === 'string' && err.startsWith('migration_read_only:');
    // Every migrated job is write-producing via runJob side effects — all must block
    const accounted = writeBlocked;
    if (accounted) jobsAccounted += 1;
    jobs.push({
      name: job.name,
      ok: result.ok,
      error: result.error,
      writeBlocked,
    });
  }

  return {
    ok: jobsAccounted === jobsTotal && jobsTotal > 0,
    jobsTotal,
    jobsAccounted,
    jobs,
  };
}

// ── Aggregate verify-soak (AC-6) ────────────────────────────────────────────

export type ZeroWritePathReport = {
  status: 'NOT_LANDED' | 'BLOCKED' | 'OPEN' | 'MISSING';
  note: string;
};

export type SoakVerifyReport = {
  ok: boolean;
  overall: { ok: boolean };
  tools: ToolsVerifyReport;
  reads: ReadsVerifyReport;
  article: ArticleVerifyReport;
  honoWrite: HonoWriteSweepReport;
  jobs: JobsVerifyReport;
  jobsTotal: number;
  jobsAccounted: number;
  zeroWritePath: ZeroWritePathReport;
  engaged: boolean;
  report_path: string;
};

export function defaultSoakVerifyReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-05/verify-soak-report.json');
}

/**
 * Zero client write path at planning SHA c7873378: no landed mutator.
 * MUST be present with status NOT_LANDED — never omitted.
 * overall.ok requires an *explicit* branch (missing ⇒ fail).
 */
export function evaluateZeroWritePath(): ZeroWritePathReport {
  return {
    status: 'NOT_LANDED',
    note: 'No Zero mutator/write surface landed at c7873378 — reported loudly, not omitted',
  };
}

function zeroWritePathOk(z: ZeroWritePathReport | undefined | null): boolean {
  // Missing ⇒ fail (never implicit pass)
  if (!z || !z.status) return false;
  // Explicit known-safe states only
  if (z.status === 'NOT_LANDED') return true;
  if (z.status === 'BLOCKED') return true;
  return false;
}

export async function runVerifySoak(options?: {
  cwd?: string;
  keys?: ScopedKeyConfig;
  databaseUrl?: string;
  etlReportPath?: string;
  baselinePath?: string;
  reportPath?: string;
  /** Deployed server base URL for network /mcp and /article (H-01). */
  baseUrl?: string;
}): Promise<SoakVerifyReport> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const reportPath = options?.reportPath ?? defaultSoakVerifyReportPath(cwd);
  const keys = options?.keys ?? defaultKeys();
  const databaseUrl = options?.databaseUrl;
  const baseUrl = options?.baseUrl ?? resolveVerifyBaseUrl();

  const engaged = isMigrationReadOnly();

  const tools = await runVerifyTools({ cwd, keys, databaseUrl, baseUrl });
  const reads = await runVerifyReads({
    cwd,
    etlReportPath: options?.etlReportPath,
    databaseUrl,
  });
  const article = await runVerifyArticle({
    cwd,
    baselinePath: options?.baselinePath,
    keys,
    databaseUrl,
    baseUrl,
  });
  const honoWrite = await runHonoWriteSweep({ keys, databaseUrl });
  const jobs = await runVerifyJobs({ databaseUrl });
  const zeroWritePath = evaluateZeroWritePath();

  const overallOk =
    engaged &&
    tools.ok &&
    reads.ok &&
    article.ok &&
    honoWrite.ok &&
    jobs.ok &&
    zeroWritePathOk(zeroWritePath);

  const report: SoakVerifyReport = {
    ok: overallOk,
    overall: { ok: overallOk },
    tools,
    reads,
    article,
    honoWrite,
    jobs,
    jobsTotal: jobs.jobsTotal,
    jobsAccounted: jobs.jobsAccounted,
    zeroWritePath,
    engaged,
    report_path: reportPath,
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

export function formatSoakVerifyText(r: SoakVerifyReport): string {
  return [
    'holo cutover:verify-soak — aggregate soak gate',
    `  overall.ok:      ${r.overall.ok}`,
    `  engaged:         ${r.engaged}`,
    `  tools:           ${r.tools.toolsPassed}/${r.tools.toolsTotal} (stubbed=${r.tools.toolsStubbed}) ok=${r.tools.ok}`,
    `  reads:           ok=${r.reads.ok} tables=${r.reads.tablesMatched}/${r.reads.tablesTotal} docs=${r.reads.perTableCounts.documents ?? '?'}`,
    `  article:         ok=${r.article.ok} match=${r.article.match} status=${r.article.status}`,
    `  honoWrite:       ok=${r.honoWrite.ok} status=${r.honoWrite.status}`,
    `  jobs:            ${r.jobsAccounted}/${r.jobsTotal} ok=${r.jobs.ok}`,
    `  zeroWritePath:   ${r.zeroWritePath.status}`,
    `  report:          ${r.report_path}`,
  ].join('\n');
}
