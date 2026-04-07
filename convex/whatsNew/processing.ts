/**
 * What's New Processing Functions
 *
 * Shared functions for processing findings:
 * - Deduplication
 * - Quality scoring
 * - Categorization
 * - Metrics calculation
 */

import type { Finding } from "./types";

// Re-export Finding type for convenience
export type { Finding };

/**
 * Deduplicate findings by URL
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const finding of findings) {
    // Normalize URL for deduplication
    const normalizedUrl = finding.url
      .toLowerCase()
      .replace(/\/$/, "")
      .replace(/^https?:\/\//, "");

    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      unique.push(finding);
    }
  }

  return unique;
}

/**
 * Cap findings per source to prevent any single source from dominating.
 * Keeps top N findings per source, sorted by score descending.
 */
export function capFindingsPerSource(findings: Finding[], maxPerSource: number): Finding[] {
  const bySource = new Map<string, Finding[]>();
  for (const finding of findings) {
    // Normalize source to base name (e.g., "Bluesky (@foo)" -> "Bluesky")
    const baseSource = finding.source.replace(/\s*\(.*\)$/, '');
    if (!bySource.has(baseSource)) {
      bySource.set(baseSource, []);
    }
    bySource.get(baseSource)!.push(finding);
  }

  const capped: Finding[] = [];
  for (const [, sourceFindings] of bySource) {
    // Sort by score descending, take top N
    sourceFindings.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    capped.push(...sourceFindings.slice(0, maxPerSource));
  }

  return capped;
}

/**
 * Categorize findings into discovery/release/trend/discussion
 */
export function categorizeFindings(findings: Finding[]): {
  discoveries: Finding[];
  releases: Finding[];
  trends: Finding[];
  discussions: Finding[];
} {
  const discoveries: Finding[] = [];
  const releases: Finding[] = [];
  const trends: Finding[] = [];
  const discussions: Finding[] = [];

  for (const finding of findings) {
    if (finding.tags?.includes("discovery")) {
      discoveries.push(finding);
    }
    if (finding.tags?.includes("release")) {
      releases.push(finding);
    }
    if (finding.tags?.includes("trend")) {
      trends.push(finding);
    }
    if (finding.tags?.includes("discussion")) {
      discussions.push(finding);
    }
  }

  return { discoveries, releases, trends, discussions };
}

/**
 * Populate per-finding corroboration count
 */
export function populatePerFindingCorroboration(findings: Finding[]): void {
  // Group findings by normalized URL
  const byUrl = new Map<string, Finding[]>();
  for (const finding of findings) {
    const normalizedUrl = finding.url
      .toLowerCase()
      .replace(/\/$/, "")
      .replace(/^https?:\/\//, "");
    if (!byUrl.has(normalizedUrl)) {
      byUrl.set(normalizedUrl, []);
    }
    byUrl.get(normalizedUrl)!.push(finding);
  }

  // Count corroboration for each finding
  for (const finding of findings) {
    const normalizedUrl = finding.url
      .toLowerCase()
      .replace(/\/$/, "")
      .replace(/^https?:\/\//, "");
    finding.corroboration = byUrl.get(normalizedUrl)!.length;
  }
}

/**
 * Calculate top engagement velocity
 */
export function calculateTopEngagementVelocity(
  findings: Finding[]
): Array<{ url: string; velocity: number }> {
  const withVelocity = findings
    .filter((f) => f.engagementVelocity !== undefined)
    .map((f) => ({ url: f.url, velocity: f.engagementVelocity! }))
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 10);

  return withVelocity;
}

/**
 * Calculate total corroboration count
 */
export function calculateCorroboration(findings: Finding[]): number {
  let total = 0;
  for (const finding of findings) {
    total += finding.corroboration ?? 1;
  }
  return total;
}

/**
 * Extract unique sources
 */
export function extractSources(findings: Finding[]): string[] {
  const sources = new Set<string>();
  for (const finding of findings) {
    sources.add(finding.source);
  }
  return Array.from(sources).sort();
}

/**
 * Score findings quality using LLM
 *
 * For social posts (Reddit, HN, Bluesky, Twitter), use LLM to assess:
 * - Clickbait detection
 * - Self-promotion vs. substance
 * - Technical depth
 * - Authoritative source bonus
 *
 * This is a re-export of the function from actions.ts for convenience.
 */
export async function scoreFindingsQuality(
  findings: Finding[]
): Promise<Finding[]> {
  // Import LLM scoring function from actions
  const { scoreFindingsQuality: llmScore } = await import("./actions");
  return llmScore(findings);
}
