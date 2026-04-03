/**
 * Creator Crash Course Report Generator
 *
 * Formats creator profile + video transcript data into a
 * curriculum-style crash course report.
 */

import { formatReportHeader, formatTable, todayISO } from "../lib/reportFormat";

export type CreatorProfile = {
  name: string;
  platform: string;
  channelUrl?: string;
  subscriberCount?: number;
  videoCount?: number;
  description?: string;
};

export type VideoSummary = {
  title: string;
  videoId: string;
  publishedAt?: string;
  duration?: string;
  topic?: string;
  keyTakeaway?: string;
  summary?: string;
};

export type CreatorModule = {
  name: string;
  keyIdea: string;
  videoIds: string[];
};

export type CreatorTheme = {
  theme: string;
  videoCount: number;
  explanation: string;
};

export type CreatorReportInput = {
  profile: CreatorProfile;
  videos: VideoSummary[];
  coreThesis?: string;
  modules?: CreatorModule[];
  themes?: CreatorTheme[];
};

/**
 * Format subscriber count with K/M suffixes.
 * 1200000 → "1.2M", 45000 → "45K", 500 → "500"
 */
function formatSubscriberCount(count: number): string {
  if (count >= 1_000_000) {
    const m = count / 1_000_000;
    return `${parseFloat(m.toFixed(1))}M`;
  }
  if (count >= 1_000) {
    const k = count / 1_000;
    return `${parseFloat(k.toFixed(1))}K`;
  }
  return String(count);
}

/**
 * Truncate a string to maxLen chars, appending "…" if truncated.
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

/**
 * Format a creator analysis report as a markdown string.
 */
export function formatCreatorReport(input: CreatorReportInput): string {
  const { profile, videos, coreThesis, themes } = input;

  // Resolve modules — default to a single "All Content" module
  const modules: CreatorModule[] =
    input.modules && input.modules.length > 0
      ? input.modules
      : [
          {
            name: "All Content",
            keyIdea: "Complete video library",
            videoIds: videos.map((v) => v.videoId),
          },
        ];

  // Build a lookup map: videoId → VideoSummary
  const videoById = new Map<string, VideoSummary>(
    videos.map((v) => [v.videoId, v])
  );

  // ── Header ───────────────────────────────────────────────────────────────
  const subscriberStr = profile.subscriberCount
    ? formatSubscriberCount(profile.subscriberCount)
    : "N/A";

  const thesis = coreThesis ?? profile.description ?? "";

  const header = formatReportHeader(
    `Creator Analysis: ${profile.name}`,
    thesis,
    {
      date: todayISO(),
      type: "creator-analysis",
      extra: { Videos: `${videos.length} analyzed` },
    }
  );

  // ── Profile section ──────────────────────────────────────────────────────
  const descriptionSnippet = profile.description
    ? profile.description.slice(0, 200)
    : "";

  const profileSection = [
    `## Profile`,
    `**Platform**: ${profile.platform} | **Subscribers**: ${subscriberStr} | **Videos**: ${profile.videoCount ?? videos.length}`,
    descriptionSnippet,
    "",
  ].join("\n");

  // ── Core Thesis section ──────────────────────────────────────────────────
  const coreThesisSection = [`## Core Thesis`, thesis, ""].join("\n");

  // ── Curriculum section ───────────────────────────────────────────────────
  const moduleBlocks = modules.map((mod, idx) => {
    const modVideos = mod.videoIds
      .map((id) => videoById.get(id))
      .filter((v): v is VideoSummary => v !== undefined);

    const videoLines = modVideos
      .map((v) => `- ${v.title} — ${v.keyTakeaway ?? ""}`)
      .join("\n");

    return [
      `### Module ${idx + 1}: ${mod.name}`,
      `**Videos**: ${modVideos.length} | **Key Idea**: ${mod.keyIdea}`,
      videoLines,
      "",
    ].join("\n");
  });

  const curriculumSection = [
    `## Curriculum`,
    "",
    ...moduleBlocks,
  ].join("\n");

  // ── Cross-Cutting Themes section (optional) ──────────────────────────────
  let themesSection = "";
  if (themes && themes.length > 0) {
    const themeLines = themes
      .map(
        (t) =>
          `- **${t.theme}**: Appears in ${t.videoCount} videos — ${t.explanation}`
      )
      .join("\n");

    themesSection = [`## Cross-Cutting Themes`, themeLines, ""].join("\n");
  }

  // ── Learning Paths section (only when ≥3 modules) ────────────────────────
  let learningPathsSection = "";
  if (modules.length >= 3) {
    const beginnerPath = modules
      .slice(0, 3)
      .map((m) => m.name)
      .join(" → ");
    const advancedPath =
      modules.length > 3
        ? modules
            .slice(Math.floor(modules.length / 2))
            .map((m) => m.name)
            .join(" → ")
        : modules
            .slice(1)
            .map((m) => m.name)
            .join(" → ");

    learningPathsSection = [
      `## Learning Paths`,
      `**Beginner**: ${beginnerPath}`,
      `**Advanced**: ${advancedPath}`,
      "",
    ].join("\n");
  }

  // ── Video Catalog section ────────────────────────────────────────────────
  const catalogRows = videos.map((v, i) => [
    String(i + 1),
    truncate(v.title, 25),
    v.topic ?? "",
    truncate(v.keyTakeaway ?? "", 30),
  ]);

  const catalogTable = formatTable(
    ["#", "Title", "Topic", "Key Takeaway"],
    catalogRows,
    30
  );

  const catalogSection = [`## Video Catalog`, "", catalogTable, ""].join("\n");

  // ── Assemble full report ─────────────────────────────────────────────────
  const sections = [
    header,
    profileSection,
    coreThesisSection,
    curriculumSection,
  ];

  if (themesSection) {
    sections.push(themesSection);
  }

  if (learningPathsSection) {
    sections.push(learningPathsSection);
  }

  sections.push(catalogSection);

  return sections.join("\n");
}
