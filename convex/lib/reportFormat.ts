/**
 * Shared Report Formatting Utilities
 *
 * Universal report header, rating bars, and formatting helpers
 * used across all Convex research/analysis workflows.
 *
 * Design principles (from clig.dev + McKinsey Pyramid):
 * - Instant value at the top (verdict, answer, best pick)
 * - Tables ≤80 chars wide for terminal readability
 * - Consistent header pattern across all report types
 * - Confidence/status indicators: 🟢/🟡/🔴 or HIGH/MED/LOW
 */

/**
 * Report types matching the document categories
 */
export type ReportType =
  | "deep-research"
  | "shop"
  | "whats-new"
  | "assimilation"
  | "creator-analysis"
  | "revenue-validation"
  | "competitive-analysis"
  | "ai-roi"
  | "flights"
  | "quick-research";

/**
 * Metadata for the universal report header
 */
export interface ReportHeaderMeta {
  date: string;
  type: ReportType;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  sources?: number;
  agents?: number;
  extra?: Record<string, string>;
}

/**
 * Generate the universal report header.
 * Every report starts with: title, instant value, metadata line, separator.
 */
export function formatReportHeader(
  title: string,
  instantValue: string,
  meta: ReportHeaderMeta
): string {
  const metaParts = [`**Date**: ${meta.date}`, `**Type**: ${meta.type}`];

  if (meta.confidence) {
    metaParts.push(`**Confidence**: ${meta.confidence}`);
  }
  if (meta.sources) {
    metaParts.push(`**Sources**: ${meta.sources}`);
  }
  if (meta.agents) {
    metaParts.push(`**Agents**: ${meta.agents}`);
  }
  if (meta.extra) {
    for (const [key, value] of Object.entries(meta.extra)) {
      metaParts.push(`**${key}**: ${value}`);
    }
  }

  return `# ${title}
${instantValue}

${metaParts.join(" | ")}
---

`;
}

/**
 * Format a dimension rating as a visual bar (e.g., "████░" for 4/5)
 */
export function formatRatingBar(rating: number, max = 5): string {
  const clamped = Math.max(0, Math.min(max, Math.round(rating)));
  return "█".repeat(clamped) + "░".repeat(max - clamped);
}

/**
 * Format a confidence score as a percentage bar (e.g., "[████████░░] 82%")
 */
export function formatScoreBar(score: number, width = 10): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${score}%`;
}

/**
 * Get confidence badge emoji + text
 */
export function getConfidenceBadge(
  level: "HIGH" | "MEDIUM" | "LOW"
): string {
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
 * Determine confidence level from a numeric score
 */
export function scoreToConfidenceLevel(
  score: number
): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

/**
 * Format a markdown table from rows. Auto-pads columns.
 * Keeps tables narrow for terminal readability.
 *
 * @param headers - Column header strings
 * @param rows - Array of row arrays (same length as headers)
 * @param maxColWidth - Maximum column width before truncation (default 30)
 */
export function formatTable(
  headers: string[],
  rows: string[][],
  maxColWidth = 30
): string {
  const truncate = (s: string, max: number) =>
    s.length > max ? s.slice(0, max - 1) + "…" : s;

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const headerLen = h.length;
    const maxRowLen = rows.reduce(
      (max, row) => Math.max(max, (row[i] || "").length),
      0
    );
    return Math.min(Math.max(headerLen, maxRowLen), maxColWidth);
  });

  const pad = (s: string, width: number) =>
    truncate(s, width).padEnd(width);

  const headerLine = `| ${headers.map((h, i) => pad(h, colWidths[i])).join(" | ")} |`;
  const separatorLine = `|${colWidths.map((w) => "-".repeat(w + 2)).join("|")}|`;
  const dataLines = rows.map(
    (row) =>
      `| ${row.map((cell, i) => pad(cell || "", colWidths[i])).join(" | ")} |`
  );

  return [headerLine, separatorLine, ...dataLines].join("\n");
}

/**
 * Format a sources/bibliography section
 */
export function formatSources(
  sources: Array<{ title?: string; url: string; domain?: string }>
): string {
  if (sources.length === 0) return "";

  const lines = sources.map((s, i) => {
    const label = s.title || s.domain || "Source";
    return `[${i + 1}] ${label} — ${s.url}`;
  });

  return `## Sources\n${lines.join("\n")}`;
}

/**
 * Format today's date as YYYY-MM-DD
 */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}
