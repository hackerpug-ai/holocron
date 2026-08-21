/**
 * OBS-02 Holocron OTLP export bridge.
 *
 * Production path: @mastra/otel-exporter → pinned Collector → Langfuse OTLP v4.
 * Legacy custom ingestion exporter is retired.
 */
import { randomUUID } from 'node:crypto';
import type {
  AnyExportedSpan,
  InitExporterOptions,
  TracingEvent,
} from '@mastra/core/observability';
import { TracingEventType } from '@mastra/core/observability';
import { BaseExporter, type BaseExporterConfig } from '@mastra/observability';
import { OtelExporter } from '@mastra/otel-exporter';
import {
  basicAuthHeader,
  HOLOCRON_ATTRIBUTE_ALLOWLIST,
  HOLOCRON_SERVICE_NAME,
  type LangfuseConfigFromEnv,
  readLangfuseConfigFromEnv,
  readObservabilityConfig,
} from './config.ts';
import {
  classifyExportError,
  ExportFailureCode,
  type ExportFailureCodeName,
  recordExportFailure,
  recordExportSuccess,
} from './export-health.ts';
import { filterAllowlistedAttributes, REDACTION_TOKEN, redactForExport } from './redaction.ts';

export {
  HOLOCRON_SERVICE_NAME,
  type LangfuseConfigFromEnv,
  readLangfuseConfigFromEnv,
} from './config.ts';
export { ExportFailureCode } from './export-health.ts';
export { REDACTION_TOKEN, redactForExport } from './redaction.ts';

/** @deprecated OBS-02 terminal codes replace LANGFUSE_EXPORT_FAILED. */
export const LANGFUSE_EXPORT_FAILED = ExportFailureCode.LANGFUSE_UNREACHABLE;

export class LangfuseExportError extends Error {
  readonly code: ExportFailureCodeName;
  constructor(
    message: string,
    override readonly cause?: unknown,
    code: ExportFailureCodeName = ExportFailureCode.LANGFUSE_UNREACHABLE
  ) {
    super(message);
    this.name = 'LangfuseExportError';
    this.code = code;
  }
}

export type OtelBridgeConfig = BaseExporterConfig & {
  collectorUrl?: string;
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  serviceName?: string;
  /** Soft by default — external sink failure must not take missions down. */
  failOnExportError?: boolean;
};

export type LangfuseExportStatus = {
  ok: boolean;
  errorCode: ExportFailureCodeName | null;
  errorMessage: string | null;
  exportedEvents: number;
  lastFlushAt: string | null;
  baseUrl: string | null;
  collectorUrl: string | null;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function iso(d: Date | string | undefined | null): string {
  if (!d) return new Date().toISOString();
  if (typeof d === 'string') return d;
  return d.toISOString();
}

/**
 * Mission/backup bridge over OtelExporter.
 * Buffers SPAN_ENDED events and flushes through the Collector; never posts
 * to legacy-ingestion-endpoint.
 */
export class HolocronOtelBridge extends BaseExporter {
  name = 'holocron-otel-exporter';

  readonly publicKey: string | undefined;
  readonly secretKey: string | undefined;
  readonly baseUrl: string | undefined;
  readonly collectorUrl: string;
  readonly serviceName: string;
  readonly failOnExportError: boolean;

  #otel: OtelExporter;
  #buffer: TracingEvent[] = [];
  #exportedEvents = 0;
  #lastFlushAt: string | null = null;
  #lastError: string | null = null;
  #exportFailed = false;
  #lastFailureCode: ExportFailureCodeName | null = null;
  #serviceNameFromInit: string | undefined;
  #initialized = false;

  constructor(config: OtelBridgeConfig = {}) {
    super(config);
    const obs = readObservabilityConfig();
    this.publicKey = config.publicKey ?? obs.langfusePublicKey ?? undefined;
    this.secretKey = config.secretKey ?? obs.langfuseSecretKey ?? undefined;
    const rawBase = config.baseUrl ?? obs.langfuseBaseUrl ?? undefined;
    this.baseUrl = rawBase ? stripTrailingSlash(rawBase) : undefined;
    this.collectorUrl = stripTrailingSlash(config.collectorUrl ?? obs.otelCollectorUrl);
    this.serviceName = config.serviceName ?? HOLOCRON_SERVICE_NAME;
    this.failOnExportError = config.failOnExportError === true;

    this.#otel = new OtelExporter({
      provider: {
        custom: {
          endpoint: this.collectorUrl,
          protocol: 'http/json',
          headers: {},
        },
      },
      timeout: 10_000,
      batchSize: 16,
      signals: { traces: true, logs: false },
      logger: config.logger,
      logLevel: config.logLevel ?? 'error',
    });
  }

  override init(options: InitExporterOptions): void {
    this.#serviceNameFromInit = options.config?.serviceName;
    this.#otel.init(options);
    this.#initialized = true;
  }

  get resolvedServiceName(): string {
    return this.#serviceNameFromInit ?? this.serviceName;
  }

  get exportFailed(): boolean {
    return this.#exportFailed || this.isDisabled;
  }

  get lastError(): string | null {
    return this.#lastError;
  }

  getStatus(): LangfuseExportStatus {
    return {
      ok: !this.#exportFailed && !this.isDisabled,
      errorCode: this.#exportFailed
        ? (this.#lastFailureCode ?? ExportFailureCode.LANGFUSE_UNREACHABLE)
        : null,
      errorMessage: this.#lastError,
      exportedEvents: this.#exportedEvents,
      lastFlushAt: this.#lastFlushAt,
      baseUrl: this.baseUrl ?? null,
      collectorUrl: this.collectorUrl,
    };
  }

  protected async _exportTracingEvent(event: TracingEvent): Promise<void> {
    if (event.type !== TracingEventType.SPAN_ENDED) return;
    const span = event.exportedSpan;
    if (!span) return;
    this.#buffer.push({
      type: TracingEventType.SPAN_ENDED,
      exportedSpan: this.#sanitizeSpan(span),
    });
  }

  #sanitizeSpan(span: AnyExportedSpan): AnyExportedSpan {
    const metadata = filterAllowlistedAttributes(
      redactForExport({
        ...(span.metadata ?? {}),
        serviceName: this.resolvedServiceName,
        spanType: span.type,
        isRootSpan: span.isRootSpan === true,
      }) as Record<string, unknown>,
      HOLOCRON_ATTRIBUTE_ALLOWLIST
    );
    return {
      ...span,
      metadata,
      input: redactForExport(span.input),
      output: redactForExport(span.output),
      attributes: span.attributes
        ? (filterAllowlistedAttributes(
            redactForExport(span.attributes as Record<string, unknown>) as Record<string, unknown>,
            HOLOCRON_ATTRIBUTE_ALLOWLIST
          ) as typeof span.attributes)
        : span.attributes,
    };
  }

  /**
   * Flush buffered spans through OtelExporter → Collector.
   * Failures set degraded status; only throw when failOnExportError is true.
   */
  override async flush(): Promise<void> {
    if (!this.#initialized) {
      this.#otel.init({
        config: { serviceName: this.resolvedServiceName },
      } as InitExporterOptions);
      this.#initialized = true;
    }

    const batch = this.#buffer.splice(0, this.#buffer.length);
    try {
      for (const event of batch) {
        await this.#otel.exportTracingEvent(event);
      }
      await this.#otel.flush();
      this.#exportedEvents += batch.length;
      this.#lastFlushAt = new Date().toISOString();

      // Probe collector metrics reachability — do not mark last-success without proof.
      const cfg = readObservabilityConfig();
      const metrics = await fetch(cfg.otelCollectorMetricsUrl, {
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
      if (!metrics?.ok) {
        this.#exportFailed = true;
        this.#lastFailureCode = ExportFailureCode.LANGFUSE_UNREACHABLE;
        this.#lastError = 'collector metrics unreachable after flush';
        recordExportFailure(ExportFailureCode.LANGFUSE_UNREACHABLE);
        if (this.failOnExportError) {
          throw new LangfuseExportError(this.#lastError, undefined, this.#lastFailureCode);
        }
        return;
      }

      // Bounded v2 confirmation when Langfuse credentials are present (retry briefly).
      if (this.baseUrl && this.publicKey && this.secretKey) {
        let v2: Response | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          v2 = await fetch(`${this.baseUrl}/api/public/v2/observations?limit=1`, {
            headers: {
              Authorization: basicAuthHeader(this.publicKey, this.secretKey),
            },
            signal: AbortSignal.timeout(5000),
          }).catch(() => null);
          if (v2 && (v2.status === 200 || v2.status === 401 || v2.status === 403)) break;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
        if (!v2 || (v2.status !== 200 && v2.status !== 401 && v2.status !== 403)) {
          this.#exportFailed = true;
          this.#lastFailureCode = ExportFailureCode.LANGFUSE_UNREACHABLE;
          this.#lastError = `Langfuse Observations API v2 unreachable (status=${v2?.status ?? 'fetch-failed'})`;
          recordExportFailure(ExportFailureCode.LANGFUSE_UNREACHABLE);
          if (this.failOnExportError) {
            throw new LangfuseExportError(this.#lastError, undefined, this.#lastFailureCode);
          }
          return;
        }
        if (v2.status === 200) {
          recordExportSuccess();
        }
      } else {
        // Collector accepted flush; Langfuse identity not configured for v2 proof.
        recordExportSuccess();
      }

      this.#exportFailed = false;
      this.#lastError = null;
      this.#lastFailureCode = null;
    } catch (err) {
      if (err instanceof LangfuseExportError) throw err;
      const code = classifyExportError(err);
      this.#exportFailed = true;
      this.#lastFailureCode = code;
      this.#lastError = err instanceof Error ? err.message : String(err);
      this.#buffer.unshift(...batch);
      recordExportFailure(code);
      if (this.failOnExportError) {
        throw new LangfuseExportError(this.#lastError, err, code);
      }
    }
  }

  override async shutdown(): Promise<void> {
    try {
      await this.flush();
    } catch {
      // shutdown still completes; status retained
    }
    try {
      await this.#otel.shutdown();
    } catch {
      // ignore
    }
  }

  /** Enqueue a pre-built SPAN_ENDED event (mission/backup instrumentation). */
  enqueueSpan(span: AnyExportedSpan): void {
    this.#buffer.push({
      type: TracingEventType.SPAN_ENDED,
      exportedSpan: this.#sanitizeSpan(span),
    });
  }
}

export type LangfuseExporterConfig = OtelBridgeConfig;

export function createOtelBridgeFromEnv(overrides: OtelBridgeConfig = {}): HolocronOtelBridge {
  const fromEnv = readLangfuseConfigFromEnv();
  const obs = readObservabilityConfig();
  return new HolocronOtelBridge({
    publicKey: overrides.publicKey ?? fromEnv?.publicKey,
    secretKey: overrides.secretKey ?? fromEnv?.secretKey,
    baseUrl: overrides.baseUrl ?? fromEnv?.baseUrl,
    collectorUrl: overrides.collectorUrl ?? obs.otelCollectorUrl,
    serviceName: overrides.serviceName ?? HOLOCRON_SERVICE_NAME,
    failOnExportError: overrides.failOnExportError === true,
    logger: overrides.logger,
    logLevel: overrides.logLevel,
  });
}

/** @deprecated use createOtelBridgeFromEnv */
export function createLangfuseExporterFromEnv(
  overrides: OtelBridgeConfig = {}
): HolocronOtelBridge {
  return createOtelBridgeFromEnv(overrides);
}

/**
 * Buffer a mission root span + model-generation span for a real fleet call.
 */
export function bufferMissionModelCall(
  exporter: HolocronOtelBridge,
  args: {
    traceId: string;
    runId: string;
    stepId?: string | null;
    name?: string;
    endpoint: string;
    modelId?: string | null;
    role?: string;
    callKind?: string;
    startTime: Date;
    endTime: Date;
    input?: unknown;
    output?: unknown;
    status?: string;
  }
): void {
  const spanId = randomUUID().replace(/-/g, '').slice(0, 16);
  const rootId = randomUUID().replace(/-/g, '').slice(0, 16);
  const metadata = redactForExport({
    serviceName: exporter.resolvedServiceName,
    spanType: 'model_generation',
    endpoint: args.endpoint,
    model: args.modelId ?? undefined,
    role: args.role,
    runId: args.runId,
    stepId: args.stepId ?? undefined,
    callKind: args.callKind,
    status: args.status,
  }) as Record<string, unknown>;

  exporter.enqueueSpan({
    id: rootId,
    traceId: args.traceId,
    name: 'research-mission',
    type: 'span',
    isRootSpan: true,
    startTime: args.startTime,
    endTime: args.endTime,
    metadata: redactForExport({
      serviceName: exporter.resolvedServiceName,
      runId: args.runId,
      isRootSpan: true,
    }) as Record<string, unknown>,
    tags: ['research-mission', exporter.resolvedServiceName],
  } as AnyExportedSpan);

  exporter.enqueueSpan({
    id: spanId,
    traceId: args.traceId,
    name: args.name ?? 'model_generation',
    type: 'model_generation',
    isRootSpan: false,
    parentSpanId: rootId,
    startTime: args.startTime,
    endTime: args.endTime,
    metadata,
    input: redactForExport(args.input),
    output: redactForExport(args.output),
    attributes: { model: args.modelId ?? undefined },
    tags: ['research-mission', exporter.resolvedServiceName],
  } as AnyExportedSpan);
}

/** Query observations via Langfuse Observations API v2 (not deprecated traces). */
export async function fetchLangfuseObservations(args: {
  traceId?: string;
  limit?: number;
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
  const qs = new URLSearchParams({ limit: String(args.limit ?? 50) });
  if (args.traceId) qs.set('traceId', args.traceId);
  const res = await fetch(`${baseUrl}/api/public/v2/observations?${qs.toString()}`, {
    headers: { Authorization: basicAuthHeader(publicKey, secretKey) },
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

/** @deprecated use fetchLangfuseObservations (v2). Kept for transitional callers. */
export async function fetchLangfuseTrace(args: {
  traceId: string;
  baseUrl?: string;
  publicKey?: string;
  secretKey?: string;
}): Promise<{ status: number; body: unknown }> {
  const obs = await fetchLangfuseObservations(args);
  if (obs.status !== 200 || !obs.body || typeof obs.body !== 'object') return obs;
  const data = ((obs.body as { data?: Array<Record<string, unknown>> }).data ?? []).filter(
    (o) => String(o.traceId ?? '') === args.traceId
  );
  if (data.length === 0) return { status: 404, body: { message: 'trace not found via v2' } };
  return {
    status: 200,
    body: {
      id: args.traceId,
      observations: data,
      metadata: data[0]?.metadata ?? {},
    },
  };
}

export { iso };
