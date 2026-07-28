/**
 * OTel-style backup job spans via HolocronLangfuseExporter + redactForExport.
 *
 * Emits root spans named `backup:wal_archive` / `backup:base_backup`.
 * Attributes are redacted (no bucket creds / hostnames in WAL paths).
 * Always returns a real hex trace_id for heartbeat correlation even when
 * Langfuse is not configured (span is still recorded on the job result + local log).
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TracingEventType } from '@mastra/core/observability';
import { resolveRepoRoot } from '../config/secrets.ts';
import {
  createLangfuseExporterFromEnv,
  HOLOCRON_SERVICE_NAME,
  type HolocronLangfuseExporter,
  REDACTION_TOKEN,
  redactForExport,
} from '../observability/langfuse-exporter.ts';

export type BackupSpanName = 'backup:wal_archive' | 'backup:base_backup';

export type BackupSpanAttributes = {
  job_name: string;
  status: string;
  last_wal_segment?: string | null;
  last_snapshot_id?: string | null;
  object_count?: number | null;
  /** May contain paths — redacted before export. */
  wal_path?: string | null;
  detail?: string | null;
  [key: string]: unknown;
};

export type EmittedBackupSpan = {
  name: BackupSpanName;
  traceId: string;
  spanId: string;
  startTime: string;
  endTime: string;
  attributes: Record<string, unknown>;
  /** True when local span is valid (Langfuse optional). */
  exportOk: boolean;
  exportError: string | null;
  serviceName: string;
  redacted: true;
};

function toHex32(seed?: string): string {
  if (seed) {
    const hex = seed.replace(/-/g, '').toLowerCase();
    if (/^[0-9a-f]{32}$/.test(hex)) return hex;
  }
  return randomUUID().replace(/-/g, '');
}

function toHex16(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Strip hostnames and absolute path prefixes that would leak operator machine
 * layout. WAL segment filenames (24 hex) are preserved.
 */
export function redactWalPath(path: string | null | undefined): string | null {
  if (!path) return null;
  let out = path;
  out = out.replace(/https?:\/\/[^/\s]+/gi, REDACTION_TOKEN);
  if (out.includes('/')) {
    const base = out.split('/').filter(Boolean).pop() ?? out;
    if (/^[0-9A-F]{24}/i.test(base) || base.includes('archive-push') || base.endsWith('.gz')) {
      return base.replace(/[^A-Za-z0-9._-]/g, '_');
    }
    return REDACTION_TOKEN;
  }
  return out;
}

function sanitizeAttributes(raw: BackupSpanAttributes): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {
    job_name: raw.job_name,
    status: raw.status,
  };
  if (raw.last_wal_segment) cleaned.last_wal_segment = raw.last_wal_segment;
  if (raw.last_snapshot_id) cleaned.last_snapshot_id = raw.last_snapshot_id;
  if (raw.object_count !== undefined && raw.object_count !== null) {
    cleaned.object_count = raw.object_count;
  }
  if (raw.wal_path) cleaned.wal_path = redactWalPath(String(raw.wal_path));
  if (raw.detail) cleaned.detail = String(raw.detail).slice(0, 200);

  for (const [k, v] of Object.entries(raw)) {
    if (k in cleaned) continue;
    const lower = k.toLowerCase();
    if (
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('token') ||
      lower.includes('key') ||
      lower.includes('credential') ||
      lower.includes('cipher')
    ) {
      continue;
    }
    if (typeof v === 'string' && (v.includes('://') || v.startsWith('/'))) {
      cleaned[k] = redactWalPath(v);
      continue;
    }
    cleaned[k] = v;
  }

  return redactForExport(cleaned) as Record<string, unknown>;
}

function spanLogPath(repoRoot = resolveRepoRoot()): string {
  return resolve(repoRoot, '.tmp/D04-03/backup-spans.jsonl');
}

function appendSpanLog(span: EmittedBackupSpan): void {
  try {
    const path = spanLogPath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(span)}\n`, { flag: 'a', mode: 0o644 });
  } catch {
    // Evidence log is best-effort; span still lives on the job result.
  }
}

/**
 * Emit a root backup span. Prefer HolocronLangfuseExporter when configured;
 * always returns a correlated traceId and redacted attributes.
 */
export async function emitBackupSpan(args: {
  name: BackupSpanName;
  attributes: BackupSpanAttributes;
  traceId?: string;
  exporter?: HolocronLangfuseExporter;
  /** When true, throw on Langfuse transport failure. Default soft for backup jobs. */
  failOnExportError?: boolean;
}): Promise<EmittedBackupSpan> {
  const start = new Date();
  const traceId = toHex32(args.traceId);
  const spanId = toHex16();
  const attributes = sanitizeAttributes(args.attributes);
  const end = new Date();

  const exportOk = true;
  let exportError: string | null = null;

  const exporter =
    args.exporter ??
    createLangfuseExporterFromEnv({
      serviceName: HOLOCRON_SERVICE_NAME,
      failOnExportError: args.failOnExportError === true,
    });

  try {
    const synthetic = {
      id: spanId,
      traceId,
      name: args.name,
      type: 'span',
      isRootSpan: true,
      startTime: start,
      endTime: end,
      metadata: attributes,
      input: { job_name: attributes.job_name },
      output: {
        status: attributes.status,
        last_wal_segment: attributes.last_wal_segment ?? null,
        last_snapshot_id: attributes.last_snapshot_id ?? null,
      },
      tags: ['backup', HOLOCRON_SERVICE_NAME],
      parentSpanId: undefined,
    };

    const anyExporter = exporter as unknown as {
      exportTracingEvent: (e: { type: string; exportedSpan: typeof synthetic }) => Promise<void>;
      flush: () => Promise<void>;
      getStatus: () => {
        ok: boolean;
        errorMessage: string | null;
        baseUrl: string | null;
        exportedEvents: number;
      };
    };

    await anyExporter.exportTracingEvent({
      type: TracingEventType.SPAN_ENDED,
      exportedSpan: synthetic,
    });

    try {
      await exporter.flush();
      const status = exporter.getStatus();
      if (!status.ok && status.baseUrl) {
        exportError = status.errorMessage;
      } else if (!status.baseUrl || status.errorMessage?.toLowerCase().includes('disabled')) {
        exportError = status.errorMessage ?? 'langfuse not configured (local span only)';
      }
    } catch (err) {
      exportError = err instanceof Error ? err.message : String(err);
      if (args.failOnExportError) throw err;
    }
  } catch (err) {
    exportError = err instanceof Error ? err.message : String(err);
    if (args.failOnExportError) throw err;
  }

  const emitted: EmittedBackupSpan = {
    name: args.name,
    traceId,
    spanId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    attributes,
    exportOk,
    exportError,
    serviceName: HOLOCRON_SERVICE_NAME,
    redacted: true,
  };
  appendSpanLog(emitted);
  return emitted;
}
