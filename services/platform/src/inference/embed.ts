/**
 * Shared embed() helper — Qwen3 query/document prefix asymmetry via resolveModel('embed').
 *
 * search-1 / CAP-EMB-01:
 *   embed(text, mode) → 1024-dim number[] from the live fleet embed role.
 *   createFleetEmbeddingModel(resolved) — embedding analog of createFleetChatModel.
 *
 * NEVER hardcode a fleet URL or return null / all-zero vectors on failure.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embed as aiEmbed } from 'ai';
import {
  type ResolvedModel,
  type ResolveModelOptions,
  RoleUnavailableError,
  resolveModel,
} from './resolve-model';

export type EmbedMode = 'query' | 'document';

export type EmbedOptions = ResolveModelOptions & {
  /** Fleet API key for OpenAI-compatible client. */
  apiKey?: string;
  /** Provider name passed to createOpenAICompatible (default: holocron-fleet). */
  name?: string;
};

/**
 * Build an @ai-sdk/openai-compatible embedding model for a fleet-resolved embed role.
 * Mirrors createFleetChatModel (resolve-model.ts): createOpenAICompatible → .embeddingModel.
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
 * @returns Float32-compatible number[] of length embeddingDimension (1024)
 * @throws RoleUnavailableError when the fleet embed role is unreachable
 * @throws Error when the embedding is null, wrong-dim, or all-zero
 */
export async function embed(
  text: string,
  mode: EmbedMode,
  options: EmbedOptions = {}
): Promise<number[]> {
  const { apiKey, name, ...resolveOptions } = options;

  // resolveModel throws RoleUnavailableError on dead health probe (fail-closed).
  const resolved = await resolveModel('embed', {
    allowEscape: false,
    ...resolveOptions,
  });

  const expectedDim = resolved.embeddingDimension ?? 1024;
  const prefixed = applyEmbedPrefix(text, mode, resolved.prefixPolicy);
  const model = createFleetEmbeddingModel(resolved, { apiKey, name });

  let embedding: number[];
  try {
    const result = await aiEmbed({ model, value: prefixed });
    embedding = result.embedding as number[];
  } catch (err) {
    // Surface fleet transport failures as RoleUnavailableError (same fail-closed contract).
    if (err instanceof RoleUnavailableError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new RoleUnavailableError(
      'embed',
      resolved.endpoint,
      resolved.degradationAction,
      `embed API call failed: ${message}`
    );
  }

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(
      `embed() returned empty/null embedding for mode=${mode} (expected length ${expectedDim})`
    );
  }

  if (embedding.length !== expectedDim) {
    throw new Error(
      `embed() dimension mismatch: got ${embedding.length}, expected ${expectedDim} (mode=${mode})`
    );
  }

  if (!embedding.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error(`embed() returned non-finite components (mode=${mode})`);
  }

  // NEVER silently accept an all-zero vector — that is a stub / null embedding.
  if (embedding.every((v) => v === 0)) {
    throw new Error(
      `embed() returned all-zero vector of length ${expectedDim} (mode=${mode}) — refusing silent null embedding`
    );
  }

  return embedding;
}

export { RoleUnavailableError };
