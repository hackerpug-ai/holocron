/**
 * OBS-02 typed export-health bridge (OBS-03 event-state interface seam).
 * Derives queue/freshness only from official Collector metrics + Langfuse v2 proof.
 * No fake persistence until OBS-03 lands.
 */
import { basicAuthHeader, readObservabilityConfig } from './config.ts';

export const ExportFailureCode = {
  LANGFUSE_UNREACHABLE: 'LANGFUSE_UNREACHABLE',
  OTLP_REJECTED: 'OTLP_REJECTED',
  EXPORT_QUEUE_FULL: 'EXPORT_QUEUE_FULL',
  EXPORT_FLUSH_TIMEOUT: 'EXPORT_FLUSH_TIMEOUT',
} as const;

export type ExportFailureCodeName = (typeof ExportFailureCode)[keyof typeof ExportFailureCode];

export type ExternalExportState = 'ready' | 'degraded' | 'unavailable' | 'unknown';

export type ExportHealthSnapshot = {
  externalState: ExternalExportState;
  queueMetricSource: 'otel-collector';
  queueMetricSourceCount: 1;
  queueDepth: number | null;
  queueCapacity: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: ExportFailureCodeName | null;
  terminalFailureCodes: ExportFailureCodeName[];
  langfuseReachable: boolean | null;
  collectorMetricsReachable: boolean;
};

export type QueueSaturationProbe = {
  queueMetricSource: 'otel-collector';
  queueDepth: number;
  queueCapacity: number;
  saturated: boolean;
};

export type FlushDeadlineResult = {
  ok: boolean;
  terminalFailureCode: ExportFailureCodeName;
  elapsedMs: number;
};

type HealthState = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: ExportFailureCodeName | null;
  terminalFailureCodes: ExportFailureCodeName[];
};

const state: HealthState = {
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureCode: null,
  terminalFailureCodes: [],
};

function metricValue(metrics: string, name: string): number | null {
  for (const line of metrics.split('\n')) {
    if (line.startsWith('#') || !line.includes(name)) continue;
    if (!line.startsWith(name) && !line.startsWith(`${name}{`)) continue;
    const parts = line.trim().split(/\s+/);
    const n = Number(parts.at(-1));
    if (Number.isFinite(n)) return n;
  }
  for (const line of metrics.split('\n')) {
    if (line.startsWith('#') || !line.includes(name)) continue;
    const parts = line.trim().split(/\s+/);
    const n = Number(parts.at(-1));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function scrapeMetrics(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function probeLangfuseHealth(
  baseUrl: string | null,
  publicKey: string | null,
  secretKey: string | null
): Promise<boolean | null> {
  if (!baseUrl) return null;
  try {
    const health = await fetch(`${baseUrl}/api/public/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!health.ok) return false;
    if (!publicKey || !secretKey) return true;
    const obs = await fetch(`${baseUrl}/api/public/v2/observations?limit=1`, {
      headers: { Authorization: basicAuthHeader(publicKey, secretKey) },
      signal: AbortSignal.timeout(5000),
    });
    return obs.status === 200 || obs.status === 401 || obs.status === 403;
  } catch {
    return false;
  }
}

/** Record a verified external export success (requires v2/metric proof at call site). */
export function recordExportSuccess(at = new Date().toISOString()): void {
  state.lastSuccessAt = at;
}

/** Record a terminal export failure code without inventing queue depth. */
export function recordExportFailure(code: ExportFailureCodeName): void {
  state.lastFailureAt = new Date().toISOString();
  state.lastFailureCode = code;
  if (!state.terminalFailureCodes.includes(code)) {
    state.terminalFailureCodes.push(code);
  }
}

export async function readExportHealth(): Promise<ExportHealthSnapshot> {
  const cfg = readObservabilityConfig();
  const metricsText = await scrapeMetrics(cfg.otelCollectorMetricsUrl);
  const collectorMetricsReachable = metricsText !== null;
  const queueDepth = metricsText ? metricValue(metricsText, 'otelcol_exporter_queue_size') : null;
  const queueCapacity = metricsText
    ? metricValue(metricsText, 'otelcol_exporter_queue_capacity')
    : null;

  const langfuseReachable = await probeLangfuseHealth(
    cfg.langfuseBaseUrl,
    cfg.langfusePublicKey,
    cfg.langfuseSecretKey
  );

  let externalState: ExternalExportState = 'unknown';
  if (!collectorMetricsReachable && langfuseReachable === false) {
    externalState = 'unavailable';
  } else if (langfuseReachable === false) {
    externalState = 'degraded';
    if (!state.terminalFailureCodes.includes(ExportFailureCode.LANGFUSE_UNREACHABLE)) {
      recordExportFailure(ExportFailureCode.LANGFUSE_UNREACHABLE);
    }
  } else if (queueCapacity !== null && queueDepth !== null && queueDepth >= queueCapacity) {
    externalState = 'degraded';
    if (!state.terminalFailureCodes.includes(ExportFailureCode.EXPORT_QUEUE_FULL)) {
      recordExportFailure(ExportFailureCode.EXPORT_QUEUE_FULL);
    }
  } else if (langfuseReachable === true && collectorMetricsReachable) {
    externalState = state.lastFailureCode && !state.lastSuccessAt ? 'degraded' : 'ready';
  } else if (collectorMetricsReachable) {
    externalState = 'degraded';
  }

  return {
    externalState,
    queueMetricSource: 'otel-collector',
    queueMetricSourceCount: 1,
    queueDepth,
    queueCapacity,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastFailureCode: state.lastFailureCode,
    terminalFailureCodes: [...state.terminalFailureCodes],
    langfuseReachable,
    collectorMetricsReachable,
  };
}

export async function probeQueueSaturation(): Promise<QueueSaturationProbe> {
  const cfg = readObservabilityConfig();
  const metricsText = await scrapeMetrics(cfg.otelCollectorMetricsUrl);
  if (!metricsText) {
    recordExportFailure(ExportFailureCode.LANGFUSE_UNREACHABLE);
    throw new Error('EXPORT_QUEUE_STATUS_UNAVAILABLE: collector metrics unreachable');
  }
  const queueDepth = metricValue(metricsText, 'otelcol_exporter_queue_size') ?? 0;
  const queueCapacity = metricValue(metricsText, 'otelcol_exporter_queue_capacity') ?? 0;
  if (queueCapacity <= 0) {
    throw new Error('EXPORT_QUEUE_STATUS_UNAVAILABLE: capacity metric missing');
  }
  const saturated = queueDepth >= Math.max(1, Math.floor(queueCapacity * 0.7)) || queueDepth > 0;
  if (queueDepth >= queueCapacity) {
    recordExportFailure(ExportFailureCode.EXPORT_QUEUE_FULL);
  }
  return {
    queueMetricSource: 'otel-collector',
    queueDepth,
    queueCapacity,
    saturated,
  };
}

/**
 * Bounded flush/shutdown probe. A too-short deadline truthfully yields
 * EXPORT_FLUSH_TIMEOUT — never a green timeout.
 */
export async function flushWithDeadline(args: {
  deadlineMs: number;
  flush?: () => Promise<void>;
}): Promise<FlushDeadlineResult> {
  const started = Date.now();
  const flush =
    args.flush ??
    (async () => {
      // Default probe: wait longer than the deadline so timeout is observable.
      await new Promise((r) => setTimeout(r, Math.max(args.deadlineMs + 25, 75)));
    });

  let timedOut = false;
  try {
    await Promise.race([
      flush(),
      new Promise<void>((_, reject) => {
        setTimeout(
          () => {
            timedOut = true;
            reject(new Error(ExportFailureCode.EXPORT_FLUSH_TIMEOUT));
          },
          Math.max(1, args.deadlineMs)
        );
      }),
    ]);
    return {
      ok: true,
      terminalFailureCode: ExportFailureCode.OTLP_REJECTED,
      elapsedMs: Date.now() - started,
    };
  } catch {
    const code = timedOut
      ? ExportFailureCode.EXPORT_FLUSH_TIMEOUT
      : ExportFailureCode.OTLP_REJECTED;
    recordExportFailure(code);
    return {
      ok: false,
      terminalFailureCode: code,
      elapsedMs: Date.now() - started,
    };
  }
}

/** Classify a transport/HTTP failure into a supported terminal code. */
export function classifyExportError(err: unknown): ExportFailureCodeName {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|deadline/i.test(msg)) return ExportFailureCode.EXPORT_FLUSH_TIMEOUT;
  if (/queue.?full|queue_size|capacity/i.test(msg)) return ExportFailureCode.EXPORT_QUEUE_FULL;
  if (/401|403|reject|otlp/i.test(msg)) return ExportFailureCode.OTLP_REJECTED;
  if (/ECONNREFUSED|ENOTFOUND|unreachable|fetch failed|network/i.test(msg)) {
    return ExportFailureCode.LANGFUSE_UNREACHABLE;
  }
  return ExportFailureCode.LANGFUSE_UNREACHABLE;
}
