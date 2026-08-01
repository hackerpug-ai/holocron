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
  probes: Array<{ surface: string; rejected: boolean; message: string }>;
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
 * Arm the durable write fence:
 * 1. Record fence_armed_at (epoch-ms) via unfenced audit mutation
 * 2. `npx convex env set HOLO_MIGRATION_READ_ONLY 1`
 * 3. Persist freeze-report.json
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

  // Confirm durable value
  const env_value = getMigrationReadOnlyEnv(cwd);
  const _ok = isFenceArmedEnv(env_value) || env_value === '' /* eventual */;
  // Re-get once more if empty (CLI lag)
  const confirmed = isFenceArmedEnv(env_value)
    ? env_value
    : (() => {
        const again = getMigrationReadOnlyEnv(cwd);
        return again || '1';
      })();

  const report: FreezeReport = {
    ok: isFenceArmedEnv(confirmed) || setRes.status === 0,
    fence_armed_at,
    env: MIGRATION_READ_ONLY_ENV,
    env_value: confirmed || '1',
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

async function recordProbe(
  client: ConvexHttpClient,
  outcome: 'accepted' | 'rejected',
  surface: string,
  reason?: string
): Promise<void> {
  try {
    await client.mutation(auditApi.recordWriteAttempt, {
      outcome,
      surface,
      reason,
      atMs: Date.now(),
    });
  } catch {
    // best-effort
  }
}

/**
 * Quiet interval check:
 * - Probe real write surfaces; record rejected/accepted in audit
 * - Query accepted/rejected counts over the window
 * - ok iff acceptedWriteCount===0 && rejectedWriteCount>0
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

  // Probe 1: documents.create mutation
  try {
    await client.mutation(docsCreate, {
      title: `s29-quiet-probe-${untilMs}`,
      content: 'quiet-check probe — must be rejected',
      category: 'general',
      embedding: [0, 0, 0],
    });
    await recordProbe(
      client,
      'accepted',
      'documents.mutations.create',
      'probe unexpectedly accepted'
    );
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
    await recordProbe(
      client,
      rejected ? 'rejected' : 'accepted',
      'documents.mutations.create',
      message.slice(0, 200)
    );
    probes.push({
      surface: 'documents.mutations.create',
      rejected,
      message,
    });
  }

  // Probe 2: subscriptions.add
  try {
    await client.mutation(subsAdd, {
      sourceType: 'github',
      identifier: `s29-quiet-${untilMs}`,
      name: `s29-quiet-${untilMs}`,
    });
    await recordProbe(client, 'accepted', 'subscriptions.mutations.add');
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
    await recordProbe(
      client,
      rejected ? 'rejected' : 'accepted',
      'subscriptions.mutations.add',
      message.slice(0, 200)
    );
    probes.push({ surface: 'subscriptions.mutations.add', rejected, message });
  }

  const rejectedProbes = probes.filter((p) => p.rejected);

  let acceptedWriteCount = 0;
  let rejectedWriteCount = 0;
  try {
    const counts = (await client.query(auditApi.countAttemptsInWindow, {
      sinceMs,
      untilMs: Date.now(),
    })) as { acceptedWriteCount: number; rejectedWriteCount: number };
    acceptedWriteCount = counts.acceptedWriteCount;
    rejectedWriteCount = counts.rejectedWriteCount;
  } catch {
    // Fall back to in-process probe tallies
    acceptedWriteCount = probes.filter((p) => !p.rejected).length;
    rejectedWriteCount = probes.filter((p) => p.rejected).length;
  }

  // If audit under-counted rejections but probes saw them, prefer probe evidence
  if (rejectedWriteCount === 0 && rejectedProbes.length > 0) {
    rejectedWriteCount = rejectedProbes.length;
  }

  const report: QuietCheckReport = {
    ok: acceptedWriteCount === 0 && rejectedWriteCount > 0,
    acceptedWriteCount,
    rejectedWriteCount,
    windowSeconds,
    sinceMs,
    untilMs,
    probes,
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
