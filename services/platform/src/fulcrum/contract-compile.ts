/**
 * Fulcrum fitness-contract COMPILE entrypoint (FUL-PLAT-005).
 *
 * RED SKELETON — the compile validates nothing against Postgres and writes
 * nothing yet. Every AC test in
 * services/platform/tests/integration/fulcrum-mission-contract.test.ts fails
 * against this skeleton (the compile refuses before any ladder write), which
 * is the honest start state for the GREEN implementation:
 *
 *   parse → refuse unregistered tool grants (FULCRUM_TOOL_GRANT_UNREGISTERED)
 *   → compile the fulcrum instantiation through the REAL mission compiler and
 *     persist it under templateKey `evidence-research`
 *   → append one weight_versions + weight_components set and one
 *     domain_tier_versions + domain_tiers set at MAX(version)+1, all in ONE
 *     transaction, rubric_json carrying the persisted contract snapshot.
 */
import type { FulcrumMissionContract } from './contract.ts';

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

export async function compileFulcrumMissionContract(
  _input: FulcrumContractCompileInput
): Promise<FulcrumContractCompileResult> {
  throw new FulcrumContractError(
    'FULCRUM_CONTRACT_INVALID',
    'FULCRUM_CONTRACT_COMPILE_NOT_IMPLEMENTED: the fitness-contract compile entrypoint does not validate against the registry or persist ladder rows yet'
  );
}

export type { FulcrumMissionContract };
