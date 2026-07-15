/**
 * Cell 1 — Agent
 *
 * Boots one Mastra Agent bound to the live fleet via
 * @ai-sdk/openai-compatible at http://127.0.0.1:4545/v1.
 * Calls agent.generate() and asserts non-empty text.
 * Zero cloud requests (no api.openai.com / api.anthropic.com).
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Agent } from '@mastra/core/agent';
import type { Mastra } from '@mastra/core/mastra';
import { assertNoTripwire, TripwireError } from '../../mastra/tripwire.ts';
import { FLEET_KEY, FLEET_URL } from '../../mastra.ts';

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

/**
 * Network assertion: count outbound requests to known cloud providers.
 * We monkey-patch globalThis.fetch for the duration of the generate() call.
 */
function withCloudRequestTracking<T>(fn: () => Promise<T>): {
  result: T;
  cloudRequests: number;
  fleetRequests: number;
} {
  const cloudHosts = ['api.openai.com', 'api.anthropic.com'];
  let cloudRequests = 0;
  let fleetRequests = 0;
  const origFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: Parameters<typeof origFetch>[0],
    init?: Parameters<typeof origFetch>[1]
  ) => {
    const url = typeof input === 'string' ? input : ((input as URL).url ?? String(input));
    if (cloudHosts.some((h) => url.includes(h))) {
      cloudRequests++;
    }
    if (url.includes('127.0.0.1:4545') || url.includes('localhost:4545')) {
      fleetRequests++;
    }
    return origFetch(input as RequestInfo, init as RequestInit);
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
 * Create the fleet-bound agent. Registered on the Mastra instance
 * by the spike orchestrator so observability spans are captured.
 */
export function createFleetAgent(): Agent {
  const provider = createOpenAICompatible({
    name: 'holocron-fleet',
    baseURL: FLEET_URL,
    apiKey: FLEET_KEY,
  });

  const fleetModel = provider.chatModel('compat-spike');

  return new Agent({
    id: 'compat-agent',
    name: 'compat-agent',
    model: fleetModel,
    instructions:
      'You are a compatibility test agent. Respond concisely. Always reply with at least one word.',
  });
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
