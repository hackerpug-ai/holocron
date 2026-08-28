/**
 * Fulcrum admission predicate — PURE.
 *
 * evaluateAdmission(claim, gradedEvidence[], policy, now) per 04-api-design.md
 * § Evidence Gate. Strict Zod in, structured decision out; reasons are a closed
 * string-literal union, never a free-form message.
 *
 * The gate takes ALREADY-READ values (tierValue, retrievedAt, normalizedText) and
 * returns a decision. Reading the ladder and persisting the decision live in
 * services/platform/src/fulcrum/admission-writer.ts. Zero I/O, zero model client,
 * zero model roles, no database imports — the reviewer greps the gate directory for all four.
 */
import { z } from 'zod';
import { gradeByRecencyWindow } from './grade.ts';
import { verifyQuote } from './verify-quote.ts';

/** Machine-readable admission reasons — closed union, persisted verbatim. */
export const AdmissionReasonSchema = z.enum([
  'admitted_quote_verified',
  'quote_unverified',
  'domain_unclassified',
  'evidence_out_of_window',
  'grade_below_floor',
  'no_evidence',
]);

export const AdmissionClaimSchema = z
  .object({
    id: z.string().min(1),
    quoteText: z.string().nullable(),
  })
  .strict();

/** One bound evidence object with its fetch artifact and ladder tier already resolved. */
export const GradedEvidenceSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceDomain: z.string().min(1).nullable(),
    tierValue: z.number().min(0).max(1).nullable(),
    retrievedAt: z.number().int().min(0),
    normalizedText: z.string(),
  })
  .strict();

export const AdmissionPolicySchema = z
  .object({
    gradeFloor: z.number().min(0).max(1),
    recencyWindowDays: z.number().int().min(1),
  })
  .strict();

export const AdmissionDecisionSchema = z
  .object({
    status: z.enum(['admitted', 'provisional']),
    passesGate: z.boolean(),
    qualifyingGrade: z.number().min(0).max(1).nullable(),
    reasons: z.array(AdmissionReasonSchema).min(1),
  })
  .strict();

export type AdmissionReasonValue = z.infer<typeof AdmissionReasonSchema>;
export type AdmissionClaim = z.infer<typeof AdmissionClaimSchema>;
export type GradedEvidence = z.infer<typeof GradedEvidenceSchema>;
export type AdmissionPolicy = z.infer<typeof AdmissionPolicySchema>;
export type AdmissionDecision = z.infer<typeof AdmissionDecisionSchema>;

/** Deterministic reason reporting order (most specific first). */
const REASON_ORDER = [
  'quote_unverified',
  'domain_unclassified',
  'evidence_out_of_window',
  'grade_below_floor',
] as const satisfies readonly AdmissionReasonValue[];

const DAY_MS = 86_400_000;

function decide(
  status: AdmissionDecision['status'],
  passesGate: boolean,
  qualifyingGrade: number | null,
  reasons: AdmissionReasonValue[]
): AdmissionDecision {
  return AdmissionDecisionSchema.parse({ status, passesGate, qualifyingGrade, reasons });
}

/**
 * A claim qualifies iff at least one bound evidence object simultaneously:
 * carries the claim's quote as an exact substring of its normalized artifact,
 * is classified on the active ladder, sits inside the recency window, and
 * grades at/above the floor. Every failure mode records its own reason.
 */
export function evaluateAdmission(
  claim: AdmissionClaim,
  evidence: GradedEvidence[],
  policy: AdmissionPolicy,
  now: number
): AdmissionDecision {
  if (!Number.isFinite(now)) throw new TypeError('evaluateAdmission: now must be finite');
  const parsedClaim = AdmissionClaimSchema.parse(claim);
  const parsedEvidence = z.array(GradedEvidenceSchema).parse(evidence);
  const parsedPolicy = AdmissionPolicySchema.parse(policy);

  if (parsedEvidence.length === 0) {
    return decide('provisional', false, null, ['no_evidence']);
  }

  const failures = new Set<AdmissionReasonValue>();
  const passingGrades: number[] = [];
  const gradedBelowFloor: number[] = [];

  for (const item of parsedEvidence) {
    if (!verifyQuote(parsedClaim.quoteText ?? '', item.normalizedText)) {
      failures.add('quote_unverified');
      continue;
    }
    if (item.tierValue === null) {
      failures.add('domain_unclassified');
      continue;
    }
    const ageDays = Math.max(0, (now - item.retrievedAt) / DAY_MS);
    if (ageDays > parsedPolicy.recencyWindowDays) {
      failures.add('evidence_out_of_window');
      continue;
    }
    const grade = gradeByRecencyWindow(
      item.tierValue,
      item.retrievedAt,
      parsedPolicy.recencyWindowDays,
      now
    );
    if (grade < parsedPolicy.gradeFloor) {
      failures.add('grade_below_floor');
      gradedBelowFloor.push(grade);
      continue;
    }
    passingGrades.push(grade);
  }

  if (passingGrades.length > 0) {
    return decide('admitted', true, Math.max(...passingGrades), ['admitted_quote_verified']);
  }

  const reasons: AdmissionReasonValue[] = REASON_ORDER.filter((reason) => failures.has(reason));
  if (reasons.length === 0) reasons.push('no_evidence');
  const qualifyingGrade = gradedBelowFloor.length > 0 ? Math.max(...gradedBelowFloor) : null;
  return decide('provisional', false, qualifyingGrade, reasons);
}
