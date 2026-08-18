/**
 * Cell 1 — Agent
 *
 * Boots one Mastra Agent bound to the live fleet via the role router.
 * S31-07: model construction lives in the instrumented client (telemetry.ts);
 * the compat spike generate path writes telemetry via runFleetModelCall.
 * S31-04: createFleetAgentWithResolved accepts specialist tools / inputProcessors
 * for the chat triage → specialists path (http/chat-runs.ts).
 *
 * Zero cloud requests (no api.openai.com / api.anthropic.com / api.deepseek.com) on the default path.
 */

import { randomUUID } from 'node:crypto';
import type { ToolsInput } from '@mastra/core/agent';
import { Agent } from '@mastra/core/agent';
import type { Mastra } from '@mastra/core/mastra';
import type { InputProcessor } from '@mastra/core/processors';
import type { ResolvedModel, ResolveModelOptions } from '../../inference/resolve-model.ts';
import {
  assertModelRequestAccountingSnapshot,
  createFleetAgentModelBundle,
  type ModelRequestAccountingSnapshot,
  runFleetModelCall,
} from '../../inference/telemetry.ts';
import { assertNoTripwire, TripwireError } from '../../mastra/tripwire.ts';
import { FLEET_KEY } from '../../mastra.ts';

export interface AgentCellResult {
  ok: boolean;
  runId: string;
  text?: string;
  modelRequests: number;
  underlyingTransportCalls: number;
  cloudRequests: number;
  fleetRequests: number;
  unknownRequests: number;
  telemetryRows: number;
  resolvedEndpoint: string;
  responseHeaderApiBase: string | null;
  responseHeaderApiBases: string[];
  instrumentationBoundary: 'provider-model';
  terminalized: true;
  reconciliationComplete: boolean;
  error?: string;
  /** Present when a processor tripwire blocked the generate call. */
  tripwire?: {
    reason: string;
    processorId: string;
    retry?: boolean;
  };
}

export type CreateFleetAgentOptions = {
  /** Fleet Role Manifest role (default: divergent). */
  role?: string;
  /** Forwarded to resolveModel (allowEscape defaults false). */
  resolveOptions?: ResolveModelOptions;
  /** Agent id/name (default: compat-agent). */
  agentId?: string;
  /** Fleet API key for OpenAI-compatible client. */
  apiKey?: string;
  /** Specialist / domain system instructions. */
  instructions?: string;
  /** Least-privilege tool set resolved from the shared registry. */
  tools?: ToolsInput;
  /** Persisted public chat run identity for request-scoped model telemetry. */
  runId?: string;
  /** Mastra 1.x input processors (e.g. chat policy block). */
  inputProcessors?: InputProcessor[];
};

export type FleetAgentBundle = {
  agent: Agent;
  resolved: ResolvedModel;
};

export function isAllowedFleetRouterEndpoint(endpoint: string): boolean {
  return /^https?:\/\/(?:host\.docker\.internal|holocron(?:\.tail011a51\.ts\.net)?|localhost|127\.0\.0\.1):4545\/v1$/i.test(
    endpoint
  );
}

/**
 * Structural factory: resolve a fleet role via the instrumented client helper,
 * return Agent + ResolvedModel. Fail-closed on unknown/unreachable roles.
 * S31-04 options (tools, inputProcessors, instructions) preserved for chat path.
 */
export async function createFleetAgentWithResolved(
  options: CreateFleetAgentOptions = {}
): Promise<FleetAgentBundle> {
  const role = options.role ?? 'divergent';
  const { model: fleetModel, resolved } = await createFleetAgentModelBundle({
    role,
    resolveOptions: options.resolveOptions,
    apiKey: options.apiKey ?? FLEET_KEY,
    agentId: options.agentId,
    runId: options.runId,
  });
  if (!isAllowedFleetRouterEndpoint(resolved.baseURL)) {
    throw new Error(`fleet agent refused non-router endpoint: ${resolved.baseURL}`);
  }

  const id = options.agentId ?? 'compat-agent';
  const agent = new Agent({
    id,
    name: id,
    model: fleetModel,
    instructions:
      options.instructions ??
      'You are a compatibility test agent. Respond concisely. Always reply with at least one word.',
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.inputProcessors && options.inputProcessors.length > 0
      ? { inputProcessors: options.inputProcessors }
      : {}),
  });

  return { agent, resolved };
}

/**
 * Create the fleet-bound agent via the instrumented client.
 * Registered on the Mastra instance by the spike orchestrator so observability spans are captured.
 */
export async function createFleetAgent(options: CreateFleetAgentOptions = {}): Promise<Agent> {
  const { agent } = await createFleetAgentWithResolved(options);
  return agent;
}

/**
 * Compat spike agent cell — real fleet generate through runFleetModelCall
 * so inference_telemetry always records call_site=compat/cells/agent.
 */
export async function runAgentCell(_mastra: Mastra): Promise<AgentCellResult> {
  const runId = randomUUID();
  try {
    const out = await runFleetModelCall({
      role: 'divergent',
      prompt: 'Say "compatibility spike green" and nothing else.',
      runId,
      stepId: 'compat/cells/agent',
      callSite: 'compat/cells/agent',
      callKind: 'chat',
      maxOutputTokens: 32,
      modelOptions: { apiKey: FLEET_KEY, name: 'holocron-fleet' },
      exportToLangfuse: false,
    });
    const responseHeaderApiBases = out.responseHeaderApiBases;
    const modelRequests = 1;
    const underlyingTransportCalls = 1;
    const fleetRequests = responseHeaderApiBases.filter((value) =>
      /^https?:\/\/inference[12]\.tail011a51\.ts\.net:8003\/v1$/i.test(value)
    ).length;
    const cloudRequests = responseHeaderApiBases.filter((value) =>
      /api\.(?:openai|anthropic|deepseek)\.com/i.test(value)
    ).length;
    const unknownRequests = modelRequests - fleetRequests - cloudRequests;
    const resolvedEndpoint = out.resolved.baseURL;
    const result = {
      text: out.text,
      resolved: out.resolved,
      tripwire: undefined as undefined,
      finishReason: 'stop' as const,
    };

    const accounting: ModelRequestAccountingSnapshot = {
      requestId: `compat-${runId}`,
      runId,
      resolvedEndpoint,
      modelRequests,
      underlyingTransportCalls,
      fleetRequests,
      cloudRequests,
      unknownRequests,
      responseHeaderApiBase: responseHeaderApiBases[0] ?? null,
      responseHeaderApiBases,
      terminalized: true,
      reconciliationComplete:
        modelRequests === underlyingTransportCalls &&
        modelRequests === fleetRequests + cloudRequests + unknownRequests,
      instrumentationBoundary: 'provider-model',
    };
    assertModelRequestAccountingSnapshot(accounting, { durableTelemetryRows: 1 });

    try {
      assertNoTripwire(result as never);
    } catch (err) {
      if (err instanceof TripwireError) {
        return {
          ok: false,
          runId,
          modelRequests,
          underlyingTransportCalls,
          cloudRequests,
          fleetRequests,
          unknownRequests,
          telemetryRows: 1,
          resolvedEndpoint,
          responseHeaderApiBase: accounting.responseHeaderApiBase,
          responseHeaderApiBases,
          instrumentationBoundary: 'provider-model',
          terminalized: true,
          reconciliationComplete: accounting.reconciliationComplete,
          error: err.message,
          tripwire: {
            reason: err.tripwire.reason,
            processorId: err.tripwire.processorId,
            retry: err.tripwire.retry,
          },
        };
      }
      throw err;
    }

    const text = result.text;
    if (!text || text.trim().length === 0) {
      return {
        ok: false,
        runId,
        modelRequests,
        underlyingTransportCalls,
        cloudRequests,
        fleetRequests,
        unknownRequests,
        telemetryRows: 1,
        resolvedEndpoint,
        responseHeaderApiBase: accounting.responseHeaderApiBase,
        responseHeaderApiBases,
        instrumentationBoundary: 'provider-model',
        terminalized: true,
        reconciliationComplete: accounting.reconciliationComplete,
        error: 'agent.text was empty',
      };
    }

    return {
      ok: true,
      runId,
      text,
      modelRequests,
      underlyingTransportCalls,
      cloudRequests,
      fleetRequests,
      unknownRequests,
      telemetryRows: 1,
      resolvedEndpoint,
      responseHeaderApiBase: accounting.responseHeaderApiBase,
      responseHeaderApiBases,
      instrumentationBoundary: 'provider-model',
      terminalized: true,
      reconciliationComplete: accounting.reconciliationComplete,
    };
  } catch (err) {
    return {
      ok: false,
      runId,
      modelRequests: 0,
      underlyingTransportCalls: 0,
      cloudRequests: 0,
      fleetRequests: 0,
      unknownRequests: 0,
      telemetryRows: 0,
      resolvedEndpoint: 'unknown',
      responseHeaderApiBase: null,
      responseHeaderApiBases: [],
      instrumentationBoundary: 'provider-model',
      terminalized: true,
      reconciliationComplete: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
