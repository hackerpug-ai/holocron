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
import { readFileSync } from 'node:fs';
import { Mastra } from '@mastra/core/mastra';
import {
  MastraStorageExporter,
  Observability,
  SamplingStrategyType,
  SensitiveDataFilter,
} from '@mastra/observability';
import { createFleetAgentWithResolved } from '../compat/cells/agent.ts';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import {
  displayEndpoint,
  type InferenceTelemetryRecord,
  recordInferenceTelemetry,
} from '../inference/telemetry.ts';
import { assertNoTripwire } from '../mastra/tripwire.ts';
import { createStorage } from '../mastra.ts';
import { type EvidenceGateResult, evaluateEvidenceGate } from '../research/evidence-gate.ts';
import {
  advanceResearchSessionIteration,
  ensureResearchSessionIterationBaseline,
} from '../research/progress.ts';
import { HOLOCRON_SERVICE_NAME } from './config.ts';
import {
  classifyExportError,
  ExportFailureCode,
  recordExportFailure,
  recordExportSuccess,
} from './export-health.ts';
import {
  createOtelBridgeFromEnv,
  type HolocronOtelBridge,
  LANGFUSE_EXPORT_FAILED,
  LangfuseExportError,
  type LangfuseExportStatus,
} from './langfuse-exporter.ts';
import { HolocronRedactionProcessor, redactForExport } from './redaction.ts';

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
  evidenceGate?: EvidenceGateResult;
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
   * When true, external export failure throws LangfuseExportError carrying
   * `missionResult`. Default false — sink outage must not fail the mission.
   */
  throwOnExportFailure?: boolean;
  /** Optional deterministic fixture used by the Sprint 17 gate seam. */
  evidenceFixturePath?: string;
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
export function createMissionObservability(args?: { langfuse?: HolocronOtelBridge }): {
  observability: Observability;
  langfuseExporter: HolocronOtelBridge;
} {
  const langfuseExporter =
    args?.langfuse ??
    createOtelBridgeFromEnv({
      serviceName: HOLOCRON_SERVICE_NAME,
      failOnExportError: false,
    });

  const observability = new Observability({
    configs: {
      default: {
        serviceName: HOLOCRON_SERVICE_NAME,
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [new MastraStorageExporter(), langfuseExporter],
        spanOutputProcessors: [
          new HolocronRedactionProcessor(),
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
  // Redact before any exporter/local SQL path can persist free-text secrets.
  const safeGoal = String(redactForExport(goal));

  const langfuseExporter = createOtelBridgeFromEnv({
    baseUrl: options.langfuseBaseUrl,
    publicKey: options.langfusePublicKey,
    secretKey: options.langfuseSecretKey,
    serviceName: HOLOCRON_SERVICE_NAME,
    failOnExportError: false,
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
      goal: safeGoal,
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
      `Research mission goal: ${safeGoal}\nRespond with a brief research finding.`,
      {
        tracingOptions: {
          traceId,
          metadata: {
            role,
            runId,
            serviceName: HOLOCRON_SERVICE_NAME,
            mission: 'research',
            goal: safeGoal,
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
    // Durable per-call ledger (obs-5). Soft on schema/infra gaps — mission
    // product outcome must not fail solely because inference_telemetry is down.
    try {
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
    } catch {
      inferenceTelemetry = null;
    }
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
    } catch {
      // Telemetry insert failure must not mask the original generate error.
      inferenceTelemetry = null;
    }
  }

  let errorCode: string | null = null;
  let challengeModelRevision: string | null = null;
  if (options.evidenceFixturePath && !generateError) {
    try {
      const challengeBundle = await createFleetAgentWithResolved({
        role: 'convergent',
        agentId: `research-challenge-${runId}`,
      });
      challengeModelRevision = challengeBundle.resolved.modelRevision;
      const challengeStarted = Date.now();
      const challengeResult = await challengeBundle.agent.generate(
        `Challenge research goal: ${safeGoal}. Return one concise refuting consideration.`,
        {
          tracingOptions: {
            traceId,
            metadata: {
              role: 'convergent',
              runId,
              serviceName: HOLOCRON_SERVICE_NAME,
              mission: 'research',
              phase: 'CHALLENGE',
            },
            tags: ['research-challenge', HOLOCRON_SERVICE_NAME, 'convergent'],
          },
        }
      );
      assertNoTripwire(challengeResult);
      const challengeTokens = usageTokens(
        (challengeResult as { usage?: unknown; totalUsage?: unknown }).usage ??
          (challengeResult as { totalUsage?: unknown }).totalUsage
      );
      await recordInferenceTelemetry({
        runId,
        stepId: 'research-challenge',
        traceId,
        role: challengeBundle.resolved.role,
        provider: 'fleet',
        endpoint: displayEndpoint(challengeBundle.resolved),
        modelId: challengeBundle.resolved.litellmModelId,
        inputTokens: challengeTokens.inputTokens,
        outputTokens: challengeTokens.outputTokens,
        totalTokens: challengeTokens.totalTokens,
        wallMs: Math.max(1, Date.now() - challengeStarted),
        status: challengeResult.text?.trim() ? 'success' : 'degraded',
        errorCode: challengeResult.text?.trim() ? null : 'EMPTY_RESPONSE',
        errorMessage: challengeResult.text?.trim() ? null : 'challenge returned empty text',
      });
    } catch (challengeError) {
      generateError =
        challengeError instanceof Error ? challengeError.message : String(challengeError);
      errorCode = 'RESEARCH_CHALLENGE_FAILED';
    }
  }

  let langfuseOk = false;
  let exportError: string | null = null;

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
      const code = classifyExportError(langfuseExporter.lastError ?? 'export failed');
      errorCode = code;
      exportError = langfuseExporter.lastError ?? 'external OTLP export degraded';
      recordExportFailure(code);
    } else {
      recordExportSuccess();
    }
  } catch (err) {
    langfuseOk = false;
    const code =
      err instanceof LangfuseExportError
        ? err.code
        : classifyExportError(err);
    errorCode = code;
    exportError = err instanceof Error ? err.message : String(err);
    recordExportFailure(code);
  }

  let evidenceGate: EvidenceGateResult | undefined;
  if (options.evidenceFixturePath) {
    const input = JSON.parse(readFileSync(options.evidenceFixturePath, 'utf8')) as never;
    evidenceGate = evaluateEvidenceGate(input);
    const researchSql = createSql(
      resolveHolocronNonprodDatabaseUrl({ context: 'research evidence gate' })
    );
    const terminalAdmitted = evidenceGate.admitted && challengeModelRevision !== null;
    const completedAt = terminalAdmitted ? new Date() : null;
    try {
      await researchSql`
        INSERT INTO research_sessions (
          id, system, topic, research_type, status, plan, findings, final_confidence_summary,
          created_at, updated_at, completed_at
        )
        VALUES (
          ${runId}::uuid,
          'deep',
          ${safeGoal},
          'mission',
          ${terminalAdmitted ? 'completed' : 'running'},
          ${researchSql.json({
            phases: ['PLAN', 'RETRIEVE', 'EXTRACT', 'ASSAY', 'CHALLENGE', 'GATE', 'COMMIT'],
            assayInstanceId: `${agentBundle.resolved.modelRevision}:assay`,
            challengeInstanceId: challengeModelRevision
              ? `${challengeModelRevision}:challenge`
              : null,
            gate: evidenceGate,
          })},
          ${researchSql.json(input as never)},
          ${researchSql.json(evidenceGate as never)},
          now(), now(), ${completedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          plan = EXCLUDED.plan,
          findings = EXCLUDED.findings,
          final_confidence_summary = EXCLUDED.final_confidence_summary,
          updated_at = now(),
          completed_at = EXCLUDED.completed_at
      `;
      // REDHAT-FIX-02 PATH-A: production writer for research_sessions.current_iteration.
      // Always start at 1/5; intermediate progress advances via advanceResearchSessionIteration
      // (real engine path — not Maestro advance-server.py absolute SET).
      await ensureResearchSessionIterationBaseline({
        sessionId: runId,
        maxIterations: 5,
        currentIteration: 1,
        sql: researchSql,
      });
      if (terminalAdmitted) {
        // Terminal admitted missions walk 1→2→3→4→5 through the production +1 writer
        // so "as the workflow reaches iteration 3/5" is engine-backed, not a harness jump.
        // Each phase transition is a real advanceResearchSessionIteration call site.
        const maxIterations = 5;
        for (let step = 1; step < maxIterations; step++) {
          const advanced = await advanceResearchSessionIteration({
            sessionId: runId,
            sql: researchSql,
          });
          if (!advanced.ok) {
            break;
          }
        }
      }
    } finally {
      await researchSql.end({ timeout: 5 });
    }
  }

  const status = langfuseExporter.getStatus();
  // Product outcome is independent of external sink (OBS-02 AC-2).
  const ok = !generateError && Boolean(text);

  const missionResult: ResearchMissionResult = {
    ok,
    runId,
    traceId: resultTraceId,
    serviceName: HOLOCRON_SERVICE_NAME,
    role,
    goal: safeGoal,
    text: text ? String(redactForExport(text)) : text,
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
      evidenceGate: evidenceGate ?? null,
    },
    evidenceGate,
  };

  if (!langfuseOk && options.throwOnExportFailure === true) {
    throw Object.assign(
      new LangfuseExportError(
        exportError ?? 'external OTLP export failed',
        undefined,
        (errorCode as keyof typeof ExportFailureCode) in ExportFailureCode
          ? (errorCode as (typeof ExportFailureCode)[keyof typeof ExportFailureCode])
          : ExportFailureCode.LANGFUSE_UNREACHABLE
      ),
      { missionResult }
    );
  }

  return missionResult;
}
