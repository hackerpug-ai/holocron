/**
 * Research mission runner — one real fleet model call under Mastra Observability,
 * exported to Postgres (MastraStorageExporter) + self-hosted Langfuse.
 *
 * Also records one durable inference_telemetry row per real model call
 * (obs-5 AC-2 / FIX-obs-5-H1) correlated by runId + traceId.
 *
 * Public CLI entry: `holo mission run research --goal <text> [--json]`
 */
import { randomUUID } from 'node:crypto';
import { Mastra } from '@mastra/core/mastra';
import { MastraStorageExporter, Observability, SensitiveDataFilter } from '@mastra/observability';
import { createFleetAgentWithResolved } from '../compat/cells/agent.ts';
import {
  displayEndpoint,
  type InferenceTelemetryRecord,
  recordInferenceTelemetry,
} from '../inference/telemetry.ts';
import { assertNoTripwire } from '../mastra/tripwire.ts';
import { createStorage } from '../mastra.ts';
import {
  createLangfuseExporterFromEnv,
  HOLOCRON_SERVICE_NAME,
  type HolocronLangfuseExporter,
  LANGFUSE_EXPORT_FAILED,
  LangfuseExportError,
  type LangfuseExportStatus,
} from './langfuse-exporter.ts';

export type ResearchMissionResult = {
  ok: boolean;
  runId: string;
  traceId: string | null;
  serviceName: string;
  role: string;
  goal: string;
  text: string | null;
  langfuseExportOk: boolean;
  langfuse: LangfuseExportStatus;
  /** Durable inference_telemetry row for the model call (null if resolve failed pre-call). */
  inferenceTelemetry: InferenceTelemetryRecord | null;
  errorCode: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
};

function usageTokens(usage: unknown): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const u = (usage ?? {}) as Record<string, unknown>;
  const inputTokens = Math.max(0, Math.floor(Number(u.inputTokens ?? u.promptTokens ?? 0) || 0));
  const outputTokens = Math.max(
    0,
    Math.floor(Number(u.outputTokens ?? u.completionTokens ?? 0) || 0)
  );
  let totalTokens = Math.max(0, Math.floor(Number(u.totalTokens ?? 0) || 0));
  if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
    totalTokens = inputTokens + outputTokens;
  }
  return { inputTokens, outputTokens, totalTokens };
}

export type RunResearchMissionOptions = {
  goal: string;
  role?: string;
  runId?: string;
  /** Override Langfuse base URL (used by export-failure negative control). */
  langfuseBaseUrl?: string;
  langfusePublicKey?: string;
  langfuseSecretKey?: string;
  /**
   * When true (default for CLI), Langfuse export failure throws LangfuseExportError
   * carrying `missionResult` so the CLI can print JSON and exit 1.
   */
  throwOnExportFailure?: boolean;
};

function toHexTraceId(seed: string): string {
  const hex = seed.replace(/-/g, '').toLowerCase();
  if (/^[0-9a-f]{32}$/.test(hex)) return hex;
  return randomUUID().replace(/-/g, '');
}

/**
 * Build Observability with Postgres storage exporter + Holocron Langfuse exporter.
 * serviceName is always holocron-platform (obs-1 contract).
 */
export function createMissionObservability(args?: { langfuse?: HolocronLangfuseExporter }): {
  observability: Observability;
  langfuseExporter: HolocronLangfuseExporter;
} {
  const langfuseExporter =
    args?.langfuse ??
    createLangfuseExporterFromEnv({
      serviceName: HOLOCRON_SERVICE_NAME,
      failOnExportError: true,
    });

  const observability = new Observability({
    configs: {
      default: {
        serviceName: HOLOCRON_SERVICE_NAME,
        sampling: { type: 'always' as const },
        exporters: [new MastraStorageExporter(), langfuseExporter],
        spanOutputProcessors: [
          new SensitiveDataFilter({
            sensitiveFields: [
              'password',
              'token',
              'secret',
              'key',
              'apikey',
              'auth',
              'authorization',
              'bearer',
              'jwt',
              'credential',
              'clientsecret',
              'privatekey',
              'refresh',
              'ssn',
              'email',
            ],
            redactionToken: '[REDACTED]',
            redactionStyle: 'full',
          }),
        ],
      },
    },
  });

  return { observability, langfuseExporter };
}

/**
 * Run one research mission against the live fleet and flush traces to Langfuse.
 */
export async function runResearchMission(
  options: RunResearchMissionOptions
): Promise<ResearchMissionResult> {
  const goal = options.goal?.trim();
  if (!goal) {
    return {
      ok: false,
      runId: options.runId ?? randomUUID(),
      traceId: null,
      serviceName: HOLOCRON_SERVICE_NAME,
      role: options.role ?? 'divergent',
      goal: options.goal ?? '',
      text: null,
      langfuseExportOk: false,
      langfuse: {
        ok: false,
        errorCode: LANGFUSE_EXPORT_FAILED,
        errorMessage: 'missing --goal',
        exportedEvents: 0,
        lastFlushAt: null,
        baseUrl: null,
      },
      inferenceTelemetry: null,
      errorCode: 'MISSION_GOAL_REQUIRED',
      error: 'mission run research requires --goal <text>',
      metadata: {},
    };
  }

  const role = options.role ?? 'divergent';
  const runId = options.runId ?? randomUUID();
  const traceId = toHexTraceId(runId);

  const langfuseExporter = createLangfuseExporterFromEnv({
    baseUrl: options.langfuseBaseUrl,
    publicKey: options.langfusePublicKey,
    secretKey: options.langfuseSecretKey,
    serviceName: HOLOCRON_SERVICE_NAME,
    failOnExportError: true,
  });

  const { observability } = createMissionObservability({ langfuse: langfuseExporter });
  const storage = createStorage();

  let agentBundle: Awaited<ReturnType<typeof createFleetAgentWithResolved>>;
  try {
    agentBundle = await createFleetAgentWithResolved({
      role,
      agentId: 'research-mission-agent',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      runId,
      traceId: null,
      serviceName: HOLOCRON_SERVICE_NAME,
      role,
      goal,
      text: null,
      langfuseExportOk: false,
      langfuse: langfuseExporter.getStatus(),
      inferenceTelemetry: null,
      errorCode: 'FLEET_RESOLVE_FAILED',
      error: msg,
      metadata: { role, runId },
    };
  }

  const researchAgent = agentBundle.agent;
  const mastra = new Mastra({
    storage,
    observability,
    agents: { 'research-mission-agent': researchAgent },
  });

  let text: string | null = null;
  let resultTraceId: string | null = traceId;
  let generateError: string | null = null;
  let inferenceTelemetry: InferenceTelemetryRecord | null = null;
  const modelCallStarted = Date.now();
  const stepId = 'research-mission-generate';
  const endpoint = displayEndpoint(agentBundle.resolved);
  const modelId = agentBundle.resolved.litellmModelId;

  try {
    const result = await researchAgent.generate(
      `Research mission goal: ${goal}\nRespond with a brief research finding.`,
      {
        tracingOptions: {
          traceId,
          metadata: {
            role,
            runId,
            serviceName: HOLOCRON_SERVICE_NAME,
            mission: 'research',
            goal,
          },
          tags: ['research-mission', HOLOCRON_SERVICE_NAME, role],
        },
      }
    );
    assertNoTripwire(result);
    text = result.text?.trim() ? result.text : null;
    if (result.traceId) {
      resultTraceId = String(result.traceId);
    }
    const wallMs = Math.max(1, Date.now() - modelCallStarted);
    const tokens = usageTokens(
      (result as { usage?: unknown; totalUsage?: unknown }).usage ??
        (result as { totalUsage?: unknown }).totalUsage
    );
    // Durable per-call ledger (obs-5): never invent success without a real call.
    inferenceTelemetry = await recordInferenceTelemetry({
      runId,
      stepId,
      traceId: resultTraceId,
      role: agentBundle.resolved.role,
      provider: 'fleet',
      endpoint,
      modelId,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      totalTokens: tokens.totalTokens,
      wallMs,
      status: text ? 'success' : 'degraded',
      errorCode: text ? null : 'EMPTY_RESPONSE',
      errorMessage: text ? null : 'agent returned empty text',
    });
    if (!text) {
      generateError = 'agent returned empty text';
    }
  } catch (err) {
    generateError = err instanceof Error ? err.message : String(err);
    const wallMs = Math.max(1, Date.now() - modelCallStarted);
    try {
      inferenceTelemetry = await recordInferenceTelemetry({
        runId,
        stepId,
        traceId: resultTraceId,
        role: agentBundle.resolved.role,
        provider: 'fleet',
        endpoint,
        modelId,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        wallMs,
        status: 'error',
        errorCode: 'MISSION_GENERATE_FAILED',
        errorMessage: generateError,
      });
    } catch (telemetryErr) {
      // Telemetry insert failure must not mask the original generate error,
      // but operators still need a fail-closed signal in metadata.
      generateError = `${generateError}; telemetry-record-failed: ${
        telemetryErr instanceof Error ? telemetryErr.message : String(telemetryErr)
      }`;
    }
  }

  let langfuseOk = false;
  let exportError: string | null = null;
  let errorCode: string | null = null;

  try {
    await langfuseExporter.flush();
    const obs = mastra.observability as {
      getDefaultInstance?: () => { forceFlush?: () => Promise<void> } | undefined;
      forceFlush?: () => Promise<void>;
    };
    if (typeof obs.forceFlush === 'function') {
      await obs.forceFlush();
    } else {
      const inst = obs.getDefaultInstance?.();
      if (inst && typeof inst.forceFlush === 'function') {
        await inst.forceFlush();
      }
    }
    langfuseOk = !langfuseExporter.exportFailed;
    if (!langfuseOk) {
      errorCode = LANGFUSE_EXPORT_FAILED;
      exportError = langfuseExporter.lastError ?? 'Langfuse export failed';
    }
  } catch (err) {
    langfuseOk = false;
    errorCode = LANGFUSE_EXPORT_FAILED;
    if (err instanceof LangfuseExportError) {
      exportError = err.message;
    } else {
      exportError = err instanceof Error ? err.message : String(err);
    }
  }

  const status = langfuseExporter.getStatus();
  const ok = langfuseOk && !generateError && Boolean(text);

  const missionResult: ResearchMissionResult = {
    ok,
    runId,
    traceId: resultTraceId,
    serviceName: HOLOCRON_SERVICE_NAME,
    role,
    goal,
    text,
    langfuseExportOk: langfuseOk,
    langfuse: status,
    inferenceTelemetry,
    errorCode: errorCode ?? (generateError ? 'MISSION_GENERATE_FAILED' : null),
    error: exportError ?? generateError,
    metadata: {
      role,
      runId,
      serviceName: HOLOCRON_SERVICE_NAME,
      mission: 'research',
      model: agentBundle.resolved.litellmModelId,
      endpoint: agentBundle.resolved.endpoint,
      inferenceTelemetryId: inferenceTelemetry?.id ?? null,
    },
  };

  if (!langfuseOk && options.throwOnExportFailure !== false) {
    throw Object.assign(new LangfuseExportError(exportError ?? 'Langfuse export failed'), {
      missionResult,
    });
  }

  return missionResult;
}
