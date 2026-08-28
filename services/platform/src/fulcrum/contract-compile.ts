/**
 * Fulcrum fitness-contract COMPILE entrypoint (FUL-PLAT-005 — GREEN).
 *
 * Validates the WHOLE contract first, then writes — a refused compile leaves
 * 0 ladder rows:
 *
 *   1. parse (strict Zod; ZodError → FULCRUM_CONTRACT_INVALID with the named
 *      issue path + expected/received preserved in the message)
 *   2. refuse unregistered tool grants (FULCRUM_TOOL_GRANT_UNREGISTERED,
 *      naming the rejected grant) — corpus-only, never an outbound web tool
 *   3. compile the fulcrum instantiation through the REAL mission compiler —
 *      mission DSL v1 refuses grants (assertNoUnsupportedToolGrants; FUL-PLAT-008
 *      owns the registry relaxation), so the definition is compiled with empty
 *      grants and the validated grant list is attached + re-hashed before
 *      persistence
 *   4. register the grant-carrying instantiation under templateKey
 *      `evidence-research` at the instantiation template version — never a
 *      distinct `fulcrum` template row
 *   5. append the weight + tier ladders at MAX(version)+1 inside ONE
 *      transaction, rubric_json carrying the sourceRules snapshot — never
 *      mutating a published weight_versions / domain_tier_versions row
 */
import { ZodError } from 'zod';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { sha256Hex } from '../mission/canonical-json.ts';
import { compileMissionTemplateDefinition } from '../mission/compiler.ts';
import type { MissionTemplateDefinition } from '../mission/contract.ts';
import { registerCompiledMissionTemplate } from '../mission/repository.ts';
import {
  evidenceResearchTemplateDefinition,
  FULCRUM_INSTANTIATION_TEMPLATE_VERSION,
} from '../mission/templates/evidence-research.ts';
import {
  FULCRUM_CORPUS_TOOL_IDS,
  type FulcrumCorpusToolId,
  type FulcrumMissionContract,
  isFulcrumCorpusToolId,
  parseFulcrumMissionContract,
} from './contract.ts';

export type FulcrumContractErrorCode =
  | 'FULCRUM_TOOL_GRANT_UNREGISTERED'
  | 'FULCRUM_CONTRACT_INVALID';

/** Typed refusal — closed code union, matching MissionRuntimeError conventions. */
export class FulcrumContractError extends Error {
  readonly code: FulcrumContractErrorCode;

  constructor(code: FulcrumContractErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FulcrumContractError';
    this.code = code;
  }
}

export type FulcrumContractCompileInput = {
  contract: unknown;
  databaseUrl?: string;
};

export type FulcrumContractCompileResult = {
  ok: true;
  missionId: string;
  weightVersion: number;
  domainTierVersion: number;
  weightComponents: number;
  domainTiers: number;
  templateKey: 'evidence-research';
  instantiation: 'fulcrum';
  templateVersion: string;
  templateCreated: boolean;
  toolGrants: readonly string[];
};

function zodIssuePath(path: readonly PropertyKey[]): string {
  return path.length > 0 ? path.map((part) => String(part)).join('.') : '(root)';
}

/** Wrap any contract-validation failure as the typed FULCRUM_CONTRACT_INVALID refusal. */
function toFulcrumContractInvalidError(error: unknown): FulcrumContractError {
  const detail =
    error instanceof ZodError
      ? error.issues.map((issue) => `${zodIssuePath(issue.path)}: ${issue.message}`).join('; ')
      : error instanceof Error
        ? error.message
        : String(error);
  return new FulcrumContractError(
    'FULCRUM_CONTRACT_INVALID',
    `fulcrum contract invalid — ${detail}`,
    {
      cause: error,
    }
  );
}

export async function compileFulcrumMissionContract(
  input: FulcrumContractCompileInput
): Promise<FulcrumContractCompileResult> {
  // ── 1. Validate the WHOLE contract before any write (named Zod paths) ────
  let contract: FulcrumMissionContract;
  try {
    contract = parseFulcrumMissionContract(input.contract);
  } catch (error) {
    throw toFulcrumContractInvalidError(error);
  }

  // ── 2. Refuse unregistered tool grants BEFORE any write ──────────────────
  const rejectedGrant = contract.toolGrants.find((grant) => !isFulcrumCorpusToolId(grant));
  if (rejectedGrant !== undefined) {
    throw new FulcrumContractError(
      'FULCRUM_TOOL_GRANT_UNREGISTERED',
      `tool grant '${rejectedGrant}' is not a registered Fulcrum corpus tool (allowed: ${FULCRUM_CORPUS_TOOL_IDS.join(', ')})`
    );
  }
  const validatedGrants: FulcrumCorpusToolId[] = contract.toolGrants.filter(isFulcrumCorpusToolId);

  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: input.databaseUrl,
    context: 'fulcrum fitness-contract compile',
  });

  // ── 3. Compile the fulcrum instantiation through the REAL mission compiler.
  // DSL v1 refuses grants, so compile with empty grants, then attach the
  // validated list + re-hash so definition_json and definition_hash agree.
  const instantiationDefinition: MissionTemplateDefinition = {
    ...evidenceResearchTemplateDefinition,
    version: FULCRUM_INSTANTIATION_TEMPLATE_VERSION,
    toolGrants: [],
  };
  const compiled = await compileMissionTemplateDefinition(instantiationDefinition);

  const grantedDefinition: MissionTemplateDefinition = {
    ...compiled.definition,
    toolGrants: [...validatedGrants],
  };
  const registration = await registerCompiledMissionTemplate(
    {
      ...compiled,
      definition: grantedDefinition,
      definitionHash: sha256Hex(grantedDefinition),
    },
    { databaseUrl }
  );

  // ── 4. Append both ladders in ONE transaction — version N+1, never UPDATE.
  const sql = createSql(databaseUrl);
  try {
    return await sql.begin(async (tx) => {
      const [nextWeightVersion] = await tx<{ next_version: number }[]>`
        SELECT COALESCE(max(version), 0) + 1 AS next_version
        FROM weight_versions
        WHERE mission_id = ${contract.missionId}
      `;
      const weightVersion = Number(nextWeightVersion?.next_version ?? 1);
      const [weightVersionRow] = await tx<{ id: string; version: number }[]>`
        INSERT INTO weight_versions (mission_id, version, disconfirmation_multiplier)
        VALUES (${contract.missionId}, ${weightVersion}, ${contract.disconfirmationMultiplier})
        RETURNING id, version
      `;
      const weightVersionId = String(weightVersionRow?.id ?? '');

      // Source governance round-trips to Postgres so the retrieval client can
      // enforce the ban list + per-domain courtesy delay (FUL-PLAT-006).
      const sourceRulesSnapshot = { sourceRules: contract.sourceRules };
      for (const component of contract.components) {
        await tx`
          INSERT INTO weight_components
            (weight_version_id, component, kind, weight, grade_floor, recency_window_days, half_life_days, rubric_json)
          VALUES (
            ${weightVersionId},
            ${component.component},
            ${component.kind},
            ${component.weight},
            ${component.gradeFloor ?? null},
            ${component.recencyWindowDays ?? null},
            ${component.halfLifeDays ?? null},
            ${tx.json(sourceRulesSnapshot)}
          )
        `;
      }

      const [nextTierVersion] = await tx<{ next_version: number }[]>`
        SELECT COALESCE(max(version), 0) + 1 AS next_version
        FROM domain_tier_versions
        WHERE mission_id = ${contract.missionId}
      `;
      const domainTierVersion = Number(nextTierVersion?.next_version ?? 1);
      const [tierVersionRow] = await tx<{ id: string; version: number }[]>`
        INSERT INTO domain_tier_versions (mission_id, version)
        VALUES (${contract.missionId}, ${domainTierVersion})
        RETURNING id, version
      `;
      const domainTierVersionId = String(tierVersionRow?.id ?? '');
      for (const tier of contract.domainTiers) {
        await tx`
          INSERT INTO domain_tiers (domain_tier_version_id, registrable_domain, tier, tier_value)
          VALUES (${domainTierVersionId}, ${tier.registrableDomain}, ${tier.tier}, ${tier.tierValue})
        `;
      }

      return {
        ok: true,
        missionId: contract.missionId,
        weightVersion,
        domainTierVersion,
        weightComponents: contract.components.length,
        domainTiers: contract.domainTiers.length,
        templateKey: 'evidence-research',
        instantiation: 'fulcrum',
        templateVersion: FULCRUM_INSTANTIATION_TEMPLATE_VERSION,
        templateCreated: registration.created,
        toolGrants: [...validatedGrants],
      };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type { FulcrumMissionContract };
