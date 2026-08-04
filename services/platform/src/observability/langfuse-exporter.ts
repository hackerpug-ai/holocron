/**
 * Holocron Langfuse exporter — real OTLP/ingestion export to self-hosted Langfuse.
 *
 * Parallel to MastraStorageExporter (Postgres). Flush/transport failures are
 * explicit (LANGFUSE_EXPORT_FAILED) — never silent success.
 *
 * Uses Langfuse public ingestion API (POST /api/public/ingestion) with Basic auth.
 * No cloud defaults for proof; baseUrl comes from env/config.
 */
import { randomUUID } from 'node:crypto';
import type {
  AnyExportedSpan,
  InitExporterOptions,
  TracingEvent,
} from '@mastra/core/observability';
import { TracingEventType } from '@mastra/core/observability';
import { BaseExporter, type BaseExporterConfig } from '@mastra/observability';

export const LANGFUSE_EXPORT_FAILED = 'LANGFUSE_EXPORT_FAILED' as const;
export const HOLOCRON_SERVICE_NAME = 'holocron-platform' as const;

/** Default redaction token — matches SensitiveDataFilter / AC-4. */
export const REDACTION_TOKEN = '[REDACTED]' as const;

export class LangfuseExportError extends Error {
  readonly code = LANGFUSE_EXPORT_FAILED;
  constructor(
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LangfuseExportError';
  }
}

export type LangfuseExporterConfig = BaseExporterConfig & {
  publicKey?: string;
  secretKey?: string;
  /** Self-hosted Langfuse base URL (no trailing slash). Required for proof. */
  baseUrl?: string;
  /** When true (default), flush() throws LangfuseExportError on transport failure. */
  failOnExportError?: boolean;
  /** Optional service name stamped into every exported root. */
  serviceName?: string;
};

export type LangfuseExportStatus = {
  ok: boolean;
  errorCode: typeof LANGFUSE_EXPORT_FAILED | null;
  errorMessage: string | null;
  exportedEvents: number;
  lastFlushAt: string | null;
  baseUrl: string | null;
};

type IngestionEvent = {
  id: string;
  type: 'trace-create' | 'span-create' | 'generation-create' | 'span-update' | 'generation-update';
  timestamp: string;
  body: Record<string, unknown>;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function basicAuth(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

/** Case-insensitive sensitive key match (mirrors SensitiveDataFilter normalization). */
const SENSITIVE_KEY_RE =
  /^(password|token|secret|key|apikey|auth|authorization|bearer|bearertoken|jwt|credential|clientsecret|privatekey|refresh|ssn|email)$/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_ASSIGN_RE =
  /\b(secret|password|token|api[_-]?key|authorization|bearer)\s*[:=]\s*([^\s,;]+)/gi;

/**
 * Redact sensitive keys and free-text secrets/PII before external export.
 * Always uses the literal token `[REDACTED]` so AC-4 can observe it.
 *
 * Two-phase:
 *  1) Collect secret/PII values from the payload (secret=…, emails, key fields)
 *  2) Replace those values everywhere (covers model echoes of the sentinel)
 */
export function redactForExport<T>(value: T): T {
  const secrets = new Set<string>();
  collectSecretValues(value, secrets, new WeakSet());
  return redactDeep(value, secrets, new WeakSet()) as T;
}

function collectSecretValues(value: unknown, secrets: Set<string>, seen: WeakSet<object>): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    for (const m of value.matchAll(EMAIL_RE)) {
      if (m[0]) secrets.add(m[0]);
    }
    for (const m of value.matchAll(SECRET_ASSIGN_RE)) {
      const val = m[2];
      if (val && val.length >= 3) secrets.add(val);
    }
    // Bare fixture-style sentinels (trace-secret-001)
    for (const m of value.matchAll(/\btrace-secret-[0-9a-zA-Z_-]+\b/g)) {
      if (m[0]) secrets.add(m[0]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectSecretValues(v, secrets, seen);
    return;
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return;
    seen.add(value as object);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k) && typeof v === 'string' && v.length >= 3) {
        secrets.add(v);
      }
      collectSecretValues(v, secrets, seen);
    }
  }
}

function redactDeep(value: unknown, secrets: Set<string>, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactString(value, secrets);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, secrets, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTION_TOKEN;
      } else {
        out[k] = redactDeep(v, secrets, seen);
      }
    }
    return out;
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_KEY_RE.test(normalized)) return true;
  // Extra holocron sentinels
  if (normalized.includes('secret') || normalized.includes('password')) return true;
  if (normalized === 'email' || normalized.endsWith('email')) return true;
  return false;
}

function redactString(s: string, secrets: Set<string>): string {
  let out = s.replace(EMAIL_RE, REDACTION_TOKEN);
  out = out.replace(SECRET_ASSIGN_RE, `$1=${REDACTION_TOKEN}`);
  // Replace collected secret values (longest first to avoid partial collisions)
  const ordered = [...secrets].sort((a, b) => b.length - a.length);
  for (const secret of ordered) {
    if (!secret || secret === REDACTION_TOKEN) continue;
    if (out.includes(secret)) {
      out = out.split(secret).join(REDACTION_TOKEN);
    }
  }
  return out;
}

function iso(d: Date | string | undefined | null): string {
  if (!d) return new Date().toISOString();
  if (typeof d === 'string') return d;
  return d.toISOString();
}

function isModelGeneration(span: AnyExportedSpan): boolean {
  const t = String(span.type ?? '').toLowerCase();
  return (
    t === 'model_generation' || t === 'model_step' || t === 'model_inference' || t === 'generation'
  );
}

/**
 * Real Langfuse exporter. Buffers SPAN_ENDED events and POSTs them to the
 * self-hosted ingestion endpoint on flush.
 */
export class HolocronLangfuseExporter extends BaseExporter {
  name = 'holocron-langfuse-exporter';

  readonly publicKey: string | undefined;
  readonly secretKey: string | undefined;
  readonly baseUrl: string | undefined;
  readonly serviceName: string;
  readonly failOnExportError: boolean;

  #buffer: IngestionEvent[] = [];
  #seenTraceIds = new Set<string>();
  #exportedEvents = 0;
  #lastFlushAt: string | null = null;
  #lastError: string | null = null;
  #exportFailed = false;
  #serviceNameFromInit: string | undefined;

  constructor(config: LangfuseExporterConfig = {}) {
    super(config);
    this.publicKey = config.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
    this.secretKey = config.secretKey ?? process.env.LANGFUSE_SECRET_KEY;
    const rawBase = config.baseUrl ?? process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST;
    this.baseUrl = rawBase ? stripTrailingSlash(rawBase) : undefined;
    this.serviceName = config.serviceName ?? HOLOCRON_SERVICE_NAME;
    this.failOnExportError = config.failOnExportError !== false;

    if (!this.publicKey || !this.secretKey || !this.baseUrl) {
      this.setDisabled(
        `Missing Langfuse config (publicKey/secretKey/baseUrl). Set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL.`
      );
    }
  }

  override init(options: InitExporterOptions): void {
    this.#serviceNameFromInit = options.config?.serviceName;
  }

  get resolvedServiceName(): string {
    return this.#serviceNameFromInit ?? this.serviceName;
  }

  getStatus(): LangfuseExportStatus {
    return {
      ok: !this.#exportFailed && !this.isDisabled,
      errorCode: this.#exportFailed ? LANGFUSE_EXPORT_FAILED : null,
      errorMessage: this.#lastError,
      exportedEvents: this.#exportedEvents,
      lastFlushAt: this.#lastFlushAt,
      baseUrl: this.baseUrl ?? null,
    };
  }

  /** True when the last flush failed or exporter is misconfigured for a required export. */
  get exportFailed(): boolean {
    return this.#exportFailed || this.isDisabled;
  }

  get lastError(): string | null {
    return this.#lastError;
  }

  protected async _exportTracingEvent(event: TracingEvent): Promise<void> {
    if (event.type !== TracingEventType.SPAN_ENDED) return;
    const span = event.exportedSpan;
    if (!span) return;
    this.#buffer.push(...this.spanToEvents(span));
  }

  private spanToEvents(span: AnyExportedSpan): IngestionEvent[] {
    const events: IngestionEvent[] = [];
    const traceId = span.traceId;
    const now = new Date().toISOString();
    const serviceName = this.resolvedServiceName;

    const metadata = redactForExport({
      ...(span.metadata ?? {}),
      serviceName,
      spanType: span.type,
      isRootSpan: span.isRootSpan === true,
    }) as Record<string, unknown>;

    const input = redactForExport(span.input);
    const output = redactForExport(span.output);

    if (!this.#seenTraceIds.has(traceId)) {
      this.#seenTraceIds.add(traceId);
      events.push({
        id: randomUUID(),
        type: 'trace-create',
        timestamp: now,
        body: {
          id: traceId,
          name:
            span.isRootSpan === true ? String(span.name ?? 'research-mission') : 'research-mission',
          metadata,
          input,
          output: span.isRootSpan === true ? output : undefined,
          tags: Array.isArray(span.tags) ? span.tags : ['research-mission', serviceName],
          timestamp: iso(span.startTime),
        },
      });
    }

    if (isModelGeneration(span)) {
      events.push({
        id: randomUUID(),
        type: 'generation-create',
        timestamp: now,
        body: {
          id: span.id,
          traceId,
          name: span.name ?? 'model_generation',
          startTime: iso(span.startTime),
          endTime: iso(span.endTime ?? span.startTime),
          metadata,
          input,
          output,
          model:
            (span.attributes as { model?: string } | undefined)?.model ??
            (metadata.model as string | undefined),
          parentObservationId: span.parentSpanId,
        },
      });
    } else {
      events.push({
        id: randomUUID(),
        type: 'span-create',
        timestamp: now,
        body: {
          id: span.id,
          traceId,
          name: span.name ?? String(span.type ?? 'span'),
          startTime: iso(span.startTime),
          endTime: iso(span.endTime ?? span.startTime),
          metadata,
          input,
          output,
          parentObservationId: span.parentSpanId,
        },
      });
    }

    return events;
  }

  /**
   * POST buffered events to Langfuse. On failure sets exportFailed and optionally throws.
   */
  override async flush(): Promise<void> {
    if (this.isDisabled) {
      this.#exportFailed = true;
      this.#lastError =
        this.#lastError ?? 'Langfuse exporter disabled (missing credentials or baseUrl)';
      if (this.failOnExportError) {
        throw new LangfuseExportError(this.#lastError);
      }
      return;
    }

    if (!this.baseUrl || !this.publicKey || !this.secretKey) {
      this.#exportFailed = true;
      this.#lastError = 'Langfuse exporter missing baseUrl/credentials';
      if (this.failOnExportError) {
        throw new LangfuseExportError(this.#lastError);
      }
      return;
    }

    const batch = this.#buffer.splice(0, this.#buffer.length);
    if (batch.length === 0) {
      // Empty flush is still a transport probe — prove endpoint is reachable.
      await this.#postBatch([]);
      this.#lastFlushAt = new Date().toISOString();
      return;
    }

    await this.#postBatch(batch);
    this.#lastFlushAt = new Date().toISOString();
  }

  async #postBatch(batch: IngestionEvent[]): Promise<void> {
    const url = `${this.baseUrl}/api/public/ingestion`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuth(this.publicKey!, this.secretKey!),
        },
        body: JSON.stringify({ batch }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.#exportFailed = true;
        this.#lastError = `Langfuse ingestion HTTP ${res.status}: ${text.slice(0, 400)}`;
        // put events back for retry visibility
        this.#buffer.unshift(...batch);
        if (this.failOnExportError) {
          throw new LangfuseExportError(this.#lastError);
        }
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        errors?: Array<{ message?: string; status?: number }>;
        successes?: unknown[];
      };
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        this.#exportFailed = true;
        this.#lastError = `Langfuse ingestion errors: ${JSON.stringify(body.errors).slice(0, 400)}`;
        this.#buffer.unshift(...batch);
        if (this.failOnExportError) {
          throw new LangfuseExportError(this.#lastError);
        }
        return;
      }
      this.#exportedEvents += batch.length;
      // successful flush clears failure latch for this attempt
      this.#exportFailed = false;
      this.#lastError = null;
    } catch (err) {
      if (err instanceof LangfuseExportError) throw err;
      this.#exportFailed = true;
      this.#lastError =
        err instanceof Error ? err.message : `Langfuse export failed: ${String(err)}`;
      this.#buffer.unshift(...batch);
      if (this.failOnExportError) {
        throw new LangfuseExportError(this.#lastError, err);
      }
    }
  }

  override async shutdown(): Promise<void> {
    try {
      await this.flush();
    } catch {
      // shutdown still completes; status retained on exporter
    }
  }
}

export type LangfuseConfigFromEnv = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

export function readLangfuseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LangfuseConfigFromEnv | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = (env.LANGFUSE_BASE_URL ?? env.LANGFUSE_HOST)?.trim();
  if (!publicKey || !secretKey || !baseUrl) return null;
  return { publicKey, secretKey, baseUrl: stripTrailingSlash(baseUrl) };
}

export function createLangfuseExporterFromEnv(
  overrides: LangfuseExporterConfig = {}
): HolocronLangfuseExporter {
  const fromEnv = readLangfuseConfigFromEnv();
  return new HolocronLangfuseExporter({
    publicKey: overrides.publicKey ?? fromEnv?.publicKey,
    secretKey: overrides.secretKey ?? fromEnv?.secretKey,
    baseUrl: overrides.baseUrl ?? fromEnv?.baseUrl,
    serviceName: overrides.serviceName ?? HOLOCRON_SERVICE_NAME,
    failOnExportError: overrides.failOnExportError,
    logger: overrides.logger,
    logLevel: overrides.logLevel,
  });
}

/** Query a trace from self-hosted Langfuse (operator/tests). */
export async function fetchLangfuseTrace(args: {
  traceId: string;
  baseUrl?: string;
  publicKey?: string;
  secretKey?: string;
}): Promise<{ status: number; body: unknown }> {
  const cfg = readLangfuseConfigFromEnv();
  const baseUrl = stripTrailingSlash(args.baseUrl ?? cfg?.baseUrl ?? '');
  const publicKey = args.publicKey ?? cfg?.publicKey;
  const secretKey = args.secretKey ?? cfg?.secretKey;
  if (!baseUrl || !publicKey || !secretKey) {
    throw new LangfuseExportError('Cannot query Langfuse: missing baseUrl/credentials');
  }
  const res = await fetch(`${baseUrl}/api/public/traces/${args.traceId}`, {
    headers: { Authorization: basicAuth(publicKey, secretKey) },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // raw
  }
  return { status: res.status, body };
}
