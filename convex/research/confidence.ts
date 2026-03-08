/**
 * Confidence Calculation Module for Deep Research
 *
 * Implements 5-factor weighted confidence scoring algorithm:
 * - Source Credibility (25%): Quality and trustworthiness of sources
 * - Evidence Quality (25%): Directness and strength of evidence
 * - Corroboration (25%): Number of independent sources confirming claim
 * - Recency (15%): How current the information is
 * - Expert Consensus (10%): Agreement among domain experts
 */

import type { Id } from "../_generated/dataModel";

/**
 * 5-factor confidence input structure
 */
export interface ConfidenceFactors {
  sourceCredibilityScore: number; // 0-100
  evidenceQualityScore: number; // 0-100
  corroborationScore: number; // 0-100
  recencyScore: number; // 0-100
  expertConsensusScore: number; // 0-100
}

/**
 * Confidence level enumeration
 */
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

/**
 * Full confidence result with metadata
 */
export interface ConfidenceResult {
  score: number; // 0-100 weighted score
  level: ConfidenceLevel;
  factors: ConfidenceFactors;
  caveats: string[];
  warnings: string[];
  meetsMultiSourceRequirement: boolean;
}

/**
 * Source type credibility scores
 */
export const SOURCE_TYPE_CREDIBILITY: Record<string, number> = {
  official_documentation: 95,
  academic_paper: 90,
  expert_blog: 75,
  news: 65,
  forum: 45,
  social_media: 30,
  unknown: 40,
};

/**
 * Evidence type quality scores
 */
export const EVIDENCE_TYPE_QUALITY: Record<string, number> = {
  primary: 95,
  secondary: 70,
  tertiary: 45,
  anecdotal: 25,
};

/**
 * Calculate weighted confidence score using 5-factor algorithm
 *
 * Weights:
 * - Source Credibility: 25%
 * - Evidence Quality: 25%
 * - Corroboration: 25%
 * - Recency: 15%
 * - Expert Consensus: 10%
 *
 * @param factors - The 5 factor scores (0-100 each)
 * @returns Weighted confidence score (0-100)
 */
export function calculateConfidenceScore(factors: ConfidenceFactors): number {
  const score =
    factors.sourceCredibilityScore * 0.25 +
    factors.evidenceQualityScore * 0.25 +
    factors.corroborationScore * 0.25 +
    factors.recencyScore * 0.15 +
    factors.expertConsensusScore * 0.1;

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Determine confidence level from numeric score
 *
 * Level mapping:
 * - HIGH: 80-100 (requires 3+ sources for full HIGH)
 * - MEDIUM: 50-79
 * - LOW: 0-49
 *
 * @param score - Confidence score (0-100)
 * @param sourceCount - Number of independent sources
 * @returns Confidence level
 */
export function determineConfidenceLevel(
  score: number,
  sourceCount: number
): ConfidenceLevel {
  // High confidence requires both high score AND multi-source requirement
  if (score >= 80 && sourceCount >= 3) {
    return "HIGH";
  }
  // Score alone in high range but insufficient sources = MEDIUM
  if (score >= 80 && sourceCount < 3) {
    return "MEDIUM";
  }
  if (score >= 50) {
    return "MEDIUM";
  }
  return "LOW";
}

/**
 * Generate caveats for MEDIUM confidence claims
 *
 * Caveats explain why confidence is not HIGH and what would improve it.
 *
 * @param factors - The confidence factors
 * @param sourceCount - Number of sources
 * @returns Array of caveat strings
 */
export function generateCaveats(
  factors: ConfidenceFactors,
  sourceCount: number
): string[] {
  const caveats: string[] = [];

  // Multi-source caveat
  if (sourceCount < 3) {
    caveats.push(
      `Based on ${sourceCount} source${sourceCount === 1 ? "" : "s"}; additional sources would increase confidence`
    );
  }

  // Source credibility caveat
  if (factors.sourceCredibilityScore < 70) {
    caveats.push("Some sources have limited credibility or authority");
  }

  // Evidence quality caveat
  if (factors.evidenceQualityScore < 70) {
    caveats.push("Evidence is indirect or based on secondary sources");
  }

  // Recency caveat
  if (factors.recencyScore < 60) {
    caveats.push("Information may be outdated; verify current state");
  }

  // Consensus caveat
  if (factors.expertConsensusScore < 60) {
    caveats.push("Limited expert consensus on this topic");
  }

  return caveats;
}

/**
 * Generate warnings for LOW confidence claims
 *
 * Warnings are stronger than caveats and indicate significant reliability concerns.
 *
 * @param factors - The confidence factors
 * @param sourceCount - Number of sources
 * @returns Array of warning strings
 */
export function generateWarnings(
  factors: ConfidenceFactors,
  sourceCount: number
): string[] {
  const warnings: string[] = [];

  // Single source warning
  if (sourceCount === 1) {
    warnings.push("⚠️ Single source only - verify independently before relying on this");
  }

  // No source warning
  if (sourceCount === 0) {
    warnings.push("⚠️ No verifiable sources found - treat as unverified claim");
  }

  // Low credibility warning
  if (factors.sourceCredibilityScore < 40) {
    warnings.push("⚠️ Sources have low credibility - exercise caution");
  }

  // Anecdotal evidence warning
  if (factors.evidenceQualityScore < 30) {
    warnings.push("⚠️ Evidence is primarily anecdotal or speculative");
  }

  // Outdated warning
  if (factors.recencyScore < 30) {
    warnings.push("⚠️ Information may be significantly outdated");
  }

  // Contradicting expert views
  if (factors.expertConsensusScore < 30) {
    warnings.push("⚠️ Expert opinions on this topic are divided or unavailable");
  }

  return warnings;
}

/**
 * Calculate full confidence result including level, caveats, and warnings
 *
 * @param factors - The 5 confidence factor scores
 * @param sourceCount - Number of independent sources
 * @returns Complete confidence result
 */
export function calculateFullConfidenceResult(
  factors: ConfidenceFactors,
  sourceCount: number
): ConfidenceResult {
  const score = calculateConfidenceScore(factors);
  const level = determineConfidenceLevel(score, sourceCount);

  return {
    score,
    level,
    factors,
    caveats: level === "MEDIUM" ? generateCaveats(factors, sourceCount) : [],
    warnings: level === "LOW" ? generateWarnings(factors, sourceCount) : [],
    meetsMultiSourceRequirement: sourceCount >= 3,
  };
}

/**
 * Calculate corroboration score based on source count
 *
 * Scoring:
 * - 1 source: 20
 * - 2 sources: 50
 * - 3 sources: 75
 * - 4 sources: 90
 * - 5+ sources: 100
 *
 * @param sourceCount - Number of independent sources
 * @returns Corroboration score (0-100)
 */
export function calculateCorroborationScore(sourceCount: number): number {
  if (sourceCount <= 0) return 0;
  if (sourceCount === 1) return 20;
  if (sourceCount === 2) return 50;
  if (sourceCount === 3) return 75;
  if (sourceCount === 4) return 90;
  return 100;
}

/**
 * Calculate recency score based on publication date
 *
 * Scoring:
 * - Within 1 month: 100
 * - Within 3 months: 90
 * - Within 6 months: 80
 * - Within 1 year: 65
 * - Within 2 years: 50
 * - Within 5 years: 35
 * - Older than 5 years: 20
 * - Unknown date: 40
 *
 * @param publishedDate - ISO date string or null
 * @returns Recency score (0-100)
 */
export function calculateRecencyScore(publishedDate: string | null): number {
  if (!publishedDate) return 40;

  try {
    const published = new Date(publishedDate);
    const now = new Date();
    const monthsAgo = (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24 * 30);

    if (monthsAgo <= 1) return 100;
    if (monthsAgo <= 3) return 90;
    if (monthsAgo <= 6) return 80;
    if (monthsAgo <= 12) return 65;
    if (monthsAgo <= 24) return 50;
    if (monthsAgo <= 60) return 35;
    return 20;
  } catch {
    return 40;
  }
}

/**
 * Confidence stats aggregation structure
 */
export interface ConfidenceStats {
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  averageConfidenceScore: number;
  claimsWithMultipleSources: number;
  totalClaims: number;
}

/**
 * Aggregate confidence stats from multiple findings
 *
 * @param findings - Array of findings with confidence data
 * @returns Aggregated confidence statistics
 */
export function aggregateConfidenceStats(
  findings: Array<{
    confidenceLevel: string;
    confidenceScore: number;
    citationIds: Array<Id<"citations">>;
  }>
): ConfidenceStats {
  const stats: ConfidenceStats = {
    highConfidenceCount: 0,
    mediumConfidenceCount: 0,
    lowConfidenceCount: 0,
    averageConfidenceScore: 0,
    claimsWithMultipleSources: 0,
    totalClaims: findings.length,
  };

  if (findings.length === 0) {
    return stats;
  }

  let totalScore = 0;

  for (const finding of findings) {
    totalScore += finding.confidenceScore;

    switch (finding.confidenceLevel) {
      case "HIGH":
        stats.highConfidenceCount++;
        break;
      case "MEDIUM":
        stats.mediumConfidenceCount++;
        break;
      case "LOW":
        stats.lowConfidenceCount++;
        break;
    }

    if (finding.citationIds.length >= 3) {
      stats.claimsWithMultipleSources++;
    }
  }

  stats.averageConfidenceScore = Math.round(totalScore / findings.length);

  return stats;
}
