/**
 * Competitive Analysis Report Formatter
 *
 * Formats session + competitors + features into a structured market validation
 * report matching the business-competitive-research skill output format.
 *
 * Sections (in order):
 *   Market Snapshot → Job to Be Done → Competitive Map → Key Competitors →
 *   Substitutes & Alternatives → Customer Segments → Industry Forces (Porter) →
 *   White Space & Opportunities → Next Steps
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
 * Format the Market Snapshot section.
 * Uses marketVerdict as the summary and adds basic market stats.
 */
function formatMarketSnapshot(
  session: CompetitiveAnalysisSession,
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  const verdict = session.marketVerdict ?? "_Market analysis in progress._";
  const lines = [
    `## Market Snapshot`,
    "",
    verdict,
    "",
  ];

  if (competitors.length > 0) {
    lines.push(`**Competitors Identified**: ${competitors.length}`);
  }
  if (session.sourceCount) {
    lines.push(`**Sources Reviewed**: ${session.sourceCount}`);
  }

  return lines.join("\n");
}

/**
 * Format the Job to Be Done section.
 * Derives the customer job from the market name and competitor focus areas.
 */
function formatJobToBeDone(
  session: CompetitiveAnalysisSession,
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  const lines = [`## Job to Be Done`, ""];

  lines.push(`**Market**: ${session.market}`);
  lines.push("");

  // Derive common focus areas from competitors
  const focusAreas = competitors
    .map((c) => c.focus)
    .filter((f): f is string => Boolean(f));

  if (focusAreas.length > 0) {
    const unique = [...new Set(focusAreas)];
    lines.push(`**Common Problem Areas**: ${unique.join(", ")}`);
  } else {
    lines.push(
      `_Customers in the **${session.market}** space are hiring solutions to solve core workflow challenges._`
    );
  }

  return lines.join("\n");
}

/**
 * Format the Competitive Map section as a positioning table.
 */
function formatCompetitiveMap(
  competitors: CompetitiveAnalysisCompetitor[],
  features: CompetitiveAnalysisFeature[]
): string {
  if (competitors.length === 0) {
    return `## Competitive Map\n\n_No competitor data available._`;
  }

  const lines = [`## Competitive Map`, ""];

  const headers = ["Competitor", "Focus", "Founded", "Funding"];
  const rows = competitors.map((c) => [
    c.name,
    c.focus ?? "—",
    c.founded ?? "—",
    c.funding ?? "—",
  ]);

  lines.push(formatTable(headers, rows, 25));

  // Feature matrix as a sub-section
  if (features.length > 0) {
    lines.push("");
    lines.push("**Feature Coverage**");
    lines.push("");
    const competitorNames = competitors.map((c) => c.name);
    const fHeaders = ["Feature", "Us", ...competitorNames];
    const fRows = features.map((f) => {
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
    lines.push(formatTable(fHeaders, fRows, 25));
    lines.push("");
    lines.push("_Legend: ✓ = yes, ~ = partial, ✗ = no_");
  }

  return lines.join("\n");
}

/**
 * Format the Key Competitors section with full profiles.
 */
function formatKeyCompetitors(
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  if (competitors.length === 0) {
    return `## Key Competitors\n\n_No competitor data available._`;
  }

  const lines = [`## Key Competitors`, ""];

  for (const competitor of competitors) {
    lines.push(`### ${competitor.name}`);

    const metaParts: string[] = [];
    if (competitor.focus) metaParts.push(`**Focus**: ${competitor.focus}`);
    if (competitor.funding) metaParts.push(`**Funding**: ${competitor.funding}`);
    if (competitor.founded) metaParts.push(`**Founded**: ${competitor.founded}`);
    if (competitor.url) metaParts.push(`**URL**: ${competitor.url}`);
    if (metaParts.length > 0) lines.push(metaParts.join(" | "));

    if (competitor.strengths && competitor.strengths.length > 0) {
      lines.push(`**Strengths**:`);
      competitor.strengths.forEach((s) => lines.push(`- ${s}`));
    }

    if (competitor.weaknesses && competitor.weaknesses.length > 0) {
      lines.push(`**Weaknesses**:`);
      competitor.weaknesses.forEach((w) => lines.push(`- ${w}`));
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format the Substitutes & Alternatives section.
 * Derives substitutes from competitor weaknesses and the Porter substitutes force.
 */
function formatSubstitutes(
  session: CompetitiveAnalysisSession,
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  const lines = [`## Substitutes & Alternatives`, ""];

  if (session.porterSubstitutes) {
    lines.push(`**Substitute Threat**: ${session.porterSubstitutes}`);
    lines.push("");
  }

  if (competitors.length > 0) {
    lines.push("Customers may also consider these alternatives:");
    competitors.forEach((c) => {
      const focus = c.focus ? ` (${c.focus})` : "";
      lines.push(`- **${c.name}**${focus}`);
    });
  } else {
    lines.push("_No substitute data available._");
  }

  return lines.join("\n");
}

/**
 * Format the Customer Segments section.
 * Derived from competitor focus areas and feature coverage patterns.
 */
function formatCustomerSegments(
  session: CompetitiveAnalysisSession,
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  const lines = [`## Customer Segments`, ""];

  const focusAreas = competitors
    .map((c) => c.focus)
    .filter((f): f is string => Boolean(f));
  const unique = [...new Set(focusAreas)];

  if (unique.length > 0) {
    lines.push(`Key segments identified for **${session.market}**:`);
    unique.forEach((focus) => {
      lines.push(`- ${focus}`);
    });
  } else {
    lines.push(
      `_Customer segment analysis for **${session.market}** — review competitor focus areas for segment breakdown._`
    );
  }

  return lines.join("\n");
}

/**
 * Format the Industry Forces (Porter's Five Forces) section.
 */
function formatIndustryForces(session: CompetitiveAnalysisSession): string {
  const forces: Array<[string, string | undefined, string]> = [
    ["Competitive Rivalry", session.porterRivalry, "Internal competition intensity"],
    ["Threat of New Entrants", session.porterNewEntrants, "Barriers to entry"],
    ["Threat of Substitutes", session.porterSubstitutes, "Alternative solutions"],
    ["Buyer Power", session.porterBuyerPower, "Customer negotiating leverage"],
    ["Supplier Power", session.porterSupplierPower, "Vendor/partner leverage"],
  ];

  const lines = [`## Industry Forces (Porter)`, ""];

  forces.forEach(([label, rating, description]) => {
    const ratingStr = rating ?? "_not rated_";
    lines.push(`- **${label}**: ${ratingStr} — ${description}`);
  });

  return lines.join("\n");
}

/**
 * Format the White Space & Opportunities section.
 * Identifies gaps where no competitor leads, or where we uniquely lead.
 */
function formatWhiteSpace(
  session: CompetitiveAnalysisSession,
  features: CompetitiveAnalysisFeature[],
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  const lines = [`## White Space & Opportunities`, ""];

  // Features where we lead and no competitor matches
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
    lines.push("**Unique Differentiators** (we lead, competitors do not):");
    ourLeads.forEach((f) => lines.push(`- ${f.featureName}`));
    lines.push("");
  }

  // Features where no one (including us) has full support
  const gaps = features.filter((f) => {
    if (f.ourSupport === "yes") return false;
    if (
      typeof f.competitorSupport !== "object" ||
      f.competitorSupport === null
    ) {
      return true;
    }
    const vals = Object.values(f.competitorSupport as Record<string, string>);
    return vals.every((v) => v !== "yes");
  });

  if (gaps.length > 0) {
    lines.push("**Unmet Needs** (no market leader exists):");
    gaps.forEach((f) => lines.push(`- ${f.featureName}`));
    lines.push("");
  }

  // Porter-based opportunities
  if (session.porterNewEntrants === "HIGH") {
    lines.push(
      "- Low barriers to entry — first-mover advantages are short-lived; focus on network effects or proprietary data moats"
    );
  }
  if (session.porterBuyerPower === "HIGH") {
    lines.push(
      "- High buyer power — opportunity to capture market with superior value-to-price ratio"
    );
  }
  if (session.porterRivalry === "LOW") {
    lines.push(
      "- Low rivalry — market is underdeveloped; opportunity to establish category leadership"
    );
  }

  if (
    ourLeads.length === 0 &&
    gaps.length === 0 &&
    !session.porterNewEntrants &&
    !session.porterBuyerPower &&
    !session.porterRivalry
  ) {
    lines.push(
      `_Insufficient data to identify white space for **${session.market}**. Add feature and Porter data to reveal opportunities._`
    );
  }

  // Competitor weakness-based opportunities
  const competitorWeaknesses = competitors.flatMap((c) =>
    (c.weaknesses ?? []).map((w) => ({ competitor: c.name, weakness: w }))
  );
  if (competitorWeaknesses.length > 0) {
    lines.push("**Competitor Weakness Opportunities**:");
    competitorWeaknesses.forEach(({ competitor, weakness }) => {
      lines.push(`- ${competitor}: ${weakness}`);
    });
  }

  return lines.join("\n");
}

/**
 * Format the Next Steps section.
 * Generates actionable recommendations from the analysis.
 */
function formatNextSteps(
  session: CompetitiveAnalysisSession,
  features: CompetitiveAnalysisFeature[],
  competitors: CompetitiveAnalysisCompetitor[]
): string {
  const steps: string[] = [];

  // Feature gaps: features where we have "no" or "partial" but a competitor has "yes"
  const featureGaps = features.filter((f) => {
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

  if (featureGaps.length > 0) {
    const gapNames = featureGaps.map((f) => f.featureName).join(", ");
    steps.push(`Close feature gaps where competitors lead: **${gapNames}**`);
  }

  if (session.porterRivalry === "HIGH") {
    steps.push(
      "Define clear differentiation strategy — high rivalry demands a compelling positioning story"
    );
  }

  if (session.porterBuyerPower === "HIGH") {
    steps.push(
      "Build switching costs and value-add features to counter high buyer power"
    );
  }

  if (session.porterNewEntrants === "HIGH") {
    steps.push(
      "Invest in moats: network effects, proprietary data, or exclusive partnerships"
    );
  }

  // Unique strengths to market
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
    steps.push(
      `Amplify unique capabilities in go-to-market messaging: **${leadNames}**`
    );
  }

  if (competitors.length > 0) {
    steps.push(
      `Conduct customer interviews across ${competitors.length} competitor user bases to validate JTBD hypotheses`
    );
  }

  if (steps.length === 0) {
    steps.push(
      `Complete Porter's Five Forces assessment and feature matrix for **${session.market}** to generate actionable next steps`
    );
  }

  const lines = [`## Next Steps`, ""];
  steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));

  return lines.join("\n");
}

/**
 * Format a complete competitive analysis report in markdown.
 *
 * Produces sections in skill-spec order:
 *   Market Snapshot → Job to Be Done → Competitive Map → Key Competitors →
 *   Substitutes & Alternatives → Customer Segments → Industry Forces (Porter) →
 *   White Space & Opportunities → Next Steps
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

  const sections = [
    header,
    formatMarketSnapshot(session, competitors),
    "",
    formatJobToBeDone(session, competitors),
    "",
    formatCompetitiveMap(competitors, features),
    "",
    formatKeyCompetitors(competitors),
    "",
    formatSubstitutes(session, competitors),
    "",
    formatCustomerSegments(session, competitors),
    "",
    formatIndustryForces(session),
    "",
    formatWhiteSpace(session, features, competitors),
    "",
    formatNextSteps(session, features, competitors),
  ];

  return sections.join("\n");
}
