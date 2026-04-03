/**
 * Output Formatting for Deep Research with Confidence
 *
 * Generates confidence-aware markdown output following the McKinsey Pyramid
 * Principle: direct answer first, supporting evidence organized by theme.
 *
 * Structure:
 * - Title + direct answer (narrativeSummary) at the top
 * - Key Findings grouped by theme/category
 * - Confidence Summary table
 * - Gaps & Open Questions (from LOW confidence findings)
 * - Methodology
 * - Sources
 */

import type { ConfidenceStats } from "./confidence";
import {
  getConfidenceBadge,
  formatScoreBar,
  formatTable,
  formatSources,
  todayISO,
  scoreToConfidenceLevel,
} from "../lib/reportFormat";

/**
 * Finding structure for output formatting
 */
export interface FormattedFinding {
  claimText: string;
  claimCategory?: string;
  confidenceScore: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  caveats: string[];
  warnings: string[];
  citations: Array<{
    url: string;
    title?: string;
    domain?: string;
  }>;
  sourceCount: number;
}

/**
 * Output filter options
 */
export type ConfidenceFilter = "HIGH_ONLY" | "HIGH_MEDIUM" | "ALL";

/**
 * Format a single finding entry within a themed section.
 * Shows: badge, bold claim title, claim text, source count, citations.
 */
function formatFindingEntry(finding: FormattedFinding): string {
  const badge = getConfidenceBadge(finding.confidenceLevel);

  // Use first sentence of claim as a short title
  const titleMatch = finding.claimText.match(/^([^.!?]+[.!?]?)/);
  const title = titleMatch ? titleMatch[0].trim() : finding.claimText.slice(0, 80);
  const body = finding.claimText.length > title.length ? finding.claimText : "";

  const citationList = finding.citations
    .map((c) => `[${c.title || c.domain || "Source"}](${c.url})`)
    .join(", ");

  let entry = `- **${title}** ${badge} (${finding.sourceCount} source${finding.sourceCount !== 1 ? "s" : ""})`;

  if (body) {
    entry += `\n  ${body}`;
  }

  if (citationList) {
    entry += `\n  Sources: ${citationList}`;
  }

  // Add caveats for MEDIUM confidence
  if (finding.confidenceLevel === "MEDIUM" && finding.caveats.length > 0) {
    entry += `\n  _Caveats: ${finding.caveats.join("; ")}_`;
  }

  return entry;
}

/**
 * Format findings grouped by category/theme.
 * If findings have no claimCategory, they go under "General Findings".
 */
export function formatFindingsWithConfidence(
  findings: FormattedFinding[],
  filter: ConfidenceFilter = "ALL"
): string {
  // Apply filter
  let filteredFindings = findings;
  switch (filter) {
    case "HIGH_ONLY":
      filteredFindings = findings.filter((f) => f.confidenceLevel === "HIGH");
      break;
    case "HIGH_MEDIUM":
      filteredFindings = findings.filter(
        (f) => f.confidenceLevel === "HIGH" || f.confidenceLevel === "MEDIUM"
      );
      break;
    case "ALL":
    default:
      break;
  }

  // Group by category/theme
  const categoryMap = new Map<string, FormattedFinding[]>();
  for (const finding of filteredFindings) {
    const category = finding.claimCategory || "General Findings";
    const existing = categoryMap.get(category) ?? [];
    existing.push(finding);
    categoryMap.set(category, existing);
  }

  let output = `## Key Findings\n\n`;

  for (const [category, categoryFindings] of categoryMap) {
    // Sort within category by confidence score descending
    const sorted = [...categoryFindings].sort(
      (a, b) => b.confidenceScore - a.confidenceScore
    );

    output += `### ${category}\n`;
    output += sorted.map(formatFindingEntry).join("\n\n");
    output += "\n\n";
  }

  // Filter note
  if (filter !== "ALL") {
    const hiddenCount = findings.length - filteredFindings.length;
    if (hiddenCount > 0) {
      output += `_Note: ${hiddenCount} lower-confidence finding(s) filtered out. Use filter "ALL" to see complete results._\n\n`;
    }
  }

  return output;
}

/**
 * Generate complete research report with confidence.
 * Follows McKinsey Pyramid Principle: answer first, evidence second.
 */
export function generateConfidenceReport(
  topic: string,
  stats: ConfidenceStats,
  findings: FormattedFinding[],
  filter: ConfidenceFilter = "ALL",
  narrativeSummary?: string
): string {
  const totalClaims = stats.totalClaims;
  const avgScore = stats.averageConfidenceScore;
  const overallLevel = scoreToConfidenceLevel(avgScore);

  // Fallback instant value if no narrativeSummary
  const highPct =
    totalClaims > 0
      ? Math.round((stats.highConfidenceCount / totalClaims) * 100)
      : 0;
  const medPct =
    totalClaims > 0
      ? Math.round((stats.mediumConfidenceCount / totalClaims) * 100)
      : 0;

  const fallbackSummary =
    overallLevel === "HIGH"
      ? `Findings are well-supported by multiple authoritative sources (${highPct}% high confidence across ${totalClaims} claims).`
      : overallLevel === "MEDIUM"
        ? `Findings are generally supported but some claims need additional verification (${highPct + medPct}% high/medium confidence across ${totalClaims} claims).`
        : `Findings require significant additional verification before relying on them (average confidence: ${avgScore}% across ${totalClaims} claims).`;

  const instantValue = narrativeSummary || fallbackSummary;

  const totalSources = findings.reduce((sum, f) => sum + f.sourceCount, 0);

  // YAML frontmatter matching DEEP_RESEARCH_TEMPLATE
  let report = `---\ntitle: "${topic}"\ndate: "${todayISO()}"\ncategory: "research"\nconfidence: "${overallLevel}"\nsources_consulted: ${totalSources}\niterations: 1\n---\n\n`;

  // Title + Executive Summary
  report += `# ${topic}\n\n`;
  report += `## Executive Summary\n${instantValue}\n\n`;

  // Key findings grouped by theme
  report += formatFindingsWithConfidence(findings, filter);

  // Confidence Assessment table (per-finding rows, matching DEEP_RESEARCH_TEMPLATE)
  const assessmentRows: string[][] = findings.map((f) => [
    f.claimText.slice(0, 50) + (f.claimText.length > 50 ? "…" : ""),
    f.confidenceLevel,
    String(f.sourceCount),
  ]);

  report += `## Confidence Assessment\n\n`;
  if (assessmentRows.length > 0) {
    report += formatTable(["Finding", "Confidence", "Sources"], assessmentRows);
    report += "\n\n";
  }
  report += `Average: ${formatScoreBar(avgScore)}\n\n`;

  // Deduplicated sources section (before Gaps, matching DEEP_RESEARCH_TEMPLATE order)
  const allCitations = findings.flatMap((f) => f.citations);
  const seen = new Set<string>();
  const uniqueSources: Array<{ url: string; title?: string; domain?: string }> =
    [];
  for (const c of allCitations) {
    if (!seen.has(c.url)) {
      seen.add(c.url);
      uniqueSources.push(c);
    }
  }

  if (uniqueSources.length > 0) {
    report += `${formatSources(uniqueSources)}\n\n`;
  }

  // Gaps & Open Questions from LOW confidence findings
  const lowFindings = findings.filter(
    (f) => f.confidenceLevel === "LOW" && filter === "ALL"
  );
  report += `## Gaps & Open Questions\n`;
  if (lowFindings.length > 0) {
    for (const f of lowFindings) {
      const category = f.claimCategory ? ` _(${f.claimCategory})_` : "";
      report += `- ${f.claimText}${category}`;
      if (f.warnings.length > 0) {
        report += ` — ⚠️ ${f.warnings.join("; ")}`;
      }
      report += "\n";
    }
  } else {
    report += `- No significant gaps identified\n- Suggested follow-up: verify high-confidence claims with primary sources\n`;
  }
  report += "\n";

  return report;
}

/**
 * Generate JSON output for programmatic consumption (unchanged)
 */
export function generateConfidenceJSON(
  topic: string,
  stats: ConfidenceStats,
  findings: FormattedFinding[],
  narrativeSummary?: string
): object {
  return {
    topic,
    generatedAt: new Date().toISOString(),
    confidence: {
      overallLevel:
        stats.averageConfidenceScore >= 75
          ? "HIGH"
          : stats.averageConfidenceScore >= 50
            ? "MEDIUM"
            : "LOW",
      averageScore: stats.averageConfidenceScore,
      distribution: {
        high: stats.highConfidenceCount,
        medium: stats.mediumConfidenceCount,
        low: stats.lowConfidenceCount,
      },
      totalClaims: stats.totalClaims,
      multiSourceClaims: stats.claimsWithMultipleSources,
    },
    narrativeSummary,
    findings: findings.map((f) => ({
      claim: f.claimText,
      category: f.claimCategory,
      confidence: {
        score: f.confidenceScore,
        level: f.confidenceLevel,
      },
      sources: f.citations,
      sourceCount: f.sourceCount,
      caveats: f.caveats,
      warnings: f.warnings,
    })),
  };
}
