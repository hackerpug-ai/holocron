/**
 * Names-only observability config for OBS-02 OTLP v4 path.
 * Secrets stay in env / secrets.yaml — never hardcoded here.
 */

export const HOLOCRON_SERVICE_NAME = 'holocron-platform' as const;

/**
 * Holocron attribute allowlist for operational metadata.
 * Raw auth headers, credentials, and unbounded prompt/output bodies are excluded.
 */
export const HOLOCRON_ATTRIBUTE_ALLOWLIST = [
  'serviceName',
  'service.name',
  'runId',
  'traceId',
  'spanId',
  'missionId',
  'workflowRunId',
  'toolCallId',
  'role',
  'provider',
  'model',
  'modelId',
  'endpoint',
  'callKind',
  'status',
  'environment',
  'releaseSha',
  'imageDigest',
  'spanType',
  'isRootSpan',
  'job_name',
  'last_wal_segment',
  'last_snapshot_id',
  'object_count',
  'mission',
  'phase',
  'stepId',
] as const;

export type HolocronAttributeKey = (typeof HOLOCRON_ATTRIBUTE_ALLOWLIST)[number];

export type ObservabilitySinkConfig = {
  serviceName: typeof HOLOCRON_SERVICE_NAME;
  databaseUrl: string;
  otelCollectorUrl: string;
  otelCollectorMetricsUrl: string;
  langfuseBaseUrl: string | null;
  langfusePublicKey: string | null;
  langfuseSecretKey: string | null;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function trimOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Read validated, names-only observability config from env. */
export function readObservabilityConfig(
  env: NodeJS.ProcessEnv = process.env
): ObservabilitySinkConfig {
  const langfuseBase =
    trimOrNull(env.LANGFUSE_BASE_URL) ?? trimOrNull(env.LANGFUSE_HOST);
  return {
    serviceName: HOLOCRON_SERVICE_NAME,
    databaseUrl: env.DATABASE_URL?.trim() || 'postgres://127.0.0.1:5432/holocron',
    otelCollectorUrl: stripTrailingSlash(
      env.OTEL_COLLECTOR_URL?.trim() || 'http://127.0.0.1:14318/v1/traces'
    ),
    otelCollectorMetricsUrl: stripTrailingSlash(
      env.OTEL_COLLECTOR_METRICS_URL?.trim() || 'http://127.0.0.1:18888/metrics'
    ),
    langfuseBaseUrl: langfuseBase ? stripTrailingSlash(langfuseBase) : null,
    langfusePublicKey: trimOrNull(env.LANGFUSE_PUBLIC_KEY),
    langfuseSecretKey: trimOrNull(env.LANGFUSE_SECRET_KEY),
  };
}

export type LangfuseConfigFromEnv = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

export function readLangfuseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LangfuseConfigFromEnv | null {
  const cfg = readObservabilityConfig(env);
  if (!cfg.langfuseBaseUrl || !cfg.langfusePublicKey || !cfg.langfuseSecretKey) {
    return null;
  }
  return {
    publicKey: cfg.langfusePublicKey,
    secretKey: cfg.langfuseSecretKey,
    baseUrl: cfg.langfuseBaseUrl,
  };
}

export function basicAuthHeader(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}
