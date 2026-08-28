/**
 * Fulcrum FITNESS contract — the versioned scoring constitution (FUL-PLAT-005).
 *
 * Two contracts meet in Fulcrum and must not be conflated:
 *   - the mission TEMPLATE contract (src/mission/contract.ts) is the closed
 *     execution DSL — this task only widens its toolGrants field;
 *   - THIS fitness contract is new: components, weights, tier ladder,
 *     source governance, cadence. It compiles into append-only ladder rows
 *     (weight_versions / weight_components / domain_tier_versions /
 *     domain_tiers — migration 0041, FUL-PLAT-001); the template contract
 *     compiles into mission_template_versions.
 *
 * Strict Zod object — no passthrough, no z.any(), no free-form Record on
 * governance fields (UC-GATE-01: ban-list + courtesy delays are Zod fields
 * enforced by the retrieval client, FUL-PLAT-006).
 */
import { z } from 'zod';

/**
 * The six registered Mastra corpus tool ids (src/tools/registry.ts) SENSE may
 * call (PRD 04-api-design § Retrieval contract). Single exported const array —
 * the mission-template toolGrants enum derives from THIS array so the registry
 * surface and the schema cannot drift. SENSE is corpus-only: no outbound web
 * tool (Exa/Jina/fetch) may ever appear here.
 */
export const FULCRUM_CORPUS_TOOL_IDS = [
  'hybrid_search',
  'search_fts',
  'search_vector',
  'search_research',
  'get_research_session',
  'get_document',
] as const;

export type FulcrumCorpusToolId = (typeof FULCRUM_CORPUS_TOOL_IDS)[number];

export function isFulcrumCorpusToolId(value: string): value is FulcrumCorpusToolId {
  return (FULCRUM_CORPUS_TOOL_IDS as readonly string[]).includes(value);
}

/**
 * Raw grant list on the fitness contract. Membership against the registered
 * corpus tool ids is enforced by the COMPILE entrypoint (contract-compile.ts)
 * so an unregistered grant is refused with FULCRUM_TOOL_GRANT_UNREGISTERED —
 * a typed, named refusal — instead of an anonymous Zod enum failure.
 */
export const FulcrumToolGrantsSchema = z.array(z.string().min(1)).min(1);

export const FulcrumWeightComponentSchema = z
  .object({
    component: z.string().min(1),
    kind: z.enum(['evidence', 'judgment']),
    weight: z.number().min(0).max(1),
    gradeFloor: z.number().min(0).max(1).nullable().optional(),
    recencyWindowDays: z.number().int().positive().nullable().optional(),
    halfLifeDays: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const FulcrumDomainTierSchema = z
  .object({
    registrableDomain: z.string().min(1),
    tier: z.string().min(1),
    tierValue: z.number().min(0).max(1),
  })
  .strict();

export const FulcrumSourceRulesSchema = z
  .object({
    banList: z.array(z.string().min(1)),
    /** Per-domain courtesy delay in ms enforced before any host is touched. */
    courtesyDelayMs: z.number().int().nonnegative(),
  })
  .strict();

export const FulcrumCadenceSchema = z
  .object({
    intervalMinutes: z.number().int().positive(),
  })
  .strict();

export const FulcrumMissionContractSchema = z
  .object({
    missionId: z.string().min(1),
    /** Fulcrum is an instantiation tag on evidence-research — never its own template key. */
    templateKey: z.literal('evidence-research'),
    instantiation: z.literal('fulcrum'),
    rootQuestion: z.string().min(1),
    disconfirmationMultiplier: z.number().positive(),
    components: z.array(FulcrumWeightComponentSchema).min(1),
    domainTiers: z.array(FulcrumDomainTierSchema).min(1),
    sourceRules: FulcrumSourceRulesSchema,
    cadence: FulcrumCadenceSchema,
    toolGrants: FulcrumToolGrantsSchema,
  })
  .strict();

export type FulcrumWeightComponent = z.infer<typeof FulcrumWeightComponentSchema>;
export type FulcrumDomainTier = z.infer<typeof FulcrumDomainTierSchema>;
export type FulcrumSourceRules = z.infer<typeof FulcrumSourceRulesSchema>;
export type FulcrumMissionContract = z.infer<typeof FulcrumMissionContractSchema>;

/**
 * Parse the raw fitness contract. Throws the ZodError itself so callers see
 * NAMED issue paths (e.g. `sourceRules.banList.0`) and expected/received —
 * the compile entrypoint wraps it in FULCRUM_CONTRACT_INVALID with the named
 * path preserved in the message. A refused parse writes nothing.
 */
export function parseFulcrumMissionContract(raw: unknown): FulcrumMissionContract {
  const parsed = FulcrumMissionContractSchema.safeParse(raw);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}
