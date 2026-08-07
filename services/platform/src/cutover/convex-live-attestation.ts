/**
 * D07-02 / UC-SYNC-04 AC-1 — standing Convex-live attestation + write-block probes.
 *
 * Multi-tick fail-closed window:
 *   - every tick independently observes a real Convex query response
 *   - every tick issues a real HTTP POST /api/documents against a pre-existing
 *     serving process (never in-process createHonoApp) and requires 423 +
 *     migration_read_only
 *   - overall ok is ALL ticks green (never derived from only the final tick)
 *   - durable evidence is hash-chained (prev_hash = sha256(canonical(prev)))
 *
 * NEVER deletes/modifies convex/ or the live Convex deployment.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { anyApi } from 'convex/server';
import { resolveRepoRoot } from '../config/secrets.ts';
import { createCutoverConvexClient } from './convex-fence-client.ts';
import { MIGRATION_READ_ONLY_BODY, resolveVerifyBaseUrl } from './soak-fence.ts';

export const CONVEX_UNREACHABLE = 'CONVEX_UNREACHABLE';
export const WRITES_NOT_BLOCKED = 'WRITES_NOT_BLOCKED';
export const WRITE_PROBE_TARGET_MISSING = 'WRITE_PROBE_TARGET_MISSING';
export const ATTESTATION_PARTIAL = 'ATTESTATION_PARTIAL';

export const DEFAULT_ATTEST_TICKS = 3;
export const DEFAULT_ATTEST_INTERVAL_MS = 1500;

const GENESIS_PREV_HASH = '0'.repeat(64);

export type WriteProbeBody = {
  code?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

export type AttestationTick = {
  tick_index: number;
  at_ms: number;
  reachable: boolean;
  writes_blocked: boolean;
  write_probe_status: number | null;
  write_probe_body: WriteProbeBody | null;
  convex_query_ok: boolean;
  convex_documents_count: number | null;
  convex_fence_audit_id: string | null;
  convex_newest_document_creation_time: number | null;
  base_url: string | null;
  error: string | null;
  /** sha256 of the previous tick's canonical form (or genesis zeros). */
  prev_hash: string;
};

export type AttestationError = {
  code: string;
  message: string;
};

export type AttestationReport = {
  ok: boolean;
  ticks: AttestationTick[];
  ticks_requested: number;
  interval_ms: number;
  evidence_path: string;
  report_path: string | null;
  base_url: string | null;
  convex_url_host: string | null;
  error?: AttestationError;
  at_ms: number;
};

export type AttestConvexLiveOptions = {
  ticks?: number;
  intervalMs?: number;
  /** Explicit pre-existing Hono base URL (else resolveVerifyBaseUrl()). */
  baseUrl?: string | null;
  /** Bearer token for POST /api/documents (defaults to HOLO_KEY_RN / rn-test). */
  authToken?: string | null;
  cwd?: string;
  evidencePath?: string;
  reportPath?: string | null;
  /** Test hook: invoked before each tick (0-based). Used for mid-window disarm. */
  onBeforeTick?: (tickIndex: number) => void | Promise<void>;
  /** Skip sleeping between ticks (tests). */
  skipSleep?: boolean;
  env?: NodeJS.ProcessEnv;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function defaultAttestationEvidencePath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/convex-live-attestation.jsonl');
}

export function defaultAttestationReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/attestation-report.json');
}

/** Stable JSON for hash chaining — sorted keys, no whitespace variance. */
export function canonicalTick(tick: AttestationTick): string {
  const ordered: Record<string, unknown> = {
    at_ms: tick.at_ms,
    base_url: tick.base_url,
    convex_documents_count: tick.convex_documents_count,
    convex_fence_audit_id: tick.convex_fence_audit_id,
    convex_newest_document_creation_time: tick.convex_newest_document_creation_time,
    convex_query_ok: tick.convex_query_ok,
    error: tick.error,
    prev_hash: tick.prev_hash,
    reachable: tick.reachable,
    tick_index: tick.tick_index,
    write_probe_body: tick.write_probe_body,
    write_probe_status: tick.write_probe_status,
    writes_blocked: tick.writes_blocked,
  };
  return JSON.stringify(ordered);
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashTick(tick: AttestationTick): string {
  return sha256Hex(canonicalTick(tick));
}

function resolveAuthToken(explicit: string | null | undefined, env: NodeJS.ProcessEnv): string {
  const t = explicit?.trim() || env.HOLO_KEY_RN?.trim() || env.RN_API_KEY?.trim() || 'rn-test';
  return t;
}

function convexUrlHost(env: NodeJS.ProcessEnv): string | null {
  const url =
    env.EXPO_PUBLIC_CONVEX_URL?.trim() ||
    env.VITE_CONVEX_HTTP_URL?.trim() ||
    env.CONVEX_URL?.trim() ||
    '';
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 64);
  }
}

/**
 * Real Convex read probe — documents count + list(1) + latestFenceArmed.
 * Reachability alone is insufficient; we require at least one successful query.
 */
export async function probeConvexReachability(): Promise<{
  reachable: boolean;
  convex_query_ok: boolean;
  documents_count: number | null;
  fence_audit_id: string | null;
  newest_document_creation_time: number | null;
  error: string | null;
}> {
  try {
    const client = createCutoverConvexClient();
    const docsApi = (anyApi as any).documents.queries as {
      count: unknown;
      list: unknown;
    };
    const auditApi = (anyApi as any).migrationFence.audit as {
      latestFenceArmed: unknown;
    };

    let documents_count: number | null = null;
    let newest: number | null = null;
    let fence_audit_id: string | null = null;
    let queryOk = false;

    try {
      const countRaw = await client.query(docsApi.count as never, {} as never);
      documents_count = typeof countRaw === 'number' ? countRaw : Number(countRaw) || 0;
      queryOk = true;
    } catch {
      // try list as alternate
    }

    try {
      const listRaw = (await client.query(
        docsApi.list as never,
        {
          limit: 1,
        } as never
      )) as {
        documents?: Array<{ _creationTime?: number }>;
      } | null;
      const docs = listRaw?.documents ?? [];
      if (docs.length > 0 && typeof docs[0]?._creationTime === 'number') {
        newest = docs[0]!._creationTime!;
      }
      queryOk = true;
    } catch {
      // optional
    }

    try {
      const fence = (await client.query(auditApi.latestFenceArmed as never, {} as never)) as {
        _id?: string;
        fenceArmedAtMs?: number;
      } | null;
      if (fence && typeof fence._id === 'string' && fence._id.length > 0) {
        fence_audit_id = fence._id;
        queryOk = true;
      } else if (fence && typeof fence.fenceArmedAtMs === 'number') {
        fence_audit_id = `fenceArmedAtMs:${fence.fenceArmedAtMs}`;
        queryOk = true;
      }
    } catch {
      // migrationFence may be missing on very old deployments; count/list still counts
    }

    if (!queryOk) {
      return {
        reachable: false,
        convex_query_ok: false,
        documents_count: null,
        fence_audit_id: null,
        newest_document_creation_time: null,
        error: 'no Convex query succeeded',
      };
    }

    return {
      reachable: true,
      convex_query_ok: true,
      documents_count,
      fence_audit_id,
      newest_document_creation_time: newest,
      error: null,
    };
  } catch (err) {
    return {
      reachable: false,
      convex_query_ok: false,
      documents_count: null,
      fence_audit_id: null,
      newest_document_creation_time: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Real HTTP write probe against a pre-existing serving process.
 * Expects 423 + migration_read_only while the soak fence is armed.
 */
export async function probeWriteBlocked(
  baseUrl: string,
  authToken: string,
  timeoutMs = 8_000
): Promise<{
  writes_blocked: boolean;
  status: number | null;
  body: WriteProbeBody | null;
  error: string | null;
}> {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return {
      writes_blocked: false,
      status: null,
      body: null,
      error: 'empty base URL',
    };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${trimmed}/api/documents`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        title: `d07-02-attest-write-probe-${Date.now()}`,
        content: 'D07-02 attestation write probe — must be rejected while fence armed',
        category: 'general',
      }),
    });
    clearTimeout(timer);
    const body = (await res.json().catch(() => ({}))) as WriteProbeBody;
    const code = typeof body.code === 'string' ? body.code : '';
    const errorField = typeof body.error === 'string' ? body.error : '';
    const writes_blocked =
      res.status === 423 &&
      (code === MIGRATION_READ_ONLY_BODY.code ||
        errorField === MIGRATION_READ_ONLY_BODY.error ||
        code === 'migration_read_only' ||
        errorField === 'migration_read_only');
    return {
      writes_blocked,
      status: res.status,
      body,
      error: writes_blocked ? null : `status=${res.status} body=${JSON.stringify(body)}`,
    };
  } catch (err) {
    return {
      writes_blocked: false,
      status: null,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function appendEvidenceLine(path: string, tick: AttestationTick): void {
  ensureParentDir(path);
  appendFileSync(path, `${JSON.stringify(tick)}\n`, 'utf8');
}

function resetEvidenceFile(path: string): void {
  ensureParentDir(path);
  writeFileSync(path, '', 'utf8');
}

/**
 * Run a multi-tick Convex-live + write-block attestation window.
 * Fail-closed: ok is true only when EVERY tick is reachable AND writes_blocked.
 */
export async function runAttestConvexLive(
  options: AttestConvexLiveOptions = {}
): Promise<AttestationReport> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? resolveRepoRoot();
  const ticksRequested = Math.max(1, Math.floor(options.ticks ?? DEFAULT_ATTEST_TICKS));
  const intervalMs = Math.max(0, Math.floor(options.intervalMs ?? DEFAULT_ATTEST_INTERVAL_MS));
  const evidencePath = options.evidencePath ?? defaultAttestationEvidencePath(cwd);
  const reportPath =
    options.reportPath === null ? null : (options.reportPath ?? defaultAttestationReportPath(cwd));
  const baseUrl =
    (options.baseUrl?.trim() || resolveVerifyBaseUrl(null) || '').replace(/\/+$/, '') || null;
  const authToken = resolveAuthToken(options.authToken, env);
  const host = convexUrlHost(env);

  resetEvidenceFile(evidencePath);

  const ticks: AttestationTick[] = [];
  let prevHash = GENESIS_PREV_HASH;
  let firstError: AttestationError | undefined;

  for (let i = 0; i < ticksRequested; i++) {
    if (options.onBeforeTick) {
      await options.onBeforeTick(i);
    }
    if (i > 0 && !options.skipSleep && intervalMs > 0) {
      await sleep(intervalMs);
    }

    const at_ms = Date.now();
    let reachable = false;
    let convex_query_ok = false;
    let documents_count: number | null = null;
    let fence_audit_id: string | null = null;
    let newest: number | null = null;
    let writes_blocked = false;
    let write_probe_status: number | null = null;
    let write_probe_body: WriteProbeBody | null = null;
    let tickError: string | null = null;

    // Convex reachability (real deployment I/O)
    const convex = await probeConvexReachability();
    reachable = convex.reachable;
    convex_query_ok = convex.convex_query_ok;
    documents_count = convex.documents_count;
    fence_audit_id = convex.fence_audit_id;
    newest = convex.newest_document_creation_time;
    if (!reachable) {
      tickError = convex.error ?? 'convex unreachable';
      if (!firstError) {
        firstError = {
          code: CONVEX_UNREACHABLE,
          message: tickError,
        };
      }
    }

    // Write probe against pre-existing serving process
    if (!baseUrl) {
      writes_blocked = false;
      write_probe_status = null;
      write_probe_body = null;
      const msg = 'no pre-existing serving base URL (HOLO_VERIFY_BASE_URL / PLATFORM_URL)';
      tickError = tickError ? `${tickError}; ${msg}` : msg;
      if (!firstError) {
        firstError = {
          code: WRITE_PROBE_TARGET_MISSING,
          message: msg,
        };
      }
    } else {
      const probe = await probeWriteBlocked(baseUrl, authToken);
      writes_blocked = probe.writes_blocked;
      write_probe_status = probe.status;
      write_probe_body = probe.body;
      if (!writes_blocked) {
        const msg = probe.error ?? 'write probe not blocked';
        tickError = tickError ? `${tickError}; ${msg}` : msg;
        // Prefer CONVEX_UNREACHABLE when both fail, but WRITES_NOT_BLOCKED when convex ok
        if (!firstError || firstError.code !== CONVEX_UNREACHABLE) {
          if (!reachable && firstError?.code === CONVEX_UNREACHABLE) {
            // keep CONVEX_UNREACHABLE as primary
          } else if (reachable) {
            firstError = {
              code: WRITES_NOT_BLOCKED,
              message: msg,
            };
          } else if (!firstError) {
            firstError = {
              code: CONVEX_UNREACHABLE,
              message: tickError,
            };
          }
        }
      }
    }

    const tick: AttestationTick = {
      tick_index: i,
      at_ms,
      reachable,
      writes_blocked,
      write_probe_status,
      write_probe_body,
      convex_query_ok,
      convex_documents_count: documents_count,
      convex_fence_audit_id: fence_audit_id,
      convex_newest_document_creation_time: newest,
      base_url: baseUrl,
      error: tickError,
      prev_hash: prevHash,
    };

    ticks.push(tick);
    appendEvidenceLine(evidencePath, tick);
    prevHash = hashTick(tick);
  }

  const allReachable = ticks.every((t) => t.reachable === true);
  const allBlocked = ticks.every((t) => t.writes_blocked === true);
  const ok = ticks.length === ticksRequested && allReachable && allBlocked;

  if (!ok && !firstError) {
    firstError = {
      code: ATTESTATION_PARTIAL,
      message: `attestation failed: reachable=${allReachable} writes_blocked=${allBlocked}`,
    };
  }

  const report: AttestationReport = {
    ok,
    ticks,
    ticks_requested: ticksRequested,
    interval_ms: intervalMs,
    evidence_path: evidencePath,
    report_path: reportPath,
    base_url: baseUrl,
    convex_url_host: host,
    at_ms: Date.now(),
    ...(ok ? {} : { error: firstError }),
  };

  if (reportPath) {
    ensureParentDir(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

/** Load and re-verify hash chain of an existing evidence jsonl. */
export function verifyAttestationHashChain(evidencePath: string): {
  ok: boolean;
  lines: number;
  broken_at: number | null;
  message: string;
} {
  if (!existsSync(evidencePath)) {
    return { ok: false, lines: 0, broken_at: null, message: 'evidence file missing' };
  }
  const raw = readFileSync(evidencePath, 'utf8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, lines: 0, broken_at: null, message: 'evidence file empty' };
  }
  let prevHash = GENESIS_PREV_HASH;
  for (let i = 0; i < lines.length; i++) {
    let tick: AttestationTick;
    try {
      tick = JSON.parse(lines[i]!) as AttestationTick;
    } catch {
      return {
        ok: false,
        lines: lines.length,
        broken_at: i,
        message: `unparseable line ${i}`,
      };
    }
    if (tick.prev_hash !== prevHash) {
      return {
        ok: false,
        lines: lines.length,
        broken_at: i,
        message: `prev_hash mismatch at tick ${i}`,
      };
    }
    prevHash = hashTick(tick);
  }
  return {
    ok: true,
    lines: lines.length,
    broken_at: null,
    message: `hash-chain ok (${lines.length} records)`,
  };
}

export function formatAttestConvexLiveText(report: AttestationReport): string {
  const lines = [
    'holo cutover:attest-convex-live — UC-SYNC-04 Convex-live attestation',
    `  ok:              ${report.ok}`,
    `  ticks:           ${report.ticks.length}/${report.ticks_requested}`,
    `  interval_ms:     ${report.interval_ms}`,
    `  base_url:        ${report.base_url ?? '(none)'}`,
    `  convex_host:     ${report.convex_url_host ?? '(unset)'}`,
    `  evidence:        ${report.evidence_path}`,
  ];
  for (const t of report.ticks) {
    lines.push(
      `  tick[${t.tick_index}]: reachable=${t.reachable} writes_blocked=${t.writes_blocked} status=${t.write_probe_status ?? 'n/a'} prev_hash=${t.prev_hash.slice(0, 12)}…`
    );
  }
  if (report.error) {
    lines.push(`  error.code:      ${report.error.code}`);
    lines.push(`  error.message:   ${report.error.message}`);
  }
  lines.push(report.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}
