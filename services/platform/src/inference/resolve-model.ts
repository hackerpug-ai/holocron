/**
 * resolveModel(role) — wire Fleet Role Manifest roles to live fleet endpoints.
 *
 * Sprint 05 service-3 seam: returns the live :4545 endpoint for declared roles
 * after a real health probe. Unknown roles and unreachable fleet fail closed
 * (no silent cloud fallback, no fake endpoint).
 *
 * Full budget/degraded-mode routing lands in Sprint 08 — this is the seam only.
 */

import type { DegradationAction, FleetRole, FleetRoleManifest } from '../fleet/manifest.schema.ts';
import { getFleetManifest, getRoleEntry, UnknownFleetRoleError } from '../fleet/manifest.ts';

export type ResolveModelOptions = {
  /** Override manifest path (tests / CLI). */
  manifestPath?: string;
  /** Pre-loaded manifest (skips disk when provided). */
  manifest?: FleetRoleManifest;
  /**
   * Override the role's endpoint for health probing only.
   * Used by fail-closed tests (dead port). Does NOT invent a success path.
   */
  endpointOverride?: string;
  /**
   * When true, skip the live health probe (structural resolve only).
   * Default false — production and AC require a live probe.
   */
  skipHealth?: boolean;
  /** Optional fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
};

export type ResolvedModel = {
  role: string;
  endpoint: string;
  litellmModelId: string;
  modelRevision: string;
  contextLimit: number;
  concurrency: number;
  timeoutMs: number;
  structuredOutput: boolean;
  degradationAction: DegradationAction;
  /** Health probe succeeded against the live endpoint. */
  healthy: true;
  /** OpenAI-compatible base URL for @ai-sdk/openai-compatible (…/v1). */
  baseURL: string;
  embeddingDimension?: number;
  prefixPolicy?: { query: string; document: string };
};

export class RoleUnavailableError extends Error {
  readonly code = 'ROLE_UNAVAILABLE' as const;
  constructor(
    readonly role: string,
    readonly endpoint: string,
    readonly degradationAction: DegradationAction,
    readonly causeMessage: string
  ) {
    super(
      `fleet role '${role}' unreachable at ${endpoint} (degradation=${degradationAction}): ${causeMessage}`
    );
    this.name = 'RoleUnavailableError';
  }
}

/** Normalize endpoint to host:port base without trailing slash or /v1. */
export function normalizeEndpointBase(endpoint: string): string {
  return endpoint.replace(/\/$/, '').replace(/\/v1$/i, '');
}

/** OpenAI-compatible base URL (…/v1) for AI SDK clients. */
export function toOpenAiCompatibleBaseURL(endpoint: string): string {
  const base = normalizeEndpointBase(endpoint);
  return `${base}/v1`;
}

/**
 * Live health probe against the role's configured probe path.
 * Fail closed on non-OK / network error / timeout.
 */
export async function probeRoleHealth(
  role: FleetRole,
  options?: {
    endpointOverride?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<{ ok: true; endpoint: string } | { ok: false; endpoint: string; error: string }> {
  const endpoint = normalizeEndpointBase(options?.endpointOverride ?? role.endpoint);
  const path = role.healthProbe.path.startsWith('/')
    ? role.healthProbe.path
    : `/${role.healthProbe.path}`;
  const url = `${endpoint}${path}`;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), role.healthProbe.timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: role.healthProbe.method,
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const expect = role.healthProbe.expectStatus ?? 200;
    if (res.status !== expect) {
      return {
        ok: false,
        endpoint,
        error: `health probe HTTP ${res.status} (expected ${expect}) at ${url}`,
      };
    }
    return { ok: true, endpoint };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, endpoint, error: `health probe failed at ${url}: ${error}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a fleet role to a live endpoint.
 *
 * @throws UnknownFleetRoleError when role is not in the manifest
 * @throws RoleUnavailableError when the live health probe fails (fail closed)
 * @throws ManifestIncompleteError when the manifest cannot be loaded
 */
export async function resolveModel(
  role: string,
  options: ResolveModelOptions = {}
): Promise<ResolvedModel> {
  const manifest = options.manifest ?? getFleetManifest(options.manifestPath);

  let entry: FleetRole;
  try {
    entry = getRoleEntry(manifest, role);
  } catch (err) {
    if (err instanceof UnknownFleetRoleError) throw err;
    throw err;
  }

  const probeEndpoint = options.endpointOverride ?? entry.endpoint;

  if (!options.skipHealth) {
    const health = await probeRoleHealth(entry, {
      endpointOverride: probeEndpoint,
      fetchImpl: options.fetchImpl,
    });
    if (!health.ok) {
      throw new RoleUnavailableError(role, health.endpoint, entry.degradationAction, health.error);
    }
  }

  const endpoint = normalizeEndpointBase(probeEndpoint);

  // Never return a cloud endpoint — belt-and-suspenders against misconfig
  if (/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/i.test(endpoint)) {
    throw new RoleUnavailableError(
      role,
      endpoint,
      'fail-closed',
      'cloud endpoint refused — fleet roles must resolve to local/tailnet endpoints only'
    );
  }

  const resolved: ResolvedModel = {
    role: entry.role,
    endpoint,
    litellmModelId: entry.litellmModelId,
    modelRevision: entry.modelRevision,
    contextLimit: entry.contextLimit,
    concurrency: entry.concurrency,
    timeoutMs: entry.timeoutMs,
    structuredOutput: entry.structuredOutput,
    degradationAction: entry.degradationAction,
    healthy: true,
    baseURL: toOpenAiCompatibleBaseURL(endpoint),
  };

  if (entry.embed) {
    resolved.embeddingDimension = entry.embed.embeddingDimension;
    resolved.prefixPolicy = entry.embed.prefixPolicy;
  }

  return resolved;
}

export { UnknownFleetRoleError };
