/**
 * probeCapabilities — boot-time per-role capability probe for structured output.
 *
 * Probes each Fleet Role Manifest role endpoint with a REAL generateText call
 * using an explicit JSON instruction (never a /health proxy or static cache) to
 * record per-role json_schema structured-output support, and selects
 * constrained-decode vs repair-loop mode.
 *
 * Uses generateText rather than generateObject because local OpenAI-compatible
 * models respond more reliably to prompt-level JSON instructions; the probe
 * validates the parsed text against a small Zod schema to detect whether the
 * role honors structured output.
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
 * Run a real generateText call (with explicit JSON instruction) against a
 * resolved fleet role to test json_schema constrained decode support.
 *
 * This is the core probe: it makes a REAL fleet call using generateText (not
 * generateObject — generateText with a prompt-level JSON instruction is more
 * reliable for local OpenAI-compatible models) with a simple schema and checks
 * if the model honors json_schema (constrained decode) or if we need the
 * repair loop (repair mode).
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

  // Use generateText with explicit JSON instruction (more reliable for local models)
  const { generateText } = await import('ai');

  const prompt = `Reply with a valid JSON object matching this schema:
{
  "success": true,
  "message": "probe successful"
}

Output ONLY the JSON object, no additional text.`;

  const timeoutMs = options.timeoutMs ?? 45_000;

  try {
    const result = await generateText({
      model: fleetModel,
      prompt,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });

    // Parse and validate against the probe schema
    let jsonResponse: unknown;
    try {
      const text = result.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return false; // No JSON found → repair mode
      }
      jsonResponse = JSON.parse(jsonMatch[0]);
    } catch {
      return false; // JSON parse failed → repair mode
    }

    // Validate against schema
    const validated = PROBE_SCHEMA.safeParse(jsonResponse);
    return validated.success;
  } catch {
    return false; // Call failed or timed out → repair mode
  }
}

/**
 * Probe a single role for json_schema structured-output support.
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

    // Probe json_schema support with a REAL generateText call (not generateObject —
    // generateText with explicit JSON instruction is more reliable for local models)
    const supportsJsonSchema = await probeJsonSchemaSupport(resolved, options);

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
 * generateText call (not generateObject — generateText with a prompt-level
 * JSON instruction is more reliable for local OpenAI-compatible models; never a
 * /health proxy or static cache) and records per-role capability.
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
