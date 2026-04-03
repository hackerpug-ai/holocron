/**
 * AI ROI Report Formatter
 *
 * Formats AI ROI session data into a business case markdown report.
 * Uses the shared report formatting utilities for consistent header/table layout.
 */

import {
  formatReportHeader,
  formatTable,
  todayISO,
  getConfidenceBadge,
} from "../lib/reportFormat";
import type { Doc } from "../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export type AiRoiReportInput = {
  session: Doc<"aiRoiSessions">;
  opportunities: Doc<"aiRoiOpportunities">[];
  evidence: Doc<"aiRoiEvidence">[];
};

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Format a single opportunity section with metrics table.
 */
function formatOpportunitySection(
  opp: Doc<"aiRoiOpportunities">,
  index: number
): string {
  const confidenceBadge = getConfidenceBadge(
    opp.confidence as "HIGH" | "MEDIUM" | "LOW"
  );

  const lines: string[] = [
    `### ${index + 1}. ${opp.name} — ${confidenceBadge}`,
  ];

  if (opp.currentProcess) {
    lines.push(`**Current**: ${opp.currentProcess}`);
  }
  if (opp.proposedAutomation) {
    lines.push(`**Proposed**: ${opp.proposedAutomation}`);
  }

  // Metrics table — only render if at least one metric is available
  const hasMetrics =
    opp.currentTimePerWeek ||
    opp.automatedTimePerWeek ||
    opp.currentCostPerYear ||
    opp.automatedCostPerYear ||
    opp.savingsPerYear ||
    opp.errorRateBefore ||
    opp.errorRateAfter;

  if (hasMetrics) {
    const rows: string[][] = [];

    if (
      opp.currentTimePerWeek ||
      opp.automatedTimePerWeek
    ) {
      const saved =
        opp.currentTimePerWeek && opp.automatedTimePerWeek
          ? `${opp.currentTimePerWeek} → ${opp.automatedTimePerWeek}`
          : "—";
      rows.push([
        "Time/week",
        opp.currentTimePerWeek ?? "—",
        opp.automatedTimePerWeek ?? "—",
        saved,
      ]);
    }

    if (opp.currentCostPerYear || opp.automatedCostPerYear || opp.savingsPerYear) {
      rows.push([
        "Cost/year",
        opp.currentCostPerYear ?? "—",
        opp.automatedCostPerYear ?? "—",
        opp.savingsPerYear ?? "—",
      ]);
    }

    if (opp.errorRateBefore || opp.errorRateAfter) {
      rows.push([
        "Error rate",
        opp.errorRateBefore ?? "—",
        opp.errorRateAfter ?? "—",
        "—",
      ]);
    }

    if (rows.length > 0) {
      lines.push(
        "\n" +
          formatTable(
            ["Metric", "Current", "Automated", "Savings"],
            rows,
            20
          )
      );
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Build the Implementation Roadmap section from opportunity phases.
 */
function formatRoadmap(opportunities: Doc<"aiRoiOpportunities">[]): string {
  const quickWins = opportunities
    .filter((o) => o.phase === "quick-win")
    .map((o) => o.name);
  const mediumTerm = opportunities
    .filter((o) => o.phase === "medium-term")
    .map((o) => o.name);
  const strategic = opportunities
    .filter((o) => o.phase === "strategic")
    .map((o) => o.name);

  const lines = ["## Implementation Roadmap"];

  lines.push(
    `1. **Quick Win** (0-3mo): ${quickWins.length > 0 ? quickWins.join(", ") : "None identified"}`
  );
  lines.push(
    `2. **Medium Term** (3-6mo): ${mediumTerm.length > 0 ? mediumTerm.join(", ") : "None identified"}`
  );
  lines.push(
    `3. **Strategic** (6-12mo): ${strategic.length > 0 ? strategic.join(", ") : "None identified"}`
  );

  return lines.join("\n") + "\n";
}

/**
 * Build the Evidence Summary table.
 */
function formatEvidenceSummary(
  evidence: Doc<"aiRoiEvidence">[]
): string {
  if (evidence.length === 0) return "";

  const rows = evidence.map((e) => [
    e.claim,
    `T${e.tier}`,
    e.source ?? "—",
    e.challengeStatus ?? "—",
  ]);

  return (
    "## Evidence Summary\n\n" +
    formatTable(["Claim", "Tier", "Source", "Status"], rows, 30) +
    "\n"
  );
}

// ============================================================================
// Public Formatter
// ============================================================================

/**
 * Format an AI ROI analysis as a business-case markdown report.
 *
 * Accepts session + opportunities (pre-sorted by rank) + evidence.
 */
export function formatAiRoiReport({
  session,
  opportunities,
  evidence,
}: AiRoiReportInput): string {
  const topName = session.topOpportunityName ?? "N/A";
  const topSavings = session.topOpportunitySavings ?? "TBD";
  const sourceCount = session.sourceCount ?? 0;

  const instantValue = `Top Opportunity: ${topName} — Est. ${topSavings}/yr savings`;

  const header = formatReportHeader(
    `AI ROI Analysis: ${session.company}`,
    instantValue,
    {
      date: todayISO(),
      type: "ai-roi",
      sources: sourceCount,
    }
  );

  // Executive summary
  const execSummary = session.executiveSummary
    ? `## Executive Summary\n${session.executiveSummary}\n`
    : "";

  // Opportunities section
  const opportunitiesSection =
    opportunities.length > 0
      ? "## Opportunities (Ranked by Confidence)\n\n" +
        opportunities.map((o, i) => formatOpportunitySection(o, i)).join("\n")
      : "## Opportunities\n\nNo opportunities recorded yet.\n";

  // Roadmap
  const roadmap = formatRoadmap(opportunities);

  // Evidence
  const evidenceSection = formatEvidenceSummary(evidence);

  return [
    header,
    execSummary,
    opportunitiesSection,
    roadmap,
    evidenceSection,
  ]
    .filter(Boolean)
    .join("\n");
}
