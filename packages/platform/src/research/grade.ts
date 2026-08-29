/**
 * Rule-derived evidence grade.
 * tierCeiling from sourceTier; modelProposal can only LOWER; corroborationBonus
 * computed over the full candidate set and capped at the tier ceiling.
 */
import { sourceTier } from './source-tier.ts';

export type GradeCandidate = {
  sourceId: string;
  canonicalDomain: string;
  url: string;
  originKey?: string | null;
  publishedAt: string | null;
  text: string;
  /** Optional model proposal in [1,5]; can only lower the grade. */
  modelProposal?: number | null;
};

export type GradeResult = {
  grade: number;
  tierCeiling: number;
  corroborationBonus: number;
  penalties: number;
  modelProposal: number | null;
};

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Corroboration bonus (+1) iff the full set has ≥2 distinct sourceIds AND
 * ≥2 distinct canonicalDomains. Applied uniformly; never exceeds tierCeiling.
 */
export function corroborationBonusForSet(
  candidates: ReadonlyArray<Pick<GradeCandidate, 'sourceId' | 'canonicalDomain'>>
): number {
  const sourceIds = new Set(candidates.map((c) => c.sourceId).filter(Boolean));
  const domains = new Set(
    candidates.map((c) => c.canonicalDomain.trim().toLowerCase()).filter(Boolean)
  );
  return sourceIds.size >= 2 && domains.size >= 2 ? 1 : 0;
}

/**
 * grade = clamp(1,5, min(tierCeiling, modelProposal) + corroborationBonus − penalties)
 * where modelProposal is optional; absent → treat as tierCeiling (no further lowering).
 * corroborationBonus is capped so the pre-penalty sum cannot exceed tierCeiling.
 */
export function gradeEvidence(
  candidate: GradeCandidate,
  set: ReadonlyArray<Pick<GradeCandidate, 'sourceId' | 'canonicalDomain'>>
): GradeResult {
  const tierCeiling = sourceTier({
    url: candidate.url,
    originKey: candidate.originKey,
    canonicalDomain: candidate.canonicalDomain,
  });

  const rawBonus = corroborationBonusForSet(set);
  const proposal =
    candidate.modelProposal == null || !Number.isFinite(candidate.modelProposal)
      ? tierCeiling
      : Math.floor(candidate.modelProposal);
  const base = Math.min(tierCeiling, proposal);
  const headroom = Math.max(0, tierCeiling - base);
  const appliedBonus = Math.min(rawBonus, headroom);

  let penalties = 0;
  if (candidate.publishedAt == null) penalties += 1;
  if (candidate.text.length < 500) penalties += 1;

  const grade = clamp(1, 5, base + appliedBonus - penalties);

  return {
    grade,
    tierCeiling,
    corroborationBonus: rawBonus,
    penalties,
    modelProposal: candidate.modelProposal ?? null,
  };
}

/** Convenience: grade every candidate against the full set. */
export function gradeEvidenceSet(candidates: GradeCandidate[]): GradeResult[] {
  return candidates.map((c) => gradeEvidence(c, candidates));
}
