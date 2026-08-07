/**
 * D07-03 / UC-SYNC-04 — executable rollback drill (Sev-1 trigger, five write
 * surfaces, real cutover:rollback-repoint CLI child, independent zero-loss
 * recompute from raw audit bytes, pre-existing live acks).
 *
 * NEVER treats the repoint report's self-certified ok/repointed as sufficient
 * zero-loss proof without an independent raw-file recompute matching.
 * NEVER hand-sets sevOne — always drives runVerifyTools against a real
 * unreachable base URL.
 * NEVER mutates operator production secrets/audit — callers MUST point
 * HOLO_SECRETS_PATH (and fixture audit/watermark paths) at disposable paths.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { publishDocumentForRun } from '../mission/document-publish.ts';
import { MIGRATED_JOBS } from '../queue/jobs-registry.ts';
import { runJob } from '../queue/jobs-runner.ts';
import {
  defaultPostExportWriteAuditPath,
  filterAuthorizingRollbackAcks,
  isAuthorizingRollbackAck,
  POST_EXPORT_WRITE_ACCEPTED,
  type RollbackAcknowledgement,
  type RollbackRepointReport,
  TARGET_CONVEX_FROZEN,
} from './rollback-repoint.ts';
import {
  isMigrationReadOnly,
  resolveCutoverScopedKeys,
  resolveVerifyBaseUrl,
  runVerifyTools,
  type ToolsVerifyReport,
} from './soak-fence.ts';

// ── Drill-specific error codes ──────────────────────────────────────────────

export const DRILL_SEV1_TRIGGER_MISSING = 'DRILL_SEV1_TRIGGER_MISSING';
export const DRILL_WRITE_SURFACES_NOT_BLOCKED = 'DRILL_WRITE_SURFACES_NOT_BLOCKED';
export const DRILL_INDEPENDENT_RECOMPUTE_MISMATCH = 'DRILL_INDEPENDENT_RECOMPUTE_MISMATCH';
export const DRILL_AUDIT_FILE_MISSING = 'DRILL_AUDIT_FILE_MISSING';
export const DRILL_LIVE_ACK_MISSING = 'DRILL_LIVE_ACK_MISSING';
export const DRILL_REPOINT_FAILED = 'DRILL_REPOINT_FAILED';

export type WriteSurfaceProbeApp = {
  status: number;
  body: { error?: string; code?: string; [k: string]: unknown };
  executed: boolean;
};

export type WriteSurfaceProbeMcp = {
  rejected: boolean;
  status: number;
  message: string;
  executed: boolean;
};

export type WriteSurfaceProbeUpload = {
  status: number;
  body: { error?: string; code?: string; [k: string]: unknown };
  executed: boolean;
};

export type WriteSurfaceProbeJob = {
  ok: boolean;
  error: string | null;
  executed: boolean;
};

export type WriteSurfaceProbeMission = {
  rejected: boolean;
  message: string;
  executed: boolean;
};

export type FiveWriteSurfaceProbes = {
  app: WriteSurfaceProbeApp;
  mcp: WriteSurfaceProbeMcp;
  upload: WriteSurfaceProbeUpload;
  job: WriteSurfaceProbeJob;
  mission: WriteSurfaceProbeMission;
};

export type IndependentRecompute = {
  /** Independently recomputed accepted post-export writes from raw audit bytes. */
  acceptedCount: number;
  /** True when acceptedCount equals the repoint report precondition field. */
  matchesReport: boolean;
  /** Byte length of the raw audit file (must be >0 for zero-loss green). */
  rawFileByteCount: number;
  /** File must exist — absence is NOT collapsed into zero. */
  auditFileExists: boolean;
  /** Value from repoint.parsed.precondition.accepted_post_export_writes (or null). */
  reportValue: number | null;
  auditPath: string;
};

export type LiveAcksSummary = {
  authorizingCount: number;
  allPreexisting: boolean;
  acks: Array<{
    kind: string;
    preexisting: boolean;
    pid?: number;
    unit?: string;
  }>;
};

export type DrillReport = {
  ok: boolean;
  /** Mirrors successful zero-loss repoint; false when refused or failed. */
  repointed: boolean;
  target: string;
  /** Independently recomputed lost accepted writes (never copied from child ok). */
  lost_accepted_writes: number;
  /** Same as independent recompute — D07-01 oracle field. */
  accepted_post_export_writes_recomputed: number;
  /** Authorizing pre-existing acks only (from repoint child report). */
  acknowledgements: RollbackAcknowledgement[];
  precondition: {
    accepted_post_export_writes: number;
  };
  sevOneTrigger: {
    gate: 'verify-tools';
    declared: boolean;
    report: Pick<
      ToolsVerifyReport,
      'ok' | 'toolsPassed' | 'toolsTotal' | 'toolsStubbed' | 'base_url' | 'error' | 'transport'
    >;
    triggerBaseUrl: string;
  };
  probes: FiveWriteSurfaceProbes;
  repoint: {
    exitCode: number | null;
    parsed: RollbackRepointReport | null;
    stdout: string;
    stderr: string;
    argv: string[];
  };
  independentRecompute: IndependentRecompute;
  liveAcks: LiveAcksSummary;
  postRepointHealthProbe: {
    status: number;
    body: Record<string, unknown>;
    baseUrl: string;
  } | null;
  /**
   * REDHAT-FIX-RH-S30-02: post-repoint content probe against real data plane.
   * Health-label echo alone is insufficient — must prove Convex-backed content
   * when data_plane=='convex' (status 200 + source convex + document identity).
   */
  content_probe: {
    status: number;
    source: string | null;
    data_plane: string | null;
    document_id: string | null;
    document_title: string | null;
    baseUrl: string;
    ok: boolean;
  } | null;
  drillProcessPid: number;
  report_path: string;
  error?: { code: string; message: string };
};

export function defaultRollbackDrillReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-03/rollback-drill-report.json');
}

/** Bind an ephemeral port then close it — genuine connection-refused target. */
export async function allocateDeadBaseUrl(): Promise<string> {
  const port = await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('allocateDeadBaseUrl: failed to bind ephemeral port'));
        return;
      }
      const p = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(p)));
    });
  });
  return `http://127.0.0.1:${port}`;
}

/**
 * Independent recompute: load RAW audit file bytes (not loadPostExportWriteAudit
 * fail-open synthesis) and count accepted writes after export_watermark_ms.
 * File absence is distinguishable from zero accepted writes.
 */
export function recomputeAcceptedPostExportWritesFromRawFile(auditPath: string): {
  acceptedCount: number;
  rawFileByteCount: number;
  auditFileExists: boolean;
  parseError: string | null;
} {
  if (!existsSync(auditPath)) {
    return {
      acceptedCount: -1,
      rawFileByteCount: 0,
      auditFileExists: false,
      parseError: 'AUDIT_FILE_MISSING',
    };
  }
  const raw = readFileSync(auditPath);
  const rawFileByteCount = raw.byteLength;
  try {
    const j = JSON.parse(raw.toString('utf8')) as {
      export_watermark_ms?: number;
      accepted_writes?: Array<{ committed_at_ms?: number }>;
    };
    const tExport = typeof j.export_watermark_ms === 'number' ? j.export_watermark_ms : 0;
    const writes = Array.isArray(j.accepted_writes) ? j.accepted_writes : [];
    const acceptedCount = writes.filter(
      (w) => typeof w.committed_at_ms === 'number' && (w.committed_at_ms as number) > tExport
    ).length;
    return {
      acceptedCount,
      rawFileByteCount,
      auditFileExists: true,
      parseError: null,
    };
  } catch (err) {
    return {
      acceptedCount: -1,
      rawFileByteCount,
      auditFileExists: true,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

function emptyProbes(): FiveWriteSurfaceProbes {
  return {
    app: { status: 0, body: {}, executed: false },
    mcp: { rejected: false, status: 0, message: '', executed: false },
    upload: { status: 0, body: {}, executed: false },
    job: { ok: true, error: null, executed: false },
    mission: { rejected: false, message: '', executed: false },
  };
}

async function mcpStoreDocumentNetwork(
  baseUrl: string,
  mcpKey: string,
  title: string
): Promise<{ status: number; rejected: boolean; message: string }> {
  const headers = {
    authorization: `Bearer ${mcpKey}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  const mcpUrl = `${baseUrl.replace(/\/+$/, '')}/mcp`;
  try {
    await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'cutover-rollback-drill', version: '1' },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const call = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'store_document',
          arguments: { title, content: 'rollback-drill write-surface probe' },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await call.text();
    let message = raw.slice(0, 500);
    let isError = call.status >= 400;
    try {
      const parsed = JSON.parse(raw) as {
        result?: {
          isError?: boolean;
          content?: Array<{ text?: string }>;
        };
        error?: { message?: string };
      };
      if (parsed.result) {
        isError = Boolean(parsed.result.isError);
        const text = parsed.result.content?.map((c) => c.text ?? '').join('\n') ?? '';
        if (text) message = text;
      } else if (parsed.error?.message) {
        isError = true;
        message = parsed.error.message;
      }
    } catch {
      // keep raw
    }
    const rejected =
      isError || /MIGRATION_READ_ONLY|migration_read_only/i.test(message) || call.status === 423;
    return { status: call.status, rejected, message };
  } catch (err) {
    return {
      status: 0,
      rejected: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Probe the five PRD-named representative write surfaces against a live server
 * (app, MCP, upload) plus in-process job + mission publish chokepoints that
 * re-read the durable soak fence.
 */
export async function probeFiveWriteSurfaces(options: {
  baseUrl: string;
  rnKey: string;
  mcpKey: string;
  databaseUrl?: string;
}): Promise<FiveWriteSurfaceProbes> {
  const base = options.baseUrl.replace(/\/+$/, '');
  const probes = emptyProbes();
  const runTag = `drill-${Date.now().toString(36)}`;

  // 1. App mutation — POST /api/documents
  try {
    const res = await fetch(`${base}/api/documents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.rnKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: `rollback-drill-app-${runTag}`,
        content: 'five-surface app probe',
        category: 'general',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as WriteSurfaceProbeApp['body'];
    probes.app = { status: res.status, body, executed: true };
  } catch (err) {
    probes.app = {
      status: 0,
      body: { error: err instanceof Error ? err.message : String(err) },
      executed: true,
    };
  }

  // 2. MCP store_document over real /mcp
  const mcp = await mcpStoreDocumentNetwork(base, options.mcpKey, `rollback-drill-mcp-${runTag}`);
  probes.mcp = {
    rejected: mcp.rejected,
    status: mcp.status,
    message: mcp.message,
    executed: true,
  };

  // 3. Upload — POST /api/uploads
  try {
    const sha = createHash('sha256').update(`drill-upload-${runTag}`).digest('hex');
    const res = await fetch(`${base}/api/uploads`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.rnKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'improvement_image',
        targetId: randomUUID(),
        idempotencyKey: `rollback-drill-upload-${runTag}`,
        sha256: sha,
        byteLength: 4,
        mimeType: 'text/plain',
        originalName: 'drill-probe.txt',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as WriteSurfaceProbeUpload['body'];
    probes.upload = { status: res.status, body, executed: true };
  } catch (err) {
    probes.upload = {
      status: 0,
      body: { error: err instanceof Error ? err.message : String(err) },
      executed: true,
    };
  }

  // 4. Scheduled job — runJob('task-timeout-worker')
  const job = MIGRATED_JOBS.find((j) => j.name === 'task-timeout-worker') ?? MIGRATED_JOBS[0]!;
  try {
    const result = await runJob(job, {
      databaseUrl: options.databaseUrl ?? resolveHolocronNonprodDatabaseUrl(),
      runId: randomUUID(),
    });
    probes.job = {
      ok: result.ok,
      error: result.error,
      executed: true,
    };
  } catch (err) {
    probes.job = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      executed: true,
    };
  }

  // 5. Mission commit — publishDocumentForRun()
  const databaseUrl = options.databaseUrl ?? resolveHolocronNonprodDatabaseUrl();
  const sql = createSql(databaseUrl);
  try {
    await publishDocumentForRun(sql, {
      sourceRunId: randomUUID(),
      title: `rollback-drill-mission-${runTag}`,
      content: 'mission publish surface probe',
      category: 'subscriptions',
      idempotencyKey: `rollback-drill-mission-${runTag}`,
    });
    probes.mission = { rejected: false, message: '', executed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    probes.mission = {
      rejected: true,
      message,
      executed: true,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }

  return probes;
}

function allFiveBlocked(probes: FiveWriteSurfaceProbes): boolean {
  return (
    probes.app.executed &&
    probes.app.status === 423 &&
    probes.app.body.code === 'migration_read_only' &&
    probes.mcp.executed &&
    probes.mcp.rejected === true &&
    probes.upload.executed &&
    probes.upload.status === 423 &&
    probes.job.executed &&
    probes.job.ok === false &&
    typeof probes.job.error === 'string' &&
    probes.job.error.startsWith('migration_read_only:') &&
    probes.mission.executed &&
    probes.mission.rejected === true
  );
}

function parseRepointStdout(stdout: string): RollbackRepointReport | null {
  const text = stdout.trim();
  if (!text) return null;
  // CLI may emit trailing logs; take the largest JSON object
  try {
    return JSON.parse(text) as RollbackRepointReport;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as RollbackRepointReport;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Drive the real registered `cutover:rollback-repoint --json` CLI as a child
 * process (never only in-process runRollbackRepoint).
 */
export function spawnRollbackRepointCli(options: {
  cwd: string;
  watermarkPath?: string;
  outputPath?: string;
  target?: string;
  env?: NodeJS.ProcessEnv;
}): {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  argv: string[];
  parsed: RollbackRepointReport | null;
} {
  const argv = ['services/platform/src/cli/holo.ts', 'cutover:rollback-repoint', '--json'];
  if (options.watermarkPath) {
    argv.push('--etl-report', options.watermarkPath);
  }
  if (options.outputPath) {
    argv.push('--output', options.outputPath);
  }
  if (options.target) {
    argv.push('--target', options.target);
  }
  const r = spawnSync('bun', argv, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: 120_000,
    env: options.env ?? process.env,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return {
    exitCode: r.status,
    stdout,
    stderr,
    argv: ['bun', ...argv],
    parsed: parseRepointStdout(stdout),
  };
}

async function probeHealth(
  baseUrl: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } catch (err) {
    return {
      status: 0,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

/**
 * Full rollback drill orchestrator.
 *
 * ok:true requires ALL of:
 *   (1) real failing verify-tools Sev-1 trigger (toolsPassed=0, toolsTotal>0)
 *   (2) all five write surfaces blocked with migration_read_only
 *   (3) real cutover:rollback-repoint CLI exit 0 with repointed:true
 *   (4) independent raw-audit recompute === 0 and matches report precondition
 *   (5) ≥1 authorizing pre-existing acknowledgement
 *
 * With N>0 accepted writes the drill reports ok:false, repointed:false,
 * error.code=POST_EXPORT_WRITE_ACCEPTED, and independent acceptedCount===N.
 */
export async function runRollbackDrill(options?: {
  cwd?: string;
  /** Live serving base URL for write probes + repoint acks (env fallback). */
  baseUrl?: string;
  /**
   * Unreachable URL for Sev-1 trigger. When omitted, a fresh bind-then-close
   * ephemeral port is allocated (never a hand-set ok:false flag).
   */
  triggerBaseUrl?: string;
  reportPath?: string;
  watermarkPath?: string;
  auditPath?: string;
  repointOutputPath?: string;
  target?: string;
  databaseUrl?: string;
  /** Skip live write probes (tests that only assert Sev-1). Default false. */
  skipProbes?: boolean;
  /** Skip shelling repoint (tests that only assert trigger/probes). Default false. */
  skipRepoint?: boolean;
}): Promise<DrillReport> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const reportPath = options?.reportPath ?? defaultRollbackDrillReportPath(cwd);
  const auditPath = options?.auditPath ?? defaultPostExportWriteAuditPath(cwd);
  const liveBaseUrl = resolveVerifyBaseUrl(options?.baseUrl) || '';
  const keys = resolveCutoverScopedKeys();
  const databaseUrl =
    options?.databaseUrl ?? process.env.DATABASE_URL ?? resolveHolocronNonprodDatabaseUrl();
  const drillProcessPid = process.pid;

  // ── (1) Sev-1 trigger from REAL failing runVerifyTools ───────────────────
  const triggerBaseUrl = options?.triggerBaseUrl ?? (await allocateDeadBaseUrl());
  const toolsReport = await runVerifyTools({
    cwd,
    baseUrl: triggerBaseUrl,
    databaseUrl,
    keys,
    // Dead URL will fail identity — still enumerates manifest for toolsTotal>0
    allowMissingDeploymentEnv: true,
    // Avoid DB seed path dependency for connection-refused trigger.
    // Identity fails before tools are invoked; seeds only need to type-check.
    seeds: {
      documentId: '00000000-0000-4000-8000-000000000001',
      subscriptionId: '00000000-0000-4000-8000-000000000002',
      researchSessionId: '00000000-0000-4000-8000-000000000001',
      improvementId: '00000000-0000-4000-8000-000000000001',
      assimilationSessionId: '00000000-0000-4000-8000-000000000001',
      toolId: '00000000-0000-4000-8000-000000000001',
      shopSessionId: '00000000-0000-4000-8000-000000000001',
      profileId: '00000000-0000-4000-8000-000000000001',
      runId: `drill-sev1-${Date.now()}`,
    },
  });

  const sevOneTrigger: DrillReport['sevOneTrigger'] = {
    gate: 'verify-tools',
    declared:
      toolsReport.ok === false && toolsReport.toolsPassed === 0 && toolsReport.toolsTotal > 0,
    report: {
      ok: toolsReport.ok,
      toolsPassed: toolsReport.toolsPassed,
      toolsTotal: toolsReport.toolsTotal,
      toolsStubbed: toolsReport.toolsStubbed,
      base_url: toolsReport.base_url,
      error: toolsReport.error,
      transport: toolsReport.transport,
    },
    triggerBaseUrl,
  };

  // ── (2) Real cutover:rollback-repoint CLI child ──────────────────────────
  // IMPORTANT: repoint runs BEFORE the five write-surface probes. The child
  // probePreexistingServingListening has a 3s budget; /health's queue probe
  // alone can take 3.5s under DB load. Stressing the server with write probes
  // first made preflight race and false LIVE_ACK_MISSING. Fence stays armed
  // across repoint (H-05), so probes still prove migration_read_only after.
  let repoint: DrillReport['repoint'] = {
    exitCode: null,
    parsed: null,
    stdout: '',
    stderr: '',
    argv: [],
  };
  if (!options?.skipRepoint) {
    // Warm /health until it answers quickly enough for the child's 3s preflight
    // AND post-write ack collection (also 3s). Under concurrent DB load (e.g.
    // CREATE INDEX on shared holocron_nonprod), /health's queue probe alone can
    // take 3.5s and the child falsely reports LIVE_ACK_MISSING.
    if (liveBaseUrl) {
      const readyDeadline = Date.now() + 180_000;
      for (;;) {
        const start = Date.now();
        const h = await probeHealth(liveBaseUrl);
        const elapsed = Date.now() - start;
        // Child preflight timeout is 3s — require a comfortable margin.
        if (h.status > 0 && elapsed < 2_000) break;
        if (Date.now() >= readyDeadline) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const repointOutput =
      options?.repointOutputPath ?? resolve(cwd, '.tmp/D07-03/rollback-repoint-from-drill.json');
    // Explicitly pin serving-plane env so the child does not inherit a stale or
    // empty HOLO_VERIFY_BASE_URL from a prior CLI invocation in the same shell.
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...(liveBaseUrl
        ? {
            HOLO_VERIFY_BASE_URL: liveBaseUrl,
            HOLO_SOAK_BASE_URL: liveBaseUrl,
            PLATFORM_URL: liveBaseUrl,
          }
        : {}),
    };
    const child = spawnRollbackRepointCli({
      cwd,
      watermarkPath: options?.watermarkPath,
      outputPath: repointOutput,
      target: options?.target,
      env: childEnv,
    });
    repoint = {
      exitCode: child.exitCode,
      parsed: child.parsed,
      stdout: child.stdout,
      stderr: child.stderr,
      argv: child.argv,
    };
  }

  // ── (3) Five write-surface probes against live fenced server ─────────────
  let probes = emptyProbes();
  if (!options?.skipProbes && liveBaseUrl) {
    probes = await probeFiveWriteSurfaces({
      baseUrl: liveBaseUrl,
      rnKey: keys.rn || process.env.HOLO_KEY_RN || 'rn-test',
      mcpKey: keys.mcp || process.env.HOLO_KEY_MCP || 'mcp-test',
      databaseUrl,
    });
  }

  // ── (4) Independent raw-file recompute (never trust child ok alone) ──────
  const raw = recomputeAcceptedPostExportWritesFromRawFile(auditPath);
  const reportValue =
    typeof repoint.parsed?.precondition?.accepted_post_export_writes === 'number'
      ? repoint.parsed.precondition.accepted_post_export_writes
      : null;
  const matchesReport =
    raw.auditFileExists &&
    raw.parseError == null &&
    reportValue != null &&
    raw.acceptedCount === reportValue;

  const independentRecompute: IndependentRecompute = {
    acceptedCount: raw.acceptedCount,
    matchesReport,
    rawFileByteCount: raw.rawFileByteCount,
    auditFileExists: raw.auditFileExists,
    reportValue,
    auditPath,
  };

  // ── (5) Live acks from repoint child report ──────────────────────────────
  const acks = repoint.parsed?.acknowledgements ?? [];
  const authorizing = filterAuthorizingRollbackAcks(acks);
  const liveAcks: LiveAcksSummary = {
    authorizingCount: authorizing.length,
    allPreexisting: acks.length > 0 && acks.every((a) => a.preexisting === true),
    acks: acks.map((a) => ({
      kind: a.kind,
      preexisting: a.preexisting,
      pid: a.pid,
      unit: a.unit,
    })),
  };

  // Post-repoint /health against the same live base URL (pre-existing process)
  let postRepointHealthProbe: DrillReport['postRepointHealthProbe'] = null;
  let content_probe: DrillReport['content_probe'] = null;
  if (liveBaseUrl && repoint.parsed?.repointed === true) {
    const health = await probeHealth(liveBaseUrl);
    postRepointHealthProbe = {
      status: health.status,
      body: health.body,
      baseUrl: liveBaseUrl,
    };

    // REDHAT-FIX-RH-S30-02: real content-read path (not /health echo alone).
    try {
      const keys = {
        rn:
          process.env.HOLO_KEY_RN ||
          process.env.RN_API_KEY ||
          process.env.HOLO_KEY_CONTROL ||
          'rn-test',
      };
      const contentRes = await fetch(`${liveBaseUrl}/api/content-probe`, {
        headers: { authorization: `Bearer ${keys.rn}` },
        signal: AbortSignal.timeout(15_000),
      });
      const contentBody = (await contentRes.json().catch(() => ({}))) as {
        ok?: boolean;
        source?: string;
        data_plane?: string;
        document?: { id?: string; title?: string | null; content?: string | null };
        error?: string;
      };
      const source = typeof contentBody.source === 'string' ? contentBody.source : null;
      const data_plane = typeof contentBody.data_plane === 'string' ? contentBody.data_plane : null;
      const document_id =
        typeof contentBody.document?.id === 'string' ? contentBody.document.id : null;
      const document_title =
        typeof contentBody.document?.title === 'string' ? contentBody.document.title : null;
      // Post-repoint to convex requires Convex-backed content identity.
      const expectsConvex =
        (repoint.parsed?.data_plane === 'convex' ||
          repoint.parsed?.target === TARGET_CONVEX_FROZEN ||
          data_plane === 'convex') === true;
      const ok =
        contentRes.status === 200 &&
        contentBody.ok === true &&
        document_id != null &&
        document_id.length > 0 &&
        (!expectsConvex || source === 'convex');
      content_probe = {
        status: contentRes.status,
        source,
        data_plane,
        document_id,
        document_title,
        baseUrl: liveBaseUrl,
        ok,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      content_probe = {
        status: 0,
        source: null,
        data_plane: null,
        document_id: null,
        document_title: null,
        baseUrl: liveBaseUrl,
        ok: false,
      };
      // Surface in later error composition if overall ok would otherwise be true
      void msg;
    }
  }

  const acceptedRecomputed = raw.auditFileExists && raw.parseError == null ? raw.acceptedCount : -1;
  const repointed = repoint.parsed?.repointed === true;
  const target = repoint.parsed?.target ?? options?.target ?? TARGET_CONVEX_FROZEN;

  // Compose ok:true
  let error: DrillReport['error'];
  let ok = true;

  if (!sevOneTrigger.declared) {
    ok = false;
    error = {
      code: DRILL_SEV1_TRIGGER_MISSING,
      message:
        `Sev-1 trigger missing: runVerifyTools against ${triggerBaseUrl} did not yield ` +
        `ok:false with toolsPassed=0 and toolsTotal>0 ` +
        `(got ok=${toolsReport.ok} passed=${toolsReport.toolsPassed} total=${toolsReport.toolsTotal})`,
    };
  } else if (!options?.skipProbes && liveBaseUrl && !allFiveBlocked(probes)) {
    ok = false;
    error = {
      code: DRILL_WRITE_SURFACES_NOT_BLOCKED,
      message:
        `Not all five write surfaces blocked under soak fence ` +
        `(fence_armed=${isMigrationReadOnly()}; app.status=${probes.app.status} ` +
        `mcp.rejected=${probes.mcp.rejected} upload.status=${probes.upload.status} ` +
        `job.ok=${probes.job.ok} mission.rejected=${probes.mission.rejected})`,
    };
  } else if (!options?.skipRepoint && repoint.parsed?.error?.code === POST_EXPORT_WRITE_ACCEPTED) {
    ok = false;
    error = {
      code: POST_EXPORT_WRITE_ACCEPTED,
      message:
        repoint.parsed.error.message ||
        `rollback refused: ${acceptedRecomputed} accepted post-export write(s)`,
    };
  } else if (!options?.skipRepoint && !repointed) {
    ok = false;
    error = {
      code: repoint.parsed?.error?.code ?? DRILL_REPOINT_FAILED,
      message:
        repoint.parsed?.error?.message ||
        `cutover:rollback-repoint CLI exit=${repoint.exitCode} repointed!=true`,
    };
  } else if (!raw.auditFileExists) {
    ok = false;
    error = {
      code: DRILL_AUDIT_FILE_MISSING,
      message:
        `post-export audit file missing at ${auditPath} — zero-loss cannot be proven ` +
        `(absence must not collapse into acceptedCount=0)`,
    };
  } else if (acceptedRecomputed !== 0 || !matchesReport) {
    ok = false;
    error = {
      code: DRILL_INDEPENDENT_RECOMPUTE_MISMATCH,
      message:
        `independent recompute acceptedCount=${acceptedRecomputed} reportValue=${reportValue} ` +
        `matchesReport=${matchesReport} rawBytes=${raw.rawFileByteCount}`,
    };
  } else if (liveAcks.authorizingCount < 1) {
    ok = false;
    error = {
      code: DRILL_LIVE_ACK_MISSING,
      message: 'no authorizing pre-existing acknowledgements in repoint report',
    };
  } else if (repointed && content_probe != null && !content_probe.ok) {
    // REDHAT-FIX-RH-S30-02: health-only is insufficient after convex repoint.
    ok = false;
    error = {
      code: 'DRILL_CONTENT_PROBE_FAILED',
      message:
        `post-repoint content_probe failed: status=${content_probe.status} ` +
        `source=${content_probe.source} data_plane=${content_probe.data_plane} ` +
        `document_id=${content_probe.document_id} ` +
        `(require Convex-backed content read when data_plane==convex; /health echo alone is insufficient)`,
    };
  }

  // Sanity: authorizing acks must not be this drill process
  if (ok && liveAcks.acks.some((a) => a.pid === drillProcessPid)) {
    ok = false;
    error = {
      code: DRILL_LIVE_ACK_MISSING,
      message: 'authorizing ack pid equals drill process pid (self-ack rejected)',
    };
  }

  // When skip flags used, don't force green on incomplete runs
  if (options?.skipRepoint || options?.skipProbes) {
    ok = false;
    if (!error) {
      error = {
        code: DRILL_REPOINT_FAILED,
        message: 'incomplete drill (skipProbes/skipRepoint) — ok forced false',
      };
    }
  }

  const report: DrillReport = {
    ok,
    repointed: ok && repointed,
    target,
    lost_accepted_writes: acceptedRecomputed >= 0 ? acceptedRecomputed : -1,
    accepted_post_export_writes_recomputed: acceptedRecomputed,
    acknowledgements: authorizing,
    precondition: {
      accepted_post_export_writes:
        reportValue ?? (acceptedRecomputed >= 0 ? acceptedRecomputed : -1),
    },
    sevOneTrigger,
    probes,
    repoint,
    independentRecompute,
    liveAcks,
    postRepointHealthProbe,
    content_probe,
    drillProcessPid,
    report_path: reportPath,
    ...(error ? { error } : {}),
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

export function formatRollbackDrillText(r: DrillReport): string {
  if (!r.ok) {
    return [
      'holo cutover:rollback-drill — FAILED',
      `  error.code:    ${r.error?.code ?? 'DRILL_FAILED'}`,
      `  error.message: ${r.error?.message ?? ''}`,
      `  repointed:     ${r.repointed}`,
      `  sevOne.declared: ${r.sevOneTrigger.declared}`,
      `  independent.acceptedCount: ${r.independentRecompute.acceptedCount}`,
      `  liveAcks.authorizingCount: ${r.liveAcks.authorizingCount}`,
      `  report:        ${r.report_path}`,
    ].join('\n');
  }
  return [
    'holo cutover:rollback-drill — zero-loss rollback proven',
    `  ok:                 ${r.ok}`,
    `  repointed:          ${r.repointed}`,
    `  target:             ${r.target}`,
    `  lost_accepted:      ${r.lost_accepted_writes}`,
    `  independent.match:  ${r.independentRecompute.matchesReport}`,
    `  authorizing_acks:   ${r.liveAcks.authorizingCount}`,
    `  sevOne.declared:    ${r.sevOneTrigger.declared}`,
    `  report:             ${r.report_path}`,
  ].join('\n');
}

// re-export for tests that assert authorizing filter semantics
export { isAuthorizingRollbackAck, POST_EXPORT_WRITE_ACCEPTED, TARGET_CONVEX_FROZEN };
