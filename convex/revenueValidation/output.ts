/**
 * Revenue Validation Report Formatter
 *
 * Formats revenue validation session data into the revenue-validate skill
 * output format: ASCII box summary block followed by a full markdown report.
 *
 * Format reference: ~/.claude/skills/revenue-validate/SKILL.md §13 DISPLAY RESULTS
 */

import {
  formatTable,
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

// ── DVF Progress Bar Helpers ──────────────────────────────────────────────────

/**
 * Render a DVF 10-block progress bar using ▓ (filled) and ░ (empty).
 * Score is on a 0–10 scale.
 */
function dvfBar(score: number | undefined): string {
  if (score === undefined) return "░".repeat(10);
  const filled = Math.max(0, Math.min(10, Math.round(score)));
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

/**
 * Format a DVF score as "{score}/10" or "—   " (padded) when missing.
 */
function dvfScoreStr(score: number | undefined): string {
  return score !== undefined ? `${score}/10` : "—   ";
}

// ── Evidence Counting Helpers ─────────────────────────────────────────────────

function countByTier(evidence: Evidence[], tier: number): number {
  return evidence.filter((e) => e.tier === tier).length;
}

function countSurvived(evidence: Evidence[]): number {
  return evidence.filter((e) => e.challengeStatus === "validated").length;
}

function countContradicted(evidence: Evidence[]): number {
  return evidence.filter((e) => e.challengeStatus === "refuted").length;
}

// ── Competitor Helpers ────────────────────────────────────────────────────────

/**
 * Parse a pricing string like "$49/mo" → 49. Returns undefined if unparseable.
 */
function parsePriceFromStr(
  pricing: string | undefined | null,
): number | undefined {
  if (!pricing) return undefined;
  const match = pricing.match(/\$?([\d,]+)/);
  if (!match) return undefined;
  return parseFloat(match[1].replace(",", ""));
}

function medianPrice(competitors: Competitor[]): string {
  const prices = competitors
    .map((c) => parsePriceFromStr(c.pricing))
    .filter((p): p is number => p !== undefined)
    .sort((a, b) => a - b);
  if (prices.length === 0) return "—";
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
  return median.toFixed(0);
}

// ── Top Risk helper ───────────────────────────────────────────────────────────

/**
 * Find the most at-risk evidence item (refuted > contested > validated, then
 * higher tier first).
 */
function topRisk(evidence: Evidence[]): string {
  const sorted = [...evidence].sort((a, b) => {
    const statusRank = (e: Evidence) =>
      e.challengeStatus === "refuted"
        ? 2
        : e.challengeStatus === "contested"
          ? 1
          : 0;
    const rankDiff = statusRank(b) - statusRank(a);
    if (rankDiff !== 0) return rankDiff;
    return b.tier - a.tier;
  });
  return sorted[0]?.claim ?? "None identified";
}

// ── Summary Block ─────────────────────────────────────────────────────────────

const SEPARATOR = "═".repeat(59);

/**
 * Build the ASCII box summary block matching the skill's DISPLAY RESULTS format.
 */
function formatSummaryBlock(
  session: Session,
  evidence: Evidence[],
  competitors: Competitor[],
): string {
  const verdict = session.verdict ?? "PENDING";
  const governedScore = session.totalScore ?? 0;

  // Normalize composite score (0–30) to 0–100 for display
  const rawScore = Math.round(governedScore * (100 / 30));

  const d = session.desirabilityScore;
  const viab = session.viabilityScore;
  const f = session.feasibilityScore;

  // Evidence counts by tier
  const t1 = countByTier(evidence, 1);
  const t2 = countByTier(evidence, 2);
  const t3 = countByTier(evidence, 3);
  const t4 = countByTier(evidence, 4);
  const total = evidence.length;
  const survived = countSurvived(evidence);
  const contradicted = countContradicted(evidence);

  // Market sizing
  const tam = session.tam ?? "—";
  const sam = session.sam ?? "—";
  const som = session.som ?? "—";

  // Competitors
  const competitorCount = competitors.length;
  const medPriceStr = medianPrice(competitors);

  // Unit economics (base + bear scenarios)
  const unitEconomics = (session.unitEconomics as UnitEconomics | null) ?? null;
  const base = unitEconomics?.base;
  const ltvCac = base?.ltvCacRatio ?? "—";
  const payback =
    base?.paybackMonths !== undefined ? `${base.paybackMonths}` : "—";

  // Top risk and next step
  const topRiskText = topRisk(evidence);
  const nextStep = session.executiveSummary
    ? session.executiveSummary.split(/[.!]/)[0].trim()
    : "Complete validation analysis";

  // DVF box inner lines — fixed-width to fit the box borders
  const dvfBox = [
    "┌─────────────────────────────────────────────────────┐",
    `│  Desirability:  ${dvfScoreStr(d)}  ${dvfBar(d)}    │`,
    `│  Viability:     ${dvfScoreStr(viab)}  ${dvfBar(viab)}    │`,
    `│  Feasibility:   ${dvfScoreStr(f)}  ${dvfBar(f)}    │`,
    "└─────────────────────────────────────────────────────┘",
  ].join("\n");

  const lines = [
    SEPARATOR,
    "REVENUE VALIDATION COMPLETE",
    SEPARATOR,
    "",
    `Product:     ${session.productName}`,
    `Verdict:     ${verdict} (${rawScore}/100)`,
    "",
    `Evidence:    T1: ${t1} | T2: ${t2} | T3: ${t3} | T4: ${t4}`,
    `Challenged:  ${survived}/${total} survived | ${contradicted} contradicted`,
    "",
    dvfBox,
    "",
    `Market:        TAM ${tam} → SAM ${sam} → SOM ${som}`,
    `Competitors:   ${competitorCount} identified (median $${medPriceStr}/mo)`,
    `Unit Econ:     LTV:CAC ${ltvCac}:1 | Payback ${payback}mo`,
    `Top Risk:      ${topRiskText}`,
    `Next Step:     ${nextStep}`,
    "",
    SEPARATOR,
  ];

  return lines.join("\n");
}

// ── Detailed Report Helpers ───────────────────────────────────────────────────

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
      topClaimForDimension(evidence, "desirability"),
    ],
    [
      "Viability",
      scoreLabel(session.viabilityScore),
      topClaimForDimension(evidence, "viability"),
    ],
    [
      "Feasibility",
      scoreLabel(session.feasibilityScore),
      topClaimForDimension(evidence, "feasibility"),
    ],
  ];

  return formatTable(
    ["Dimension", "Score", "Key Evidence"],
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
 * Format a revenue validation session into the skill-defined output format.
 *
 * Returns the ASCII box summary block (matching the revenue-validate skill's
 * §13 DISPLAY RESULTS format) followed by a full markdown report.
 */
export function formatRevenueValidationReport(
  session: Session,
  evidence: Evidence[],
  competitors: Competitor[],
): string {
  // ── Part 1: ASCII summary block ──
  const summaryBlock = formatSummaryBlock(session, evidence, competitors);

  // ── Part 2: Full markdown report ──
  const header = `# Revenue Validation: ${session.productName}\n`;

  const executiveSummary = session.executiveSummary
    ? `## Executive Summary\n${session.executiveSummary}\n`
    : "";

  const dvfSection = `## DVF Scoring\n\n${formatDvfTable(session, evidence)}\n`;

  const marketSection =
    `## Market Size\n` +
    `**TAM**: ${session.tam ?? "—"} | **SAM**: ${session.sam ?? "—"} | **SOM**: ${session.som ?? "—"}\n`;

  const unitEconomics =
    (session.unitEconomics as UnitEconomics | null) ?? null;
  const unitEconomicsSection = `## Unit Economics\n\n${formatUnitEconomicsTable(unitEconomics)}\n`;

  const competitorsSection = `## Competitors\n\n${formatCompetitorsTable(competitors)}\n`;

  const risksSection = `## Risks\n${formatRisksSection(evidence)}\n`;

  const evidenceSection = `## Evidence\n\n${formatEvidenceTable(evidence)}\n`;

  const detailedReport = [
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

  return `${summaryBlock}\n\n${detailedReport}`;
}
