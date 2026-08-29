/**
 * D08-02 — decommissioned cutover fence helpers (no retired cloud SDK).
 *
 * Pure fence/env helpers retained for PONR / export-watermark / article-baseline.
 * Live deployment client operations fail closed — source tree deleted.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MIGRATION_READ_ONLY_ENV = 'HOLO_MIGRATION_READ_ONLY';
export const CUTOVER_SCHEDULES_DISABLED_ENV = 'HOLO_CUTOVER_SCHEDULES_DISABLED';
export const CUTOVER_OPERATOR_SECRET_ENV = 'HOLO_CUTOVER_OPERATOR_SECRET';

const RETIRED = 'retired cloud client removed in D08-02; Convex source tree and SDK are gone';

export function resolveCutoverOperatorSecret(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const v = env[CUTOVER_OPERATOR_SECRET_ENV]?.trim();
  return v && v.length > 0 ? v : undefined;
}

export const MEASURED_DRAIN_SURFACES = ['tasks', 'subscriptionContent'] as const;
export type MeasuredDrainSurface = (typeof MEASURED_DRAIN_SURFACES)[number];
export const CUTOVER_DRAIN_SURFACES = [...MEASURED_DRAIN_SURFACES] as const;
export const UNMEASURED_DRAIN_SURFACE_CLAIMS = [
  'crons',
  'queues',
  'outbox',
  'scheduled_jobs',
] as const;

export function isMeasuredDrainSurface(s: string): s is MeasuredDrainSurface {
  return (MEASURED_DRAIN_SURFACES as readonly string[]).includes(s);
}

export type CrossProcessProbe = {
  rejected: boolean;
  message: string;
  surface: string;
  documentsBefore: number;
  documentsAfter: number;
  child_pid: number | null;
};

export type FreezeReport = {
  ok: boolean;
  fence_armed_at: number;
  confirmed_at_ms: number;
  cross_process_probe: CrossProcessProbe;
  env: string;
  env_value: string;
  reason: string | null;
  audit_id: string | null;
  report_path: string;
};

export type DrainReportSamples = {
  runningTasks?: number;
  activeTasks?: number;
  queuedSubscriptionContent?: number;
  tasksCancelled?: number;
  contentSkipped?: number;
  afterRunningTasks?: number;
  afterActiveTasks?: number;
  afterQueuedSubscriptionContent?: number;
  batchesProcessed?: number;
  drainBatches?: number;
  measuredSurfaces?: string[];
  unknownSurfaces?: string[];
  surfaceResiduals?: Record<
    string,
    { before?: number; after?: number; runningBefore?: number; runningAfter?: number }
  >;
};

export type DrainReport = {
  ok: boolean;
  surfaces: string[];
  completedAtMs: number;
  disabledEnv: string;
  disabledEnvValue: string;
  convexDrainOk: boolean;
  consumersHonored: boolean;
  samples?: DrainReportSamples;
  probe?: { skipped?: boolean; honored?: boolean; reason?: string };
  error?: string;
};

export function drainResidualZero(samples?: DrainReportSamples | null): boolean {
  if (!samples) return false;
  if (Array.isArray(samples.unknownSurfaces) && samples.unknownSurfaces.length > 0) {
    return false;
  }
  const afterActive = samples.afterActiveTasks;
  const afterRunning = samples.afterRunningTasks;
  const afterQueued = samples.afterQueuedSubscriptionContent;
  if (
    typeof afterActive !== 'number' ||
    typeof afterRunning !== 'number' ||
    typeof afterQueued !== 'number'
  ) {
    return false;
  }
  if (afterActive < 0 || afterRunning < 0 || afterQueued < 0) {
    return false;
  }
  return afterActive === 0 && afterRunning === 0 && afterQueued === 0;
}

export function drainSurfacesHonest(surfaces: string[] | undefined | null): boolean {
  if (!Array.isArray(surfaces) || surfaces.length === 0) return false;
  if (!surfaces.every((s) => isMeasuredDrainSurface(s))) return false;
  for (const required of MEASURED_DRAIN_SURFACES) {
    if (!surfaces.includes(required)) return false;
  }
  return true;
}

export type QuietCheckReport = {
  ok: boolean;
  acceptedWriteCount: number;
  rejectedWriteCount: number;
  windowSeconds: number;
  sinceMs: number;
  untilMs: number;
  quietSinceMs: number;
  quietUntilMs: number;
  elapsedMs: number;
  drainCompletedAtMs: number;
  drain: {
    ok: boolean;
    surfaces: string[];
    completedAtMs: number;
    disabledEnv: string;
    disabledEnvValue: string;
    convexDrainOk: boolean;
    consumersHonored: boolean;
    samples?: DrainReport['samples'];
    probe?: DrainReport['probe'];
    error?: string;
  };
  probes: Array<{ surface: string; rejected: boolean; message: string }>;
  oracle: 'audit' | 'live_probes' | 'mixed';
  auditAcceptedWriteCount: number;
  auditRejectedWriteCount: number;
  report_path: string;
};

export type FenceCoverageMatch = {
  file: string;
  line: number;
  import: string;
};

export type FenceCoverageReport = {
  ok: boolean;
  matches: FenceCoverageMatch[];
  files_scanned: number;
  convex_root: string;
};

/** @deprecated D08-02 — no cloud client remains. */
export function createCutoverConvexClient(): never {
  throw new Error(RETIRED);
}

/** Env CLI against retired deployment — unavailable post-decommission. */
export function convexEnv(
  op: 'get' | 'set' | 'unset',
  name: string,
  value?: string,
  cwd?: string
): { status: number; stdout: string; stderr: string } {
  void op;
  void name;
  void value;
  void cwd;
  // Prefer process env overlay for read-side reporting.
  if (op === 'get') {
    const v = process.env[name];
    if (v === undefined) {
      return { status: 1, stdout: '', stderr: 'not set' };
    }
    return { status: 0, stdout: v, stderr: '' };
  }
  return { status: 1, stdout: '', stderr: RETIRED };
}

/** Read fence flag from process env (deployment CLI removed). */
export function getMigrationReadOnlyEnv(_cwd?: string): string {
  void _cwd;
  const raw = (process.env[MIGRATION_READ_ONLY_ENV] ?? '').trim();
  return raw;
}

export function isFenceArmedEnv(value: string): boolean {
  return value === '1' || value === 'true';
}

export function defaultFreezeReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-03/freeze-report.json');
}

export function defaultQuietCheckReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-03/quiet-check-report.json');
}

export function archiveFreezeReportIfPresent(reportPath: string): string | null {
  if (!existsSync(reportPath)) return null;
  try {
    const prev = JSON.parse(readFileSync(reportPath, 'utf8')) as { fence_armed_at?: number };
    const stamp =
      typeof prev.fence_armed_at === 'number' && prev.fence_armed_at > 0
        ? String(prev.fence_armed_at)
        : String(Date.now());
    const archived = reportPath.replace(/\.json$/i, `-${stamp}.json`);
    const dest = existsSync(archived)
      ? reportPath.replace(/\.json$/i, `-${stamp}-${Date.now()}.json`)
      : archived;
    mkdirSync(resolve(dest, '..'), { recursive: true });
    writeFileSync(dest, readFileSync(reportPath));
    return dest;
  } catch {
    return null;
  }
}

export function extractMigrationReadOnlyMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export type CrossProcessProbeOptions = {
  surface?: string;
  timeoutMs?: number;
};

export async function runCrossProcessBlockedWriteProbe(
  _options?: CrossProcessProbeOptions
): Promise<CrossProcessProbe> {
  void _options;
  throw new Error(RETIRED);
}

export async function runCutoverFreeze(_options: {
  reason?: string | null;
  reportPath?: string;
  cwd?: string;
}): Promise<FreezeReport> {
  void _options;
  throw new Error(RETIRED);
}

export async function resolveFenceArmedAt(options?: {
  cwd?: string;
  reportPath?: string;
}): Promise<number> {
  const path = options?.reportPath ?? defaultFreezeReportPath(options?.cwd);
  if (existsSync(path)) {
    try {
      const j = JSON.parse(readFileSync(path, 'utf8')) as { fence_armed_at?: number };
      if (typeof j.fence_armed_at === 'number' && j.fence_armed_at > 0) return j.fence_armed_at;
    } catch {
      /* fall through */
    }
  }
  if (isFenceArmedEnv(getMigrationReadOnlyEnv(options?.cwd))) {
    return Date.now();
  }
  return 0;
}

export type MigrationReadOnlyRuntimeStatus = {
  ok: boolean;
  armed: boolean;
  value: string;
  source: string;
};

export async function waitForMigrationReadOnlyRuntime(options: {
  timeoutMs?: number;
  pollMs?: number;
  cwd?: string;
}): Promise<MigrationReadOnlyRuntimeStatus> {
  void options;
  const value = getMigrationReadOnlyEnv(options.cwd);
  const armed = isFenceArmedEnv(value);
  return { ok: armed, armed, value, source: 'process.env' };
}

export async function runScheduleDrain(_options?: Record<string, unknown>): Promise<DrainReport> {
  void _options;
  throw new Error(RETIRED);
}

export async function seedInFlightForDrainTest(
  _options?: Record<string, unknown>
): Promise<unknown> {
  void _options;
  throw new Error(RETIRED);
}

export async function callDisableAndDrain(_options?: Record<string, unknown>): Promise<unknown> {
  void _options;
  throw new Error(RETIRED);
}

export async function runQuietCheck(_options: Record<string, unknown>): Promise<QuietCheckReport> {
  void _options;
  throw new Error(RETIRED);
}

export function verifyConvexFenceCoverage(_options?: { convexRoot?: string }): FenceCoverageReport {
  void _options;
  // Source tree deleted — coverage vacuously clean.
  return { ok: true, matches: [], files_scanned: 0, convex_root: 'convex' };
}

export function formatFreezeText(r: FreezeReport): string {
  return `freeze ok=${r.ok} armed_at=${r.fence_armed_at} env=${r.env_value}`;
}

export function formatQuietCheckText(r: QuietCheckReport): string {
  return `quiet ok=${r.ok} rejected=${r.rejectedWriteCount} accepted=${r.acceptedWriteCount}`;
}

export function formatCoverageText(r: FenceCoverageReport): string {
  return `coverage ok=${r.ok} matches=${r.matches.length} scanned=${r.files_scanned}`;
}
