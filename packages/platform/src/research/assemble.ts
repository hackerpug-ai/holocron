/**
 * Assemble EvidenceGateInput from graded/entailed/disconfirmed candidates.
 * independenceGroup mirrors sourceId; assertQuoteAttested before gate.
 */
import { randomUUID } from 'node:crypto';
import { assertComponentsFrozen, type FrozenComponents } from './components.ts';
import {
  type EvidenceGateInput,
  type EvidenceGateResult,
  evaluateEvidenceGate,
} from './evidence-gate.ts';
import { assertQuoteAttested, type ProvenanceStore } from './provenance.ts';

export type AssembledEvidenceRow = {
  claimId: string;
  claimText: string;
  component: string;
  sourceId: string;
  quote: string;
  sourceText: string;
  grade: number;
  entailment: number;
  disconfirmationResolved: boolean;
  direction: 'supporting' | 'refuting';
};

export type AssembleInput = {
  frozen: FrozenComponents;
  rows: AssembledEvidenceRow[];
  gradeFloor?: number;
  entailmentFloor?: number;
  independentSourceFloor?: number;
  provenance?: ProvenanceStore;
  /** Skip attestation when provenance store not wired (unit paths). Default false. */
  skipAttestation?: boolean;
};

export type AssembleResult = {
  gateInput: EvidenceGateInput;
  gate: EvidenceGateResult;
};

/**
 * Build gate input, assert frozen components + quote attestation, then evaluate.
 */
export function assembleAndEvaluate(input: AssembleInput): AssembleResult {
  const requiredComponents = [...input.frozen.components];
  // Gate requires the frozen vocabulary; rows may cover a subset.
  assertComponentsFrozen(input.frozen, requiredComponents);
  for (const row of input.rows) {
    if (!input.frozen.components.includes(row.component)) {
      throw new Error('RESEARCH_COMPONENTS_MUTATED');
    }
  }

  if (!input.skipAttestation) {
    if (!input.provenance) {
      throw new Error('RESEARCH_SOURCETEXT_NOT_ATTESTED');
    }
    for (const row of input.rows) {
      assertQuoteAttested({
        quote: row.quote,
        sourceText: row.sourceText,
        store: input.provenance,
      });
    }
  }

  const claims = input.rows.map((row) => ({
    id: row.claimId,
    text: row.claimText,
    component: row.component,
  }));

  // Deduplicate claims by id (multiple evidence rows may share a claim).
  const claimById = new Map(claims.map((c) => [c.id, c]));

  const evidence = input.rows.map((row) => ({
    id: `e-${row.claimId}-${row.sourceId}`.slice(0, 120) || randomUUID(),
    claimId: row.claimId,
    component: row.component,
    sourceId: row.sourceId,
    // Independence group MUST mirror sourceId — never a model-supplied label.
    independenceGroup: row.sourceId,
    quote: row.quote,
    sourceText: row.sourceText,
    grade: row.grade,
    entailment: row.entailment,
    disconfirmationResolved: row.disconfirmationResolved,
    direction: row.direction,
  }));

  const gateInput: EvidenceGateInput = {
    claims: [...claimById.values()],
    evidence,
    requiredComponents,
    gradeFloor: input.gradeFloor ?? 3,
    entailmentFloor: input.entailmentFloor ?? 0.8,
    independentSourceFloor: input.independentSourceFloor ?? 2,
  };

  const gate = evaluateEvidenceGate(gateInput);
  return { gateInput, gate };
}
