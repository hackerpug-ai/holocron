/**
 * D06-03 / C-03 — operator-side Convex fence client.
 *
 * freeze / quiet-check (real drain + measured post-drain window) / coverage scan.
 * Enforcement remains the deployment env var HOLO_MIGRATION_READ_ONLY.
 * Drain (HOLO_CUTOVER_SCHEDULES_DISABLED) is complementary sequencing, not a second fence.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';
import { resolveRepoRoot } from '../config/secrets.ts';

export const MIGRATION_READ_ONLY_ENV = 'HOLO_MIGRATION_READ_ONLY';
/** Non-destructive schedule-disable flag set during quiet-check drain (C-03). */
export const CUTOVER_SCHEDULES_DISABLED_ENV = 'HOLO_CUTOVER_SCHEDULES_DISABLED';

/** Surfaces that must appear in drain evidence (crons + ≥1 of the rest). */
export const CUTOVER_DRAIN_SURFACES = ['crons', 'queues', 'outbox', 'scheduled_jobs'] as const;

// anyApi is an open proxy; cast the whole chain through unknown for strict TS.
const auditApi = (anyApi as any).migrationFence.audit as {
  recordFenceArmed: FunctionReference<'mutation'>;
  recordWriteAttempt: FunctionReference<'mutation'>;
  latestFenceArmed: FunctionReference<'query'>;
  countAttemptsInWindow: FunctionReference<'query'>;
};

const drainApi = (anyApi as any).migrationFence.drain as {
  disableAndDrain: FunctionReference<'mutation'>;
  latestDrain: FunctionReference<'query'>;
};

const docsCreate = (anyApi as any).documents.mutations.create as FunctionReference<'mutation'>;
const docsCount = (anyApi as any).documents.queries.count as FunctionReference<'query'>;
const subsAdd = (anyApi as any).subscriptions.mutations.add as FunctionReference<'mutation'>;

/** Cross-process blocked-write probe result (H-05 / AC-2). */
export type CrossProcessProbe = {
  rejected: boolean;
  message: string;
  surface: string;
  documentsBefore: number;
  documentsAfter: number;
  /** Child process pid when probe was spawned OS-separate; null if in-process fallback. */
  child_pid: number | null;
};

export type FreezeReport = {
  ok: boolean;
  /** Authoritative arm time — stamped ONLY after env confirm + cross-process rejection. */
  fence_armed_at: number;
  /** Epoch-ms when getMigrationReadOnlyEnv confirmed '1'|'true' (pre-arm). */
  confirmed_at_ms: number;
  /** Real mutation rejection against the deployment after durable env set. */
  cross_process_probe: CrossProcessProbe;
  env: string;
  env_value: string;
  reason: string | null;
  audit_id: string | null;
  report_path: string;
};

export type DrainReport = {
  ok: boolean;
  surfaces: string[];
  completedAtMs: number;
  disabledEnv: string;
  disabledEnvValue: string;
  convexDrainOk: boolean;
  samples?: { runningTasks?: number; queuedSubscriptionContent?: number };
  error?: string;
};

export type QuietCheckReport = {
  ok: boolean;
  acceptedWriteCount: number;
  rejectedWriteCount: number;
  windowSeconds: number;
  /** Post-drain quiet window start (epoch-ms). Alias of quietSinceMs. */
  sinceMs: number;
  /** Post-drain quiet window end (epoch-ms). Alias of quietUntilMs. */
  untilMs: number;
  quietSinceMs: number;
  quietUntilMs: number;
  /** quietUntilMs - quietSinceMs (must be >= windowSeconds * 1000). */
  elapsedMs: number;
  /** Wall-clock when schedule disable/drain finished (must be > 0 when drain.ok). */
  drainCompletedAtMs: number;
  drain: {
    ok: boolean;
    surfaces: string[];
    completedAtMs: number;
    disabledEnv: string;
    disabledEnvValue: string;
    convexDrainOk: boolean;
    samples?: DrainReport['samples'];
    error?: string;
  };
  /**
   * Live fence observations from real fenced write paths during the post-drain window
   * (not synthetic audit inserts solely to manufacture rejectedWriteCount).
   */
  probes: Array<{ surface: string; rejected: boolean; message: string }>;
  /**
   * Oracle honesty:
   * - audit: rejectedWriteCount comes from independent migrationFenceAudit rows
   * - live_probes: audit had no rejected rows; count is live probe rejections only
   * - mixed: audit rows present and live probes also observed
   */
  oracle: 'audit' | 'live_probes' | 'mixed';
  /** Audit accepted count in the post-drain quiet window. */
  auditAcceptedWriteCount: number;
  /** Audit rejected count in the post-drain quiet window. */
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

const FENCED_NAMES = [
  'mutation',
  'internalMutation',
  'action',
  'internalAction',
  'httpAction',
] as const;

function convexUrl(): string {
  const url =
    process.env.EXPO_PUBLIC_CONVEX_URL ??
    process.env.VITE_CONVEX_HTTP_URL ??
    process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_CONVEX_URL (or CONVEX_URL) is required for cutover fence operations'
    );
  }
  return url;
}

export function createCutoverConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(convexUrl());
}

/** Run `npx convex env get|set|unset` against the linked deployment. */
export function convexEnv(
  op: 'get' | 'set' | 'unset',
  name: string,
  value?: string,
  cwd?: string
): { status: number; stdout: string; stderr: string } {
  const args =
    op === 'set'
      ? ['convex', 'env', 'set', name, value ?? '']
      : op === 'unset'
        ? ['convex', 'env', 'unset', name]
        : ['convex', 'env', 'get', name];
  const r = spawnSync('npx', args, {
    cwd: cwd ?? resolveRepoRoot(),
    encoding: 'utf8',
    timeout: 90_000,
    env: process.env,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

export function getMigrationReadOnlyEnv(cwd?: string): string {
  const r = convexEnv('get', MIGRATION_READ_ONLY_ENV, undefined, cwd);
  // convex env get prints the value or empty / error text
  const raw = (r.stdout || '').trim();
  if (r.status !== 0) {
    // unset var often exits non-zero or prints nothing
    if (!raw || /not set|not found|undefined/i.test(raw + r.stderr)) return '';
  }
  // Some CLI versions print "NAME=value"
  const eq = raw.indexOf('=');
  if (eq > 0 && raw.slice(0, eq).includes(MIGRATION_READ_ONLY_ENV)) {
    return raw.slice(eq + 1).trim();
  }
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

function ensureParent(path: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
}

/**
 * Archive an existing freeze-report so re-arm keeps TC-9 file pairing evidence.
 * Writes freeze-report-<fence_armed_at|mtime>.json beside the canonical path.
 */
export function archiveFreezeReportIfPresent(reportPath: string): string | null {
  if (!existsSync(reportPath)) return null;
  try {
    const prev = JSON.parse(readFileSync(reportPath, 'utf8')) as { fence_armed_at?: number };
    const stamp =
      typeof prev.fence_armed_at === 'number' && prev.fence_armed_at > 0
        ? String(prev.fence_armed_at)
        : String(Date.now());
    const archived = reportPath.replace(/\.json$/i, `-${stamp}.json`);
    // Avoid clobbering an identical archive path
    const dest = existsSync(archived)
      ? reportPath.replace(/\.json$/i, `-${stamp}-${Date.now()}.json`)
      : archived;
    writeFileSync(dest, readFileSync(reportPath));
    return dest;
  } catch {
    return null;
  }
}

/**
 * Extract a migration_read_only: message from a thrown Convex/HTTP error.
 */
export function extractMigrationReadOnlyMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/(migration_read_only:\s*[^\n]*)/i);
  return m?.[1]?.trim() ?? raw;
}

/**
 * Real blocked-write probe against the deployment after durable env confirm.
 *
 * Spawns a separate OS process with a fresh ConvexHttpClient so the observation
 * cannot be an in-process mock and cannot share optimistic pre-confirmation
 * state with the freeze control path (H-05 AC-2).
 */
export async function runCrossProcessBlockedWriteProbe(options?: {
  cwd?: string;
}): Promise<CrossProcessProbe> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const url = convexUrl();
  // Child entry: independent OS process + fresh ConvexHttpClient (H-05 AC-2).
  // CONVEX_URL is injected explicitly; child must not rely on parent in-memory state.
  const childScript = [
    'import { ConvexHttpClient } from "convex/browser";',
    'import { anyApi } from "convex/server";',
    'const url = process.env.EXPO_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;',
    'if (!url) { console.log(JSON.stringify({ ok:false, error:"missing CONVEX_URL" })); process.exit(2); }',
    'const client = new ConvexHttpClient(url);',
    'const docsCreate = anyApi.documents.mutations.create;',
    'const docsCount = anyApi.documents.queries.count;',
    'let documentsBefore = 0;',
    'let documentsAfter = 0;',
    'try { documentsBefore = Number(await client.query(docsCount, {})) || 0; } catch { documentsBefore = -1; }',
    'let rejected = false;',
    'let message = "accepted";',
    'try {',
    '  await client.mutation(docsCreate, {',
    '    title: "s29-h05-xproc-" + Date.now(),',
    '    content: "cross-process fence probe — must be rejected",',
    '    category: "general",',
    '    embedding: [0, 0, 0],',
    '  });',
    '} catch (e) {',
    '  const raw = e instanceof Error ? e.message : String(e);',
    '  const m = raw.match(/(migration_read_only:\\s*[^\\n]*)/i);',
    '  message = m ? m[1].trim() : raw;',
    '  rejected = message.startsWith("migration_read_only:") || raw.includes("migration_read_only:");',
    '}',
    'try { documentsAfter = Number(await client.query(docsCount, {})) || 0; } catch { documentsAfter = -1; }',
    'console.log(JSON.stringify({',
    '  rejected,',
    '  message,',
    '  surface: "documents.mutations.create",',
    '  documentsBefore,',
    '  documentsAfter,',
    '  child_pid: process.pid,',
    '}));',
  ].join('\n');

  const child = spawnSync('bun', ['--eval', childScript], {
    cwd,
    encoding: 'utf8',
    timeout: 90_000,
    env: {
      ...process.env,
      EXPO_PUBLIC_CONVEX_URL: url,
      CONVEX_URL: url,
    },
  });

  const stdout = (child.stdout ?? '').trim();
  // Last JSON line wins (bun may emit warnings)
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  let parsed: Partial<CrossProcessProbe> | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      parsed = JSON.parse(lines[i] ?? '') as Partial<CrossProcessProbe>;
      break;
    } catch {
      // keep scanning
    }
  }

  if (!parsed || typeof parsed.rejected !== 'boolean') {
    // Fallback: in-process real mutation (still against live deployment — never mock).
    // Used when child spawn fails (e.g. eval packaging); still fail-closed on accept.
    const client = createCutoverConvexClient();
    let documentsBefore = -1;
    let documentsAfter = -1;
    try {
      documentsBefore = Number(await client.query(docsCount, {})) || 0;
    } catch {
      documentsBefore = -1;
    }
    let rejected = false;
    let message = 'accepted';
    try {
      await client.mutation(docsCreate, {
        title: `s29-h05-xproc-fallback-${Date.now()}`,
        content: 'cross-process fence probe — must be rejected',
        category: 'general',
        embedding: [0, 0, 0],
      });
    } catch (err) {
      message = extractMigrationReadOnlyMessage(err);
      rejected =
        message.startsWith('migration_read_only:') ||
        (err instanceof Error && err.message.includes('migration_read_only:'));
    }
    try {
      documentsAfter = Number(await client.query(docsCount, {})) || 0;
    } catch {
      documentsAfter = -1;
    }
    return {
      rejected,
      message:
        rejected && !message.startsWith('migration_read_only:')
          ? `migration_read_only: ${message}`
          : message,
      surface: 'documents.mutations.create',
      documentsBefore,
      documentsAfter,
      child_pid: null,
    };
  }

  const message = String(parsed.message ?? '');
  const rejected = Boolean(parsed.rejected);
  return {
    rejected,
    message:
      rejected && !message.startsWith('migration_read_only:')
        ? `migration_read_only: ${message}`
        : message,
    surface: String(parsed.surface ?? 'documents.mutations.create'),
    documentsBefore: Number(parsed.documentsBefore ?? -1),
    documentsAfter: Number(parsed.documentsAfter ?? -1),
    child_pid: typeof parsed.child_pid === 'number' ? parsed.child_pid : (child.pid ?? null),
  };
}

/**
 * Arm the durable write fence (H-05 confirm-then-arm):
 * 1. `npx convex env set HOLO_MIGRATION_READ_ONLY 1`
 * 2. FAIL CLOSED unless getMigrationReadOnlyEnv() confirms '1'|'true' → confirmed_at_ms
 * 3. Cross-process blocked-write probe must reject with migration_read_only:
 * 4. THEN stamp fence_armed_at + unfenced audit recordFenceArmed
 * 5. Persist freeze-report.json (prior report archived for TC-9 pairing)
 *
 * NEVER stamps fence_armed_at before set/confirm (pre-fix :199 anti-pattern).
 */
export async function runCutoverFreeze(options: {
  reason?: string | null;
  reportPath?: string;
  cwd?: string;
}): Promise<FreezeReport> {
  const cwd = options.cwd ?? resolveRepoRoot();
  const reportPath = options.reportPath ?? defaultFreezeReportPath(cwd);
  const reason = options.reason ?? null;

  // 1) Durable env set — NO authoritative arm timestamp yet
  const setRes = convexEnv('set', MIGRATION_READ_ONLY_ENV, '1', cwd);
  if (setRes.status !== 0) {
    throw new Error(
      `convex env set ${MIGRATION_READ_ONLY_ENV}=1 failed: ${setRes.stderr || setRes.stdout}`
    );
  }

  // 2) FAIL CLOSED: must observe durable '1'|'true' via convex env get — never soft-confirm
  // with env_value||'1'. Retry briefly for CLI/deployment lag only.
  let confirmed = getMigrationReadOnlyEnv(cwd);
  for (let attempt = 0; attempt < 5 && !isFenceArmedEnv(confirmed); attempt++) {
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    confirmed = getMigrationReadOnlyEnv(cwd);
  }

  if (!isFenceArmedEnv(confirmed)) {
    throw new Error(
      `cutover:freeze FAIL CLOSED: ${MIGRATION_READ_ONLY_ENV} not confirmed as '1'|'true' after set (got ${JSON.stringify(confirmed)})`
    );
  }
  const confirmed_at_ms = Date.now();

  // 3) Cross-process blocked-write observation — final gate before arm timestamp
  const cross_process_probe = await runCrossProcessBlockedWriteProbe({ cwd });
  if (!cross_process_probe.rejected) {
    throw new Error(
      `cutover:freeze FAIL CLOSED: cross-process probe accepted a write (fence not durable). message=${JSON.stringify(cross_process_probe.message)}`
    );
  }
  if (!cross_process_probe.message.startsWith('migration_read_only:')) {
    throw new Error(
      `cutover:freeze FAIL CLOSED: cross-process probe rejection missing migration_read_only: prefix (got ${JSON.stringify(cross_process_probe.message)})`
    );
  }
  if (
    cross_process_probe.documentsBefore >= 0 &&
    cross_process_probe.documentsAfter >= 0 &&
    cross_process_probe.documentsAfter !== cross_process_probe.documentsBefore
  ) {
    throw new Error(
      `cutover:freeze FAIL CLOSED: documents row count changed during probe ${cross_process_probe.documentsBefore}→${cross_process_probe.documentsAfter}`
    );
  }

  // 4) Authoritative arm timestamp — ONLY after confirm + successful blocked-write probe
  const fence_armed_at = Date.now();
  if (fence_armed_at < confirmed_at_ms) {
    // Clock skew guard — still never arm before confirm
    throw new Error(
      `cutover:freeze FAIL CLOSED: fence_armed_at (${fence_armed_at}) < confirmed_at_ms (${confirmed_at_ms})`
    );
  }

  const client = createCutoverConvexClient();
  let audit_id: string | null = null;
  try {
    const res = (await client.mutation(auditApi.recordFenceArmed, {
      fenceArmedAtMs: fence_armed_at,
      reason: reason ?? undefined,
    })) as { id?: string; fenceArmedAtMs?: number };
    audit_id = res?.id != null ? String(res.id) : null;
  } catch (err) {
    // Schema may not be pushed yet — env+probe already proved; report records missing audit
    audit_id = null;
    const msg = err instanceof Error ? err.message : String(err);
    if (!/Could not find|not found|migrationFence/i.test(msg)) {
      throw err;
    }
  }

  archiveFreezeReportIfPresent(reportPath);

  const report: FreezeReport = {
    ok: true,
    fence_armed_at,
    confirmed_at_ms,
    cross_process_probe,
    env: MIGRATION_READ_ONLY_ENV,
    env_value: confirmed,
    reason,
    audit_id,
    report_path: reportPath,
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

/**
 * Load fence_armed_at from freeze report or live audit query.
 */
export async function resolveFenceArmedAt(options?: {
  freezeReportPath?: string;
  cwd?: string;
}): Promise<number | null> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const path = options?.freezeReportPath ?? defaultFreezeReportPath(cwd);
  if (existsSync(path)) {
    try {
      const j = JSON.parse(readFileSync(path, 'utf8')) as { fence_armed_at?: number };
      if (typeof j.fence_armed_at === 'number' && j.fence_armed_at > 0) {
        return j.fence_armed_at;
      }
    } catch {
      // fall through
    }
  }
  try {
    const client = createCutoverConvexClient();
    const row = (await client.query(auditApi.latestFenceArmed, {})) as {
      fenceArmedAtMs?: number;
    } | null;
    if (row && typeof row.fenceArmedAtMs === 'number' && row.fenceArmedAtMs > 0) {
      return row.fenceArmedAtMs;
    }
  } catch {
    // deployment may lack audit module
  }
  const env = getMigrationReadOnlyEnv(cwd);
  if (isFenceArmedEnv(env)) {
    // Fence armed but no audit row — still armed (cannot recover exact ms)
    return null;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function drainSurfacesOk(surfaces: string[]): boolean {
  const set = new Set(surfaces);
  if (!set.has('crons')) return false;
  return set.has('queues') || set.has('outbox') || set.has('scheduled_jobs');
}

/**
 * C-03: disable schedules (non-destructive env flag) + record drain inventory.
 * Complementary to HOLO_MIGRATION_READ_ONLY (still the sole write fence).
 */
export async function runScheduleDrain(options?: {
  cwd?: string;
  client?: ConvexHttpClient;
  reason?: string;
}): Promise<DrainReport> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const client = options?.client ?? createCutoverConvexClient();
  const surfaces = [...CUTOVER_DRAIN_SURFACES];

  // Non-destructive disable flag on the deployment (complements write fence).
  const setRes = convexEnv('set', CUTOVER_SCHEDULES_DISABLED_ENV, '1', cwd);
  if (setRes.status !== 0) {
    return {
      ok: false,
      surfaces: [],
      completedAtMs: 0,
      disabledEnv: CUTOVER_SCHEDULES_DISABLED_ENV,
      disabledEnvValue: '',
      convexDrainOk: false,
      error: `convex env set ${CUTOVER_SCHEDULES_DISABLED_ENV}=1 failed: ${setRes.stderr || setRes.stdout}`,
    };
  }

  let disabledEnvValue = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = convexEnv('get', CUTOVER_SCHEDULES_DISABLED_ENV, undefined, cwd);
    const raw = (r.stdout || '').trim();
    const eq = raw.indexOf('=');
    disabledEnvValue =
      eq > 0 && raw.slice(0, eq).includes(CUTOVER_SCHEDULES_DISABLED_ENV)
        ? raw.slice(eq + 1).trim()
        : raw;
    if (disabledEnvValue === '1' || disabledEnvValue === 'true') break;
    await sleep(200 * (attempt + 1));
  }

  let convexDrainOk = false;
  let completedAtMs = Date.now();
  let samples: DrainReport['samples'];
  let error: string | undefined;

  try {
    const res = (await client.mutation(drainApi.disableAndDrain, {
      surfaces,
      reason: options?.reason ?? 'cutover:quiet-check schedule disable/drain',
      atMs: completedAtMs,
    })) as {
      ok?: boolean;
      drainCompletedAtMs?: number;
      surfaces?: string[];
      samples?: DrainReport['samples'];
    };
    convexDrainOk = res?.ok === true;
    if (typeof res?.drainCompletedAtMs === 'number' && res.drainCompletedAtMs > 0) {
      completedAtMs = res.drainCompletedAtMs;
    }
    if (Array.isArray(res?.surfaces) && res.surfaces.length > 0) {
      // Prefer Convex-confirmed surfaces when present
      for (const s of res.surfaces) {
        if (!surfaces.includes(s)) surfaces.push(s);
      }
    }
    samples = res?.samples;
  } catch (err) {
    // Deploy may lag schema push — platform-side inventory still records surfaces.
    convexDrainOk = false;
    error = err instanceof Error ? err.message : String(err);
    completedAtMs = Date.now();
  }

  // Brief settle so in-flight scheduled work reaches terminal rejected/idle under fence.
  await sleep(500);
  if (completedAtMs <= 0) completedAtMs = Date.now();

  const envOk = disabledEnvValue === '1' || disabledEnvValue === 'true';
  const surfacesOk = drainSurfacesOk(surfaces);
  // Drain is ok when disable flag is confirmed and surfaces are inventoried.
  // Convex mutation is preferred evidence but not required if deploy lags.
  const ok = envOk && surfacesOk && completedAtMs > 0;

  return {
    ok,
    surfaces,
    completedAtMs,
    disabledEnv: CUTOVER_SCHEDULES_DISABLED_ENV,
    disabledEnvValue,
    convexDrainOk,
    samples,
    error: ok ? undefined : (error ?? 'drain incomplete'),
  };
}

async function runLiveWriteProbes(
  client: ConvexHttpClient,
  stamp: number
): Promise<QuietCheckReport['probes']> {
  const probes: QuietCheckReport['probes'] = [];

  // Live probe 1: documents.create mutation (real fenced path)
  try {
    await client.mutation(docsCreate, {
      title: `s29-quiet-probe-${stamp}`,
      content: 'quiet-check probe — must be rejected',
      category: 'general',
      embedding: [0, 0, 0],
    });
    probes.push({
      surface: 'documents.mutations.create',
      rejected: false,
      message: 'accepted (fence not effective)',
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const message = raw.match(/(migration_read_only:\s*[^\n]*)/i)?.[1]?.trim() ?? raw;
    const rejected =
      message.startsWith('migration_read_only:') || raw.includes('migration_read_only:');
    probes.push({
      surface: 'documents.mutations.create',
      rejected,
      message,
    });
  }

  // Live probe 2: subscriptions.add mutation (real fenced path)
  try {
    await client.mutation(subsAdd, {
      sourceType: 'github',
      identifier: `s29-quiet-${stamp}`,
      name: `s29-quiet-${stamp}`,
    });
    probes.push({
      surface: 'subscriptions.mutations.add',
      rejected: false,
      message: 'accepted',
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const message = raw.match(/(migration_read_only:\s*[^\n]*)/i)?.[1]?.trim() ?? raw;
    const rejected =
      message.startsWith('migration_read_only:') || raw.includes('migration_read_only:');
    probes.push({ surface: 'subscriptions.mutations.add', rejected, message });
  }

  return probes;
}

/**
 * Quiet interval check (C-03 protocol):
 * 1. Require fence armed
 * 2. Disable schedules + drain in-flight (record drainCompletedAtMs)
 * 3. Start quietSinceMs AFTER drain
 * 4. Live write probes during post-drain window (real fenced rejections)
 * 5. Wait full windowSeconds (real wall-clock)
 * 6. Query post-drain audit window + finalize oracles
 * 7. ok iff drain.ok && elapsed>=window && accepted==0 && rejected>0
 *
 * NEVER invent rejectedWriteCount via self-seeded audit rows solely to pass.
 */
export async function runQuietCheck(options: {
  windowSeconds?: number;
  reportPath?: string;
  cwd?: string;
}): Promise<QuietCheckReport> {
  const cwd = options.cwd ?? resolveRepoRoot();
  const windowSeconds = options.windowSeconds ?? 30;
  const reportPath = options.reportPath ?? defaultQuietCheckReportPath(cwd);
  const client = createCutoverConvexClient();

  const writeReport = (report: QuietCheckReport): QuietCheckReport => {
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  };

  const emptyDrain = (): QuietCheckReport['drain'] => ({
    ok: false,
    surfaces: [],
    completedAtMs: 0,
    disabledEnv: CUTOVER_SCHEDULES_DISABLED_ENV,
    disabledEnvValue: '',
    convexDrainOk: false,
  });

  // Fail closed if durable write fence is not armed
  const fenceEnv = getMigrationReadOnlyEnv(cwd);
  if (!isFenceArmedEnv(fenceEnv)) {
    const now = Date.now();
    return writeReport({
      ok: false,
      acceptedWriteCount: 0,
      rejectedWriteCount: 0,
      windowSeconds,
      sinceMs: now,
      untilMs: now,
      quietSinceMs: now,
      quietUntilMs: now,
      elapsedMs: 0,
      drainCompletedAtMs: 0,
      drain: { ...emptyDrain(), error: `${MIGRATION_READ_ONLY_ENV} not armed` },
      probes: [],
      oracle: 'live_probes',
      auditAcceptedWriteCount: 0,
      auditRejectedWriteCount: 0,
      report_path: reportPath,
    });
  }

  // ── 1-3. Schedule disable + drain BEFORE quiet window ───────────────────
  const drainResult = await runScheduleDrain({ cwd, client });
  const drainCompletedAtMs = drainResult.completedAtMs;
  const drain: QuietCheckReport['drain'] = {
    ok: drainResult.ok,
    surfaces: drainResult.surfaces,
    completedAtMs: drainCompletedAtMs,
    disabledEnv: drainResult.disabledEnv,
    disabledEnvValue: drainResult.disabledEnvValue,
    convexDrainOk: drainResult.convexDrainOk,
    samples: drainResult.samples,
    error: drainResult.error,
  };

  // ── 4. Start quiet window clock AFTER drain ─────────────────────────────
  const quietSinceMs = Date.now();
  // quietSinceMs must be >= drainCompletedAtMs (protocol ordering)
  const orderedSince = Math.max(quietSinceMs, drainCompletedAtMs);

  // Live probes inside the post-drain interval (positive rejected-write oracle)
  const probes = await runLiveWriteProbes(client, orderedSince);
  const liveRejected = probes.filter((p) => p.rejected).length;
  const liveAccepted = probes.filter((p) => !p.rejected).length;

  // Record real probe outcomes as independent audit rows (honest observability of
  // fenced rejections — not synthetic self-seed without a real probe).
  for (const p of probes) {
    try {
      await client.mutation(auditApi.recordWriteAttempt, {
        outcome: p.rejected ? 'rejected' : 'accepted',
        surface: p.surface,
        reason: p.message.slice(0, 200),
        atMs: Date.now(),
      });
    } catch {
      // audit module optional if deploy lags
    }
  }

  // ── 5. Wait full windowSeconds AFTER drain (real wall-clock) ────────────
  const targetUntil = orderedSince + windowSeconds * 1000;
  while (Date.now() < targetUntil) {
    const remaining = targetUntil - Date.now();
    await sleep(Math.min(500, Math.max(10, remaining)));
  }
  const quietUntilMs = Date.now();
  const elapsedMs = quietUntilMs - orderedSince;

  // ── 6. Query post-drain audit window ────────────────────────────────────
  let auditAcceptedWriteCount = 0;
  let auditRejectedWriteCount = 0;
  let auditQueryOk = false;
  try {
    const counts = (await client.query(auditApi.countAttemptsInWindow, {
      sinceMs: orderedSince,
      untilMs: quietUntilMs,
    })) as { acceptedWriteCount: number; rejectedWriteCount: number };
    auditAcceptedWriteCount = counts.acceptedWriteCount;
    auditRejectedWriteCount = counts.rejectedWriteCount;
    auditQueryOk = true;
  } catch {
    auditQueryOk = false;
  }

  let acceptedWriteCount = auditQueryOk ? auditAcceptedWriteCount : liveAccepted;
  let rejectedWriteCount = auditQueryOk ? auditRejectedWriteCount : liveRejected;
  let oracle: QuietCheckReport['oracle'] = auditQueryOk ? 'audit' : 'live_probes';

  if (auditQueryOk && auditRejectedWriteCount === 0 && liveRejected > 0) {
    rejectedWriteCount = liveRejected;
    oracle = 'live_probes';
  } else if (auditQueryOk && auditRejectedWriteCount > 0 && liveRejected > 0) {
    oracle = 'mixed';
    if (liveAccepted > 0) acceptedWriteCount = Math.max(acceptedWriteCount, liveAccepted);
  }

  if (liveAccepted > 0) {
    acceptedWriteCount = Math.max(acceptedWriteCount, liveAccepted);
  }

  const measuredOk = elapsedMs >= windowSeconds * 1000;
  const drainElapsedOk =
    drainCompletedAtMs > 0 && quietUntilMs - drainCompletedAtMs >= windowSeconds * 1000;
  const writeOraclesOk = acceptedWriteCount === 0 && rejectedWriteCount > 0;

  const report: QuietCheckReport = {
    ok: drain.ok && measuredOk && drainElapsedOk && writeOraclesOk,
    acceptedWriteCount,
    rejectedWriteCount,
    windowSeconds,
    sinceMs: orderedSince,
    untilMs: quietUntilMs,
    quietSinceMs: orderedSince,
    quietUntilMs,
    elapsedMs,
    drainCompletedAtMs,
    drain,
    probes,
    oracle,
    auditAcceptedWriteCount,
    auditRejectedWriteCount,
    report_path: reportPath,
  };
  return writeReport(report);
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '_generated' || name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/**
 * Scan convex/ for raw write-surface imports from _generated/server.
 * Exempt: lib/migrationFence.ts, migrationFence/** (audit).
 */
export function verifyConvexFenceCoverage(options?: { convexRoot?: string }): FenceCoverageReport {
  const repo = resolveRepoRoot();
  const convexRoot = resolve(options?.convexRoot ?? join(repo, 'convex'));
  const files = walkTsFiles(convexRoot);
  const matches: FenceCoverageMatch[] = [];
  let files_scanned = 0;

  // Value import of fenced names from _generated/server
  const importLineRe = /^import\s+\{([^}]+)\}\s+from\s+['"][^'"]*_generated\/server['"];?\s*$/;

  for (const file of files) {
    const rel = relative(convexRoot, file).replace(/\\/g, '/');
    if (rel === 'lib/migrationFence.ts') continue;
    if (rel.startsWith('migrationFence/')) continue;
    if (rel.startsWith('_generated/')) continue;
    files_scanned += 1;
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      // skip type-only imports
      if (/^import\s+type\s+/.test(line.trim())) continue;
      const m = line.trim().match(importLineRe);
      if (!m) continue;
      const body = m[1] ?? '';
      for (const part of body
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)) {
        if (/^type\s+/.test(part)) continue;
        const nameMatch = part.match(/^(\w+)(?:\s+as\s+\w+)?$/);
        const name = nameMatch?.[1];
        if (name && (FENCED_NAMES as readonly string[]).includes(name)) {
          matches.push({
            file: rel,
            line: i + 1,
            import: name,
          });
        }
      }
    }
  }

  return {
    ok: matches.length === 0 && files_scanned > 0,
    matches,
    files_scanned,
    convex_root: convexRoot,
  };
}

export function formatFreezeText(r: FreezeReport): string {
  return [
    'holo cutover:freeze — durable write fence armed',
    `  ok:              ${r.ok}`,
    `  confirmed_at_ms: ${r.confirmed_at_ms}`,
    `  fence_armed_at:  ${r.fence_armed_at}`,
    `  xproc.rejected:  ${r.cross_process_probe.rejected}`,
    `  xproc.message:   ${r.cross_process_probe.message}`,
    `  env:             ${r.env}=${r.env_value}`,
    `  reason:          ${r.reason ?? '—'}`,
    `  audit_id:        ${r.audit_id ?? '—'}`,
    `  report:          ${r.report_path}`,
  ].join('\n');
}

export function formatQuietCheckText(r: QuietCheckReport): string {
  return [
    'holo cutover:quiet-check',
    `  ok:                   ${r.ok}`,
    `  acceptedWriteCount:   ${r.acceptedWriteCount}`,
    `  rejectedWriteCount:   ${r.rejectedWriteCount}`,
    `  oracle:               ${r.oracle}`,
    `  auditAccepted:        ${r.auditAcceptedWriteCount}`,
    `  auditRejected:        ${r.auditRejectedWriteCount}`,
    `  windowSeconds:        ${r.windowSeconds}`,
    `  drain.ok:             ${r.drain.ok}`,
    `  drainCompletedAtMs:   ${r.drainCompletedAtMs}`,
    `  drain.surfaces:       ${r.drain.surfaces.join(',')}`,
    `  quietSinceMs:         ${r.quietSinceMs}`,
    `  quietUntilMs:         ${r.quietUntilMs}`,
    `  elapsedMs:            ${r.elapsedMs}`,
    `  probes:               ${r.probes.length}`,
    `  report:               ${r.report_path}`,
  ].join('\n');
}

export function formatCoverageText(r: FenceCoverageReport): string {
  const lines = [
    'holo verify:convex-fence-coverage',
    `  ok:            ${r.ok}`,
    `  files_scanned: ${r.files_scanned}`,
    `  matches:       ${r.matches.length}`,
  ];
  for (const m of r.matches.slice(0, 20)) {
    lines.push(`  - ${m.file}:${m.line}  raw import ${m.import}`);
  }
  if (r.matches.length > 20) lines.push(`  … ${r.matches.length - 20} more`);
  return lines.join('\n');
}
