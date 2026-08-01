/**
 * D06-03 — operator-side Convex fence client.
 *
 * freeze / quiet-check / coverage scan / fence_armed queries.
 * Enforcement remains the deployment env var HOLO_MIGRATION_READ_ONLY.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';
import { resolveRepoRoot } from '../config/secrets.ts';

export const MIGRATION_READ_ONLY_ENV = 'HOLO_MIGRATION_READ_ONLY';

// anyApi is an open proxy; cast the whole chain through unknown for strict TS.
const auditApi = (anyApi as any).migrationFence.audit as {
  recordFenceArmed: FunctionReference<'mutation'>;
  recordWriteAttempt: FunctionReference<'mutation'>;
  latestFenceArmed: FunctionReference<'query'>;
  countAttemptsInWindow: FunctionReference<'query'>;
};

const docsCreate = (anyApi as any).documents.mutations.create as FunctionReference<'mutation'>;
const subsAdd = (anyApi as any).subscriptions.mutations.add as FunctionReference<'mutation'>;

export type FreezeReport = {
  ok: boolean;
  fence_armed_at: number;
  env: string;
  env_value: string;
  reason: string | null;
  audit_id: string | null;
  report_path: string;
};

export type QuietCheckReport = {
  ok: boolean;
  acceptedWriteCount: number;
  rejectedWriteCount: number;
  windowSeconds: number;
  sinceMs: number;
  untilMs: number;
  /**
   * Live fence observations from real fenced write paths (not synthetic audit inserts).
   * Primary proof that the fence rejects writes during the quiet window.
   */
  probes: Array<{ surface: string; rejected: boolean; message: string }>;
  /**
   * Oracle honesty:
   * - audit: rejectedWriteCount comes from independent migrationFenceAudit rows
   * - live_probes: audit had no rejected rows; count is live probe rejections only
   * - mixed: audit rows present and live probes also observed
   */
  oracle: 'audit' | 'live_probes' | 'mixed';
  /** Independent audit accepted count before any quiet-check self-record. */
  auditAcceptedWriteCount: number;
  /** Independent audit rejected count before any quiet-check self-record. */
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
 * Arm the durable write fence:
 * 1. Record fence_armed_at (epoch-ms) via unfenced audit mutation
 * 2. `npx convex env set HOLO_MIGRATION_READ_ONLY 1`
 * 3. FAIL CLOSED unless getMigrationReadOnlyEnv() confirms '1'|'true'
 * 4. Persist freeze-report.json (prior report archived for TC-9 pairing)
 */
export async function runCutoverFreeze(options: {
  reason?: string | null;
  reportPath?: string;
  cwd?: string;
}): Promise<FreezeReport> {
  const cwd = options.cwd ?? resolveRepoRoot();
  const reportPath = options.reportPath ?? defaultFreezeReportPath(cwd);
  const reason = options.reason ?? null;
  const fence_armed_at = Date.now();

  const client = createCutoverConvexClient();
  let audit_id: string | null = null;
  try {
    const res = (await client.mutation(auditApi.recordFenceArmed, {
      fenceArmedAtMs: fence_armed_at,
      reason: reason ?? undefined,
    })) as { id?: string; fenceArmedAtMs?: number };
    audit_id = res?.id != null ? String(res.id) : null;
  } catch (err) {
    // Schema may not be pushed yet — still set env; report records failure detail
    audit_id = null;
    const msg = err instanceof Error ? err.message : String(err);
    if (!/Could not find|not found|migrationFence/i.test(msg)) {
      throw err;
    }
  }

  const setRes = convexEnv('set', MIGRATION_READ_ONLY_ENV, '1', cwd);
  if (setRes.status !== 0) {
    throw new Error(
      `convex env set ${MIGRATION_READ_ONLY_ENV}=1 failed: ${setRes.stderr || setRes.stdout}`
    );
  }

  // FAIL CLOSED: must observe durable '1'|'true' via convex env get — never soft-confirm
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

  archiveFreezeReportIfPresent(reportPath);

  const report: FreezeReport = {
    ok: true,
    fence_armed_at,
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

/**
 * Quiet interval check (oracle honesty):
 * 1. Snapshot independent audit rows first (from prior fenced attempts, e.g. AC-1/AC-2)
 * 2. Invoke real fenced write paths and observe rejection in-process (primary proof)
 * 3. Do NOT self-seed audit solely to manufacture rejectedWriteCount
 * 4. ok iff no accepted writes and at least one rejection (audit and/or live probes)
 */
export async function runQuietCheck(options: {
  windowSeconds?: number;
  reportPath?: string;
  cwd?: string;
}): Promise<QuietCheckReport> {
  const cwd = options.cwd ?? resolveRepoRoot();
  const windowSeconds = options.windowSeconds ?? 30;
  const reportPath = options.reportPath ?? defaultQuietCheckReportPath(cwd);
  const untilMs = Date.now();
  const sinceMs = untilMs - windowSeconds * 1000;

  const client = createCutoverConvexClient();
  const probes: QuietCheckReport['probes'] = [];

  // Independent audit snapshot BEFORE any quiet-check side effects
  let auditAcceptedWriteCount = 0;
  let auditRejectedWriteCount = 0;
  let auditQueryOk = false;
  try {
    const counts = (await client.query(auditApi.countAttemptsInWindow, {
      sinceMs,
      untilMs,
    })) as { acceptedWriteCount: number; rejectedWriteCount: number };
    auditAcceptedWriteCount = counts.acceptedWriteCount;
    auditRejectedWriteCount = counts.rejectedWriteCount;
    auditQueryOk = true;
  } catch {
    auditQueryOk = false;
  }

  // Live probe 1: documents.create mutation (real fenced path)
  try {
    await client.mutation(docsCreate, {
      title: `s29-quiet-probe-${untilMs}`,
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
      identifier: `s29-quiet-${untilMs}`,
      name: `s29-quiet-${untilMs}`,
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

  const liveRejected = probes.filter((p) => p.rejected).length;
  const liveAccepted = probes.filter((p) => !p.rejected).length;

  // Prefer independent audit rejections; fall back to live probe observations.
  // Never invent counts via self-written audit rows.
  let acceptedWriteCount = auditQueryOk ? auditAcceptedWriteCount : liveAccepted;
  let rejectedWriteCount = auditQueryOk ? auditRejectedWriteCount : liveRejected;
  let oracle: QuietCheckReport['oracle'] = auditQueryOk ? 'audit' : 'live_probes';

  if (auditQueryOk && auditRejectedWriteCount === 0 && liveRejected > 0) {
    // Independent audit empty in window — live probes prove fence (not circular self-seed)
    rejectedWriteCount = liveRejected;
    oracle = 'live_probes';
  } else if (auditQueryOk && auditRejectedWriteCount > 0 && liveRejected > 0) {
    oracle = 'mixed';
    // acceptedWriteCount stays on audit; any live acceptance is a hard fail signal
    if (liveAccepted > 0) acceptedWriteCount = Math.max(acceptedWriteCount, liveAccepted);
  }

  // Any live acceptance means the fence is not holding
  if (liveAccepted > 0) {
    acceptedWriteCount = Math.max(acceptedWriteCount, liveAccepted);
  }

  const report: QuietCheckReport = {
    ok: acceptedWriteCount === 0 && rejectedWriteCount > 0,
    acceptedWriteCount,
    rejectedWriteCount,
    windowSeconds,
    sinceMs,
    untilMs,
    probes,
    oracle,
    auditAcceptedWriteCount,
    auditRejectedWriteCount,
    report_path: reportPath,
  };
  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
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
    `  fence_armed_at:  ${r.fence_armed_at}`,
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
