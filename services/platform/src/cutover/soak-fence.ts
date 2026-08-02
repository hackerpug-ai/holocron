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
import { isAbsolute, resolve } from 'node:path';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { defaultCatalogPath, loadCatalog } from '../catalog/catalog-loader.ts';
import {
  loadSecretsFile,
  resolveRepoRoot,
  resolveSecretsPathFromEnv,
  upsertSecretsFile,
} from '../config/secrets.ts';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { readImmutableExport } from '../etl/archive.ts';
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

/** Mission / document-publish rejection — lowercase prefix (REDHAT-FIX-S29-R3-H02). */
export function migrationReadOnlyMissionError(surface: string): string {
  return `migration_read_only: mission ${surface} blocked while ${MIGRATION_READ_ONLY_ENV} is set`;
}

/**
 * Fail-closed write chokepoint helper. Throws Error with `migration_read_only:`
 * prefix when the durable/env fence is armed. Re-resolve every call (never cache).
 */
export function assertMigrationWritable(surface: string): void {
  if (isMigrationReadOnly()) {
    throw new Error(
      surface.startsWith('mission ')
        ? migrationReadOnlyMissionError(surface.slice('mission '.length))
        : `migration_read_only: ${surface} blocked while ${MIGRATION_READ_ONLY_ENV} is set`
    );
  }
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
  /**
   * SHA-256 of the watermark/ETL report file bytes.
   * Mutable and caller-rewritable — never sole provenance for verify-reads (R2-C03).
   */
  report_sha256: string;
  /**
   * @deprecated Prefer report_sha256. Kept for flip/ETL consumers that still
   * read baseline_hash as "content hash of the report file".
   */
  baseline_hash: string;
  /** Optional content-address of bound cutover-parity inventory (64-hex). */
  parityHash: string;
  /** Optional relative/absolute export dir declared on the report. */
  exportRelPath: string;
  /** Optional relative/absolute cutover-parity path declared on the report. */
  parityRelPath: string;
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
 *
 * Note (R2-C03): report_sha256 / baseline_hash is a self-hash of this mutable
 * file and is NOT sufficient provenance for cutover:verify-reads. verify-reads
 * binds to an on-disk content-addressed export archive + cutover-parity inventory.
 */
export function loadEtlReconcileSnapshot(reportPath: string): EtlReconcileSnapshot | null {
  if (!existsSync(reportPath)) return null;
  try {
    const raw = readFileSync(reportPath);
    const report_sha256 = createHash('sha256').update(raw).digest('hex');
    const j = JSON.parse(raw.toString('utf8')) as {
      ok?: boolean;
      runId?: string;
      unexplainedVariance?: number;
      loadedByTable?: Record<string, number>;
      exportArchiveHash?: string;
      parityHash?: string;
      exportRelPath?: string;
      parityRelPath?: string;
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
    const parityHash =
      typeof j.parityHash === 'string' && /^[a-f0-9]{64}$/i.test(j.parityHash)
        ? j.parityHash.toLowerCase()
        : '';
    const exportRelPath = typeof j.exportRelPath === 'string' ? j.exportRelPath : '';
    const parityRelPath = typeof j.parityRelPath === 'string' ? j.parityRelPath : '';
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
      report_sha256,
      baseline_hash: report_sha256,
      parityHash,
      exportRelPath,
      parityRelPath,
    };
  } catch {
    return null;
  }
}

/** Default cutover-parity inventory path (sibling of D06-04 watermark). */
export function defaultCutoverParityPath(cwd = resolveRepoRoot()): string {
  return resolve(cwd, '.tmp/D06-04/cutover-parity.json');
}

/** Default export dir for verify-reads archive binding. */
export function defaultVerifyExportDir(cwd = resolveRepoRoot()): string {
  const envDir = process.env.CONVEX_EXPORT_DIR?.trim();
  if (envDir) return resolve(envDir);
  return resolve(cwd, '.tmp/D06-04/export');
}

/** Committed sprint-29 cutover-parity fixture (content-addressed inventory). */
export function defaultFixtureCutoverParityPath(cwd = resolveRepoRoot()): string {
  return resolve(
    cwd,
    'services/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json'
  );
}

function resolveMaybeRel(pathOrRel: string, cwd: string): string {
  if (!pathOrRel) return '';
  return isAbsolute(pathOrRel) ? pathOrRel : resolve(cwd, pathOrRel);
}

export type CutoverParityInventory = {
  path: string;
  parityHash: string;
  boundExportArchiveHash: string;
  exportRelPath: string;
  catalogRelPath: string;
  loadedByTable: Record<string, number>;
  catalog_table_count_expected: number;
};

/**
 * Load immutable cutover-parity inventory (expected table set + counts).
 * Content-addressed: parityHash = sha256(file bytes). Fail closed on empty set.
 */
export function loadCutoverParityInventory(parityPath: string): CutoverParityInventory | null {
  if (!existsSync(parityPath)) return null;
  try {
    const raw = readFileSync(parityPath);
    const parityHash = createHash('sha256').update(raw).digest('hex');
    const j = JSON.parse(raw.toString('utf8')) as {
      boundExportArchiveHash?: string;
      exportRelPath?: string;
      catalogRelPath?: string;
      loadedByTable?: Record<string, number>;
      catalog_table_count_expected?: number;
    };
    const boundExportArchiveHash =
      typeof j.boundExportArchiveHash === 'string' &&
      /^[a-f0-9]{64}$/i.test(j.boundExportArchiveHash)
        ? j.boundExportArchiveHash.toLowerCase()
        : '';
    const loadedByTable =
      j.loadedByTable && typeof j.loadedByTable === 'object' ? j.loadedByTable : {};
    if (Object.keys(loadedByTable).length === 0 || !boundExportArchiveHash) return null;
    return {
      path: parityPath,
      parityHash,
      boundExportArchiveHash,
      exportRelPath: typeof j.exportRelPath === 'string' ? j.exportRelPath : '',
      catalogRelPath: typeof j.catalogRelPath === 'string' ? j.catalogRelPath : '',
      loadedByTable,
      catalog_table_count_expected:
        typeof j.catalog_table_count_expected === 'number' ? j.catalog_table_count_expected : 0,
    };
  } catch {
    return null;
  }
}

export type BoundExportCatalogBaseline = {
  ok: boolean;
  mismatches: string[];
  exportDir: string;
  catalogPath: string;
  parityPath: string;
  exportArchiveHash: string;
  parityHash: string;
  /** Expected source-table counts (camelCase keys) from immutable parity inventory. */
  expectedLoadedByTable: Record<string, number>;
  catalog_table_count: number;
  listedTables: string[];
  /** Immutable baseline digest: export archive content address (not report self-hash). */
  baseline_hash: string;
  baseline_source: string;
};

/**
 * R2-C03: bind verify-reads to on-disk content-addressed export + catalog + parity.
 * Rejects missing archive/catalog/parity, hash mismatch, and empty expected sets.
 */
export function loadBoundExportCatalogBaseline(options: {
  cwd?: string;
  exportDir?: string;
  catalogPath?: string;
  parityPath?: string;
  /** Declared exportArchiveHash from watermark (must match on-disk archive). */
  declaredExportArchiveHash?: string;
  /** Declared parityHash from watermark (must match on-disk parity when present). */
  declaredParityHash?: string;
  /** Optional paths declared on the watermark for resolution. */
  exportRelPath?: string;
  parityRelPath?: string;
}): BoundExportCatalogBaseline {
  const cwd = options.cwd ?? resolveRepoRoot();
  const mismatches: string[] = [];

  const parityPath = (() => {
    if (options.parityPath) return options.parityPath;
    if (options.parityRelPath) return resolveMaybeRel(options.parityRelPath, cwd);
    return defaultCutoverParityPath(cwd);
  })();
  let parity = loadCutoverParityInventory(parityPath);
  // Fall back to committed fixture when operator D06-04 parity is absent.
  if (!parity && existsSync(defaultFixtureCutoverParityPath(cwd))) {
    const fixtureParity = defaultFixtureCutoverParityPath(cwd);
    parity = loadCutoverParityInventory(fixtureParity);
  }
  if (!parity) {
    return {
      ok: false,
      mismatches: [
        `cutover-parity inventory missing or invalid (looked at ${parityPath}); refuse verify-reads without immutable catalog bind`,
      ],
      exportDir: '',
      catalogPath: '',
      parityPath,
      exportArchiveHash: '',
      parityHash: '',
      expectedLoadedByTable: {},
      catalog_table_count: 0,
      listedTables: [],
      baseline_hash: '',
      baseline_source: '',
    };
  }

  const exportDir = (() => {
    if (options.exportDir) return options.exportDir;
    if (options.exportRelPath) return resolveMaybeRel(options.exportRelPath, cwd);
    if (parity.exportRelPath) return resolveMaybeRel(parity.exportRelPath, cwd);
    return defaultVerifyExportDir(cwd);
  })();
  const catalogPath = (() => {
    if (options.catalogPath) return options.catalogPath;
    if (parity.catalogRelPath) return resolveMaybeRel(parity.catalogRelPath, cwd);
    return defaultCatalogPath(cwd);
  })();

  if (options.declaredParityHash && options.declaredParityHash !== parity.parityHash) {
    mismatches.push(
      `parity hash/provenance mismatch: report parityHash=${options.declaredParityHash} on-disk=${parity.parityHash}`
    );
  }

  if (!existsSync(exportDir)) {
    mismatches.push(`export archive directory missing: ${exportDir}`);
  }
  if (!existsSync(catalogPath)) {
    mismatches.push(`source catalog missing: ${catalogPath}`);
  }

  let exportArchiveHash = '';
  let listedTables: string[] = [];
  if (mismatches.length === 0) {
    try {
      const catalog = loadCatalog(catalogPath);
      const archive = readImmutableExport(exportDir, catalog);
      exportArchiveHash = archive.archiveHash.toLowerCase();
      listedTables = archive.listedTables;
      if (exportArchiveHash !== parity.boundExportArchiveHash) {
        mismatches.push(
          `archive hash mismatch: parity.boundExportArchiveHash=${parity.boundExportArchiveHash} on-disk archive=${exportArchiveHash}`
        );
      }
      const declared = (options.declaredExportArchiveHash ?? '').toLowerCase();
      if (!declared || declared.length !== 64) {
        mismatches.push(
          'exportArchiveHash missing on watermark report (64-hex required for archive provenance binding)'
        );
      } else if (declared !== exportArchiveHash) {
        mismatches.push(
          `exportArchiveHash provenance mismatch: report=${declared} on-disk archive=${exportArchiveHash}`
        );
      }
      // Every expected parity table must exist in catalog + export inventory.
      for (const sourceTable of Object.keys(parity.loadedByTable)) {
        if (!catalog.tables[sourceTable]) {
          mismatches.push(`catalog missing expected parity table: ${sourceTable}`);
        }
        if (!listedTables.includes(sourceTable)) {
          mismatches.push(`export archive missing expected parity table: ${sourceTable}`);
        }
      }
    } catch (err) {
      mismatches.push(
        `archive/catalog bind failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const expectedKeys = Object.keys(parity.loadedByTable);
  const catalog_table_count = expectedKeys.length;
  if (catalog_table_count < 4) {
    mismatches.push(
      `catalog/export expected table count too small: ${catalog_table_count} (need >= 4 for CAP-MIG-01 parity)`
    );
  }

  const baseline_hash = exportArchiveHash || parity.boundExportArchiveHash;
  const baseline_source = `export-catalog:${exportDir}#${baseline_hash.slice(0, 12)}+parity:${parity.path}#${parity.parityHash.slice(0, 12)}`;

  return {
    ok: mismatches.length === 0,
    mismatches,
    exportDir,
    catalogPath,
    parityPath: parity.path,
    exportArchiveHash: exportArchiveHash || parity.boundExportArchiveHash,
    parityHash: parity.parityHash,
    expectedLoadedByTable: { ...parity.loadedByTable },
    catalog_table_count,
    listedTables,
    baseline_hash,
    baseline_source,
  };
}

/**
 * Detect truncated or rewritten caller loadedByTable vs immutable parity inventory.
 */
export function diffCallerLoadedByTableAgainstParity(
  caller: Record<string, number>,
  expected: Record<string, number>
): string[] {
  const mismatches: string[] = [];
  const callerKeys = Object.keys(caller).filter((k) => typeof caller[k] === 'number');
  const expectedKeys = Object.keys(expected);
  if (callerKeys.length === 0) {
    // Empty caller is ok when authority is parity-only; no truncated signal.
    return mismatches;
  }
  const expectedPg = new Map<string, { source: string; n: number }>();
  for (const [k, n] of Object.entries(expected)) {
    expectedPg.set(camelToSnake(k), { source: k, n });
  }
  const callerPg = new Map<string, { source: string; n: number }>();
  for (const [k, n] of Object.entries(caller)) {
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    callerPg.set(camelToSnake(k), { source: k, n });
  }
  // Truncated: caller proper subset of expected
  const missing: string[] = [];
  for (const [pg, exp] of expectedPg) {
    if (!callerPg.has(pg)) missing.push(exp.source);
  }
  if (missing.length > 0) {
    mismatches.push(
      `truncated/incomplete-set: caller loadedByTable missing ${missing.length} catalog/export expected table(s): ${missing.sort().join(',')}`
    );
  }
  // Rewritten counts
  for (const [pg, c] of callerPg) {
    const exp = expectedPg.get(pg);
    if (!exp) continue;
    if (c.n !== exp.n) {
      mismatches.push(
        `rewritten/provenance count drift for ${exp.source}: caller=${c.n} parity=${exp.n}`
      );
    }
  }
  // Extra unexpected keys are soft: still report for visibility
  if (callerKeys.length < expectedKeys.length && missing.length === 0) {
    mismatches.push(
      `truncated/incomplete-set: caller tables=${callerKeys.length} expected=${expectedKeys.length}`
    );
  }
  return mismatches;
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
  /** Read tools only — true only when registry Zod outputSchema.safeParse succeeds. */
  schema_valid?: boolean;
  /**
   * Read tools only — true only when schema_valid AND payload corresponds to a
   * real Postgres SELECT for the seed/query (R3-C03). Shape-only non-null is not enough.
   */
  postgres_backed?: boolean;
  /** True when MCP payload matched independent SELECT row/content (R3-C03). */
  correspondence_matched?: boolean;
};

/** Deployed soak endpoint identity recorded on every verify-tools/article report (R2-H02 / R3-C03). */
export type TargetIdentity = {
  host: string;
  port: number;
  /** Deployment label from the *serving* process (health), never sole caller mint. */
  service_label: string;
  pid?: number;
  generation?: string;
  /**
   * Provenance of identity fields.
   * - `health`: bound from GET /health of an already-listening process (required for green).
   * - `caller_minted`: URL/options only — insufficient for green verify (R3-C03).
   */
  identity_source: 'health' | 'caller_minted';
  /** Serving process uptime_ms from health when identity_source=health. */
  uptime_ms?: number;
  /** Wall clock when health identity was observed. */
  observed_at_ms?: number;
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
  /**
   * Host/port (+ optional service label/pid/generation) for the intended soak endpoint.
   * Required for green verify-tools — free-port overwrite alone is not identity.
   */
  target_identity: TargetIdentity | null;
  report_path?: string;
  error?: string;
  /** Seeds used for read/mutation tool args (non-sentinel holocron_nonprod row ids when available). */
  seeds?: VerifyToolSeeds;
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

/**
 * Parse host+port from a base URL. Does **not** mint service identity (R3-C03).
 * Caller-minted labels/pids are intentionally excluded from green path.
 */
export function parseBaseUrlHostPort(baseUrl: string): { host: string; port: number } | null {
  const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const host = u.hostname;
    if (!host) return null;
    const portNum = u.port
      ? Number(u.port)
      : u.protocol === 'https:'
        ? 443
        : u.protocol === 'http:'
          ? 80
          : NaN;
    if (!Number.isFinite(portNum) || portNum <= 0) return null;
    return { host, port: portNum };
  } catch {
    return null;
  }
}

/**
 * @deprecated R3-C03: caller-minted identity is insufficient for green verify.
 * Prefer `resolveDeployedTargetIdentity` (health-bound). Kept for diagnostics /
 * negative tests; always tags identity_source=`caller_minted`.
 */
export function resolveTargetIdentity(
  baseUrl: string,
  options?: { serviceLabel?: string; pid?: number; generation?: string }
): TargetIdentity | null {
  const hp = parseBaseUrlHostPort(baseUrl);
  if (!hp) return null;
  const envPid = process.env.HOLO_VERIFY_PID;
  const pidRaw = options?.pid ?? (envPid && envPid.length > 0 ? Number(envPid) : undefined);
  const pid =
    typeof pidRaw === 'number' && Number.isFinite(pidRaw) && pidRaw > 0 ? pidRaw : undefined;
  const generation =
    options?.generation ??
    process.env.HOLO_VERIFY_GENERATION ??
    process.env.HOLO_SOAK_GENERATION ??
    undefined;
  const service_label =
    options?.serviceLabel ??
    process.env.HOLO_VERIFY_SERVICE_LABEL ??
    process.env.HOLO_SOAK_SERVICE_LABEL ??
    (generation && generation.length > 0 ? `generation:${generation}` : undefined) ??
    (pid !== undefined ? `pid:${pid}` : undefined) ??
    `endpoint:${hp.host}:${hp.port}`;
  const identity: TargetIdentity = {
    host: hp.host,
    port: hp.port,
    service_label,
    identity_source: 'caller_minted',
  };
  if (pid !== undefined) identity.pid = pid;
  if (generation && generation.length > 0) identity.generation = generation;
  return identity;
}

/** True when process env names a pre-existing deploy target (not options alone). */
export function hasDeploymentVerifyEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  for (const key of ['HOLO_VERIFY_BASE_URL', 'HOLO_SOAK_BASE_URL', 'PLATFORM_URL'] as const) {
    const v = env[key];
    if (typeof v === 'string' && v.trim().length > 0) return true;
  }
  return false;
}

export type DeployedIdentityResult = {
  identity: TargetIdentity | null;
  error?: string;
  health_status?: number;
  health_body?: unknown;
};

/**
 * Bind verify-tools/article identity to an **already-listening** process via GET /health.
 *
 * R3-C03 rules:
 * - Requires deployment env (HOLO_VERIFY_BASE_URL / HOLO_SOAK_BASE_URL / PLATFORM_URL)
 *   so identity is not solely an in-process options mint without a live stack.
 * - service_label / pid / generation come from the serving process health body —
 *   never written from caller options as sole proof.
 * - Optional expectServiceLabel / expectPid are *constraints* (must match health) only.
 */
export async function resolveDeployedTargetIdentity(
  baseUrl: string,
  options?: {
    /** Constraint: health.service_label must equal this when provided. */
    expectServiceLabel?: string;
    /** Constraint: health.pid must equal this when provided. */
    expectPid?: number;
    /** Constraint: health.generation must equal this when provided. */
    expectGeneration?: string;
    /** Skip deployment-env gate (tests only). Default false. */
    allowMissingDeploymentEnv?: boolean;
    fetchImpl?: typeof fetch;
  }
): Promise<DeployedIdentityResult> {
  const trimmed = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
  const hp = parseBaseUrlHostPort(trimmed);
  if (!hp || !trimmed) {
    return { identity: null, error: 'MISSING_BASE_URL' };
  }
  if (!options?.allowMissingDeploymentEnv && !hasDeploymentVerifyEnv()) {
    return {
      identity: null,
      error:
        'MISSING_DEPLOYMENT_ENV: set HOLO_VERIFY_BASE_URL (or HOLO_SOAK_BASE_URL / PLATFORM_URL) to a pre-existing listening stack before verify',
    };
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  let healthStatus = 0;
  let healthBody: unknown;
  try {
    const res = await fetchFn(`${trimmed}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
      headers: { accept: 'application/json' },
    });
    healthStatus = res.status;
    const text = await res.text();
    try {
      healthBody = text ? JSON.parse(text) : null;
    } catch {
      healthBody = text;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      identity: null,
      error: `UNREACHABLE_BASE_URL: ${trimmed} (${msg})`,
    };
  }

  if (healthStatus !== 200 && healthStatus !== 503) {
    return {
      identity: null,
      health_status: healthStatus,
      health_body: healthBody,
      error: `HEALTH_IDENTITY_UNAVAILABLE: unexpected status ${healthStatus}`,
    };
  }

  const body =
    healthBody && typeof healthBody === 'object' ? (healthBody as Record<string, unknown>) : null;
  if (!body) {
    return {
      identity: null,
      health_status: healthStatus,
      health_body: healthBody,
      error: 'HEALTH_IDENTITY_UNAVAILABLE: non-object health body',
    };
  }

  const pidRaw = body.pid;
  const pid =
    typeof pidRaw === 'number' && Number.isFinite(pidRaw) && pidRaw > 0
      ? pidRaw
      : typeof pidRaw === 'string' && /^\d+$/.test(pidRaw)
        ? Number(pidRaw)
        : undefined;
  if (pid === undefined) {
    return {
      identity: null,
      health_status: healthStatus,
      health_body: healthBody,
      error:
        'HEALTH_IDENTITY_UNAVAILABLE: serving /health must report pid of the already-listening process',
    };
  }

  // Refuse identity that is only the verify process itself (in-process createHonoApp theatre).
  if (pid === process.pid) {
    return {
      identity: null,
      health_status: healthStatus,
      health_body: healthBody,
      error:
        'SELF_MINTED_IDENTITY: /health pid equals verify process pid — require a pre-existing deployed listener',
    };
  }

  const healthLabel =
    typeof body.service_label === 'string' && body.service_label.trim().length > 0
      ? body.service_label.trim()
      : null;
  const healthGeneration =
    typeof body.generation === 'string' && body.generation.trim().length > 0
      ? body.generation.trim()
      : null;
  const uptimeRaw = body.uptime_ms;
  const uptime_ms =
    typeof uptimeRaw === 'number' && Number.isFinite(uptimeRaw) && uptimeRaw > 0
      ? uptimeRaw
      : undefined;

  if (options?.expectPid !== undefined && options.expectPid !== pid) {
    return {
      identity: null,
      health_status: healthStatus,
      health_body: healthBody,
      error: `IDENTITY_PID_MISMATCH: health pid=${pid} expect=${options.expectPid}`,
    };
  }
  if (
    options?.expectServiceLabel !== undefined &&
    options.expectServiceLabel.length > 0 &&
    healthLabel !== options.expectServiceLabel
  ) {
    return {
      identity: null,
      health_status: healthStatus,
      health_body: healthBody,
      error: `IDENTITY_LABEL_MISMATCH: health service_label=${healthLabel ?? 'null'} expect=${options.expectServiceLabel}`,
    };
  }
  if (
    options?.expectGeneration !== undefined &&
    options.expectGeneration.length > 0 &&
    healthGeneration !== options.expectGeneration
  ) {
    return {
      identity: null,
      health_status: healthStatus,
      health_body: healthBody,
      error: `IDENTITY_GENERATION_MISMATCH: health generation=${healthGeneration ?? 'null'} expect=${options.expectGeneration}`,
    };
  }

  const service_label =
    healthLabel ??
    (healthGeneration ? `generation:${healthGeneration}` : undefined) ??
    `pid:${pid}`;

  const identity: TargetIdentity = {
    host: hp.host,
    port: hp.port,
    service_label,
    pid,
    identity_source: 'health',
    observed_at_ms: Date.now(),
  };
  if (healthGeneration) identity.generation = healthGeneration;
  if (uptime_ms !== undefined) identity.uptime_ms = uptime_ms;

  return { identity, health_status: healthStatus, health_body: healthBody };
}

/** Real holocron_nonprod row ids for verify-tools (never fixed 000…0001 sentinels without row proof). */
export type VerifyToolSeeds = {
  documentId: string;
  subscriptionId: string;
  researchSessionId: string;
  improvementId: string;
  assimilationSessionId: string;
  toolId: string;
  shopSessionId: string;
  profileId: string;
  runId: string;
};

const FIXED_SENTINEL_DOCUMENT = '00000000-0000-4000-8000-000000000001';
const FIXED_SENTINEL_SUBSCRIPTION = '00000000-0000-4000-8000-000000000002';

/**
 * Load real row ids from holocron_nonprod for verify-tools args.
 * Fail-closed when documents/subscription_sources (required) are empty.
 * Optional entities may be empty strings — get_* tools then fail postgres_backed (not silent green).
 */
export async function resolveVerifyToolSeeds(options?: {
  databaseUrl?: string;
  runId?: string;
}): Promise<{ ok: true; seeds: VerifyToolSeeds } | { ok: false; error: string }> {
  const runId = options?.runId ?? `vt-${Date.now().toString(36)}`;
  const url =
    options?.databaseUrl ??
    process.env.DATABASE_URL ??
    resolveHolocronNonprodDatabaseUrl({ context: 'resolveVerifyToolSeeds' });
  const sql = createSql(url);
  try {
    const documents = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM documents ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    const subscriptions = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM subscription_sources ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    if (!documents[0]?.id || !subscriptions[0]?.id) {
      return {
        ok: false,
        error:
          'SEEDS_UNAVAILABLE: holocron_nonprod missing documents and/or subscription_sources rows for verify-tools',
      };
    }
    const research = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM research_sessions ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    const improvements = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM improvement_requests ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    const assimilation = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM assimilation_sessions ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    const tools = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM toolbelt_tools ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    const shop = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM shop_sessions ORDER BY created_at DESC, id DESC LIMIT 1
    `;
    const profiles = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM creator_profiles ORDER BY created_at DESC, id DESC LIMIT 1
    `;

    const seeds: VerifyToolSeeds = {
      documentId: documents[0].id,
      subscriptionId: subscriptions[0].id,
      researchSessionId: research[0]?.id ?? '',
      improvementId: improvements[0]?.id ?? '',
      assimilationSessionId: assimilation[0]?.id ?? '',
      toolId: tools[0]?.id ?? '',
      shopSessionId: shop[0]?.id ?? '',
      profileId: profiles[0]?.id ?? '',
      runId,
    };

    // Reject sole fixed-sentinel path unless those exact rows exist in DB (row proof above).
    if (
      seeds.documentId === FIXED_SENTINEL_DOCUMENT &&
      seeds.subscriptionId === FIXED_SENTINEL_SUBSCRIPTION
    ) {
      // Allowed only when SELECT actually returned those rows (they exist).
    }

    return { ok: true, seeds };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `SEEDS_UNAVAILABLE: ${msg}` };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Minimal args so tools/call reaches executor (reads need real seeded ids; mutations fence). */
export function buildVerifyToolArgs(
  toolId: string,
  seeds: VerifyToolSeeds | { documentId: string; subscriptionId: string; runId: string }
): Record<string, unknown> {
  const documentId = seeds.documentId;
  const subscriptionId = seeds.subscriptionId;
  const runId = seeds.runId;
  const researchSessionId =
    'researchSessionId' in seeds && seeds.researchSessionId ? seeds.researchSessionId : documentId;
  const improvementId =
    'improvementId' in seeds && seeds.improvementId ? seeds.improvementId : documentId;
  const assimilationSessionId =
    'assimilationSessionId' in seeds && seeds.assimilationSessionId
      ? seeds.assimilationSessionId
      : documentId;
  const toolEntityId = 'toolId' in seeds && seeds.toolId ? seeds.toolId : documentId;
  const shopSessionId =
    'shopSessionId' in seeds && seeds.shopSessionId ? seeds.shopSessionId : documentId;
  const profileId = 'profileId' in seeds && seeds.profileId ? seeds.profileId : documentId;

  switch (toolId) {
    case 'get_research_session':
      return { sessionId: researchSessionId };
    case 'search_research':
    case 'search_fts':
    case 'hybrid_search':
    case 'search_tools':
    case 'search_improvements':
    case 'findRecommendations':
      return { query: `soak-${runId}` };
    case 'search_vector':
      // passages.embedding is vector(1024) — dimension must match or executor errors
      return { embedding: Array.from({ length: 1024 }, () => 0.01) };
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
      return { toolId: toolEntityId };
    case 'shop_products':
      return { query: `soak-${runId}-shop`, retailers: ['amazon'] };
    case 'get_shop_session':
    case 'get_shop_listings':
      return { sessionId: shopSessionId };
    case 'get_assimilation_status':
    case 'approve_assimilation_plan':
    case 'reject_assimilation_plan':
    case 'cancel_assimilation':
      return { sessionId: assimilationSessionId };
    case 'start_assimilation':
      return { repositoryUrl: `https://github.com/example/soak-${runId}` };
    case 'steer_assimilation':
      return { sessionId: assimilationSessionId, note: `steer-${runId}` };
    case 'assimilate_creator':
    case 'get_creator_transcripts':
      return { profileId };
    case 'regenerate_transcript':
      return { contentId: documentId };
    case 'get_improvement':
    case 'close_improvement':
      return { id: improvementId };
    case 'set_improvement_status':
      return { id: improvementId, status: 'open' };
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
    signal: AbortSignal.timeout(120_000),
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
 * True when payload is non-null application data (not null / not-found shells).
 * Empty list results from Postgres are allowed; null and success:false are not.
 * R3-C03: shape alone never sets postgres_backed — use correspondence separately.
 */
export function hasNonNullApplicationData(payload: unknown): boolean {
  if (payload === null || payload === undefined) return false;
  if (typeof payload === 'string') return payload.trim().length > 0;
  if (Array.isArray(payload)) return true;
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 0) return false;
    // Explicit not-found / error shells
    if (o.success === false) return false;
    if (keys.length === 1 && keys[0] === 'session' && o.session === null) return false;
    if (keys.length === 1 && keys[0] === 'error') return false;
    return true;
  }
  return false;
}

/** Stable content hash for Postgres↔MCP correspondence (R3-C03). */
export function contentHashStable(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return String(v);
      // Scores / ranks: stabilize float noise for correspondence
      return Math.round(v * 1e6) / 1e6;
    }
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(normalize);
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        // Drop volatile / non-content fields
        if (
          k === 'score' ||
          k === 'relevanceScore' ||
          k === 'latency_ms' ||
          k === 'createdAt' ||
          k === 'updatedAt' ||
          k === 'generatedAt' ||
          k === 'discoveredAt' ||
          k === 'completedAt' ||
          k === 'closedAt'
        ) {
          continue;
        }
        out[k] = normalize(o[k]);
      }
      return out;
    }
    return String(v);
  };
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}

/** Collect UUID-like and string ids from an MCP / oracle payload tree. */
export function extractPayloadIds(payload: unknown, into: Set<string> = new Set()): Set<string> {
  if (payload === null || payload === undefined) return into;
  if (typeof payload === 'string') {
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload) ||
      payload.length > 0
    ) {
      // Only add UUID-shaped strings as ids
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload)) {
        into.add(payload.toLowerCase());
      }
    }
    return into;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) extractPayloadIds(item, into);
    return into;
  }
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    const idKeys = [
      'id',
      '_id',
      'documentId',
      'subscriptionId',
      'sessionId',
      'toolId',
      'filterId',
      'profileId',
      'contentId',
      'jobId',
    ];
    for (const k of idKeys) {
      const v = o[k];
      if (typeof v === 'string' && v.length > 0) into.add(v.toLowerCase());
    }
    for (const v of Object.values(o)) extractPayloadIds(v, into);
  }
  return into;
}

/**
 * Independent Postgres SELECT oracle for a verify-tools read (R3-C03).
 * Mirrors executor semantics for seed args so MCP payload can be correspondence-checked.
 */
export async function selectPostgresOracleForTool(
  toolId: string,
  seeds: VerifyToolSeeds,
  options?: { databaseUrl?: string }
): Promise<{ ok: true; oracle: unknown } | { ok: false; error: string }> {
  const url =
    options?.databaseUrl ??
    process.env.DATABASE_URL ??
    resolveHolocronNonprodDatabaseUrl({ context: 'selectPostgresOracleForTool' });
  const sql = createSql(url);
  const documentId = seeds.documentId;
  const subscriptionId = seeds.subscriptionId;
  const researchSessionId = seeds.researchSessionId || documentId;
  const improvementId = seeds.improvementId || documentId;
  const assimilationSessionId = seeds.assimilationSessionId || documentId;
  const toolEntityId = seeds.toolId || documentId;
  const shopSessionId = seeds.shopSessionId || documentId;
  const profileId = seeds.profileId || documentId;
  const query = `soak-${seeds.runId}`;

  try {
    let oracle: unknown;
    switch (toolId) {
      case 'get_document': {
        const rows = await sql`
          SELECT id::text AS "documentId", title, content, status, is_public AS "isPublic",
                 share_token AS "shareToken"
          FROM documents WHERE id = ${documentId}::uuid LIMIT 1
        `;
        oracle = rows[0] ?? null;
        break;
      }
      case 'list_documents': {
        const rows = await sql`
          SELECT id::text AS id, title, status
          FROM documents ORDER BY created_at DESC, id DESC LIMIT 50
        `;
        oracle = { documents: rows, hasMore: false, nextCursor: null };
        break;
      }
      case 'get_tool': {
        const rows = await sql`
          SELECT id::text AS "toolId", title, description, content, source_type AS "sourceType",
                 category, status
          FROM toolbelt_tools WHERE id = ${toolEntityId}::uuid LIMIT 1
        `;
        oracle = rows[0] ?? null;
        break;
      }
      case 'list_tools': {
        const rows = await sql`
          SELECT id::text AS "toolId", title, category, status, source_type AS "sourceType"
          FROM toolbelt_tools ORDER BY created_at DESC LIMIT 100
        `;
        oracle = { tools: rows, total: rows.length };
        break;
      }
      case 'list_subscriptions': {
        const rows = await sql`
          SELECT id::text AS "subscriptionId", source_type AS "sourceType", identifier, name
          FROM subscription_sources ORDER BY created_at DESC LIMIT 100
        `;
        oracle = { subscriptions: rows };
        break;
      }
      case 'get_subscription_content': {
        const rows = await sql`
          SELECT id::text AS id, source_id AS "sourceId", content_id AS "contentId", title, url
          FROM subscription_content
          WHERE source_id = ${subscriptionId}
          ORDER BY discovered_at DESC LIMIT 100
        `;
        oracle = { content: rows };
        break;
      }
      case 'get_subscription_filters': {
        const rows = await sql`
          SELECT id::text AS "filterId", source_id AS "sourceId", rule_name AS "ruleName",
                 rule_type AS "ruleType", rule_value AS "ruleValue"
          FROM subscription_filters
          ORDER BY created_at DESC
        `;
        oracle = { filters: rows };
        break;
      }
      case 'get_research_session': {
        const sessions = await sql`
          SELECT id::text AS "sessionId", topic, status
          FROM research_sessions WHERE id = ${researchSessionId}::uuid LIMIT 1
        `;
        oracle = sessions[0] ?? null;
        break;
      }
      case 'search_research': {
        const rows = await sql`
          SELECT id::text AS "sessionId", COALESCE(topic, '') AS topic, status
          FROM research_sessions
          WHERE lower(COALESCE(topic, '')) LIKE ${`%${query.toLowerCase()}%`}
          ORDER BY created_at DESC LIMIT 20
        `;
        oracle = { sessions: rows, totalResults: rows.length };
        break;
      }
      case 'search_fts':
      case 'hybrid_search': {
        const rows = await sql`
          SELECT id::text AS _id, title
          FROM documents
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
          ORDER BY created_at DESC LIMIT 20
        `;
        oracle = {
          results: rows,
          totalResults: rows.length,
          ...(toolId === 'hybrid_search' ? { searchMethod: 'postgres-fts' } : {}),
        };
        break;
      }
      case 'search_vector': {
        // Same embedding dimension as buildVerifyToolArgs (1024 zeros→0.01)
        const embedding = `[${Array.from({ length: 1024 }, () => 0.01).join(',')}]`;
        const rows = await sql`
          SELECT id::text AS _id, situating_header AS title
          FROM passages
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${embedding}::vector LIMIT 20
        `;
        oracle = { results: rows, totalResults: rows.length };
        break;
      }
      case 'search_tools': {
        const rows = await sql`
          SELECT id::text AS "toolId", title
          FROM toolbelt_tools
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
          ORDER BY created_at DESC LIMIT 20
        `;
        oracle = { results: rows, totalResults: rows.length, searchMethod: 'postgres-fts' };
        break;
      }
      case 'search_improvements': {
        const rows = await sql`
          SELECT id::text AS "_id", description, status
          FROM improvement_requests
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
          ORDER BY created_at DESC LIMIT 20
        `;
        oracle = rows;
        break;
      }
      case 'get_improvement': {
        const rows = await sql`
          SELECT id::text AS "_id", description, status, source_screen AS "sourceScreen"
          FROM improvement_requests WHERE id = ${improvementId}::uuid LIMIT 1
        `;
        oracle = rows[0] ?? null;
        break;
      }
      case 'list_improvements': {
        const rows = await sql`
          SELECT id::text AS "_id", description, status
          FROM improvement_requests ORDER BY created_at DESC LIMIT 100
        `;
        oracle = rows;
        break;
      }
      case 'get_shop_session': {
        const rows = await sql`
          SELECT id::text AS "sessionId", query, status, total_listings AS "totalListings"
          FROM shop_sessions WHERE id = ${shopSessionId}::uuid LIMIT 1
        `;
        oracle = { session: rows[0] ?? null };
        break;
      }
      case 'get_shop_listings': {
        const rows = await sql`
          SELECT id::text AS id, title, price, retailer
          FROM shop_listings WHERE session_id = ${shopSessionId}
          ORDER BY created_at DESC LIMIT 100
        `;
        oracle = { listings: rows };
        break;
      }
      case 'get_whats_new_report': {
        const rows = await sql`
          SELECT id::text AS id, summary_json AS report, findings_json AS findings
          FROM whats_new_reports ORDER BY created_at DESC LIMIT 1
        `;
        const row = rows[0];
        if (!row) {
          oracle = null;
        } else {
          oracle = {
            content: JSON.stringify(row.report ?? row.findings ?? {}),
            ...(row.report && typeof row.report === 'object' ? { report: row.report } : {}),
          };
        }
        break;
      }
      case 'list_whats_new_reports': {
        const rows = await sql`
          SELECT id::text AS id, findings_count AS "findingsCount"
          FROM whats_new_reports ORDER BY created_at DESC LIMIT 50
        `;
        oracle = rows;
        break;
      }
      case 'get_assimilation_status': {
        const rows = await sql`
          SELECT id::text AS "_id", status, profile, repository_url AS "repositoryUrl"
          FROM assimilation_sessions WHERE id = ${assimilationSessionId}::uuid LIMIT 1
        `;
        oracle = rows[0] ?? null;
        break;
      }
      case 'get_creator_transcripts': {
        const profile = await sql`
          SELECT handle FROM creator_profiles WHERE id = ${profileId}::uuid LIMIT 1
        `;
        if (!profile[0]) {
          oracle = { success: false, error: 'creator profile not found' };
        } else {
          const rows = await sql`
            SELECT v.content_id AS "contentId"
            FROM subscription_content c
            JOIN video_transcripts v ON v.content_id = c.content_id
            WHERE c.source_id = ${profileId} LIMIT 100
          `;
          oracle = {
            success: true,
            data: {
              profileId,
              creatorHandle: profile[0].handle ?? '',
              transcriptCount: rows.length,
              transcripts: rows,
            },
          };
        }
        break;
      }
      case 'findRecommendations': {
        // External/live path: prove Postgres is still the seed anchor + non-null payload elsewhere.
        // Correspondence requires seed document row exists (content hash anchor).
        const rows = await sql`
          SELECT id::text AS id, title FROM documents WHERE id = ${documentId}::uuid LIMIT 1
        `;
        oracle = {
          _correspondence: 'seed-document-anchor',
          document: rows[0] ?? null,
        };
        break;
      }
      default: {
        // Unknown read tool: require seed document exists as minimum correspondence anchor.
        const rows = await sql`
          SELECT id::text AS id FROM documents WHERE id = ${documentId}::uuid LIMIT 1
        `;
        oracle = { _fallback_seed: rows[0] ?? null };
        break;
      }
    }
    return { ok: true, oracle };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `ORACLE_SELECT_FAILED: ${msg}` };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Prove MCP payload corresponds to independent Postgres SELECT (R3-C03).
 * Shape-only schema_valid never returns true here.
 */
export function payloadCorrespondsToPostgres(
  toolId: string,
  mcpPayload: unknown,
  oracle: unknown,
  seeds: VerifyToolSeeds
): boolean {
  if (mcpPayload === null || mcpPayload === undefined) return false;
  if (oracle === null || oracle === undefined) {
    // Oracle null (row missing) only corresponds if MCP also null — never postgres_backed success.
    return false;
  }

  // findRecommendations: external live path — require seed document anchor present in oracle
  // and MCP non-null shape; content hash of seed id must be known.
  if (toolId === 'findRecommendations') {
    const o = oracle as { document?: { id?: string } | null };
    if (!o.document?.id) return false;
    if (o.document.id.toLowerCase() !== seeds.documentId.toLowerCase()) return false;
    return hasNonNullApplicationData(mcpPayload);
  }

  // Entity get_* — require id field match + content hash of stable fields.
  const entityIdTools: Record<string, string> = {
    get_document: seeds.documentId,
    get_tool: seeds.toolId || seeds.documentId,
    get_research_session: seeds.researchSessionId || seeds.documentId,
    get_improvement: seeds.improvementId || seeds.documentId,
    get_assimilation_status: seeds.assimilationSessionId || seeds.documentId,
  };
  if (toolId in entityIdTools) {
    const expectedRaw = entityIdTools[toolId];
    if (typeof expectedRaw !== 'string' || expectedRaw.length === 0) return false;
    const expectedId = expectedRaw.toLowerCase();
    const mcpIds = extractPayloadIds(mcpPayload);
    if (!mcpIds.has(expectedId)) return false;
    // Content correspondence: title/description/content or full stable hash equality
    if (toolId === 'get_document') {
      const mcp = mcpPayload as Record<string, unknown>;
      const ora = oracle as Record<string, unknown>;
      const titleOk =
        typeof mcp.title === 'string' && typeof ora.title === 'string' && mcp.title === ora.title;
      const contentOk =
        typeof mcp.content === 'string' &&
        typeof ora.content === 'string' &&
        mcp.content === ora.content;
      // Require title+content string equality when both sides expose them.
      if (titleOk && contentOk) return true;
      if (titleOk && ora.content == null && mcp.content == null) return true;
      // Otherwise stable hash of the id+title+content projection must match.
      return (
        contentHashStable({
          id: expectedId,
          title: mcp.title ?? null,
          content: mcp.content ?? null,
        }) ===
        contentHashStable({
          id: expectedId,
          title: ora.title ?? null,
          content: ora.content ?? null,
        })
      );
    }
    // Other entity gets: stable hash of both sides, or shared id + at least one shared content field.
    if (contentHashStable(mcpPayload) === contentHashStable(oracle)) return true;
    if (!mcpIds.has(expectedId) || !extractPayloadIds(oracle).has(expectedId)) return false;
    const mcpObj = mcpPayload as Record<string, unknown>;
    const oraObj = oracle as Record<string, unknown>;
    for (const field of ['title', 'topic', 'description', 'status', 'query', 'profile', 'name']) {
      if (
        typeof mcpObj[field] === 'string' &&
        typeof oraObj[field] === 'string' &&
        mcpObj[field] === oraObj[field]
      ) {
        return true;
      }
    }
    return false;
  }

  if (toolId === 'get_shop_session') {
    const mcp = mcpPayload as { session?: { sessionId?: string; query?: string } | null };
    const ora = oracle as { session?: { sessionId?: string; query?: string } | null };
    if (!mcp.session || !ora.session) return false;
    const sid = String(mcp.session.sessionId ?? '').toLowerCase();
    const expected = (seeds.shopSessionId || seeds.documentId).toLowerCase();
    if (sid !== expected) return false;
    if (ora.session.sessionId && String(ora.session.sessionId).toLowerCase() !== sid) return false;
    if (
      typeof mcp.session.query === 'string' &&
      typeof ora.session.query === 'string' &&
      mcp.session.query === ora.session.query
    ) {
      return true;
    }
    return contentHashStable(mcp.session) === contentHashStable(ora.session);
  }

  if (toolId === 'get_creator_transcripts') {
    const mcp = mcpPayload as { success?: boolean; data?: { profileId?: string } };
    const ora = oracle as { success?: boolean; data?: { profileId?: string } };
    if (mcp.success === false && ora.success === false) {
      // Both not-found — not a successful postgres-backed read for verify
      return false;
    }
    if (mcp.success === true && ora.success === true) {
      const pid = String(mcp.data?.profileId ?? '').toLowerCase();
      return pid === (seeds.profileId || seeds.documentId).toLowerCase();
    }
    return false;
  }

  if (toolId === 'get_whats_new_report') {
    // Both null → not backed; both with content → hash compare of content field
    if (typeof mcpPayload === 'object' && mcpPayload && typeof oracle === 'object' && oracle) {
      const mcp = mcpPayload as { content?: string };
      const ora = oracle as { content?: string };
      if (typeof mcp.content === 'string' && typeof ora.content === 'string') {
        return mcp.content === ora.content;
      }
      return contentHashStable(mcpPayload) === contentHashStable(oracle);
    }
    return false;
  }

  // Collections / searches: id-set correspondence with independent SELECT.
  const mcpIds = extractPayloadIds(mcpPayload);
  const oracleIds = extractPayloadIds(oracle);

  // Empty collection correspondence: both sides empty is valid *only* when both are empty arrays
  // or empty result wrappers — proves the same SELECT returned no rows.
  const mcpEmpty =
    (Array.isArray(mcpPayload) && mcpPayload.length === 0) ||
    (typeof mcpPayload === 'object' &&
      mcpPayload !== null &&
      ((Array.isArray((mcpPayload as { results?: unknown }).results) &&
        ((mcpPayload as { results: unknown[] }).results?.length ?? -1) === 0) ||
        (Array.isArray((mcpPayload as { documents?: unknown }).documents) &&
          ((mcpPayload as { documents: unknown[] }).documents?.length ?? -1) === 0) ||
        (Array.isArray((mcpPayload as { sessions?: unknown }).sessions) &&
          ((mcpPayload as { sessions: unknown[] }).sessions?.length ?? -1) === 0) ||
        (Array.isArray((mcpPayload as { tools?: unknown }).tools) &&
          ((mcpPayload as { tools: unknown[] }).tools?.length ?? -1) === 0) ||
        (Array.isArray((mcpPayload as { subscriptions?: unknown }).subscriptions) &&
          ((mcpPayload as { subscriptions: unknown[] }).subscriptions?.length ?? -1) === 0) ||
        (Array.isArray((mcpPayload as { content?: unknown }).content) &&
          ((mcpPayload as { content: unknown[] }).content?.length ?? -1) === 0) ||
        (Array.isArray((mcpPayload as { filters?: unknown }).filters) &&
          ((mcpPayload as { filters: unknown[] }).filters?.length ?? -1) === 0) ||
        (Array.isArray((mcpPayload as { listings?: unknown }).listings) &&
          ((mcpPayload as { listings: unknown[] }).listings?.length ?? -1) === 0)));
  const oraEmpty =
    (Array.isArray(oracle) && oracle.length === 0) ||
    (typeof oracle === 'object' &&
      oracle !== null &&
      ((Array.isArray((oracle as { results?: unknown }).results) &&
        ((oracle as { results: unknown[] }).results?.length ?? -1) === 0) ||
        (Array.isArray((oracle as { documents?: unknown }).documents) &&
          ((oracle as { documents: unknown[] }).documents?.length ?? -1) === 0) ||
        (Array.isArray((oracle as { sessions?: unknown }).sessions) &&
          ((oracle as { sessions: unknown[] }).sessions?.length ?? -1) === 0) ||
        (Array.isArray((oracle as { tools?: unknown }).tools) &&
          ((oracle as { tools: unknown[] }).tools?.length ?? -1) === 0) ||
        (Array.isArray((oracle as { subscriptions?: unknown }).subscriptions) &&
          ((oracle as { subscriptions: unknown[] }).subscriptions?.length ?? -1) === 0) ||
        (Array.isArray((oracle as { content?: unknown }).content) &&
          ((oracle as { content: unknown[] }).content?.length ?? -1) === 0) ||
        (Array.isArray((oracle as { filters?: unknown }).filters) &&
          ((oracle as { filters: unknown[] }).filters?.length ?? -1) === 0) ||
        (Array.isArray((oracle as { listings?: unknown }).listings) &&
          ((oracle as { listings: unknown[] }).listings?.length ?? -1) === 0)));

  if (mcpEmpty && oraEmpty) {
    // Independent SELECT agreed no rows for this query — real correspondence, not shape fiction.
    return true;
  }

  if (oracleIds.size === 0 && mcpIds.size === 0) {
    // No ids either side but non-empty payloads — fall back to full stable hash
    return contentHashStable(mcpPayload) === contentHashStable(oracle);
  }

  if (oracleIds.size === 0) return false;

  // Every MCP id that looks like a primary entity should appear in oracle, OR
  // at least one oracle id appears in MCP (list projections may truncate differently).
  let intersection = 0;
  for (const id of mcpIds) {
    if (oracleIds.has(id)) intersection += 1;
  }
  if (intersection > 0) return true;

  // Seed id must appear in MCP for list tools when oracle has it
  const seedIds = [
    seeds.documentId,
    seeds.subscriptionId,
    seeds.toolId,
    seeds.shopSessionId,
    seeds.profileId,
    seeds.improvementId,
    seeds.researchSessionId,
    seeds.assimilationSessionId,
  ]
    .filter((x) => typeof x === 'string' && x.length > 0)
    .map((x) => x.toLowerCase());
  for (const sid of seedIds) {
    if (oracleIds.has(sid) && mcpIds.has(sid)) return true;
  }

  return contentHashStable(mcpPayload) === contentHashStable(oracle);
}

/**
 * Schema-valid + Postgres-backed read success (H-01 / R2-H02 / R3-C03).
 * HTTP 200 alone is insufficient — isError must be false, body non-empty,
 * registry outputSchema.safeParse must succeed (NO structural null|array|object fallback),
 * and postgres_backed requires independent SELECT correspondence (not shape-only).
 */
export function evaluateReadToolSuccess(
  toolId: string,
  res: Pick<McpCallResult, 'status' | 'isError' | 'payload' | 'rawByteLength' | 'raw'>,
  options?: {
    /** Independent Postgres SELECT result for this tool+seeds. Required for postgres_backed. */
    oracle?: unknown;
    seeds?: VerifyToolSeeds;
    /** When true, oracle was loaded successfully from DB. */
    oracleOk?: boolean;
  }
): {
  ok: boolean;
  schema_valid: boolean;
  postgres_backed: boolean;
  correspondence_matched: boolean;
} {
  const transportOk = res.status === 200 || res.status === 202;
  if (!transportOk || res.isError === true) {
    return {
      ok: false,
      schema_valid: false,
      postgres_backed: false,
      correspondence_matched: false,
    };
  }
  // Empty body is never a Postgres-backed success
  if (res.rawByteLength <= 0 || res.raw.trim().length === 0) {
    return {
      ok: false,
      schema_valid: false,
      postgres_backed: false,
      correspondence_matched: false,
    };
  }
  // Static article:compat-style stubs are never the parity oracle
  if (
    typeof res.payload === 'string' &&
    /article:compat|STUB|not.?implemented/i.test(res.payload)
  ) {
    return {
      ok: false,
      schema_valid: false,
      postgres_backed: false,
      correspondence_matched: false,
    };
  }

  let zodOk = false;
  try {
    // Registry Zod output contracts only (same instances as MCP gateway). R2-H02: no structural fallback.
    const { outputSchema } = getToolSchema(toolId);
    zodOk = outputSchema.safeParse(res.payload).success;
  } catch {
    zodOk = false;
  }

  const schema_valid = zodOk;
  const shapeOk = schema_valid && hasNonNullApplicationData(res.payload);

  // R3-C03: shape-only NEVER sets postgres_backed. Require oracle correspondence.
  let correspondence_matched = false;
  if (shapeOk && options?.oracleOk === true && options.oracle !== undefined && options.seeds) {
    correspondence_matched = payloadCorrespondsToPostgres(
      toolId,
      res.payload,
      options.oracle,
      options.seeds
    );
  }

  const postgres_backed = shapeOk && correspondence_matched;
  const ok = transportOk && res.isError !== true && schema_valid && postgres_backed;
  return { ok, schema_valid, postgres_backed, correspondence_matched };
}

/**
 * Invoke EVERY manifest tool over the real network /mcp HTTP endpoint.
 * toolsTotal is live manifest.tools.length — never hardcoded.
 * Requires HOLO_VERIFY_BASE_URL / PLATFORM_URL deployment env (fail-closed).
 * target_identity is health-bound from an already-listening process (R3-C03).
 * postgres_backed requires independent SELECT correspondence (R3-C03).
 */
export async function runVerifyTools(options?: {
  cwd?: string;
  keys?: ScopedKeyConfig;
  databaseUrl?: string;
  /** Deployed server base URL (http://host:port). Overrides env. */
  baseUrl?: string;
  /**
   * Optional *constraint* on health-reported service label (must match).
   * Never written into the report as sole identity proof (R3-C03).
   */
  serviceLabel?: string;
  /** Optional *constraint* on health-reported pid (must match). */
  pid?: number;
  /** Optional *constraint* on health-reported generation (must match). */
  generation?: string;
  /** Override seeds (tests); when omitted, load real DB row ids. */
  seeds?: VerifyToolSeeds;
  /** Test-only: allow missing HOLO_VERIFY_BASE_URL env (still requires health identity). */
  allowMissingDeploymentEnv?: boolean;
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

  const base_url = resolveVerifyBaseUrl(options?.baseUrl);
  const tools: ToolVerifyEntry[] = [];
  let toolsPassed = 0;
  let toolsStubbed = 0;
  let target_identity: TargetIdentity | null = null;

  const failAll = (
    error: string,
    message: string,
    identity: TargetIdentity | null = target_identity
  ): ToolsVerifyReport => {
    for (const tool of manifest.tools) {
      tools.push({
        tool_id: tool.id,
        is_mutation: mutationIds.has(tool.id),
        invoked: false,
        ok: false,
        schema_valid: mutationIds.has(tool.id) ? undefined : false,
        postgres_backed: mutationIds.has(tool.id) ? undefined : false,
        message,
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
      target_identity: identity,
      error,
    };
  };

  if (!base_url) {
    return failAll(
      'MISSING_BASE_URL',
      'MISSING_BASE_URL: set HOLO_VERIFY_BASE_URL or PLATFORM_URL to a listening Hono/MCP server'
    );
  }

  // R3-C03: identity from already-listening process /health — not caller-minted options.
  const deployed = await resolveDeployedTargetIdentity(base_url, {
    expectServiceLabel: options?.serviceLabel,
    expectPid: options?.pid,
    expectGeneration: options?.generation,
    allowMissingDeploymentEnv: options?.allowMissingDeploymentEnv,
  });
  target_identity = deployed.identity;
  if (!target_identity || target_identity.identity_source !== 'health') {
    return failAll(
      deployed.error ?? 'MISSING_TARGET_IDENTITY',
      deployed.error ??
        'MISSING_TARGET_IDENTITY: deployed /health must report pid of a pre-existing listener (not caller-minted)'
    );
  }

  // Resolve real DB seeds (never sole fixed 000…0001 / 000…0002 without row proof)
  let seeds: VerifyToolSeeds;
  if (options?.seeds) {
    seeds = options.seeds;
  } else {
    const seedResult = await resolveVerifyToolSeeds({
      databaseUrl: options?.databaseUrl ?? process.env.DATABASE_URL,
      runId,
    });
    if (!seedResult.ok) {
      return failAll(seedResult.error, seedResult.error);
    }
    seeds = seedResult.seeds;
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
        // Read path (R3-C03): Zod schema_valid + independent SELECT correspondence
        const oracleResult = await selectPostgresOracleForTool(tool.id, seeds, {
          databaseUrl: options?.databaseUrl ?? process.env.DATABASE_URL,
        });
        const read = evaluateReadToolSuccess(tool.id, res, {
          oracle: oracleResult.ok ? oracleResult.oracle : undefined,
          oracleOk: oracleResult.ok,
          seeds,
        });
        entry.schema_valid = read.schema_valid;
        entry.postgres_backed = read.postgres_backed;
        entry.correspondence_matched = read.correspondence_matched;
        entry.ok = read.ok;
        if (!oracleResult.ok) {
          entry.message = entry.message
            ? `${entry.message}; ${oracleResult.error}`
            : oracleResult.error;
        }
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
        postgres_backed: is_mutation ? undefined : false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok:
      toolsPassed === toolsTotal &&
      toolsStubbed === 0 &&
      toolsTotal > 0 &&
      target_identity !== null &&
      target_identity.identity_source === 'health' &&
      typeof target_identity.pid === 'number' &&
      target_identity.pid > 0 &&
      base_url.length > 0,
    toolsTotal,
    toolsPassed,
    toolsStubbed,
    tools,
    transport: 'network',
    base_url,
    target_identity,
    seeds,
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
  /** Number of mapped target tables under reconciliation (catalog/export expected set). */
  tablesTotal: number;
  /** Count of tables where live count === immutable baseline count. */
  tablesMatched: number;
  /**
   * Immutable baseline digest: export archive content address (R2-C03).
   * Never solely SHA-256 of the mutable caller watermark report.
   */
  baseline_hash: string;
  /** Absolute path of the immutable parity inventory (or ETL report when unbound). */
  baseline_path: string;
  /** exportArchiveHash verified against on-disk immutable archive (64-hex). */
  exportArchiveHash: string;
  /** Human-readable baseline provenance (export archive + parity). */
  baseline_source: string;
  /** Expected table count from bound cutover-parity / catalog inventory. */
  catalog_table_count: number;
  /** Content hash of cutover-parity inventory when bound. */
  parity_hash: string;
  /** On-disk export directory used for archive bind. */
  export_dir: string;
  /** On-disk catalog path used for inventory bind. */
  catalog_path: string;
  /** SHA-256 of the caller watermark report (mutable; not sole provenance). */
  report_sha256: string;
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
    catalog_table_count: 0,
    parity_hash: '',
    export_dir: '',
    catalog_path: '',
    report_sha256: '',
    ...partial,
  };
}

/**
 * D06-05 / H-02 / R2-C03: reconcile every catalog/export expected table against
 * live Postgres using an immutable content-addressed export archive + cutover-parity
 * inventory (not a mutable caller-selected loadedByTable alone).
 *
 * Authority:
 *   1. On-disk export archive digest (exportArchiveHash) via readImmutableExport
 *   2. cutover-parity.json expected table set + counts (content-addressed)
 *   3. Source catalog membership for every expected table
 * Watermark report supplies runId and must declare matching exportArchiveHash;
 * truncated/rewritten caller loadedByTable is rejected.
 */
export async function runVerifyReads(options?: {
  cwd?: string;
  etlReportPath?: string;
  databaseUrl?: string;
  exportDir?: string;
  catalogPath?: string;
  parityPath?: string;
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

  // R2-C03: bind to immutable export + catalog + parity (not report self-hash alone).
  const bound = loadBoundExportCatalogBaseline({
    cwd,
    exportDir: options?.exportDir,
    catalogPath: options?.catalogPath,
    parityPath: options?.parityPath,
    declaredExportArchiveHash: snap.exportArchiveHash,
    declaredParityHash: snap.parityHash || undefined,
    exportRelPath: snap.exportRelPath || undefined,
    parityRelPath: snap.parityRelPath || undefined,
  });
  mismatches.push(...bound.mismatches);

  // Reject truncated / rewritten caller loadedByTable when present.
  if (
    Object.keys(snap.loadedByTable).length > 0 &&
    Object.keys(bound.expectedLoadedByTable).length > 0
  ) {
    mismatches.push(
      ...diffCallerLoadedByTableAgainstParity(snap.loadedByTable, bound.expectedLoadedByTable)
    );
  }

  // Target set ALWAYS from immutable parity inventory (catalog/export expected), never
  // solely from caller-selected loadedByTable subset.
  const authorityLoaded =
    Object.keys(bound.expectedLoadedByTable).length > 0
      ? bound.expectedLoadedByTable
      : snap.loadedByTable;
  const targets = mapLoadedByTableToPgTargets(authorityLoaded);
  if (targets.length === 0) {
    return emptyReadsReport({
      mismatches: [
        ...mismatches,
        'expected table set empty: cutover-parity/catalog export inventory produced no mapped targets',
      ],
      baseline_path: bound.parityPath || snap.path,
      baseline_hash: bound.baseline_hash || '',
      exportArchiveHash: bound.exportArchiveHash || snap.exportArchiveHash,
      etl_run_id: snap.runId,
      baseline_source: bound.baseline_source || `d06-04:${snap.path}#${snap.runId || 'no-run-id'}`,
      catalog_table_count: bound.catalog_table_count,
      parity_hash: bound.parityHash,
      export_dir: bound.exportDir,
      catalog_path: bound.catalogPath,
      report_sha256: snap.report_sha256,
    });
  }

  // Fail closed if authority set is smaller than bound catalog expectation.
  if (bound.catalog_table_count > 0 && targets.length < bound.catalog_table_count) {
    mismatches.push(
      `truncated/incomplete-set: tablesTotal would be ${targets.length} < catalog_table_count ${bound.catalog_table_count}`
    );
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

  // R2-C03: integrity requires verified on-disk export archive hash (not report self-hash).
  const archiveBound =
    typeof bound.exportArchiveHash === 'string' &&
    bound.exportArchiveHash.length === 64 &&
    bound.ok;
  if (!archiveBound) {
    if (!mismatches.some((m) => /archive|parity|catalog|provenance|hash/i.test(m))) {
      mismatches.push(
        'baseline archive/provenance binding missing (exportArchiveHash must match on-disk immutable export)'
      );
    }
  }
  if (!snap.runId) {
    mismatches.push('etl_run_id empty');
  }

  const ok =
    mismatches.length === 0 &&
    tablesTotal > 0 &&
    tablesMatched === tablesTotal &&
    archiveBound &&
    snap.runId.length > 0 &&
    bound.catalog_table_count > 0 &&
    tablesTotal === bound.catalog_table_count;

  return {
    ok,
    perTableCounts,
    baselineCounts,
    mismatches,
    etl_run_id: snap.runId,
    tablesTotal,
    tablesMatched,
    // Immutable export archive digest — independent of caller-rewritable report body.
    baseline_hash: bound.baseline_hash || bound.exportArchiveHash,
    baseline_path: bound.parityPath || snap.path,
    exportArchiveHash: bound.exportArchiveHash || snap.exportArchiveHash,
    baseline_source: bound.baseline_source || `d06-04:${snap.path}#${snap.runId || 'no-run-id'}`,
    catalog_table_count: bound.catalog_table_count || tablesTotal,
    parity_hash: bound.parityHash,
    export_dir: bound.exportDir,
    catalog_path: bound.catalogPath,
    report_sha256: snap.report_sha256,
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
  /** Deployed endpoint identity (host/port/label) — R2-H02. */
  target_identity: TargetIdentity | null;
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
  /** Constraint only — must match health-reported label (R3-C03). */
  serviceLabel?: string;
  /** Constraint only — must match health-reported pid. */
  pid?: number;
  generation?: string;
  allowMissingDeploymentEnv?: boolean;
}): Promise<ArticleVerifyReport> {
  const { createHash: createHashNode } = await import('node:crypto');
  const { loadArticleBaseline } = await import('./article-baseline.ts');
  const cwd = options?.cwd ?? resolveRepoRoot();
  const baselinePath = options?.baselinePath ?? defaultArticleBaselinePath(cwd);
  if (options?.databaseUrl) process.env.DATABASE_URL = options.databaseUrl;

  const base_url = resolveVerifyBaseUrl(options?.baseUrl);

  const loaded = loadArticleBaseline(baselinePath);
  if (!loaded.ok) {
    const code =
      loaded.error && typeof loaded.error.code === 'string' && loaded.error.code.length > 0
        ? loaded.error.code
        : 'BASELINE_MISSING';
    const msg =
      loaded.error && typeof loaded.error.message === 'string'
        ? loaded.error.message
        : 'article baseline missing or unreadable';
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
      base_url,
      target_identity: null,
      error: `${code}: ${msg}`,
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
      target_identity: null,
      error: 'MISSING_BASE_URL',
    };
  }

  // R3-C03: identity from already-listening /health — not caller options alone.
  const deployed = await resolveDeployedTargetIdentity(base_url, {
    expectServiceLabel: options?.serviceLabel,
    expectPid: options?.pid,
    expectGeneration: options?.generation,
    allowMissingDeploymentEnv: options?.allowMissingDeploymentEnv,
  });
  const target_identity = deployed.identity;
  if (!target_identity || target_identity.identity_source !== 'health') {
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
      target_identity: null,
      error:
        deployed.error ??
        'MISSING_TARGET_IDENTITY: deployed /health must report pid of a pre-existing listener',
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
      target_identity,
      error: `UNREACHABLE_BASE_URL: ${msg}`,
    };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHashNode('sha256').update(buf).digest('hex');
  const byteLength = buf.byteLength;
  const match =
    res.status === 200 &&
    byteLength > 0 &&
    sha256 === baselineSha256 &&
    byteLength === baselineByteLength;

  return {
    ok:
      match &&
      target_identity !== null &&
      target_identity.identity_source === 'health' &&
      typeof target_identity.pid === 'number',
    status: res.status,
    sha256,
    byteLength,
    baselineSha256,
    baselineByteLength,
    shareToken,
    match,
    transport: 'network',
    base_url,
    target_identity,
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
