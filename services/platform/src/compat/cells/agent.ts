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
import { createFleetAgentModelBundle, runFleetModelCall } from '../../inference/telemetry.ts';
import { assertNoTripwire, TripwireError } from '../../mastra/tripwire.ts';
import { FLEET_KEY } from '../../mastra.ts';

export interface AgentCellResult {
  ok: boolean;
  runId: string;
  text?: string;
  cloudRequests: number;
  fleetRequests: number;
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

/**
 * Network assertion: count outbound requests to known cloud providers.
 * We monkey-patch globalThis.fetch for the duration of the generate() call.
 */
function withCloudRequestTracking<T>(fn: () => Promise<T>): Promise<{
  result: T;
  cloudRequests: number;
  fleetRequests: number;
}> {
  const cloudHosts = ['api.openai.com', 'api.anthropic.com', 'api.deepseek.com'];
  const requestUrls: string[] = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: Parameters<typeof origFetch>[0],
    init?: Parameters<typeof origFetch>[1]
  ) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requestUrls.push(url);
    return origFetch(input, init);
  }) as typeof globalThis.fetch;

  return fn().then(
    (result) => {
      globalThis.fetch = origFetch;
      const resolvedEndpoint = extractResolvedEndpoint(result);
      const resolvedOrigin = resolvedEndpoint ? requestOrigin(resolvedEndpoint) : null;
      return {
        result,
        cloudRequests: requestUrls.filter((url) => cloudHosts.some((host) => url.includes(host)))
          .length,
        fleetRequests: resolvedOrigin
          ? requestUrls.filter((url) => requestOrigin(url) === resolvedOrigin).length
          : 0,
      };
    },
    (err) => {
      globalThis.fetch = origFetch;
      throw err;
    }
  );
}

function requestOrigin(endpoint: string): string {
  const parsed = new URL(endpoint);
  return parsed.origin;
}

function extractResolvedEndpoint(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('resolved' in value)) return undefined;
  const resolved = (value as { resolved?: unknown }).resolved;
  if (!resolved || typeof resolved !== 'object') return undefined;
  const baseUrl = (resolved as { baseURL?: unknown }).baseURL;
  const endpoint = (resolved as { endpoint?: unknown }).endpoint;
  if (typeof baseUrl === 'string' && baseUrl.length > 0) return baseUrl;
  if (typeof endpoint === 'string' && endpoint.length > 0) return endpoint;
  return undefined;
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
    const { result, cloudRequests, fleetRequests } = await withCloudRequestTracking(async () => {
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
      // Shape a generate-like result for tripwire compatibility.
      return {
        text: out.text,
        resolved: out.resolved,
        tripwire: undefined as undefined,
        finishReason: 'stop' as const,
      };
    });

    try {
      assertNoTripwire(result as never);
    } catch (err) {
      if (err instanceof TripwireError) {
        return {
          ok: false,
          runId,
          cloudRequests,
          fleetRequests,
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
      return { ok: false, runId, cloudRequests, fleetRequests, error: 'agent.text was empty' };
    }

    return { ok: true, runId, text, cloudRequests, fleetRequests };
  } catch (err) {
    return {
      ok: false,
      runId,
      cloudRequests: 0,
      fleetRequests: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
