/**
 * Shop Report Formatter
 *
 * Formats shop session data into a Wirecutter-style markdown report.
 */

import {
  formatReportHeader,
  formatTable,
  todayISO,
} from "../lib/reportFormat";

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
  bestDealId?: string;
};

/**
 * Format cents to a dollar string, e.g. 27900 → "$279.00"
 */
function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Map trustTier number to human-readable label
 * 1 = Authorized, 2-3 = Verified, 4-5 = Unverified
 */
function trustLabel(trustTier?: number): string {
  if (trustTier === undefined) return "Unverified";
  if (trustTier === 1) return "Authorized";
  if (trustTier <= 3) return "Verified";
  return "Unverified";
}

/**
 * Truncate a string to a maximum length, appending "…" if truncated
 */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Format a single Top Pick card
 */
function formatPickCard(
  label: string,
  listing: ShopListing,
  star = false,
): string {
  const prefix = star ? "★ " : "";
  const price = formatPrice(listing.price);
  const condition = listing.condition ?? "New";
  const score = listing.dealScore ?? 0;
  const trust = trustLabel(listing.trustTier);
  const title = truncate(listing.title, 30);

  return `### ${prefix}${label}: ${title}
**${price}** | ${listing.retailer} | ${condition} | [Buy](${listing.url})
Score: ${score}/100 | Trust: ${trust}
`;
}

/**
 * Format shop session data into a Wirecutter-style markdown report.
 */
export function formatShopReport(
  session: ShopSession,
  listings: ShopListing[],
): string {
  if (listings.length === 0) {
    return formatReportHeader(
      `${session.query} — Shopping Report`,
      "No listings found.",
      { date: todayISO(), type: "shop", extra: { Query: `"${session.query}"` } },
    );
  }

  // Sort by dealScore descending to find Best Overall and Runner Up
  const byScore = [...listings].sort(
    (a, b) => (b.dealScore ?? 0) - (a.dealScore ?? 0),
  );
  const bestOverall = byScore[0];
  const runnerUp = byScore[1];

  // Budget Pick = lowest price that isn't the best overall
  const byPrice = [...listings].sort((a, b) => a.price - b.price);
  const budgetPick =
    byPrice[0] === bestOverall ? byPrice[1] : byPrice[0];

  const instantValue = `★ BEST VALUE: ${truncate(bestOverall.title, 30)} — ${formatPrice(bestOverall.price)} at ${bestOverall.retailer}`;

  const header = formatReportHeader(
    `${session.query} — Shopping Report`,
    instantValue,
    {
      date: todayISO(),
      type: "shop",
      extra: { Query: `"${session.query}"` },
    },
  );

  // Top Picks section
  const topPickLines: string[] = ["## Top Picks\n"];
  topPickLines.push(formatPickCard("Best Overall", bestOverall, true));
  if (runnerUp) {
    topPickLines.push(formatPickCard("Runner Up", runnerUp));
  }
  if (budgetPick && budgetPick !== bestOverall && budgetPick !== runnerUp) {
    topPickLines.push(formatPickCard("Budget Pick", budgetPick));
  }
  const topPicksSection = topPickLines.join("\n");

  // Quick Compare table (up to top 5 by score)
  const compareListings = byScore.slice(0, 5);
  const compareRows = compareListings.map((l, i) => {
    const star = i === 0 ? "★ " : "";
    return [
      star + truncate(l.title, 28),
      formatPrice(l.price),
      String(l.dealScore ?? 0),
      l.retailer,
      trustLabel(l.trustTier),
    ];
  });
  const compareTable = formatTable(
    ["Product", "Price", "Score", "Retailer", "Trust"],
    compareRows,
    30,
  );

  // All Listings table
  const allRows = listings.map((l, i) => [
    String(i + 1),
    truncate(l.title, 30),
    formatPrice(l.price),
    l.retailer,
    String(l.dealScore ?? 0),
    `[Buy](${l.url})`,
  ]);
  const allTable = formatTable(
    ["#", "Product", "Price", "Retailer", "Score", "Link"],
    allRows,
    30,
  );

  return [
    header,
    topPicksSection,
    `## Quick Compare\n\n${compareTable}\n`,
    `## All Listings (${listings.length} total)\n\n${allTable}\n`,
  ].join("\n");
}
