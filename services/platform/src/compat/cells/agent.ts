/**
 * Cell 1 — Agent
 *
 * Boots one Mastra Agent bound to the live fleet via the role router:
 *   resolveModel(role) → createFleetChatModel(resolved) → Agent({ model })
 *
 * Structural local-first (REDHAT-FIX-H3): no hard-coded FLEET_URL + compat-spike.
 * Calls agent.generate() and asserts non-empty text.
 * Zero cloud requests (no api.openai.com / api.anthropic.com / api.deepseek.com) on the default path.
 */

import type { ToolsInput } from '@mastra/core/agent';
import { Agent } from '@mastra/core/agent';
import type { Mastra } from '@mastra/core/mastra';
import type { Processor } from '@mastra/core/processors';
import {
  createFleetChatModel,
  type ResolvedModel,
  type ResolveModelOptions,
  resolveModel,
} from '../../inference/resolve-model.ts';
import { assertNoTripwire, TripwireError } from '../../mastra/tripwire.ts';
import { FLEET_KEY } from '../../mastra.ts';

export interface AgentCellResult {
  ok: boolean;
  text?: string;
  cloudRequests: number;
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
  /** Mastra 1.x input processors (e.g. chat policy block). */
  inputProcessors?: Processor[];
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
  let cloudRequests = 0;
  let fleetRequests = 0;
  const origFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: Parameters<typeof origFetch>[0],
    init?: Parameters<typeof origFetch>[1]
  ) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (cloudHosts.some((h) => url.includes(h))) {
      cloudRequests++;
    }
    if (url.includes('127.0.0.1:4545') || url.includes('localhost:4545')) {
      fleetRequests++;
    }
    return origFetch(input, init);
  }) as typeof globalThis.fetch;

  return fn().then(
    (result) => {
      globalThis.fetch = origFetch;
      return { result, cloudRequests, fleetRequests };
    },
    (err) => {
      globalThis.fetch = origFetch;
      throw err;
    }
  );
}

/**
 * Structural factory: resolve a fleet role, build chat model via createFleetChatModel,
 * return Agent + ResolvedModel. Fail-closed on unknown/unreachable roles (no Anthropic).
 */
export async function createFleetAgentWithResolved(
  options: CreateFleetAgentOptions = {}
): Promise<FleetAgentBundle> {
  const role = options.role ?? 'divergent';
  const resolved = await resolveModel(role, {
    allowEscape: false,
    ...options.resolveOptions,
  });

  // createFleetChatModel refuses non-fleet provider — escape remains Anthropic SDK path.
  const fleetModel = createFleetChatModel(resolved, {
    apiKey: options.apiKey ?? FLEET_KEY,
    name: 'holocron-fleet',
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
 * Create the fleet-bound agent via resolveModel + createFleetChatModel.
 * Registered on the Mastra instance by the spike orchestrator so observability spans are captured.
 */
export async function createFleetAgent(options: CreateFleetAgentOptions = {}): Promise<Agent> {
  const { agent } = await createFleetAgentWithResolved(options);
  return agent;
}

export async function runAgentCell(mastra: Mastra): Promise<AgentCellResult> {
  try {
    // Retrieve the agent registered on the Mastra instance
    const agent = mastra.getAgent('compat-agent');

    const { result, cloudRequests } = await withCloudRequestTracking(() =>
      agent.generate('Say "compatibility spike green" and nothing else.')
    );

    // Fail closed on guardrail tripwire — never treat blocked generate as success.
    // assertNoTripwire checks result.tripwire (+ finishReason === 'other').
    try {
      assertNoTripwire(result);
    } catch (err) {
      if (err instanceof TripwireError) {
        return {
          ok: false,
          cloudRequests,
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
      return { ok: false, cloudRequests, error: 'agent.text was empty' };
    }

    return { ok: true, text, cloudRequests };
  } catch (err) {
    return {
      ok: false,
      cloudRequests: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
