/**
 * Output Formatting for Deep Research with Confidence
 *
 * Generates confidence-aware markdown output with:
 * - Confidence summary at top
 * - HIGH confidence findings (no caveats)
 * - MEDIUM confidence findings (with caveats)
 * - LOW confidence findings (with warnings)
 */

import type { ConfidenceStats } from "./confidence";
import type { Id } from "../_generated/dataModel";

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
 * Format confidence badge for markdown
 */
function getConfidenceBadge(level: "HIGH" | "MEDIUM" | "LOW"): string {
  switch (level) {
    case "HIGH":
      return "🟢 HIGH";
    case "MEDIUM":
      return "🟡 MEDIUM";
    case "LOW":
      return "🔴 LOW";
  }
}

/**
 * Format confidence score as percentage bar
 */
function formatScoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${score}%`;
}

/**
 * Generate confidence summary section
 */
export function formatConfidenceSummary(
  stats: ConfidenceStats,
  topic: string
): string {
  const totalClaims = stats.totalClaims;
  const avgScore = stats.averageConfidenceScore;

  const highPct = totalClaims > 0 ? Math.round((stats.highConfidenceCount / totalClaims) * 100) : 0;
  const medPct = totalClaims > 0 ? Math.round((stats.mediumConfidenceCount / totalClaims) * 100) : 0;
  const lowPct = totalClaims > 0 ? Math.round((stats.lowConfidenceCount / totalClaims) * 100) : 0;

  const multiSourcePct = totalClaims > 0 ? Math.round((stats.claimsWithMultipleSources / totalClaims) * 100) : 0;

  // Determine overall assessment
  let overallAssessment: string;
  if (highPct >= 60 && avgScore >= 75) {
    overallAssessment = "🟢 **HIGH CONFIDENCE RESEARCH** - Findings are well-supported by multiple authoritative sources.";
  } else if (highPct + medPct >= 70 && avgScore >= 50) {
    overallAssessment = "🟡 **MEDIUM CONFIDENCE RESEARCH** - Findings are generally supported but some claims need additional verification.";
  } else {
    overallAssessment = "🔴 **LOW CONFIDENCE RESEARCH** - Findings require significant additional verification before relying on them.";
  }

  return `# Research Report: ${topic}

## Confidence Summary

${overallAssessment}

### Statistics

| Metric | Value |
|--------|-------|
| Total Claims | ${totalClaims} |
| Average Confidence | ${formatScoreBar(avgScore)} |
| High Confidence Claims | ${stats.highConfidenceCount} (${highPct}%) |
| Medium Confidence Claims | ${stats.mediumConfidenceCount} (${medPct}%) |
| Low Confidence Claims | ${stats.lowConfidenceCount} (${lowPct}%) |
| Multi-Source Claims (3+) | ${stats.claimsWithMultipleSources} (${multiSourcePct}%) |

---

`;
}

/**
 * Format a single finding with confidence metadata
 */
function formatFinding(finding: FormattedFinding, index: number): string {
  const badge = getConfidenceBadge(finding.confidenceLevel);
  const category = finding.claimCategory ? ` | ${finding.claimCategory}` : "";

  let output = `### ${index + 1}. ${badge}${category}

${finding.claimText}

**Sources** (${finding.sourceCount}):
${finding.citations.map(c => `- [${c.title || c.domain || 'Source'}](${c.url})`).join("\n")}

**Confidence Score**: ${formatScoreBar(finding.confidenceScore)}
`;

  // Add caveats for MEDIUM confidence
  if (finding.confidenceLevel === "MEDIUM" && finding.caveats.length > 0) {
    output += `
> **Caveats:**
${finding.caveats.map(c => `> - ${c}`).join("\n")}
`;
  }

  // Add warnings for LOW confidence
  if (finding.confidenceLevel === "LOW" && finding.warnings.length > 0) {
    output += `
> **⚠️ Warnings:**
${finding.warnings.map(w => `> - ${w}`).join("\n")}
`;
  }

  output += "\n---\n\n";
  return output;
}

/**
 * Format findings grouped by confidence level
 */
export function formatFindingsWithConfidence(
  findings: FormattedFinding[],
  filter: ConfidenceFilter = "ALL"
): string {
  // Apply filter
  let filteredFindings = findings;
  switch (filter) {
    case "HIGH_ONLY":
      filteredFindings = findings.filter(f => f.confidenceLevel === "HIGH");
      break;
    case "HIGH_MEDIUM":
      filteredFindings = findings.filter(f =>
        f.confidenceLevel === "HIGH" || f.confidenceLevel === "MEDIUM"
      );
      break;
    case "ALL":
    default:
      // No filter
      break;
  }

  // Group by confidence level
  const highFindings = filteredFindings.filter(f => f.confidenceLevel === "HIGH");
  const mediumFindings = filteredFindings.filter(f => f.confidenceLevel === "MEDIUM");
  const lowFindings = filteredFindings.filter(f => f.confidenceLevel === "LOW");

  let output = "";
  let globalIndex = 0;

  // HIGH confidence section
  if (highFindings.length > 0) {
    output += `## 🟢 High Confidence Findings

These findings are supported by 3+ authoritative sources with strong corroboration.

`;
    for (const finding of highFindings) {
      output += formatFinding(finding, globalIndex++);
    }
  }

  // MEDIUM confidence section
  if (mediumFindings.length > 0 && filter !== "HIGH_ONLY") {
    output += `## 🟡 Medium Confidence Findings

These findings have supporting evidence but may benefit from additional verification.

`;
    for (const finding of mediumFindings) {
      output += formatFinding(finding, globalIndex++);
    }
  }

  // LOW confidence section
  if (lowFindings.length > 0 && filter === "ALL") {
    output += `## 🔴 Low Confidence Findings

⚠️ **Caution**: These findings have limited source support and should be independently verified before use.

`;
    for (const finding of lowFindings) {
      output += formatFinding(finding, globalIndex++);
    }
  }

  // Add filter note if applicable
  if (filter !== "ALL") {
    const hiddenCount = findings.length - filteredFindings.length;
    if (hiddenCount > 0) {
      output += `---

*Note: ${hiddenCount} lower-confidence finding(s) have been filtered out. Use filter "ALL" to see complete results.*
`;
    }
  }

  return output;
}

/**
 * Generate complete research report with confidence
 */
export function generateConfidenceReport(
  topic: string,
  stats: ConfidenceStats,
  findings: FormattedFinding[],
  filter: ConfidenceFilter = "ALL",
  narrativeSummary?: string
): string {
  let report = formatConfidenceSummary(stats, topic);

  // Add narrative summary if provided
  if (narrativeSummary) {
    report += `## Executive Summary

${narrativeSummary}

---

`;
  }

  // Add findings
  report += formatFindingsWithConfidence(findings, filter);

  // Add methodology note
  report += `
## Methodology

This report uses a 5-factor confidence scoring algorithm:

1. **Source Credibility** (25%): Quality and authority of information sources
2. **Evidence Quality** (25%): Directness of evidence (primary vs. anecdotal)
3. **Corroboration** (25%): Number of independent sources confirming claims
4. **Recency** (15%): How current the information is
5. **Expert Consensus** (10%): Agreement among domain experts

**Confidence Levels:**
- 🟢 **HIGH** (80-100): 3+ authoritative sources, strong corroboration
- 🟡 **MEDIUM** (50-79): Some support but room for verification
- 🔴 **LOW** (0-49): Limited support, exercise caution

---

*Generated with multi-source confidence analysis*
`;

  return report;
}

/**
 * Generate JSON output for programmatic consumption
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
      overallLevel: stats.averageConfidenceScore >= 75 ? "HIGH" :
                    stats.averageConfidenceScore >= 50 ? "MEDIUM" : "LOW",
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
    findings: findings.map(f => ({
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
