/**
 * Compare the Fleet Role Manifest with the model ids observed from one live
 * LiteLLM /v1/models response.
 *
 * This module deliberately contains no network access. The health probe owns
 * the single bounded request and passes its parsed ids here so the readiness
 * decision cannot accidentally fan out into one request per role.
 */
import {
  type DegradationAction,
  FLEET_ROLE_NAMES,
  type FleetRoleManifest,
  type FleetRoleName,
} from '../fleet/manifest.schema.ts';

/** Roles whose model availability is required for fleet readiness. */
export const GATING_FLEET_ROLES = ['divergent', 'convergent', 'judge', 'embed'] as const;

export type FleetRoleStatus = {
  present: boolean;
  litellmModelId: string | null;
  degradationAction: DegradationAction | null;
};

/** Outcome of one real inference probe for a gating role (AC-3). */
export type FleetRoleProbeOutcome = {
  ok: boolean;
  error?: string;
};

export type FleetRoleStatusMap = Record<FleetRoleName, FleetRoleStatus>;

export type FleetRoleReadiness = {
  roles: FleetRoleStatusMap;
  unavailable_roles: FleetRoleName[];
  ready: boolean;
};

/** OpenAI-compatible /v1/models response shape, kept intentionally narrow. */
export type FleetModelsPayload = {
  data?: unknown;
};

/**
 * Extract model ids from the live response. Malformed entries are ignored;
 * an absent or malformed data array yields no observed models and therefore a
 * fail-closed readiness result.
 */
export function extractFleetModelIds(payload: FleetModelsPayload): string[] {
  if (!Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry)) return [];
    const id = (entry as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
}

function unavailableStatus(): FleetRoleStatus {
  return {
    present: false,
    litellmModelId: null,
    degradationAction: null,
  };
}

function emptyRoleStatusMap(): FleetRoleStatusMap {
  return Object.fromEntries(
    FLEET_ROLE_NAMES.map((role) => [role, unavailableStatus()])
  ) as FleetRoleStatusMap;
}

/**
 * Cross-check declared role model ids against one observed model-id list.
 * Rerank and synthesis are intentionally visible but non-gating: a cold or
 * missing qwen3-reranker / research model degrades research rather than
 * failing /health, while embed is gating because search and re-embedding
 * must fail closed when unavailable.
 */
export function compareFleetRoles(
  manifest: FleetRoleManifest,
  observedModelIds: readonly string[]
): FleetRoleReadiness {
  const observed = new Set(observedModelIds);
  const roles = emptyRoleStatusMap();

  for (const role of FLEET_ROLE_NAMES) {
    const declared = manifest.roles[role];
    roles[role] = {
      present: observed.has(declared.litellmModelId),
      litellmModelId: declared.litellmModelId,
      degradationAction: declared.degradationAction,
    };
  }

  const unavailable_roles = FLEET_ROLE_NAMES.filter((role) => !roles[role].present);
  const ready = GATING_FLEET_ROLES.every((role) => roles[role].present);
  return { roles, unavailable_roles, ready };
}

/**
 * Imp-prod-tool-audit AC-3: readiness from REAL inference probes.
 *
 * Gating roles (divergent/convergent/judge/embed) are `present` only when the
 * probe-fleet executor reports a successful bounded chat/embed call for the
 * role's model — a dead upstream that /v1/models still aliases can no longer
 * pass. Non-gating roles (rerank/synthesis) stay alias-driven off the observed
 * model-id list so their degraded-but-non-gating state keeps its historical
 * semantics. Probe errors fail closed: a gating role without a successful
 * outcome is absent, and readiness requires every gating role present.
 */
export function fleetReadinessFromProbes(
  manifest: FleetRoleManifest,
  probeOutcomes: Partial<Record<FleetRoleName, FleetRoleProbeOutcome>>,
  aliasModelIds: readonly string[]
): FleetRoleReadiness {
  const observed = new Set(aliasModelIds);
  const roles = emptyRoleStatusMap();
  const gating = new Set<string>(GATING_FLEET_ROLES);

  for (const role of FLEET_ROLE_NAMES) {
    const declared = manifest.roles[role];
    const probe = gating.has(role) ? probeOutcomes[role] : undefined;
    const present = probe ? probe.ok === true : observed.has(declared.litellmModelId);
    roles[role] = {
      present,
      litellmModelId: declared.litellmModelId,
      degradationAction: declared.degradationAction,
    };
  }

  const unavailable_roles = FLEET_ROLE_NAMES.filter((role) => !roles[role].present);
  const ready = GATING_FLEET_ROLES.every((role) => roles[role].present);
  return { roles, unavailable_roles, ready };
}

/**
 * Build a fail-closed report when the manifest itself cannot be loaded. The
 * known role keys remain explicit so callers never infer a missing capability
 * from an omitted field; unavailable metadata stays null because it was not
 * safely declared.
 */
export function unavailableFleetRoles(): FleetRoleReadiness {
  const roles = emptyRoleStatusMap();
  return {
    roles,
    unavailable_roles: [...FLEET_ROLE_NAMES],
    ready: false,
  };
}
