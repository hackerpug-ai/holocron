/**
 * Shared embed() helper — Qwen3 query/document prefix asymmetry via resolveModel('embed').
 *
 * search-1 / CAP-EMB-01:
 *   embed(text, mode) → 1024-dim number[] from the live fleet embed role.
 *   createFleetEmbeddingModel(resolved) — embedding analog of createFleetChatModel.
 *
 * S31-07: real fleet embedding traffic goes through runFleetModelCall (callKind embedding)
 * so every call writes a durable inference_telemetry row.
 *
 * NEVER hardcode a fleet URL or return null / all-zero vectors on failure.
 */

import { randomUUID } from 'node:crypto';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  type ResolvedModel,
  type ResolveModelOptions,
  RoleUnavailableError,
} from './resolve-model';
import { runFleetModelCall } from './telemetry';

// createOpenAICompatible remains for createFleetEmbeddingModel factory below.

export type EmbedMode = 'query' | 'document';

export type EmbedOptions = ResolveModelOptions & {
  /** Fleet API key for OpenAI-compatible client. */
  apiKey?: string;
  /** Provider name passed to createOpenAICompatible (default: holocron-fleet). */
  name?: string;
  /** Optional durable run correlation for telemetry. */
  runId?: string;
  databaseUrl?: string;
};

/**
 * Build an @ai-sdk/openai-compatible embedding model for a fleet-resolved embed role.
 * Mirrors createFleetChatModel (resolve-model.ts): createOpenAICompatible → .embeddingModel.
 *
 * Prefer runFleetModelCall({ callKind: 'embedding' }) for production paths so telemetry is written.
 * This factory remains for callers that only need a model handle (tests / advanced wiring).
 */
export function createFleetEmbeddingModel(
  resolved: ResolvedModel,
  options?: { apiKey?: string; name?: string }
) {
  if (resolved.provider !== 'fleet') {
    throw new Error(
      `createFleetEmbeddingModel requires provider=fleet (got ${resolved.provider}) — embed is fleet-only`
    );
  }
  const provider = createOpenAICompatible({
    name: options?.name ?? 'holocron-fleet',
    baseURL: resolved.baseURL,
    apiKey: options?.apiKey ?? process.env.FLEET_KEY ?? 'sk-none',
  });
  return provider.embeddingModel(resolved.litellmModelId);
}

/**
 * Apply Qwen3 prefix asymmetry from ResolvedModel.prefixPolicy.
 * query mode → prefixPolicy.query; document mode → prefixPolicy.document.
 * Empty / missing policy is treated as no prefix (manifest always sets both for embed).
 */
export function applyEmbedPrefix(
  text: string,
  mode: EmbedMode,
  prefixPolicy?: { query: string; document: string }
): string {
  if (!prefixPolicy) return text;
  const prefix = mode === 'query' ? prefixPolicy.query : prefixPolicy.document;
  if (!prefix) return text;
  // Avoid double-prefixing if caller already applied the policy string.
  if (text.startsWith(prefix)) return text;
  return `${prefix}${text}`;
}

/**
 * Embed text via the fleet embed role with query/document prefix asymmetry.
 *
 * Routes through runFleetModelCall (callKind embedding) — the single instrumented client.
 *
 * @returns Float32-compatible number[] of length embeddingDimension (1024)
 * @throws RoleUnavailableError when the fleet embed role is unreachable
 * @throws Error when the embedding is null, wrong-dim, or all-zero
 */
export async function embed(
  text: string,
  mode: EmbedMode,
  options: EmbedOptions = {}
): Promise<number[]> {
  const { apiKey, name, runId, databaseUrl, ...resolveOptions } = options;

  try {
    const out = await runFleetModelCall({
      role: 'embed',
      prompt: text,
      runId: runId ?? randomUUID(),
      stepId: 'embed',
      callSite: 'embed',
      callKind: 'embedding',
      embedMode: mode,
      modelOptions: { apiKey, name },
      resolveOptions: {
        allowEscape: false,
        ...resolveOptions,
      },
      databaseUrl,
      exportToLangfuse: false,
    });
    if (!out.embedding || out.embedding.length === 0) {
      throw new Error(`embed() returned empty/null embedding for mode=${mode}`);
    }
    return out.embedding;
  } catch (err) {
    if (err instanceof RoleUnavailableError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    // Surface resolve/call failures as RoleUnavailableError when possible.
    const telemetry = (err as { telemetry?: { endpoint?: string } }).telemetry;
    throw new RoleUnavailableError(
      'embed',
      telemetry?.endpoint ?? process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1',
      'fail-closed',
      `embed API call failed: ${message}`
    );
  }
}

export { RoleUnavailableError };
