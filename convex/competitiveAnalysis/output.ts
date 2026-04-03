/**
 * Competitive Analysis Report Formatter
 *
 * Formats session + competitors + features into a Porter's Five Forces
 * and feature matrix markdown report.
 */

import {
  formatReportHeader,
  formatTable,
  todayISO,
} from "../lib/reportFormat";
import type { Doc } from "../_generated/dataModel";

export type CompetitiveAnalysisSession = Doc<"competitiveAnalysisSessions">;
export type CompetitiveAnalysisCompetitor =
  Doc<"competitiveAnalysisCompetitors">;
export type CompetitiveAnalysisFeature = Doc<"competitiveAnalysisFeatures">;

/**
 * Map "yes" | "partial" | "no" to display symbol
 */
function supportSymbol(support: string): string {
  switch (support) {
    case "yes":
      return "✓";
    case "partial":
      return "~";
    case "no":
      return "✗";
    default:
      return "?";
  }
}

/**
 * Format a single competitor profile section
 */
function formatCompetitorProfile(
  competitor: CompetitiveAnalysisCompetitor
): string {
  const lines: string[] = [];

  lines.push(`### ${competitor.name}`);

  const metaParts: string[] = [];
  if (competitor.focus) metaParts.push(`**Focus**: ${competitor.focus}`);
  if (competitor.funding) metaParts.push(`**Funding**: ${competitor.funding}`);
  if (competitor.founded) metaParts.push(`**Founded**: ${competitor.founded}`);
  if (competitor.url) metaParts.push(`**URL**: ${competitor.url}`);
  if (metaParts.length > 0) lines.push(metaParts.join(" | "));

  if (competitor.strengths && competitor.strengths.length > 0) {
    lines.push(
      `**Strengths**: ${competitor.strengths.map((s) => `- ${s}`).join("\n")}`
    );
  }

  if (competitor.weaknesses && competitor.weaknesses.length > 0) {
    lines.push(
      `**Weaknesses**: ${competitor.weaknesses.map((w) => `- ${w}`).join("\n")}`
    );
  }

  return lines.join("\n");
}

/**
 * Format the feature comparison matrix as a markdown table
 */
function formatFeatureMatrix(
  features: CompetitiveAnalysisFeature[],
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  if (features.length === 0) return "_No feature data available._";

  const competitorNames = competitors.map((c) => c.name);
  const headers = ["Feature", "Us", ...competitorNames];

  const rows = features.map((f) => {
    const competitorCells = competitorNames.map((name) => {
      const support =
        typeof f.competitorSupport === "object" &&
        f.competitorSupport !== null &&
        name in f.competitorSupport
          ? String((f.competitorSupport as Record<string, string>)[name])
          : "?";
      return supportSymbol(support);
    });
    return [f.featureName, supportSymbol(f.ourSupport), ...competitorCells];
  });

  return formatTable(headers, rows, 30);
}

/**
 * Format the Porter's Five Forces section
 */
function formatPortersFiveForces(session: CompetitiveAnalysisSession): string {
  const forces: Array<[string, string | undefined]> = [
    ["Rivalry", session.porterRivalry],
    ["New Entrants", session.porterNewEntrants],
    ["Substitutes", session.porterSubstitutes],
    ["Buyer Power", session.porterBuyerPower],
    ["Supplier Power", session.porterSupplierPower],
  ];

  const lines = forces.map(([label, rating]) => {
    const ratingStr = rating ?? "_not rated_";
    return `- **${label}**: ${ratingStr}`;
  });

  return lines.join("\n");
}

/**
 * Derive strategic implications from feature gaps and Porter ratings
 */
function deriveStrategicImplications(
  session: CompetitiveAnalysisSession,
  features: CompetitiveAnalysisFeature[],
  _competitors: CompetitiveAnalysisCompetitor[]
): string {
  const implications: string[] = [];

  // Feature gaps: features where we have "no" or "partial" but a competitor has "yes"
  const gaps = features.filter((f) => {
    if (f.ourSupport === "yes") return false;
    if (
      typeof f.competitorSupport !== "object" ||
      f.competitorSupport === null
    ) {
      return false;
    }
    const vals = Object.values(f.competitorSupport as Record<string, string>);
    return vals.some((v) => v === "yes");
  });

  if (gaps.length > 0) {
    const gapNames = gaps.map((f) => f.featureName).join(", ");
    implications.push(
      `- Address feature gaps where competitors lead: **${gapNames}**`
    );
  }

  // High rivalry suggests need for differentiation
  if (session.porterRivalry === "HIGH") {
    implications.push(
      "- High competitive rivalry signals a need for clear differentiation strategy"
    );
  }

  // High buyer power suggests price sensitivity
  if (session.porterBuyerPower === "HIGH") {
    implications.push(
      "- High buyer power indicates pricing pressure — focus on value-add and switching costs"
    );
  }

  // Low barriers to entry
  if (session.porterNewEntrants === "HIGH") {
    implications.push(
      "- High threat of new entrants: build moats through network effects or proprietary data"
    );
  }

  // Differentiation opportunities
  const ourLeads = features.filter((f) => {
    if (f.ourSupport !== "yes") return false;
    if (
      typeof f.competitorSupport !== "object" ||
      f.competitorSupport === null
    ) {
      return true;
    }
    const vals = Object.values(f.competitorSupport as Record<string, string>);
    return vals.every((v) => v !== "yes");
  });

  if (ourLeads.length > 0) {
    const leadNames = ourLeads.map((f) => f.featureName).join(", ");
    implications.push(
      `- Leverage unique capabilities as marketing differentiation: **${leadNames}**`
    );
  }

  if (implications.length === 0) {
    implications.push(
      "- Insufficient data to derive specific strategic implications"
    );
  }

  return implications.join("\n");
}

/**
 * Format a complete competitive analysis report in markdown.
 *
 * Accepts session + competitors + features and returns a structured
 * Porter's Five Forces + feature matrix report.
 */
export function formatCompetitiveAnalysisReport(
  session: CompetitiveAnalysisSession,
  competitors: CompetitiveAnalysisCompetitor[],
  features: CompetitiveAnalysisFeature[]
): string {
  const title = `Competitive Analysis: ${session.market}`;
  const instantValue = session.marketVerdict ?? "Market analysis in progress.";

  const header = formatReportHeader(title, instantValue, {
    date: todayISO(),
    type: "competitive-analysis",
    sources: session.sourceCount,
  });

  // Market Landscape
  const marketSection = `## Market Landscape\n\n${session.marketVerdict ?? "_Verdict pending._"}\n`;

  // Competitor Profiles
  const competitorSection =
    competitors.length > 0
      ? `## Competitor Profiles\n\n${competitors.map(formatCompetitorProfile).join("\n\n")}\n`
      : "## Competitor Profiles\n\n_No competitor data available._\n";

  // Feature Comparison
  const featureMatrix = formatFeatureMatrix(features, competitors);
  const featureSection = `## Feature Comparison\n\n${featureMatrix}\n\n_Legend: ✓ = yes, ~ = partial, ✗ = no_\n`;

  // Porter's Five Forces
  const porterSection = `## Porter's Five Forces\n\n${formatPortersFiveForces(session)}\n`;

  // Strategic Implications
  const strategicSection = `## Strategic Implications\n\n${deriveStrategicImplications(session, features, competitors)}\n`;

  return [
    header,
    marketSection,
    competitorSection,
    featureSection,
    porterSection,
    strategicSection,
  ].join("\n");
}
