/**
 * Revenue Validation Report Formatter
 *
 * Formats revenue validation session data into a McKinsey SCR-style
 * markdown report with DVF scoring, market sizing, unit economics,
 * competitor table, and tiered evidence.
 */

import {
  formatReportHeader,
  formatTable,
  todayISO,
} from "../lib/reportFormat";
import type { Doc } from "../_generated/dataModel";

// ── Types ─────────────────────────────────────────────────────────────────────

type Session = Doc<"revenueValidationSessions">;
type Evidence = Doc<"revenueValidationEvidence">;
type Competitor = Doc<"revenueValidationCompetitors">;

type UnitEconomicsScenario = {
  ltv?: string;
  cac?: string;
  ltvCacRatio?: string;
  paybackMonths?: number;
};

type UnitEconomics = {
  base?: UnitEconomicsScenario;
  bull?: UnitEconomicsScenario;
  bear?: UnitEconomicsScenario;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceLabel(score: number | undefined): string {
  if (score === undefined) return "—";
  if (score >= 7) return "H";
  if (score >= 4) return "M";
  return "L";
}

function scoreLabel(score: number | undefined, max = 10): string {
  return score !== undefined ? `${score}/${max}` : "—";
}

/**
 * Pick the best evidence claim for a given dimension (lowest tier = highest quality).
 */
function topClaimForDimension(evidence: Evidence[], dimension: string): string {
  const filtered = evidence
    .filter((e) => e.dimension === dimension)
    .sort((a, b) => a.tier - b.tier);
  return filtered[0]?.claim ?? "—";
}

function formatDvfTable(session: Session, evidence: Evidence[]): string {
  const rows: string[][] = [
    [
      "Desirability",
      scoreLabel(session.desirabilityScore),
      confidenceLabel(session.desirabilityScore),
      topClaimForDimension(evidence, "desirability"),
    ],
    [
      "Viability",
      scoreLabel(session.viabilityScore),
      confidenceLabel(session.viabilityScore),
      topClaimForDimension(evidence, "viability"),
    ],
    [
      "Feasibility",
      scoreLabel(session.feasibilityScore),
      confidenceLabel(session.feasibilityScore),
      topClaimForDimension(evidence, "feasibility"),
    ],
  ];

  return formatTable(
    ["Dimension", "Score", "Confidence", "Key Evidence"],
    rows,
    40,
  );
}

function formatUnitEconomicsTable(unitEconomics: UnitEconomics | null): string {
  const base = unitEconomics?.base;
  const bull = unitEconomics?.bull;
  const bear = unitEconomics?.bear;

  const rows: string[][] = [
    ["LTV", base?.ltv ?? "—", bull?.ltv ?? "—", bear?.ltv ?? "—"],
    ["CAC", base?.cac ?? "—", bull?.cac ?? "—", bear?.cac ?? "—"],
    [
      "LTV/CAC",
      base?.ltvCacRatio !== undefined ? `${base.ltvCacRatio}x` : "—",
      bull?.ltvCacRatio !== undefined ? `${bull.ltvCacRatio}x` : "—",
      bear?.ltvCacRatio !== undefined ? `${bear.ltvCacRatio}x` : "—",
    ],
  ];

  return formatTable(["Metric", "Base", "Bull", "Bear"], rows, 20);
}

function formatCompetitorsTable(competitors: Competitor[]): string {
  if (competitors.length === 0) return "_No competitors recorded._";

  const rows = competitors.map((c) => [
    c.name,
    c.pricing ?? "—",
    c.differentiator ?? "—",
  ]);

  return formatTable(["Competitor", "Pricing", "Diff vs Us"], rows, 35);
}

function formatRisksSection(evidence: Evidence[]): string {
  const risks = evidence.filter(
    (e) =>
      e.tier >= 3 ||
      e.challengeStatus === "contested" ||
      e.challengeStatus === "refuted",
  );

  if (risks.length === 0) return "_No significant risks flagged._";

  return risks
    .map((e) => {
      const tier = `T${e.tier}`;
      const status = e.challengeStatus ? ` [${e.challengeStatus}]` : "";
      return `- **${tier}**${status}: ${e.claim}`;
    })
    .join("\n");
}

function formatEvidenceTable(evidence: Evidence[]): string {
  if (evidence.length === 0) return "_No evidence recorded._";

  const rows = evidence.map((e) => [
    e.claim,
    `T${e.tier}`,
    e.sourceTitle ?? e.sourceUrl ?? "—",
  ]);

  return formatTable(["Claim", "Tier", "Source"], rows, 40);
}

// ── Main formatter ────────────────────────────────────────────────────────────

/**
 * Format a revenue validation session into a McKinsey SCR-style markdown report.
 */
export function formatRevenueValidationReport(
  session: Session,
  evidence: Evidence[],
  competitors: Competitor[],
): string {
  const verdict = session.verdict ?? "PENDING";
  const total = session.totalScore !== undefined ? session.totalScore : "—";
  const instantValue = `Verdict: ${verdict} — DVF ${total}/30`;

  const header = formatReportHeader(
    `Revenue Validation: ${session.productName}`,
    instantValue,
    {
      date: todayISO(),
      type: "revenue-validation",
      agents: session.agentCount,
    },
  );

  const executiveSummary = session.executiveSummary
    ? `## Executive Summary\n${session.executiveSummary}\n`
    : "";

  const dvfSection = `## DVF Scoring\n\n${formatDvfTable(session, evidence)}\n`;

  const marketSection =
    `## Market Size\n` +
    `**TAM**: ${session.tam ?? "—"} | **SAM**: ${session.sam ?? "—"} | **SOM**: ${session.som ?? "—"}\n`;

  const unitEconomics = session.unitEconomics as UnitEconomics | null ?? null;
  const unitEconomicsSection = `## Unit Economics\n\n${formatUnitEconomicsTable(unitEconomics)}\n`;

  const competitorsSection = `## Competitors\n\n${formatCompetitorsTable(competitors)}\n`;

  const risksSection = `## Risks\n${formatRisksSection(evidence)}\n`;

  const evidenceSection = `## Evidence\n\n${formatEvidenceTable(evidence)}\n`;

  return [
    header,
    executiveSummary,
    dvfSection,
    marketSection,
    unitEconomicsSection,
    competitorsSection,
    risksSection,
    evidenceSection,
  ]
    .filter(Boolean)
    .join("\n");
}
