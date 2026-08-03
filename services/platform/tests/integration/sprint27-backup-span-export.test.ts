/**
 * REDHAT-FIX-S27-13 / CAP-BAK-01 — honest Langfuse backup span export gating.
 *
 * Proves:
 *   AC-1: exportOk=false + exportError when Langfuse disabled (PRIMARY)
 *   AC-2: exportOk=true when real Langfuse configured (or skip, never fake)
 *   AC-3: heartbeat.trace_id set even when exportOk=false
 *   AC-4: span.ts does not hardcode exportOk=true; D04-03 AC-3 honest
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts
 * Optional configured path:
 *   PLATFORM_IT=1 LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... LANGFUSE_BASE_URL=... \
 *     pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "configured"
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  ensureBackupHeartbeatTable,
  getBackupHeartbeat,
  upsertBackupHeartbeat,
} from '../../src/backup/heartbeat.ts';
import { emitBackupSpan } from '../../src/backup/span.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { readLangfuseConfigFromEnv } from '../../src/observability/langfuse-exporter.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/redhat-fix-s27-13');
const SPAN_JSONL = resolve(REPO_ROOT, '.tmp/D04-03/backup-spans.jsonl');
const SPAN_SOURCE = resolve(REPO_ROOT, 'services/platform/src/backup/span.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const D04_03 = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md'
);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';

const LANGFUSE_ENV_KEYS = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_HOST',
] as const;

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function snapshotLangfuseEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of LANGFUSE_ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function clearLangfuseEnv(): void {
  for (const k of LANGFUSE_ENV_KEYS) delete process.env[k];
}

function restoreLangfuseEnv(snap: Record<string, string | undefined>): void {
  for (const k of LANGFUSE_ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function findJsonlRecord(spanId: string): Record<string, unknown> | null {
  if (!existsSync(SPAN_JSONL)) return null;
  const lines = readFileSync(SPAN_JSONL, 'utf8').split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row.spanId === spanId) return row;
    } catch {
      // skip corrupt lines
    }
  }
  return null;
}

describe('REDHAT-FIX-S27-13 honest Langfuse backup span export', () => {
  let sql: Sql | null = null;
  let envSnap: Record<string, string | undefined> = {};

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    envSnap = snapshotLangfuseEnv();
    sql = createSql(DATABASE_URL);
    await ensureBackupHeartbeatTable(sql);
  });

  afterAll(async () => {
    restoreLangfuseEnv(envSnap);
    if (sql) await sql.end({ timeout: 5 });
  });

  it('unconfigured optional telemetry remains local without a disabled child lifecycle', () => {
    const childEnv = { ...process.env };
    for (const key of LANGFUSE_ENV_KEYS) delete childEnv[key];
    const script = [
      `const { emitBackupSpan } = await import(${JSON.stringify(SPAN_SOURCE)});`,
      "const span = await emitBackupSpan({ name: 'backup:wal_archive', attributes: { job_name: 'wal_archive', status: 'success' } });",
      'console.log(JSON.stringify({ exportOk: span.exportOk, exportError: span.exportError, traceId: span.traceId }));',
    ].join('\n');

    const child = spawnSync(BUN_BIN, ['-e', script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: childEnv,
      timeout: 30_000,
    });

    expect(child.status, `${child.stdout}\n${child.stderr}`).toBe(0);
    expect(child.stderr).not.toMatch(/holocron-langfuse-exporter disabled/i);
    const result = JSON.parse(child.stdout.trim()) as {
      exportOk: boolean;
      exportError: string | null;
      traceId: string;
    };
    expect(result.exportOk).toBe(false);
    expect(result.exportError).toMatch(/not configured.*local span/i);
    expect(result.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  itLive('AC-1 disabled: exportOk false, exportError set, hex traceId, local jsonl', async () => {
    const snap = snapshotLangfuseEnv();
    clearLangfuseEnv();
    try {
      expect(readLangfuseConfigFromEnv(), 'test must run with Langfuse env cleared').toBeNull();

      const span = await emitBackupSpan({
        name: 'backup:wal_archive',
        attributes: {
          job_name: 'wal_archive',
          status: 'success',
          last_wal_segment: '0000000100000000000000AA',
          wal_path: '/var/lib/postgresql/pg_wal/0000000100000000000000AA',
        },
        failOnExportError: false,
      });

      expect(span.exportOk, 'exportOk must be false when Langfuse disabled').toBe(false);
      expect(span.exportError, 'exportError must describe disabled/missing config').toBeTruthy();
      expect(String(span.exportError)).toMatch(/disabled|not configured|missing/i);
      expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(span.traceId.length).toBeGreaterThanOrEqual(16);
      expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(span.name).toBe('backup:wal_archive');
      expect(span.redacted).toBe(true);

      // Consistency: exportOk false iff exportError non-null
      expect(span.exportOk === false && span.exportError !== null).toBe(true);

      const jsonl = findJsonlRecord(span.spanId);
      expect(jsonl, `jsonl line for spanId=${span.spanId}`).toBeTruthy();
      if (!jsonl) throw new Error(`missing jsonl for spanId=${span.spanId}`);
      expect(jsonl.exportOk).toBe(false);
      expect(jsonl.exportError).toBeTruthy();
      expect(jsonl.traceId).toBe(span.traceId);

      writeEvidence('ac1-disabled-span.json', {
        exportOk: span.exportOk,
        exportError: span.exportError,
        traceId: span.traceId,
        spanId: span.spanId,
        jsonlExportOk: jsonl.exportOk,
      });
    } finally {
      restoreLangfuseEnv(snap);
    }
  });

  itLive(
    'AC-2 configured: exportOk true without exportError (or skip if no credentials)',
    async () => {
      // Restore real env from outer snap (operator may have set LANGFUSE_* for this test).
      restoreLangfuseEnv(envSnap);
      const cfg = readLangfuseConfigFromEnv();
      if (!cfg) {
        writeEvidence('ac2-configured-skipped.json', {
          skipped: true,
          reason:
            'LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL (or HOST) not set — Path B honesty: local-only is certified without live Langfuse; never fake exportOk=true',
        });
        // Documented skip — never green with fake exporter
        return;
      }

      // Reachability probe so we don't claim success against a dead host
      let reachable = false;
      try {
        const res = await fetch(`${cfg.baseUrl}/api/public/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        reachable = res.ok || res.status === 200 || res.status === 401 || res.status === 403;
      } catch {
        reachable = false;
      }
      if (!reachable) {
        writeEvidence('ac2-configured-skipped.json', {
          skipped: true,
          reason: `Langfuse at ${cfg.baseUrl} not reachable — skip, never fake`,
        });
        return;
      }

      const span = await emitBackupSpan({
        name: 'backup:base_backup',
        attributes: {
          job_name: 'base_backup',
          status: 'success',
          last_snapshot_id: 'redhat-fix-s27-13-configured',
          object_count: 1,
        },
        failOnExportError: false,
      });

      expect(span.exportOk, 'configured Langfuse must report exportOk true').toBe(true);
      expect(span.exportError, 'exportError must be null on success').toBeNull();
      expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);

      writeEvidence('ac2-configured-span.json', {
        exportOk: span.exportOk,
        exportError: span.exportError,
        traceId: span.traceId,
        baseUrl: cfg.baseUrl,
      });
    }
  );

  itLive('AC-3 heartbeat: trace_id equals span.traceId when export disabled', async () => {
    const client = sql;
    if (!client) throw new Error('sql client required (PLATFORM_IT=1 + Postgres)');
    const snap = snapshotLangfuseEnv();
    clearLangfuseEnv();
    const jobName = `wal_archive_s27_13_${Date.now()}`;
    try {
      const span = await emitBackupSpan({
        name: 'backup:wal_archive',
        attributes: {
          job_name: jobName,
          status: 'success',
          last_wal_segment: '0000000100000000000000BB',
        },
        failOnExportError: false,
      });

      expect(span.exportOk).toBe(false);
      expect(span.exportError).toBeTruthy();

      const row = await upsertBackupHeartbeat(
        {
          jobName,
          status: 'success',
          lastSuccessAt: new Date(),
          lastWalSegment: '0000000100000000000000BB',
          objectCount: 1,
          traceId: span.traceId,
        },
        client
      );

      expect(row.trace_id).toBe(span.traceId);
      expect(row.trace_id).toMatch(/^[0-9a-f]{32}$/);

      const read = await getBackupHeartbeat(jobName, client);
      expect(read?.trace_id).toBe(span.traceId);

      writeEvidence('ac3-heartbeat-trace.json', {
        spanTraceId: span.traceId,
        exportOk: span.exportOk,
        exportError: span.exportError,
        heartbeatTraceId: read?.trace_id,
        jobName,
      });
    } finally {
      await client`DELETE FROM backup_heartbeat WHERE job_name = ${jobName}`;
      restoreLangfuseEnv(snap);
    }
  });

  it('AC-4 honesty: no const exportOk = true; D04-03 admits local-only mode', () => {
    const spanSrc = readFileSync(SPAN_SOURCE, 'utf8');
    expect(spanSrc).not.toMatch(/const\s+exportOk\s*=\s*true/);
    // Must derive from exporter status, not hardcode success
    expect(spanSrc).toMatch(/exportOk/);
    expect(spanSrc).toMatch(/getStatus\s*\(/);

    const d04 = readFileSync(D04_03, 'utf8');
    // Must not unconditionally claim always-on Langfuse success without local-only gate
    const ac3Section =
      d04.includes('local span') ||
      d04.includes('exportOk') ||
      d04.includes('local-only') ||
      d04.includes('when Langfuse') ||
      d04.includes('when LANGFUSE');
    expect(
      ac3Section,
      'D04-03 AC-3 must document Path B local span / exportOk honesty or Path A Langfuse requirement'
    ).toBe(true);

    const rg = spawnSync(
      'rg',
      ['-n', 'const exportOk = true', 'services/platform/src/backup/span.ts'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    // rg exit 1 = no match (desired)
    expect(rg.status, `rg must not find hardcoded exportOk=true; got: ${rg.stdout}`).toBe(1);

    writeEvidence('ac4-honesty-grep.txt', {
      spanHasHardcodedExportOkTrue: /const\s+exportOk\s*=\s*true/.test(spanSrc),
      rgExit: rg.status,
      rgStdout: rg.stdout,
      d04MentionsHonesty: ac3Section,
    });
  });
});
