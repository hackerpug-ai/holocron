/**
 * Fulcrum substrate readiness (FUL-INFRA-001).
 *
 * Compare the checked-in Fulcrum role expectation file
 * (packages/platform/deploy/fleet/fulcrum-roles.json — the ONLY declaration of
 * Fulcrum role expectations) against ONE real /v1/models response per node.
 * Mere liveness is a false pass: a server that answers but serves nothing, or
 * serves a short list, must fail closed by role name.
 *
 * Like probe-fleet-roles.ts, the comparison is pure: the probe owns the single
 * bounded GET per node and hands parsed ids here, so readiness cannot fan out
 * into one request per role. Expectations come only from the checked-in file —
 * never from the observed oMLX basenames (two namespaces, ADR-008).
 *
 * Fail-closed on: unreachable node, HTTP error, malformed payload, missing
 * role, or an expectation file that carries a forbidden role name (the schema
 * itself refuses judge / coder roles).
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** The three Fulcrum roles (ADR-008). Nothing else may enter the vocabulary. */
export const FULCRUM_ROLE_NAMES = ['convergent', 'divergent', 'embed'] as const;

export type FulcrumRoleName = (typeof FULCRUM_ROLE_NAMES)[number];

export const FulcrumRoleEntrySchema = z
  .object({
    /** oMLX model directory basename this role must be bound to on every node. */
    basename: z.string().min(1),
    /** Memorialized resident size (ADR-008 arithmetic: 28 + 17 + 1 = 46 GB). */
    size_gb: z.number().int().nonnegative(),
    /** Upstream weights repo used by provisioning to farm the basename. */
    hf_repo: z.string().min(1),
    quantization: z.string().min(1),
  })
  .strict();

export const FulcrumRolesFileSchema = z
  .object({
    version: z.number().int().positive(),
    description: z.string().min(1).optional(),
    roles: z
      .object({
        convergent: FulcrumRoleEntrySchema,
        divergent: FulcrumRoleEntrySchema,
        embed: FulcrumRoleEntrySchema,
      })
      .strict(),
    nodes: z
      .object({
        inference1: z.object({ endpoint: z.string().url() }).strict(),
        inference2: z.object({ endpoint: z.string().url() }).strict(),
      })
      .strict(),
    /** Roles that must never be requested or expected on the Fulcrum path. */
    forbidden_role_names: z.array(z.string().min(1)),
  })
  .strict();

export type FulcrumRoleEntry = z.infer<typeof FulcrumRoleEntrySchema>;
export type FulcrumRolesFile = z.infer<typeof FulcrumRolesFileSchema>;

export function defaultFulcrumRolesPath(repoRoot: string): string {
  return `${repoRoot}/packages/platform/deploy/fleet/fulcrum-roles.json`;
}

/**
 * Load + validate the expectation file. Throws on invalid JSON, a forbidden
 * role name, or any schema violation — callers must treat that as
 * FULCRUM_SUBSTRATE_INVALID (fail-closed), never as an empty expectation set.
 */
export function loadFulcrumRoles(path: string): FulcrumRolesFile {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = FulcrumRolesFileSchema.parse(raw);
  const forbidden = new Set(parsed.forbidden_role_names.map((n) => n.toLowerCase()));
  for (const role of FULCRUM_ROLE_NAMES) {
    if (forbidden.has(role.toLowerCase())) {
      throw new Error(`fulcrum roles file marks required role '${role}' forbidden`);
    }
  }
  return parsed;
}

/** Sorted role names — the canonical expectation order (convergent, divergent, embed). */
export function sortedRoleNames(manifest: FulcrumRolesFile): string[] {
  return Object.keys(manifest.roles).sort();
}

/** OpenAI-compatible /v1/models response shape, kept intentionally narrow. */
export type FulcrumModelsPayload = {
  data?: unknown;
};

/**
 * Extract model ids from the live response. Malformed entries are ignored; an
 * absent or malformed data array yields no observed models and therefore a
 * fail-closed readiness result (a server that answers but serves nothing).
 */
export function extractFulcrumModelIds(payload: FulcrumModelsPayload): string[] {
  if (!Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry)) return [];
    const id = (entry as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
}

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export type FulcrumNodeProbe = {
  node: string;
  endpoint: string;
  reachable: boolean;
  /** Failure detail when unreachable (HTTP error, timeout, malformed body). */
  error: string | null;
  /** Model ids observed from this node's own /v1/models (empty when down). */
  models: string[];
};

/**
 * ONE bounded GET to one node's own /v1/models. Never fans out per role.
 * Any transport, HTTP, or payload failure marks the node unreachable with an
 * empty model list — readiness then fails closed for that node only, so a
 * dead node is reported per node instead of hidden in an aggregate.
 */
export async function probeFulcrumNode(
  node: string,
  endpoint: string,
  fetchImpl: FetchImpl,
  timeoutMs: number
): Promise<FulcrumNodeProbe> {
  const probe = {
    node,
    endpoint,
    reachable: false,
    error: null as string | null,
    models: [] as string[],
  };
  try {
    const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      probe.error = `HTTP ${response.status} from ${endpoint}/models`;
      return probe;
    }
    const payload = (await response.json()) as FulcrumModelsPayload;
    probe.models = extractFulcrumModelIds(payload);
    probe.reachable = true;
    return probe;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    probe.error = `probe failed for ${endpoint}/models: ${msg}`;
    return probe;
  }
}

export type FulcrumRoleBinding = {
  role: string;
  basename: string;
  present: boolean;
};

export type FulcrumRoleComparison = {
  /** Sorted by role name (convergent, divergent, embed). */
  roles: FulcrumRoleBinding[];
  present: string[];
  missing: string[];
  /** Sum of declared size_gb for basenames actually served. */
  resident_gb: number;
  /** Served ids that match an expected basename. */
  fulcrum_basenames_served: number;
  /** Served ids that match no expected basename (coder + other non-Fulcrum). */
  coder_basenames_served: number;
};

/**
 * Cross-check the declared role -> basename expectations against ONE observed
 * id list. Expectations come from the manifest only — an observed basename
 * never creates an expectation (fail-closed against vocabulary drift).
 */
export function compareFulcrumRoles(
  manifest: FulcrumRolesFile,
  observedModelIds: readonly string[]
): FulcrumRoleComparison {
  const observed = new Set(observedModelIds);
  const entries = Object.entries(manifest.roles).sort(([a], [b]) => a.localeCompare(b));
  const roles: FulcrumRoleBinding[] = entries.map(([role, entry]) => ({
    role,
    basename: entry.basename,
    present: observed.has(entry.basename),
  }));
  const present = roles.filter((r) => r.present).map((r) => r.role);
  const missing = roles.filter((r) => !r.present).map((r) => r.role);
  const resident_gb = entries
    .filter(([role]) => present.includes(role))
    .map(([, entry]) => entry.size_gb)
    .reduce((sum, gb) => sum + gb, 0);
  return {
    roles,
    present,
    missing,
    resident_gb,
    fulcrum_basenames_served: present.length,
    coder_basenames_served: observedModelIds.length - present.length,
  };
}

export type FulcrumNodeReadiness = FulcrumNodeProbe & {
  comparison: FulcrumRoleComparison | null;
  missing_roles: string[];
  present_roles: string[];
  ready: boolean;
};

export type FulcrumSubstrateReport = {
  mode: 'fleet' | 'endpoint';
  expected_roles: string[];
  nodes: FulcrumNodeReadiness[];
  nodes_ready: number;
  /** Fewest Fulcrum roles served by any reachable node (null when none reachable). */
  roles_per_node: number | null;
  unreachable_nodes: string[];
  ready: boolean;
  requested_roles: string[] | null;
  forbidden_role_hits: number | null;
};

/**
 * Aggregate per-node probe results into the substrate report. Readiness is
 * per node and fail-closed: every declared node must be reachable and serve
 * every declared role. A stopped node is named individually and never hidden
 * behind an aggregate answer.
 */
export function buildSubstrateReport(
  manifest: FulcrumRolesFile,
  probes: readonly FulcrumNodeProbe[],
  options?: { mode?: 'fleet' | 'endpoint'; traceRequestedRoles?: boolean }
): FulcrumSubstrateReport {
  const nodes: FulcrumNodeReadiness[] = probes.map((probe) => {
    if (!probe.reachable) {
      return { ...probe, comparison: null, missing_roles: [], present_roles: [], ready: false };
    }
    const comparison = compareFulcrumRoles(manifest, probe.models);
    return {
      ...probe,
      comparison,
      missing_roles: comparison.missing,
      present_roles: comparison.present,
      ready: comparison.missing.length === 0,
    };
  });
  const reachable = nodes.filter((n) => n.reachable);
  const expectedRoles = sortedRoleNames(manifest);
  const requested = options?.traceRequestedRoles ? [...expectedRoles].sort() : null;
  const forbidden = new Set(manifest.forbidden_role_names.map((n) => n.toLowerCase()));
  const forbiddenHits =
    requested === null ? null : requested.filter((r) => forbidden.has(r.toLowerCase())).length;
  return {
    mode: options?.mode ?? 'fleet',
    expected_roles: expectedRoles,
    nodes,
    nodes_ready: nodes.filter((n) => n.ready).length,
    roles_per_node:
      reachable.length === 0 ? null : Math.min(...reachable.map((n) => n.present_roles.length)),
    unreachable_nodes: nodes.filter((n) => !n.reachable).map((n) => n.node),
    ready: nodes.length > 0 && nodes.every((n) => n.ready),
    requested_roles: requested,
    forbidden_role_hits: forbiddenHits,
  };
}
