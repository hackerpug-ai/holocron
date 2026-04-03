/**
 * AI ROI Report Formatter
 *
 * Formats AI ROI session data into the skill-canonical markdown report format
 * defined in ~/.claude/skills/ai-roi/SKILL.md OUTPUT FORMAT section.
 */

import { todayISO } from "../lib/reportFormat";
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
 * Count evidence by tier bands for the header line.
 * T1-T2 = high quality, T3-T4 = moderate, T5 = excluded.
 */
function countEvidenceByTier(evidence: Doc<"aiRoiEvidence">[]): {
  highQuality: number;
  moderate: number;
  excluded: number;
} {
  return evidence.reduce(
    (acc, e) => {
      if (e.tier <= 2) acc.highQuality++;
      else if (e.tier <= 4) acc.moderate++;
      else acc.excluded++;
      return acc;
    },
    { highQuality: 0, moderate: 0, excluded: 0 }
  );
}

/**
 * Count opportunities by confidence level for the header line.
 */
function countOpportunitiesByConfidence(
  opportunities: Doc<"aiRoiOpportunities">[]
): { high: number; medium: number; low: number } {
  return opportunities.reduce(
    (acc, o) => {
      const conf = (o.confidence ?? "").toUpperCase();
      if (conf === "HIGH") acc.high++;
      else if (conf === "MEDIUM") acc.medium++;
      else acc.low++;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

/**
 * Format the evidence rows attached to a single opportunity as a numbered list.
 */
function formatOpportunityEvidence(
  oppEvidence: Doc<"aiRoiEvidence">[]
): string {
  const active = oppEvidence.filter((e) => e.tier < 5);
  if (active.length === 0) return "";

  const lines = active.map((e, i) => {
    const title = e.source ?? "Source";
    const url = e.sourceUrl ?? "";
    const tierLabel = `T${e.tier}`;
    const linked = url ? `[${title}](${url})` : title;
    return `${i + 1}. ${linked} (${tierLabel}): ${e.claim}`;
  });

  return "**ROI Evidence**\n" + lines.join("\n");
}

/**
 * Format a single opportunity section in the skill canonical format.
 */
function formatOpportunitySection(
  opp: Doc<"aiRoiOpportunities">,
  oppEvidence: Doc<"aiRoiEvidence">[],
  index: number,
  company: string
): string {
  const confidence = (opp.confidence ?? "MEDIUM").toUpperCase();
  const savingsRange = opp.savingsPerYear ?? "TBD";

  const lines: string[] = [
    `### ${index + 1}. ${opp.name} — ${confidence} confidence — Est. ${savingsRange}/year`,
    "",
  ];

  // The Manual Process Today
  if (opp.currentProcess) {
    lines.push("**The Manual Process Today**");
    lines.push(opp.currentProcess);
    lines.push("");
  }

  // What AI Replaces
  if (opp.proposedAutomation) {
    lines.push(`**What AI Replaces**: ${opp.proposedAutomation}`);
    lines.push("");
  }

  // ROI Evidence
  const evidenceBlock = formatOpportunityEvidence(oppEvidence);
  if (evidenceBlock) {
    lines.push(evidenceBlock);
    lines.push("");
  }

  // Calculation block
  const hasCalcData =
    opp.currentCostPerYear ||
    opp.automatedCostPerYear ||
    opp.savingsPerYear ||
    opp.currentTimePerWeek ||
    opp.automatedTimePerWeek;

  if (hasCalcData) {
    lines.push(`**${company} Calculation**`);

    if (opp.currentTimePerWeek && opp.automatedTimePerWeek) {
      lines.push(
        `${opp.currentTimePerWeek} → ${opp.automatedTimePerWeek} (time per week)`
      );
    }
    if (
      opp.currentCostPerYear &&
      opp.automatedCostPerYear &&
      opp.savingsPerYear
    ) {
      lines.push(
        `${opp.currentCostPerYear} current − ${opp.automatedCostPerYear} automated = ${opp.savingsPerYear}/year`
      );
    } else if (opp.currentCostPerYear && opp.savingsPerYear) {
      lines.push(
        `${opp.currentCostPerYear} × reduction = ${opp.savingsPerYear}/year`
      );
    } else if (opp.savingsPerYear) {
      lines.push(`Estimated savings: ${opp.savingsPerYear}/year`);
    }

    if (opp.errorRateBefore && opp.errorRateAfter) {
      lines.push(`Error rate: ${opp.errorRateBefore} → ${opp.errorRateAfter}`);
    }

    lines.push("");
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Build the Evidence Table section matching the skill format.
 * Excludes T5 evidence (excluded by skill rules).
 */
function formatEvidenceTable(evidence: Doc<"aiRoiEvidence">[]): string {
  const active = evidence.filter((e) => e.tier < 5);
  if (active.length === 0) return "";

  const rows = active
    .map((e, i) => {
      const title = e.source ?? "—";
      const tier = `T${e.tier}`;
      const claim =
        e.claim.length > 50 ? e.claim.slice(0, 49) + "…" : e.claim;
      const url = e.sourceUrl ?? "—";
      return `| ${i + 1} | ${title} | ${tier} | ${claim} | — | ${url} |`;
    })
    .join("\n");

  return (
    "## Evidence Table\n\n" +
    "| # | Source | Tier | Claim Supported | Date | URL |\n" +
    "|---|--------|------|-----------------|------|-----|\n" +
    rows +
    "\n"
  );
}

/**
 * Build the Adversarial Review Notes table from evidence challenge status.
 */
function formatAdversarialReview(evidence: Doc<"aiRoiEvidence">[]): string {
  const reviewed = evidence.filter((e) => e.challengeStatus);
  if (reviewed.length === 0) return "";

  const rows = reviewed
    .map((e) => {
      const claim =
        e.claim.length > 40 ? e.claim.slice(0, 39) + "…" : e.claim;
      const verdict =
        e.challengeStatus === "validated"
          ? "PASS"
          : e.challengeStatus === "contested"
            ? "DOWNGRADE"
            : (e.challengeStatus?.toUpperCase() ?? "—");
      const reason =
        e.challengeStatus === "contested"
          ? "Evidence contested"
          : "Evidence validated";
      return `| ${claim} | ${verdict} | ${reason} |`;
    })
    .join("\n");

  return (
    "## Adversarial Review Notes\n\n" +
    "| Claim | Verdict | Reason |\n" +
    "|-------|---------|--------|\n" +
    rows +
    "\n"
  );
}

/**
 * Build the Gaps & Open Questions section from T5/excluded evidence
 * and contested evidence rows.
 */
function formatGapsSection(evidence: Doc<"aiRoiEvidence">[]): string {
  const excluded = evidence.filter((e) => e.tier >= 5);
  const contested = evidence.filter(
    (e) => e.tier < 5 && e.challengeStatus === "contested"
  );

  if (excluded.length === 0 && contested.length === 0) return "";

  const lines: string[] = ["## Gaps & Open Questions", ""];

  for (const e of excluded) {
    lines.push(
      `- ${e.claim}: excluded (T${e.tier}) — needs higher-quality source to establish minimum evidence`
    );
  }

  for (const e of contested) {
    lines.push(
      `- ${e.claim}: contested — requires additional primary research to resolve`
    );
  }

  lines.push("");
  return lines.join("\n");
}

// ============================================================================
// Public Formatter
// ============================================================================

/**
 * Format an AI ROI analysis as a markdown report matching the skill
 * canonical output format defined in ~/.claude/skills/ai-roi/SKILL.md.
 *
 * Accepts session + opportunities (pre-sorted by rank) + evidence.
 */
export function formatAiRoiReport({
  session,
  opportunities,
  evidence,
}: AiRoiReportInput): string {
  const company = session.company;
  const date = todayISO();

  // Source: prefer linked document id, fall back to dash
  const source = session.documentId ? `document:${session.documentId}` : "—";

  // Evidence quality counts for header
  const { highQuality, moderate, excluded } = countEvidenceByTier(evidence);

  // Opportunity counts for header
  const { high, medium, low } = countOpportunitiesByConfidence(opportunities);
  const dropped = 0;

  // ── Header ────────────────────────────────────────────────────────────────
  const header = [
    `# AI-ROI Analysis: ${company}`,
    `**Date**: ${date}`,
    `**Source**: ${source}`,
    `**Evidence quality**: ${highQuality} T1-T2 | ${moderate} T3-T4 | ${excluded} T5 excluded`,
    `**Opportunities cleared**: ${high} HIGH · ${medium} MEDIUM · ${low} LOW · ${dropped} DROPPED`,
    "",
    "---",
    "",
  ].join("\n");

  // ── Business Overview ─────────────────────────────────────────────────────
  const businessOverview = session.executiveSummary
    ? `## Business Overview\n${session.executiveSummary}\n\n`
    : "";

  // ── AI Opportunities ──────────────────────────────────────────────────────
  const opportunitiesHeader = "## AI Opportunities\n\n";

  // Build a lookup: opportunityId → evidence rows
  const evidenceByOpp = new Map<string, Doc<"aiRoiEvidence">[]>();
  for (const e of evidence) {
    if (e.opportunityId) {
      const key = e.opportunityId;
      const existing = evidenceByOpp.get(key) ?? [];
      existing.push(e);
      evidenceByOpp.set(key, existing);
    }
  }

  const opportunitiesBody =
    opportunities.length > 0
      ? opportunities
          .map((opp, i) => {
            const oppEvidence = evidenceByOpp.get(opp._id) ?? [];
            return formatOpportunitySection(opp, oppEvidence, i, company);
          })
          .join("")
      : "No opportunities recorded yet.\n\n";

  // ── Evidence Table ────────────────────────────────────────────────────────
  const evidenceTable = formatEvidenceTable(evidence);

  // ── Adversarial Review ────────────────────────────────────────────────────
  const adversarialSection = formatAdversarialReview(evidence);

  // ── Gaps & Open Questions ─────────────────────────────────────────────────
  const gapsSection = formatGapsSection(evidence);

  return [
    header,
    businessOverview,
    opportunitiesHeader + opportunitiesBody,
    evidenceTable,
    adversarialSection,
    gapsSection,
  ]
    .filter(Boolean)
    .join("\n");
}
