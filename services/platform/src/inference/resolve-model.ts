/**
 * resolveModel(role, { allowEscape }) — local-first fleet router with default-deny Claude escape.
 *
 * Default path (allowEscape=false):
 *   Fleet Role Manifest → live health probe → @ai-sdk/openai-compatible baseURL on :4545.
 *   ZERO Anthropic. Cloud endpoints refused even if misconfigured in the manifest.
 *
 * Escape path (allowEscape=true):
 *   Budget pre-check (Postgres budget_ledger via checkBudget) → real probe to api.anthropic.com
 *   → return Anthropic endpoint. Never the default.
 *   After a successful Anthropic generate, call logEscape()/runBudgetedEscape() to meter spend.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getFleetManifest, getRoleEntry, UnknownFleetRoleError } from '../fleet/manifest';
import type { DegradationAction, FleetRole, FleetRoleManifest } from '../fleet/manifest.schema';
import {
  assertBudget,
  type BudgetCheckResult,
  BudgetExceededError,
  checkBudget,
} from './budget-ledger';
import { isProcessInDegradedMode } from './degraded-process-flag';

export type ResolveModelOptions = {
  /** Override manifest path (tests / CLI). */
  manifestPath?: string;
  /** Pre-loaded manifest (skips disk when provided). */
  manifest?: FleetRoleManifest;
  /**
   * Override the role's endpoint for health probing only.
   * Used by fail-closed tests (dead port). Does NOT invent a success path.
   * Ignored on allowEscape=true (escape uses Anthropic, not fleet).
   */
  endpointOverride?: string;
  /**
   * When true, skip the live health probe (structural resolve only).
   * Default false — production and AC require a live probe.
   * Ignored on allowEscape=true (escape always probes Anthropic).
   */
  skipHealth?: boolean;
  /** Optional fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /**
   * When true, permit the budgeted Claude escape path (api.anthropic.com).
   * Default false — local fleet only; Anthropic is default-deny.
   */
  allowEscape?: boolean;
  /** Estimated USD cost for budget pre-check on escape (default 0.01). */
  estimatedCostUsd?: number;
  /** Operator reason for escape audit trail. */
  reason?: string;
  /** High-stakes flag (implies allowEscape when set via CLI). */
  highStakes?: boolean;
  /** Optional run/step ids for budget context. */
  runId?: string;
  stepId?: string;
  /**
   * Escape model id (Anthropic). Default HOLO_ESCAPE_MODEL or claude-haiku.
   * Does NOT introduce claudeFlash/Pro/Ultra factories.
   */
  escapeModelId?: string;
  /** Skip Anthropic network probe on escape (tests only — production probes). */
  skipEscapeProbe?: boolean;
};

export type ResolvedModelProvider = 'fleet' | 'anthropic';

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
  /** Health / escape probe succeeded. */
  healthy: true;
  /** OpenAI-compatible base URL for @ai-sdk/openai-compatible (…/v1), or Anthropic base. */
  baseURL: string;
  /** Which provider the endpoint targets. */
  provider: ResolvedModelProvider;
  /** Echo of allowEscape used for this resolve. */
  allowEscape: boolean;
  embeddingDimension?: number;
  prefixPolicy?: { query: string; document: string };
  /** Present when allowEscape=true and budget check ran. */
  budget?: Extract<BudgetCheckResult, { ok: true }>;
  /** Escape probe HTTP status (if probed). */
  escapeProbeStatus?: number;
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

export const ANTHROPIC_API_HOST = 'api.anthropic.com';
export const ANTHROPIC_ENDPOINT = `https://${ANTHROPIC_API_HOST}`;
export const DEFAULT_ESCAPE_MODEL_ID = 'claude-haiku-4-5-20251001';

const CLOUD_ENDPOINT_RE =
  /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/i;

/** Normalize endpoint to host:port base without trailing slash or /v1. */
export function normalizeEndpointBase(endpoint: string): string {
  return endpoint.replace(/\/$/, '').replace(/\/v1$/i, '');
}

/** OpenAI-compatible base URL (…/v1) for AI SDK clients. */
export function toOpenAiCompatibleBaseURL(endpoint: string): string {
  const base = normalizeEndpointBase(endpoint);
  return `${base}/v1`;
}

export function isCloudEndpoint(endpoint: string): boolean {
  return CLOUD_ENDPOINT_RE.test(endpoint);
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
 * Real network probe to api.anthropic.com for the escape path.
 * 200 (valid key) or 401/403 (reachable, auth failed) both count as "host reached".
 * Network errors fail closed.
 */
export async function probeAnthropicEscape(options?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiKey?: string;
}): Promise<{ ok: true; status: number; url: string } | { ok: false; error: string; url: string }> {
  const url = `${ANTHROPIC_ENDPOINT}/v1/models`;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? 'missing';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    // Any HTTP response proves the host was contacted (network assertion surface).
    if (res.status >= 500) {
      return {
        ok: false,
        url,
        error: `anthropic probe HTTP ${res.status} at ${url}`,
      };
    }
    return { ok: true, status: res.status, url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, url, error: `anthropic probe failed at ${url}: ${error}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build an @ai-sdk/openai-compatible chat model for a fleet-resolved role.
 * NEVER used for the Anthropic escape path (that stays @ai-sdk/anthropic at call sites).
 */
export function createFleetChatModel(
  resolved: ResolvedModel,
  options?: { apiKey?: string; name?: string }
) {
  if (resolved.provider !== 'fleet') {
    throw new Error(
      `createFleetChatModel requires provider=fleet (got ${resolved.provider}) — use Anthropic SDK on escape path`
    );
  }
  const provider = createOpenAICompatible({
    name: options?.name ?? 'holocron-fleet',
    baseURL: resolved.baseURL,
    apiKey: options?.apiKey ?? process.env.FLEET_KEY ?? 'sk-none',
  });
  return provider.chatModel(resolved.litellmModelId);
}

function resolveEscapeModelId(options: ResolveModelOptions): string {
  return options.escapeModelId ?? process.env.HOLO_ESCAPE_MODEL ?? DEFAULT_ESCAPE_MODEL_ID;
}

/**
 * Resolve a fleet role to a live endpoint (or budgeted Anthropic escape).
 *
 * @throws UnknownFleetRoleError when role is not in the manifest
 * @throws RoleUnavailableError when the live health/escape probe fails (fail closed)
 * @throws BudgetExceededError when allowEscape=true but budget pre-check fails
 * @throws ManifestIncompleteError when the manifest cannot be loaded
 */
export async function resolveModel(
  role: string,
  options: ResolveModelOptions = {}
): Promise<ResolvedModel> {
  const allowEscape = options.allowEscape === true || options.highStakes === true;

  // ── Escape path (explicit only) ──────────────────────────────────────────
  if (allowEscape) {
    // Never-cloud during fleet degraded mode (infer-3). Process flag is set by
    // DegradedModeController — refuse escape BEFORE any Anthropic traffic.
    if (isProcessInDegradedMode()) {
      throw new RoleUnavailableError(
        role,
        ANTHROPIC_ENDPOINT,
        'fail-closed',
        'degraded mode active — Claude escape refused (never-cloud; local fleet only)'
      );
    }

    // Role must still be a known fleet role (escape is per-step, not free-form).
    const manifest = options.manifest ?? getFleetManifest(options.manifestPath);
    let entry: FleetRole;
    try {
      entry = getRoleEntry(manifest, role);
    } catch (err) {
      if (err instanceof UnknownFleetRoleError) throw err;
      throw err;
    }

    // Budget pre-check BEFORE any Anthropic network traffic (audits check_type='pre-check')
    const budget = await assertBudget({
      estimatedCostUsd: options.estimatedCostUsd ?? 0.01,
      reason: options.reason,
      role,
      runId: options.runId,
      stepId: options.stepId,
      allowEscape: true,
    });

    let escapeProbeStatus: number | undefined;
    if (!options.skipEscapeProbe) {
      const probe = await probeAnthropicEscape({
        fetchImpl: options.fetchImpl,
        timeoutMs: Math.min(entry.timeoutMs, 15_000),
      });
      if (!probe.ok) {
        throw new RoleUnavailableError(role, ANTHROPIC_ENDPOINT, 'fail-closed', probe.error);
      }
      escapeProbeStatus = probe.status;
    }

    const modelId = resolveEscapeModelId(options);
    return {
      role: entry.role,
      endpoint: ANTHROPIC_ENDPOINT,
      litellmModelId: modelId,
      modelRevision: `escape:${modelId}`,
      contextLimit: entry.contextLimit,
      concurrency: 1,
      timeoutMs: entry.timeoutMs,
      structuredOutput: entry.structuredOutput,
      degradationAction: 'fail-closed',
      healthy: true,
      baseURL: `${ANTHROPIC_ENDPOINT}/v1`,
      provider: 'anthropic',
      allowEscape: true,
      budget,
      escapeProbeStatus,
    };
  }

  // ── Default path: fleet only ─────────────────────────────────────────────
  const manifest = options.manifest ?? getFleetManifest(options.manifestPath);

  let entry: FleetRole;
  try {
    entry = getRoleEntry(manifest, role);
  } catch (err) {
    if (err instanceof UnknownFleetRoleError) throw err;
    throw err;
  }

  const probeEndpoint = options.endpointOverride ?? entry.endpoint;

  // Belt-and-suspenders: refuse cloud endpoints on the default path even if
  // someone misconfigured the manifest (before we probe).
  if (isCloudEndpoint(probeEndpoint)) {
    throw new RoleUnavailableError(
      role,
      normalizeEndpointBase(probeEndpoint),
      'fail-closed',
      'cloud endpoint refused — fleet roles must resolve to local/tailnet endpoints only (allowEscape=false)'
    );
  }

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

  // Second refuse after normalize (canonical belt-and-suspenders)
  if (isCloudEndpoint(endpoint)) {
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
    provider: 'fleet',
    allowEscape: false,
  };

  if (entry.embed) {
    resolved.embeddingDimension = entry.embed.embeddingDimension;
    resolved.prefixPolicy = entry.embed.prefixPolicy;
  }

  return resolved;
}

export { BudgetExceededError, checkBudget, UnknownFleetRoleError };
