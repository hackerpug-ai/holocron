/**
 * Flights Report Formatter
 *
 * Formats flight session data into a Google Flights-style markdown report
 * with a date grid price calendar and top route options table.
 */

import { formatReportHeader, todayISO } from "../lib/reportFormat";

// ============================================================================
// Types
// ============================================================================

export type FlightsSession = {
  origin: string;
  destination: string;
  dateRange?: string;
  status: string;
  bestDealPrice?: number; // In cents
  bestDealAirline?: string;
  bestDealDates?: string;
  season?: string;
  cheapestDay?: string;
  shoulderSeason?: string;
  bookBy?: string;
};

export type FlightsRoute = {
  airline: string;
  departDate: string;
  returnDate?: string;
  price: number; // In cents
  stops: number;
  duration?: string;
  isBestDeal: boolean;
  bookingUrl?: string;
};

export type FlightsPriceCalendarEntry = {
  date: string;
  dayOfWeek: string;
  weekNumber: number;
  price: number; // In cents
  isCheapest: boolean;
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format cents to a dollar string rounded to nearest dollar, e.g. 24900 -> "$249"
 */
function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

/**
 * Format stops count to human-readable label
 */
function formatStops(stops: number): string {
  if (stops === 0) return "Nonstop";
  if (stops === 1) return "1 stop";
  return `${stops} stops`;
}

/**
 * Build a price grid grouped by weekNumber, with days-of-week as columns.
 * Days order: Mon, Tue, Wed, Thu, Fri, Sat, Sun
 */
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type WeekRow = {
  weekNumber: number;
  days: Map<string, FlightsPriceCalendarEntry>;
};

function buildWeekRows(
  priceCalendar: FlightsPriceCalendarEntry[]
): WeekRow[] {
  const weekMap = new Map<number, WeekRow>();

  for (const entry of priceCalendar) {
    if (!weekMap.has(entry.weekNumber)) {
      weekMap.set(entry.weekNumber, {
        weekNumber: entry.weekNumber,
        days: new Map(),
      });
    }
    weekMap.get(entry.weekNumber)!.days.set(entry.dayOfWeek, entry);
  }

  return Array.from(weekMap.values()).sort(
    (a, b) => a.weekNumber - b.weekNumber
  );
}

/**
 * Format the price calendar grid section
 */
function formatPriceCalendar(
  priceCalendar: FlightsPriceCalendarEntry[],
  month?: string
): string {
  if (priceCalendar.length === 0) return "";

  const weekRows = buildWeekRows(priceCalendar);

  // Determine min price for cheapest marker
  const minPrice = Math.min(...priceCalendar.map((e) => e.price));

  // Header
  const monthLabel = month ?? "";
  const headerTitle = monthLabel
    ? `## Price Calendar (${monthLabel})\n`
    : `## Price Calendar\n`;

  const colHeader = `|      | Mon  | Tue  | Wed  | Thu  | Fri  | Sat  | Sun  |`;
  const separator = `|------|------|------|------|------|------|------|------|`;

  const dataRows = weekRows.map((week) => {
    const weekLabel = `Wk ${week.weekNumber}`;
    const cells = DAY_ORDER.map((day) => {
      const entry = week.days.get(day);
      if (!entry) return "     ";
      const star = entry.price === minPrice ? "★" : " ";
      const priceStr = formatPrice(entry.price);
      // Pad cell to ~5 chars: e.g. "★$249" or " $329"
      return `${star}${priceStr}`.padEnd(4);
    });
    return `| ${weekLabel} | ${cells.join(" | ")} |`;
  });

  const note = `\n★ = Best price\n`;

  return [headerTitle, colHeader, separator, ...dataRows, note].join("\n");
}

/**
 * Format the top routes table section
 */
function formatRoutesTable(routes: FlightsRoute[]): string {
  if (routes.length === 0) return "";

  const header = `## Top Options\n`;

  const tableHeader = `| Airline   | Dates      | Price | Stops    | Duration |`;
  const tableSep =    `|-----------|------------|-------|----------|----------|`;

  const rows = routes.map((route) => {
    const star = route.isBestDeal ? "★" : " ";
    const airline = `${star}${route.airline}`.padEnd(9);
    const dates = route.returnDate
      ? `${route.departDate} – ${route.returnDate}`
      : route.departDate;
    const price = formatPrice(route.price).padEnd(5);
    const stops = formatStops(route.stops).padEnd(8);
    const duration = (route.duration ?? "—").padEnd(8);
    return `| ${airline} | ${dates.slice(0, 10).padEnd(10)} | ${price} | ${stops} | ${duration} |`;
  });

  return [header, tableHeader, tableSep, ...rows].join("\n");
}

/**
 * Format the tips section
 */
function formatTips(session: FlightsSession): string {
  const lines: string[] = ["## Tips"];

  if (session.cheapestDay) {
    lines.push(`- **Cheapest day**: ${session.cheapestDay}`);
  }
  if (session.shoulderSeason) {
    lines.push(`- **Shoulder season**: ${session.shoulderSeason}`);
  }
  if (session.bookBy) {
    lines.push(`- **Book by**: ${session.bookBy}`);
  }

  if (lines.length === 1) return ""; // No tips to show
  return lines.join("\n");
}

// ============================================================================
// Main Formatter
// ============================================================================

/**
 * Format a complete flights report from session, routes, and price calendar data.
 *
 * Produces a Google Flights-style markdown report with:
 * - Universal report header (title, best deal, metadata)
 * - Weekly price calendar grid
 * - Top route options table
 * - Booking tips
 */
export function formatFlightsReport(
  session: FlightsSession,
  routes: FlightsRoute[],
  priceCalendar: FlightsPriceCalendarEntry[]
): string {
  const title = `Flights: ${session.origin} → ${session.destination}`;

  // Build instant value line (best deal or placeholder)
  let instantValue: string;
  if (
    session.bestDealPrice !== undefined &&
    session.bestDealAirline &&
    session.bestDealDates
  ) {
    instantValue = `★ BEST DEAL: ${session.bestDealDates} — ${formatPrice(session.bestDealPrice)} on ${session.bestDealAirline}`;
  } else if (routes.length > 0) {
    const cheapest = [...routes].sort((a, b) => a.price - b.price)[0];
    instantValue = `★ BEST DEAL: ${cheapest.departDate} — ${formatPrice(cheapest.price)} on ${cheapest.airline}`;
  } else {
    instantValue = "No flight options found.";
  }

  const meta = {
    date: todayISO(),
    type: "flights" as const,
    ...(session.season && { extra: { Season: session.season } }),
  };

  const header = formatReportHeader(title, instantValue, meta);

  // Determine month label from first price calendar entry or route
  let month: string | undefined;
  if (priceCalendar.length > 0) {
    const firstDate = priceCalendar[0].date; // YYYY-MM-DD
    const [year, mon] = firstDate.split("-");
    const monthName = new Date(`${year}-${mon}-01`).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    month = monthName;
  }

  const calendarSection = formatPriceCalendar(priceCalendar, month);
  const routesSection = formatRoutesTable(routes);
  const tipsSection = formatTips(session);

  const sections = [header, calendarSection, routesSection, tipsSection].filter(
    Boolean
  );

  return sections.join("\n\n");
}
