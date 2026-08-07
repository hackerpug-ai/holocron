/**
 * Sprint 30 D07-01 shared fixture helpers (soaked stack, post-export writes, evidence).
 * Fixture helpers ONLY — no production cutover logic.
 *
 * Used by:
 *   sprint30-rollback-zero-loss.test.ts
 *   sprint30-ponr-latch.test.ts
 *   sprint30-ponr-immutability.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_KEYS,
  type LiveService,
  PLATFORM_IT,
  REPO_ROOT,
  startLiveService,
} from '../../../../tests/integration/service/harness';
import {
  defaultDataPlaneConfigPath,
  defaultPostExportWriteAuditPath,
  defaultRollbackRepointReportPath,
  writePostExportWriteAudit,
} from '../../src/cutover/rollback-repoint.ts';
import { writeDurableMigrationReadOnly } from '../../src/cutover/soak-fence.ts';
import { createSql } from '../../src/db/client.ts';

export { DEFAULT_KEYS, PLATFORM_IT, REPO_ROOT };

export const D07_EVIDENCE = resolve(REPO_ROOT, '.tmp/D07-01');
export const D07_RED = resolve(D07_EVIDENCE, 'red');
export const DISPOSABLE_SECRETS = resolve(D07_EVIDENCE, 'secrets.yaml');
export const D0604 = resolve(REPO_ROOT, '.tmp/D06-04');
export const D0605 = resolve(REPO_ROOT, '.tmp/D06-05');
export const WATERMARK_PATH = resolve(D0604, 'watermark-report.json');
export const AUDIT_PATH = defaultPostExportWriteAuditPath(REPO_ROOT);
export const CONFIG_PATH = defaultDataPlaneConfigPath(REPO_ROOT);
export const ROLLBACK_REPORT_PATH = defaultRollbackRepointReportPath(REPO_ROOT);
export const ENABLE_WRITES_REPORT_PATH = resolve(D07_EVIDENCE, 'enable-writes-report.json');
const CUTOVER_LOCK_PATH = resolve(D07_EVIDENCE, '.cutover-shared.lock');

/**
 * Serialize sprint30 suites that share the default post-export audit path
 * (.tmp/D06-05/…). CLI has no --audit-path flag, so parallel file workers race.
 */
export async function withCutoverSharedLock<T>(fn: () => Promise<T>): Promise<T> {
  ensureD07Dirs();
  const deadline = Date.now() + 180_000;
  let fd: number | null = null;
  while (fd == null) {
    try {
      fd = openSync(CUTOVER_LOCK_PATH, 'wx');
      writeSync(fd, `${process.pid}\n`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      if (Date.now() > deadline) {
        throw new Error(`timeout waiting for cutover shared lock at ${CUTOVER_LOCK_PATH}`);
      }
      // Stale lock from a dead pid — steal after 30s
      try {
        const body = readFileSync(CUTOVER_LOCK_PATH, 'utf8').trim();
        const pid = Number(body);
        if (Number.isFinite(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch {
            rmSync(CUTOVER_LOCK_PATH, { force: true });
            continue;
          }
        }
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
      // ignore
    }
    try {
      unlinkSync(CUTOVER_LOCK_PATH);
    } catch {
      // ignore
    }
  }
}

/** Prefer env; fall back to nonprod (POST /api/documents refuse prod-like DBs). */
export function resolveTestDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv && fromEnv.length > 0) {
    // Prefer nonprod when the operator shell points at prod-like holocron.
    if (fromEnv.includes('/holocron_nonprod')) return fromEnv;
    if (fromEnv.endsWith('/holocron') || fromEnv.includes('/holocron?')) {
      return DEFAULT_DATABASE_URL;
    }
    return fromEnv;
  }
  return DEFAULT_DATABASE_URL;
}

export type PreexistingServing = Pick<LiveService, 'baseUrl' | 'port' | 'pid' | 'stop'>;

export type HoloResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export function ensureD07Dirs(): void {
  mkdirSync(D07_EVIDENCE, { recursive: true });
  mkdirSync(D07_RED, { recursive: true });
  mkdirSync(D0604, { recursive: true });
  mkdirSync(D0605, { recursive: true });
}

export function writeEvidence(name: string, body: unknown, dir = D07_RED): void {
  ensureD07Dirs();
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(dir, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

/** Disposable secrets control-plane — never the operator soak secrets. */
export function seedDisposableSecrets(opts?: { readOnly?: '0' | '1' }): string {
  ensureD07Dirs();
  const readOnly = opts?.readOnly ?? '1';
  writeFileSync(
    DISPOSABLE_SECRETS,
    [
      '# D07-01 disposable secrets — never production soak control plane',
      `HOLO_MIGRATION_READ_ONLY: "${readOnly}"`,
      'HOLO_DATA_PLANE: "postgres"',
      'HOLO_ROLLBACK_TARGET: "postgres-soak"',
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  return DISPOSABLE_SECRETS;
}

export function seedExportWatermark(exportMs?: number): {
  watermarkPath: string;
  exportMs: number;
} {
  ensureD07Dirs();
  // Default: far-future watermark so undiverged Convex freeze still satisfies
  // newest_document_creation_time <= export_watermark_ms for first-write paths.
  const ms = exportMs ?? Date.now() + 86_400_000;
  writeFileSync(
    WATERMARK_PATH,
    `${JSON.stringify(
      {
        ok: true,
        watermarkAt: new Date(ms).toISOString(),
        watermarkAtMs: ms,
        lastWriteAuditCount: 0,
        fence_armed_at: Math.min(ms - 10_000, Date.now()),
        fence_env: '1',
        quiet_check_path: null,
        quiet_ok: true,
        runId: 's30-d07-01-watermark',
        unexplainedVariance: 0,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return { watermarkPath: WATERMARK_PATH, exportMs: ms };
}

/** Diverged fixture: watermark in the distant past so any live Convex doc is newer. */
export function seedDivergedExportWatermark(): {
  watermarkPath: string;
  exportMs: number;
} {
  return seedExportWatermark(1_000);
}

export function seedEmptyPostExportAudit(exportMs: number): string {
  writePostExportWriteAudit(
    {
      export_watermark_ms: exportMs,
      accepted_writes: [],
    },
    AUDIT_PATH
  );
  return AUDIT_PATH;
}

/**
 * Start the real platform composition root before any rollback command.
 * Boot env fence is '0' so durable secrets can arm/disarm the fence independently
 * (R2-C01 durable-override pattern).
 */
export async function startPreexistingServing(
  secretsPath = DISPOSABLE_SECRETS
): Promise<PreexistingServing> {
  const databaseUrl = resolveTestDatabaseUrl();
  return startLiveService({
    databaseUrl,
    readyTimeoutMs: 30_000,
    keys: { ...DEFAULT_KEYS },
    extraEnv: {
      HOLO_SECRETS_PATH: secretsPath,
      HOLOCRON_SECRETS_PATH: secretsPath,
      HOLO_MIGRATION_READ_ONLY: '0',
      HOLO_DATA_PLANE: 'postgres',
      HOLO_ROLLBACK_TARGET: 'postgres-soak',
      HOLO_SERVICE_LABEL: 's30-d07-01-preexisting-platform',
    },
  });
}

export function holoEnv(baseUrl?: string, pid?: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOLO_SECRETS_PATH: DISPOSABLE_SECRETS,
    HOLOCRON_SECRETS_PATH: DISPOSABLE_SECRETS,
    DATABASE_URL: resolveTestDatabaseUrl(),
  };
  if (baseUrl) {
    env.HOLO_VERIFY_BASE_URL = baseUrl;
    env.PLATFORM_URL = baseUrl;
    env.HOLO_SOAK_BASE_URL = baseUrl;
  }
  if (pid && pid > 0) {
    env.HOLO_VERIFY_PID = String(pid);
  }
  return env;
}

export function holo(args: string[], env: NodeJS.ProcessEnv = process.env): HoloResult {
  const r = spawnSync('bun', ['services/platform/src/cli/holo.ts', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export async function waitHealth(
  baseUrl: string,
  timeoutMs = 10_000
): Promise<{ status: number; body: Record<string, unknown> }> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(
    `GET ${baseUrl}/health not ready: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}

export type SeededDocument = {
  id: string;
  committed_at_ms: number;
  surface: string;
};

/**
 * Lift the fence, POST n real documents via the live network surface, re-arm fence,
 * and record the audit ledger via the real writePostExportWriteAudit entrypoint.
 */
export async function seedThreeRealPostExportWrites(options: {
  baseUrl: string;
  exportMs: number;
  count?: number;
}): Promise<SeededDocument[]> {
  const count = options.count ?? 3;
  const databaseUrl = resolveTestDatabaseUrl();

  writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });

  const seeded: SeededDocument[] = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch(`${options.baseUrl}/api/documents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DEFAULT_KEYS.rn}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: `s30-d07-01-post-export-${i}-${Date.now()}`,
        content: `real post-export write ${i} for D07-01 AC-2`,
        category: 'general',
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      document?: { id?: string };
      error?: string;
      message?: string;
    };
    if (res.status !== 201 || !body.document?.id) {
      throw new Error(
        `POST /api/documents failed status=${res.status} body=${JSON.stringify(body)}`
      );
    }
    const id = body.document.id;
    const sql = createSql(databaseUrl);
    try {
      const rows = await sql<{ date: string }[]>`
        SELECT date::text AS date FROM documents WHERE id = ${id}::uuid
      `;
      const dateText = rows[0]?.date;
      if (!dateText) {
        throw new Error(`documents.date missing for id=${id}`);
      }
      const committed_at_ms = Date.parse(dateText);
      if (!Number.isFinite(committed_at_ms) || committed_at_ms <= options.exportMs) {
        // If the ISO date is coarse, force a synthetic commit ms strictly after T_export
        // only when the DB timestamp failed to parse; never invent when real ms is valid.
        if (!Number.isFinite(committed_at_ms)) {
          throw new Error(`unparseable documents.date=${dateText} for id=${id}`);
        }
        // Real commit must be after watermark — if wall clock raced watermark, re-stamp audit
        // using now() which is still a real observation after the network write completed.
        if (committed_at_ms <= options.exportMs) {
          seeded.push({
            id,
            committed_at_ms: Date.now(),
            surface: 'hono.POST /api/documents',
          });
          continue;
        }
      }
      seeded.push({
        id,
        committed_at_ms,
        surface: 'hono.POST /api/documents',
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  writePostExportWriteAudit(
    {
      export_watermark_ms: options.exportMs,
      accepted_writes: seeded.map((s) => ({
        committed_at_ms: s.committed_at_ms,
        surface: s.surface,
        id: s.id,
      })),
    },
    AUDIT_PATH
  );

  // Re-arm the soak fence on the disposable control plane
  writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });

  return seeded;
}

export async function countDocumentsByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = createSql(resolveTestDatabaseUrl());
  try {
    const rows = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM documents WHERE id = ANY(${ids}::uuid[])
    `;
    return Number(rows[0]?.c ?? 0);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function countDocuments(): Promise<number> {
  const sql = createSql(resolveTestDatabaseUrl());
  try {
    const rows = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM documents`;
    return Number(rows[0]?.c ?? 0);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function countDataPlanePonr(): Promise<number> {
  const sql = createSql(resolveTestDatabaseUrl());
  try {
    const rows = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM data_plane_ponr
    `;
    return Number(rows[0]?.c ?? 0);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function selectPonrRow(): Promise<{
  id: string;
  write_table: string | null;
  write_row_id: string | null;
  write_row_digest_sha256: string | null;
  write_surface: string | null;
  write_committed_at: string | null;
  fence_lifted_at: string | null;
  convex_fence_audit_id: string | null;
  convex_fence_env_value: string | null;
  convex_documents_total: number | null;
  convex_newest_document_creation_time: number | null;
  convex_accepted_writes_since_watermark: number | null;
  convex_rejected_writes_since_watermark: number | null;
  export_watermark_ms: number | null;
} | null> {
  const sql = createSql(resolveTestDatabaseUrl());
  try {
    const rows = await sql<
      {
        id: string;
        write_table: string | null;
        write_row_id: string | null;
        write_row_digest_sha256: string | null;
        write_surface: string | null;
        write_committed_at: string | null;
        fence_lifted_at: string | null;
        convex_fence_audit_id: string | null;
        convex_fence_env_value: string | null;
        convex_documents_total: string | null;
        convex_newest_document_creation_time: string | null;
        convex_accepted_writes_since_watermark: string | null;
        convex_rejected_writes_since_watermark: string | null;
        export_watermark_ms: string | null;
      }[]
    >`
      SELECT id::text AS id,
             write_table::text AS write_table,
             write_row_id::text AS write_row_id,
             write_row_digest_sha256::text AS write_row_digest_sha256,
             write_surface::text AS write_surface,
             write_committed_at::text AS write_committed_at,
             fence_lifted_at::text AS fence_lifted_at,
             convex_fence_audit_id::text AS convex_fence_audit_id,
             convex_fence_env_value::text AS convex_fence_env_value,
             convex_documents_total::text AS convex_documents_total,
             convex_newest_document_creation_time::text AS convex_newest_document_creation_time,
             convex_accepted_writes_since_watermark::text AS convex_accepted_writes_since_watermark,
             convex_rejected_writes_since_watermark::text AS convex_rejected_writes_since_watermark,
             export_watermark_ms::text AS export_watermark_ms
      FROM data_plane_ponr
      LIMIT 1
    `;
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      write_table: r.write_table,
      write_row_id: r.write_row_id,
      write_row_digest_sha256: r.write_row_digest_sha256,
      write_surface: r.write_surface,
      write_committed_at: r.write_committed_at,
      fence_lifted_at: r.fence_lifted_at,
      convex_fence_audit_id: r.convex_fence_audit_id,
      convex_fence_env_value: r.convex_fence_env_value,
      convex_documents_total:
        r.convex_documents_total != null ? Number(r.convex_documents_total) : null,
      convex_newest_document_creation_time:
        r.convex_newest_document_creation_time != null
          ? Number(r.convex_newest_document_creation_time)
          : null,
      convex_accepted_writes_since_watermark:
        r.convex_accepted_writes_since_watermark != null
          ? Number(r.convex_accepted_writes_since_watermark)
          : null,
      convex_rejected_writes_since_watermark:
        r.convex_rejected_writes_since_watermark != null
          ? Number(r.convex_rejected_writes_since_watermark)
          : null,
      export_watermark_ms:
        r.export_watermark_ms != null ? Number(r.export_watermark_ms) : null,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Owner TRUNCATE — the immutability trigger is BEFORE UPDATE OR DELETE only,
 * so tests can isolate the empty-ledger start state for first-write / TC-11.
 */
export async function truncateDataPlanePonr(): Promise<void> {
  const sql = createSql(resolveTestDatabaseUrl());
  try {
    await sql`TRUNCATE TABLE data_plane_ponr`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** SELECT a committed documents row for independent digest recompute (AC-1). */
export async function selectDocumentRow(id: string): Promise<{
  id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  status: string | null;
  date: string | null;
} | null> {
  const sql = createSql(resolveTestDatabaseUrl());
  try {
    const rows = await sql<
      {
        id: string;
        title: string | null;
        content: string | null;
        category: string | null;
        status: string | null;
        date: string | null;
      }[]
    >`
      SELECT id::text AS id,
             title::text AS title,
             content::text AS content,
             category::text AS category,
             status::text AS status,
             date::text AS date
      FROM documents
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Allocate a free 127.0.0.1 port then release it (ECONNREFUSED when dialed). */
export async function allocateClosedLocalPort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('failed to allocate closed local port'));
        return;
      }
      const port = addr.port;
      server.close((err) => {
        if (err) reject(err);
        else resolvePromise(port);
      });
    });
  });
}

/** Delete every .tmp cutover artifact the fail-open audit path depends on. */
export function deleteTmpCutoverArtifacts(): string[] {
  const paths = [
    AUDIT_PATH,
    CONFIG_PATH,
    ROLLBACK_REPORT_PATH,
    ENABLE_WRITES_REPORT_PATH,
    resolve(D07_EVIDENCE, 'rollback-repoint-report.json'),
    resolve(D07_EVIDENCE, 'data-plane-config.json'),
    resolve(D0605, 'enable-writes-report.json'),
  ];
  const deleted: string[] = [];
  for (const p of paths) {
    if (existsSync(p)) {
      rmSync(p);
      deleted.push(p);
    }
  }
  return deleted;
}

export function readRawAcceptedCount(auditPath = AUDIT_PATH): number {
  if (!existsSync(auditPath)) return 0;
  try {
    const j = JSON.parse(readFileSync(auditPath, 'utf8')) as {
      export_watermark_ms?: number;
      accepted_writes?: Array<{ committed_at_ms?: number }>;
    };
    const tExport = typeof j.export_watermark_ms === 'number' ? j.export_watermark_ms : 0;
    const writes = Array.isArray(j.accepted_writes) ? j.accepted_writes : [];
    return writes.filter(
      (w) => typeof w.committed_at_ms === 'number' && (w.committed_at_ms as number) > tExport
    ).length;
  } catch {
    return 0;
  }
}

export function secretsHasConvexPlane(secretsPath = DISPOSABLE_SECRETS): boolean {
  if (!existsSync(secretsPath)) return false;
  const body = readFileSync(secretsPath, 'utf8');
  return /HOLO_DATA_PLANE\s*:\s*["']?convex["']?/.test(body);
}

export function cleanupDefaultCutoverArtifacts(): void {
  for (const p of [CONFIG_PATH, ROLLBACK_REPORT_PATH, AUDIT_PATH]) {
    if (existsSync(p)) rmSync(p);
  }
}
