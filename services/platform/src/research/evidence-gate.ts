import { z } from 'zod';

export const EvidenceItemSchema = z
  .object({
    id: z.string().min(1),
    claimId: z.string().min(1),
    component: z.string().min(1),
    sourceId: z.string().min(1),
    independenceGroup: z.string().min(1),
    grade: z.number().int().min(1).max(5),
    entailment: z.number().min(0).max(1),
    direction: z.enum(['supporting', 'refuting']),
  })
  .strict();

export const ResearchClaimSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    component: z.string().min(1),
  })
  .strict();

export const EvidenceGateInputSchema = z
  .object({
    claims: z.array(ResearchClaimSchema),
    evidence: z.array(EvidenceItemSchema),
    requiredComponents: z.array(z.string().min(1)).min(1),
    gradeFloor: z.number().int().min(1).max(5).default(3),
    entailmentFloor: z.number().min(0).max(1).default(0.8),
    independentSourceFloor: z.number().int().min(1).default(2),
  })
  .strict();

export type EvidenceGateInput = z.input<typeof EvidenceGateInputSchema>;
export type EvidenceGateResult = {
  admitted: boolean;
  direction: 'supporting' | 'refuting' | 'mixed' | 'none';
  requiredComponents: string[];
  coveredComponents: string[];
  missingComponents: string[];
  admittedEvidenceIds: string[];
  rejectedEvidenceIds: string[];
  independentSourceCount: number;
  reason: string;
};

/**
 * Deterministic admission seam. Supporting and refuting evidence use the same
 * grade, entailment, component, and independence rules; model calls never occur.
 */
export function evaluateEvidenceGate(raw: EvidenceGateInput): EvidenceGateResult {
  const input = EvidenceGateInputSchema.parse(raw);
  const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
  const admitted = input.evidence.filter(
    (item) =>
      claimsById.has(item.claimId) &&
      input.requiredComponents.includes(item.component) &&
      item.grade >= input.gradeFloor &&
      item.entailment >= input.entailmentFloor
  );
  const coveredComponents = [...new Set(admitted.map((item) => item.component))].sort();
  const missingComponents = input.requiredComponents.filter(
    (component) => !coveredComponents.includes(component)
  );
  const sourceGroups = new Set(admitted.map((item) => item.independenceGroup));
  const admittedDirections = new Set(admitted.map((item) => item.direction));
  const direction: EvidenceGateResult['direction'] =
    admittedDirections.size === 0
      ? 'none'
      : admittedDirections.size === 1
        ? ([...admittedDirections][0] as 'supporting' | 'refuting')
        : 'mixed';
  const admittedGate =
    missingComponents.length === 0 && sourceGroups.size >= input.independentSourceFloor;
  return {
    admitted: admittedGate,
    direction,
    requiredComponents: input.requiredComponents,
    coveredComponents,
    missingComponents,
    admittedEvidenceIds: admitted.map((item) => item.id),
    rejectedEvidenceIds: input.evidence
      .filter((item) => !admitted.some((candidate) => candidate.id === item.id))
      .map((item) => item.id),
    independentSourceCount: sourceGroups.size,
    reason: admittedGate
      ? 'all required components meet grade, entailment, and independence floors'
      : missingComponents.length > 0
        ? `missing required components: ${missingComponents.join(', ')}`
        : `requires ${input.independentSourceFloor} independent source groups, got ${sourceGroups.size}`,
  };
}
