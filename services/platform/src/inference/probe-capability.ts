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
 * G-ORACLE: the probe result is cross-checked against the manifest's
 * `structuredOutput` flag — if the manifest declares `structuredOutput: false`
 * the role is marked repair regardless (the manifest is authoritative).
 *
 * Sprint 09 struct-2: Boot-time probe → per-role capability map → mode selection.
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
  /** Fleet role name (divergent, convergent, judge, embed, rerank). */
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
 * This is the REAL probe: it detects whether the backend can actually handle
 * structured-output requests on the wire, not merely whether the model can emit
 * JSON-ish text.
 *
 * @param resolved - Resolved fleet model
 * @param options - Probe options
 * @returns true if json_schema is supported, false otherwise
 */
async function probeJsonSchemaSupport(
  resolved: ResolvedModel,
  options: ProbeCapabilitiesOptions = {}
): Promise<boolean> {
  const { createFleetChatModel } = await import('./resolve-model');
  const fleetModel = createFleetChatModel(resolved, {
    apiKey: process.env.FLEET_KEY ?? 'sk-none',
  });

  // Use generateObject with a real schema — this sends response_format:
  // json_schema on the wire. A role that honors it returns a parsed object;
  // a role that does not throws (NoObjectGeneratedError / schema mismatch).
  const { generateObject } = await import('ai');

  const prompt = 'Return a JSON object with success=true and message="probe successful".';

  const timeoutMs = options.timeoutMs ?? 45_000;

  try {
    await generateObject({
      model: fleetModel,
      schema: PROBE_SCHEMA,
      prompt,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return true; // generateObject succeeded → role honors json_schema
  } catch {
    return false; // generateObject failed → repair mode
  }
}

/**
 * Probe a single role for json_schema structured-output support.
 *
 * G-ORACLE: the probe result is cross-checked against the manifest's
 * `structuredOutput` flag (carried on the resolved model). The manifest is
 * authoritative: if `resolved.structuredOutput === false` the role is marked
 * repair regardless of the live probe (the manifest declares this role does
 * not support structured output). If the manifest says true AND the live
 * generateObject probe succeeds → constrained.
 *
 * @param role - Fleet role to probe
 * @param options - Probe options
 * @returns Role capability result
 */
export async function probeRoleCapability(
  role: string,
  options: ProbeCapabilitiesOptions = {}
): Promise<RoleCapability> {
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

    // G-ORACLE: the manifest's structuredOutput flag is authoritative. If the
    // manifest declares structuredOutput=false, force repair mode regardless of
    // the live probe (the manifest is the declared contract). Constrained mode
    // requires BOTH manifest=true AND a successful live generateObject probe.
    const supportsJsonSchema =
      resolved.structuredOutput === true && liveSupportsJsonSchema === true;

    // Select mode based on capability
    const mode: 'constrained' | 'repair' = supportsJsonSchema ? 'constrained' : 'repair';

    return {
      role,
      supportsJsonSchema,
      mode,
      endpoint: resolved.endpoint,
      litellmModelId: resolved.litellmModelId,
    };
  } catch (err) {
    // Probe failed → conservatively assume repair mode
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
 * The output is used by struct-1's extractStructured to select constrained-decode
 * vs repair-loop mode per role.
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
