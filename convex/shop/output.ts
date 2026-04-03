/**
 * Shop Report Formatter
 *
 * Formats shop session data into skill-spec markdown:
 * Header → Comparison Tables (New / Used) → Recommendations → Notes → Trust Legend
 *
 * Reference: ~/.claude/skills/shop/SKILL.md § OUTPUT FORMAT
 */

import { formatTable, todayISO } from "../lib/reportFormat";

export type ShopListing = {
  title: string;
  price: number; // in cents
  originalPrice?: number;
  retailer: string;
  seller?: string;
  url: string;
  condition?: string;
  dealScore?: number;
  trustTier?: number;
  isVerifiedSeller?: boolean;
};

export type ShopSession = {
  query: string;
  budget?: number; // in cents — undefined means no limit
  condition?: string; // "new" | "used" | "any" — defaults to "any"
  sessionId?: string;
  bestDealId?: string;
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Format cents to a dollar string, e.g. 27900 → "$279.00" */
function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Map trustTier number to human-readable label matching Trust Legend */
function trustLabel(trustTier?: number): string {
  if (trustTier === undefined) return "Unverified";
  if (trustTier === 1) return "Authorized";
  if (trustTier === 2 || trustTier === 3) return "Verified Seller";
  return "Unverified";
}

/** Truncate a string to a maximum length, appending "…" if needed */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

/** True when condition string indicates a new product */
function isNew(condition?: string): boolean {
  if (!condition) return true; // default assumption
  return condition.toLowerCase() === "new";
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildHeader(session: ShopSession, date: string): string {
  const budget = session.budget ? formatPrice(session.budget) : "No limit";
  const condition = session.condition ?? "any";
  const sid = session.sessionId ?? "\u2014";

  return (
    `# Shop Results: ${session.query}\n\n` +
    `**Search Date**: ${date}\n` +
    `**Budget**: ${budget}\n` +
    `**Condition**: ${condition}\n` +
    `**Session**: ${sid}\n\n`
  );
}

function buildComparisonTable(
  label: string,
  listings: ShopListing[],
  includeConditionCol: boolean,
): string {
  if (listings.length === 0) return "";

  const rows = listings.map((l) => {
    const base = [truncate(l.title, 30), formatPrice(l.price), l.retailer];
    if (includeConditionCol) {
      base.push(l.condition ?? "Used");
    }
    // Use a large maxColWidth so formatTable does not truncate URLs.
    // Arrow display text is short; the full markdown link must be preserved.
    base.push(trustLabel(l.trustTier), `${l.dealScore ?? 0}/100`, `[\u2192](${l.url})`);
    return base;
  });

  const headers = includeConditionCol
    ? ["Product", "Price", "Retailer", "Condition", "Trust", "Deal Score", "Link"]
    : ["Product", "Price", "Retailer", "Trust", "Deal Score", "Link"];

  const table = formatTable(headers, rows, 200);
  return `### ${label}\n${table}\n`;
}

function buildRecommendations(
  newListings: ShopListing[],
  usedListings: ShopListing[],
  allByScore: ShopListing[],
): string {
  const lines: string[] = ["## Recommendations\n"];

  // Best Deal — highest deal score overall
  const bestDeal = allByScore[0];
  if (bestDeal) {
    lines.push(
      `**Best Deal**: [${truncate(bestDeal.title, 40)}](${bestDeal.url}) @ ${formatPrice(bestDeal.price)} from ${bestDeal.retailer} (Score: ${bestDeal.dealScore ?? 0})`,
    );
  }

  // Budget Pick — lowest price overall (excluding best deal to avoid repeat)
  const allByPrice = [...allByScore].sort((a, b) => a.price - b.price);
  const budgetPick = allByPrice.find((l) => l !== bestDeal) ?? allByPrice[0];
  if (budgetPick && budgetPick !== bestDeal) {
    lines.push(
      `**Budget Pick**: [${truncate(budgetPick.title, 40)}](${budgetPick.url}) @ ${formatPrice(budgetPick.price)} from ${budgetPick.retailer}`,
    );
  }

  // Best New — highest score among new listings (already sorted by score)
  const bestNew = newListings[0];
  if (bestNew) {
    lines.push(
      `**Best New**: [${truncate(bestNew.title, 40)}](${bestNew.url}) @ ${formatPrice(bestNew.price)} from ${bestNew.retailer}`,
    );
  }

  // Best Used — highest score among used listings (already sorted by score)
  const bestUsed = usedListings[0];
  if (bestUsed) {
    lines.push(
      `**Best Used**: [${truncate(bestUsed.title, 40)}](${bestUsed.url}) @ ${formatPrice(bestUsed.price)} from ${bestUsed.retailer}`,
    );
  }

  return lines.join("\n") + "\n";
}

const NOTES_SECTION =
  "## Notes\n" +
  "- Prices and availability may change \u2014 verify before purchasing.\n" +
  "- Trust tier reflects seller verification status, not product quality.\n" +
  "- Deal Score combines price competitiveness, seller trust, and availability signals.\n";

const TRUST_LEGEND =
  "**Trust Legend:**\n" +
  "- **Authorized**: Tier 1 retailer (direct manufacturer, authorized dealer)\n" +
  "- **Verified Seller**: Tier 2 marketplace seller with validated feedback (60+ score)\n" +
  "- **Unverified**: Tier 2/3 seller without sufficient validation signals\n\n" +
  "---\n" +
  "*Generated by /shop via holocron MCP - results not saved (ephemeral)*";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format shop session data into the skill-spec markdown report.
 *
 * Sections: Header → Comparison Table (New) → Comparison Table (Used) →
 *           Recommendations → Notes → Trust Legend
 */
export function formatShopReport(
  session: ShopSession,
  listings: ShopListing[],
): string {
  const date = todayISO();

  if (listings.length === 0) {
    return (
      buildHeader(session, date) +
      "_No listings found for this search. Try expanding the query or adjusting filters._\n"
    );
  }

  // Partition by condition
  const newListings = listings
    .filter((l) => isNew(l.condition))
    .sort((a, b) => (b.dealScore ?? 0) - (a.dealScore ?? 0));

  const usedListings = listings
    .filter((l) => !isNew(l.condition))
    .sort((a, b) => (b.dealScore ?? 0) - (a.dealScore ?? 0));

  const allByScore = [...listings].sort(
    (a, b) => (b.dealScore ?? 0) - (a.dealScore ?? 0),
  );

  const header = buildHeader(session, date);

  const comparisonSection =
    "## Comparison Table\n\n" +
    buildComparisonTable("New Products", newListings, false) +
    (usedListings.length > 0 ? "\n" : "") +
    buildComparisonTable("Used/Refurbished", usedListings, true);

  const recommendations = buildRecommendations(newListings, usedListings, allByScore);

  return [header, comparisonSection, recommendations, NOTES_SECTION, TRUST_LEGEND].join(
    "\n",
  );
}
