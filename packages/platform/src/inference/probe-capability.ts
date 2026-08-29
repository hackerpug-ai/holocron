/**
 * probeCapabilities — boot-time per-role capability probe for structured output.
 *
 * Probes each Fleet Role Manifest role endpoint with a REAL generateObject call
 * (response_format: json_schema on the wire — never a /health proxy or static
 * cache) to record per-role json_schema structured-output support, and selects
 * constrained-decode vs repair-loop mode.
 *
 * Uses generateObject (the REAL structured-output mechanism that extractStructured
 * relies on): if the role honors json_schema the call returns a parsed object;
 * if not (e.g. reasoning models that emit content=null), generateObject throws
 * NoObjectGeneratedError and the role is marked `repair`.
 *
 * S31-06: declared-true / probed-false is MANIFEST_CAPABILITY_UNCONFIRMED (fail
 * closed) — never a silent downgrade. Extraction consumes the boot probe map
 * via the typed process-scoped BootCapabilityMap accessor.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts
 */

import { z } from 'zod';
import type { FleetRoleManifest } from '../fleet/manifest.schema';
import { type ResolvedModel, resolveModel } from './resolve-model';

/**
 * Capability probe result for a single role.
 */
export type RoleCapability = {
  /** Fleet role name (divergent, convergent, judge, embed, rerank, synthesis). */
  role: string;
  /** Whether the role supports json_schema constrained decode. */
  supportsJsonSchema: boolean;
  /** Mode selected based on capability: 'constrained' or 'repair'. */
  mode: 'constrained' | 'repair';
  /** Error message if probe failed (otherwise undefined). */
  error?: string;
  /** Endpoint that was probed. */
  endpoint: string;
  /** LiteLLM model ID that was probed. */
  litellmModelId: string;
  /**
   * Live generateObject result BEFORE cross-check with the manifest flag.
   * Present when the role was reachable and the wire probe completed.
   */
  liveSupportsJsonSchema?: boolean;
  /** Manifest-declared structuredOutput flag at probe time. */
  declaredStructuredOutput?: boolean;
};

/**
 * Capability probe options.
 */
export type ProbeCapabilitiesOptions = {
  /** Override manifest path (tests / CLI). */
  manifestPath?: string;
  /** Pre-loaded manifest (skips disk when provided). */
  manifest?: FleetRoleManifest;
  /** Timeout per role probe in ms (default 45s — local fleet can stall). */
  timeoutMs?: number;
  /** Optional fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /**
   * When true (default for boot/assert paths), declared structuredOutput=true
   * that the live probe cannot confirm throws ManifestCapabilityUnconfirmedError.
   * Set false for operator diagnostics (`holo probe:capabilities`) so the map
   * still reports every role.
   */
  failClosedOnUnconfirmed?: boolean;
};

/**
 * Typed error: the Fleet Role Manifest advertises a capability the live probe
 * cannot confirm. Startup and extraction must fail closed — never silent repair.
 */
export class ManifestCapabilityUnconfirmedError extends Error {
  readonly code = 'MANIFEST_CAPABILITY_UNCONFIRMED' as const;
  constructor(
    readonly role: string,
    readonly declaredCapability: 'structuredOutput',
    readonly probedValue: boolean
  ) {
    super(
      `MANIFEST_CAPABILITY_UNCONFIRMED: role '${role}' declares ${declaredCapability}=true ` +
        `but live probe could not confirm (probedValue=${probedValue})`
    );
    this.name = 'ManifestCapabilityUnconfirmedError';
  }
}

/**
 * Drift entry: manifest structuredOutput disagrees with the live probe mode.
 */
export type CapabilityDriftEntry = {
  role: string;
  declared: boolean;
  probed: boolean;
  probedMode: 'constrained' | 'repair';
};

/**
 * Tiny schema used for probing json_schema support.
 * Models that honor json_schema will return valid JSON matching this structure.
 */
const PROBE_SCHEMA = z.object({
  success: z.boolean(),
  message: z.string(),
});

/**
 * Typed process-scoped accessor for the boot capability map.
 * Holds the map for the process lifetime after a single boot probe.
 * Not a bare module-level mutable global — all access goes through this API.
 */
export class BootCapabilityMap {
  private map: Record<string, RoleCapability> | null = null;
  private probed = false;

  /** Whether a boot probe has populated the map. */
  isReady(): boolean {
    return this.probed && this.map !== null;
  }

  /** Install a capability map (boot path / tests). */
  set(map: Record<string, RoleCapability>): void {
    this.map = { ...map };
    this.probed = true;
  }

  /** Clear the map (tests only). */
  clear(): void {
    this.map = null;
    this.probed = false;
  }

  /** Read the map, or null when not yet probed. */
  get(): Record<string, RoleCapability> | null {
    return this.map ? { ...this.map } : null;
  }

  /** Require a role capability; throws when map missing or role unknown. */
  requireRole(role: string): RoleCapability {
    if (!this.map) {
      throw new Error(
        `boot capability map not initialized — call ensureBootCapabilityMap() before extraction (role=${role})`
      );
    }
    const cap = this.map[role];
    if (!cap) {
      throw new Error(`boot capability map has no entry for role '${role}'`);
    }
    return { ...cap };
  }
}

/** Process-lifetime boot capability map (explicit accessor — not free-form global state). */
export const bootCapabilityMap = new BootCapabilityMap();

/**
 * Run a real generateObject call against a resolved fleet role to test
 * json_schema constrained decode support.
 *
 * This is the core probe: it makes a REAL fleet call using generateObject (the
 * same mechanism extractStructured uses) with a simple schema. If the role
 * honors json_schema, generateObject returns a parsed object → supportsJsonSchema
 * is true. If the role cannot honor json_schema (e.g. reasoning models that emit
 * content=null whenever response_format is set), generateObject throws
 * NoObjectGeneratedError → supportsJsonSchema is false → repair mode.
 *
 * @param resolved - Resolved fleet model
 * @param options - Probe options
 * @returns true if json_schema is supported, false otherwise
 */
async function probeJsonSchemaSupport(
  resolved: ResolvedModel,
  options: ProbeCapabilitiesOptions = {}
): Promise<boolean> {
  // S31-07: real generateObject via the single instrumented client (telemetry).
  const { runFleetModelCall } = await import('./telemetry');
  const { randomUUID } = await import('node:crypto');

  const prompt = 'Return a JSON object with success=true and message="probe successful".';
  const timeoutMs = options.timeoutMs ?? 45_000;

  try {
    await runFleetModelCall({
      role: resolved.role,
      prompt,
      runId: randomUUID(),
      stepId: 'probe-capability',
      callSite: 'probe-capability',
      callKind: 'object',
      schema: PROBE_SCHEMA,
      modelOptions: { apiKey: process.env.FLEET_KEY ?? 'sk-none' },
      resolveOptions: {
        // Reuse the already-resolved endpoint/manifest — skip a second health probe when possible.
        skipHealth: true,
        manifestPath: options.manifestPath,
        manifest: options.manifest,
      },
      abortSignal: AbortSignal.timeout(timeoutMs),
      exportToLangfuse: false,
    });
    return true; // generateObject succeeded → role honors json_schema
  } catch {
    return false; // generateObject failed → repair mode
  }
}

/**
 * Probe a single role for json_schema structured-output support.
 *
 * S31-06: the live generateObject result is authoritative for capability.
 * - declared structuredOutput=false → mode repair (manifest may under-claim)
 * - declared true AND live true → constrained
 * - declared true AND live false → MANIFEST_CAPABILITY_UNCONFIRMED (fail closed)
 *   when failClosedOnUnconfirmed is true (boot/extraction); diagnostic mode
 *   records the overclaim without throwing.
 *
 * @param role - Fleet role to probe
 * @param options - Probe options
 * @returns Role capability result
 * @throws ManifestCapabilityUnconfirmedError when fail-closed and overclaim detected
 */
export async function probeRoleCapability(
  role: string,
  options: ProbeCapabilitiesOptions = {}
): Promise<RoleCapability> {
  const failClosed = options.failClosedOnUnconfirmed !== false;

  try {
    // Resolve the model (never bypass resolveModel)
    const resolved: ResolvedModel = await resolveModel(role, {
      manifestPath: options.manifestPath,
      manifest: options.manifest,
      skipHealth: false,
    });

    // Probe json_schema support with a REAL generateObject call (the same
    // mechanism extractStructured uses). A role that honors json_schema returns
    // a parsed object; a role that does not throws NoObjectGeneratedError.
    const liveSupportsJsonSchema = await probeJsonSchemaSupport(resolved, options);
    const declared = resolved.structuredOutput === true;

    // Fail closed: manifest overclaim is a startup/extraction error, not a
    // silent slide into repair mode (UC-INFER-01 AC-4 / S31-06).
    if (declared && !liveSupportsJsonSchema) {
      if (failClosed) {
        throw new ManifestCapabilityUnconfirmedError(role, 'structuredOutput', false);
      }
      // Diagnostic path: report repair + surface the contradiction in error.
      return {
        role,
        supportsJsonSchema: false,
        mode: 'repair',
        error: `MANIFEST_CAPABILITY_UNCONFIRMED: declared structuredOutput=true but live probe=false`,
        endpoint: resolved.endpoint,
        litellmModelId: resolved.litellmModelId,
        liveSupportsJsonSchema,
        declaredStructuredOutput: declared,
      };
    }

    // Constrained requires a successful live probe. Under-claim (declared false
    // even if the wire could support it) stays repair — the manifest is allowed
    // to be conservative; it is not allowed to overclaim.
    const supportsJsonSchema = declared && liveSupportsJsonSchema;
    const mode: 'constrained' | 'repair' = supportsJsonSchema ? 'constrained' : 'repair';

    return {
      role,
      supportsJsonSchema,
      mode,
      endpoint: resolved.endpoint,
      litellmModelId: resolved.litellmModelId,
      liveSupportsJsonSchema,
      declaredStructuredOutput: declared,
    };
  } catch (err) {
    if (err instanceof ManifestCapabilityUnconfirmedError) {
      throw err;
    }
    // Probe failed (unreachable endpoint / resolve error) → conservatively assume repair.
    // Distinct from declared-true/probed-false: the role was not reachable.
    const msg = err instanceof Error ? err.message : String(err);
    return {
      role,
      supportsJsonSchema: false,
      mode: 'repair',
      error: msg,
      endpoint: '(probe failed)',
      litellmModelId: '(probe failed)',
    };
  }
}

/**
 * Probe all Fleet Role Manifest roles for json_schema structured-output support.
 *
 * This is the boot-time probe: it tests each role endpoint with a REAL
 * generateObject call (never a /health proxy or static cache) and records
 * per-role capability.
 *
 * When a specific role is provided, returns a single RoleCapability.
 * When no role is provided, returns a map of all capabilities.
 *
 * @param role - Single role to probe (optional, for targeted testing)
 * @param options - Probe options
 * @returns Single RoleCapability if role specified, otherwise capability map (role → RoleCapability)
 */
export async function probeCapabilities(
  role?: string,
  options: ProbeCapabilitiesOptions = {}
): Promise<RoleCapability | Record<string, RoleCapability>> {
  // Load manifest to get all roles
  const { getFleetManifest } = await import('../fleet/manifest');
  const manifest = options.manifest ?? getFleetManifest(options.manifestPath);

  // Get all role names from the manifest
  const roles = Object.keys(manifest.roles) as string[];

  // If a specific role is requested, only probe that one and return single result
  if (role) {
    return await probeRoleCapability(role, options);
  }

  // Probe each role in parallel (boot-time probe can be slow)
  const capabilities: Record<string, RoleCapability> = {};

  // Probe sequentially to avoid overwhelming the local fleet
  // (it can stall on rapid sequential calls)
  for (const roleToProbe of roles) {
    const capability = await probeRoleCapability(roleToProbe, options);
    capabilities[roleToProbe] = capability;
  }

  return capabilities;
}

/**
 * Compare a capability map to the manifest's structuredOutput flags.
 * Drift exists when declared structuredOutput !== (mode === 'constrained').
 */
export function compareManifestToProbe(
  manifest: FleetRoleManifest,
  capabilities: Record<string, RoleCapability>
): CapabilityDriftEntry[] {
  const drift: CapabilityDriftEntry[] = [];
  for (const role of Object.keys(manifest.roles)) {
    const entry = manifest.roles[role as keyof typeof manifest.roles];
    const cap = capabilities[role];
    if (!entry || !cap) continue;
    const declared = entry.structuredOutput === true;
    const probed = cap.mode === 'constrained';
    if (declared !== probed) {
      drift.push({
        role,
        declared,
        probed,
        probedMode: cap.mode,
      });
    }
  }
  return drift;
}

/**
 * Run the boot-time probe once, fail closed on unconfirmed capabilities, and
 * install the map into the process-scoped accessor. Subsequent calls return
 * the cached map without re-probing (never per-extraction, never to disk).
 */
export async function ensureBootCapabilityMap(
  options: ProbeCapabilitiesOptions = {}
): Promise<Record<string, RoleCapability>> {
  if (bootCapabilityMap.isReady()) {
    const existing = bootCapabilityMap.get();
    if (existing) return existing;
  }

  const failClosed = options.failClosedOnUnconfirmed !== false;
  const map = (await probeCapabilities(undefined, {
    ...options,
    failClosedOnUnconfirmed: failClosed,
  })) as Record<string, RoleCapability>;

  bootCapabilityMap.set(map);
  return map;
}

/**
 * Assert the committed (or provided) manifest matches the live probe with
 * zero unconfirmed overclaims. Throws ManifestCapabilityUnconfirmedError on
 * the first declared-true / probed-false role. Returns the capability map.
 */
export async function assertManifestCapabilities(
  options: ProbeCapabilitiesOptions = {}
): Promise<Record<string, RoleCapability>> {
  return ensureBootCapabilityMap({
    ...options,
    failClosedOnUnconfirmed: true,
  });
}
