/**
 * Creator Crash Course Report Generator
 *
 * Formats creator profile + video transcript data into a
 * curriculum-style crash course report matching the assimilate-creator
 * skill output format.
 *
 * Title:     "Crash Course: {Domain} by {Creator}"
 * Sections:  Executive Summary → Curriculum (modules with Core Concepts +
 *            Actionable Takeaways) → Cross-Cutting Themes (with table) →
 *            Learning Paths → Extended Research → Video Catalog
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
  /** Representative quote from this video */
  quote?: string;
  /** URL to watch this video */
  url?: string;
};

export type CoreConcept = {
  concept: string;
  videoId: string;
  explanation: string;
  quote?: string;
};

export type CreatorModule = {
  name: string;
  keyIdea: string;
  videoIds: string[];
  /** Specific core concepts taught in this module */
  coreConcepts?: CoreConcept[];
  /** Actionable takeaways the learner can apply */
  actionableTakeaways?: string[];
};

export type ThemeTableRow = {
  videoId: string;
  application: string;
  quote?: string;
};

export type CreatorTheme = {
  theme: string;
  videoCount: number;
  explanation: string;
  /** Which module numbers this theme spans, e.g. [1, 3, 5] */
  moduleNumbers?: number[];
  /** Per-video application details for the theme table */
  rows?: ThemeTableRow[];
};

export type ExtendedResearchTopic = {
  topic: string;
  mentionedInVideoId?: string;
  whyExplore: string;
  searchQuery: string;
};

export type CreatorReportInput = {
  profile: CreatorProfile;
  videos: VideoSummary[];
  coreThesis?: string;
  /** 2-3 paragraph executive summary */
  executiveSummary?: string;
  modules?: CreatorModule[];
  themes?: CreatorTheme[];
  /** Topics mentioned in videos that warrant further research */
  extendedResearch?: ExtendedResearchTopic[];
  /** Primary domain/subject of this creator's content */
  domain?: string;
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
 * Build the video URL from a videoId.
 */
function videoUrl(video: VideoSummary): string {
  if (video.url) return video.url;
  return `https://www.youtube.com/watch?v=${video.videoId}`;
}

/**
 * Format the Executive Summary section.
 * Uses executiveSummary if present, falls back to coreThesis, then description.
 */
function formatExecutiveSummary(input: CreatorReportInput): string {
  const { executiveSummary, coreThesis, profile } = input;

  const body =
    executiveSummary ??
    coreThesis ??
    profile.description ??
    `_No executive summary available for ${profile.name}._`;

  return [`## Executive Summary`, "", body, ""].join("\n");
}

/**
 * Format the Core Thesis section.
 * Preserved for backward compatibility — same content as Executive Summary.
 */
function formatCoreThesis(input: CreatorReportInput): string {
  const { coreThesis, profile } = input;
  const thesis = coreThesis ?? profile.description ?? "";
  return [`## Core Thesis`, thesis, ""].join("\n");
}

/**
 * Format a single module block with Core Concepts and Actionable Takeaways.
 */
function formatModuleBlock(
  mod: CreatorModule,
  idx: number,
  videoById: Map<string, VideoSummary>
): string {
  const modVideos = mod.videoIds
    .map((id) => videoById.get(id))
    .filter((v): v is VideoSummary => v !== undefined);

  const lines: string[] = [
    `### Module ${idx + 1}: ${mod.name}`,
    `**Overview**: ${mod.keyIdea} | **Videos**: ${modVideos.length}`,
    "",
    "#### Core Concepts",
  ];

  if (mod.coreConcepts && mod.coreConcepts.length > 0) {
    mod.coreConcepts.forEach((cc, i) => {
      const video = videoById.get(cc.videoId);
      const videoTitle = video?.title ?? cc.videoId;
      const url = video ? videoUrl(video) : `#${cc.videoId}`;
      const quoteStr = cc.quote ? ` > "${cc.quote}"` : "";
      lines.push(
        `${i + 1}. **${cc.concept}** ([${videoTitle}](${url})) - ${cc.explanation}${quoteStr}`
      );
    });
  } else {
    modVideos.forEach((v, i) => {
      const url = videoUrl(v);
      const explanation = v.keyTakeaway ?? v.summary ?? "";
      const quoteStr = v.quote ? ` > "${v.quote}"` : "";
      lines.push(
        `${i + 1}. **${v.topic ?? v.title}** ([${v.title}](${url})) - ${explanation}${quoteStr}`
      );
    });
  }

  lines.push("");
  lines.push("#### Actionable Takeaways");

  if (mod.actionableTakeaways && mod.actionableTakeaways.length > 0) {
    mod.actionableTakeaways.forEach((t) => lines.push(`- ${t}`));
  } else {
    modVideos.forEach((v) => {
      if (v.keyTakeaway) lines.push(`- ${v.keyTakeaway}`);
    });
    if (modVideos.every((v) => !v.keyTakeaway)) {
      lines.push(`- Review the ${mod.name} module videos for key insights`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Format the Curriculum section with all modules.
 */
function formatCurriculum(
  modules: CreatorModule[],
  videoById: Map<string, VideoSummary>
): string {
  const moduleBlocks = modules.map((mod, idx) =>
    formatModuleBlock(mod, idx, videoById)
  );

  return [`## Curriculum`, "", ...moduleBlocks].join("\n");
}

/**
 * Format the Cross-Cutting Themes section.
 * Each theme includes a table: Video | Application | Quote
 */
function formatCrossCuttingThemes(
  themes: CreatorTheme[],
  videoById: Map<string, VideoSummary>
): string {
  if (themes.length === 0) return "";

  const lines = [`## Cross-Cutting Themes`, ""];

  themes.forEach((t) => {
    const moduleStr =
      t.moduleNumbers && t.moduleNumbers.length > 0
        ? t.moduleNumbers.join(",")
        : "—";

    lines.push(`### Theme: ${t.theme}`);
    lines.push(
      `**Appears in**: Modules ${moduleStr} | **Synthesis**: ${t.explanation}`
    );
    lines.push("");

    if (t.rows && t.rows.length > 0) {
      const tableRows = t.rows.map((row) => {
        const video = videoById.get(row.videoId);
        const videoTitle = video?.title ?? row.videoId;
        const url = video ? videoUrl(video) : `#${row.videoId}`;
        return [
          `[${videoTitle}](${url})`,
          row.application,
          row.quote ? `"${row.quote}"` : "",
        ];
      });
      lines.push(formatTable(["Video", "Application", "Quote"], tableRows, 35));
    } else {
      lines.push(
        formatTable(
          ["Video", "Application", "Quote"],
          [["—", t.explanation, "—"]],
          35
        )
      );
    }

    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Format the Learning Paths section.
 * Only emitted when there are 3 or more modules.
 */
function formatLearningPaths(
  modules: CreatorModule[],
  videoById: Map<string, VideoSummary>
): string {
  if (modules.length < 3) return "";

  const firstVideoLink = (mod: CreatorModule): string => {
    const firstId = mod.videoIds[0];
    const video = firstId ? videoById.get(firstId) : undefined;
    if (video) return `[${video.title}](${videoUrl(video)})`;
    return mod.name;
  };

  const beginnerModules = modules.slice(0, 3);
  const advancedModules =
    modules.length > 3
      ? modules.slice(Math.floor(modules.length / 2))
      : modules.slice(1);

  const beginnerPath = beginnerModules.map(firstVideoLink).join(" → ");
  const advancedPath = advancedModules.map(firstVideoLink).join(" → ");

  const midStart = Math.floor(modules.length / 4);
  const midEnd = midStart + Math.min(3, Math.floor(modules.length / 2));
  const practicalModules = modules.slice(midStart, midEnd);
  const practicalPath = practicalModules.map(firstVideoLink).join(" → ");

  const lines = [
    `## Learning Paths`,
    `**Beginner**: ${beginnerPath}`,
    `**Advanced**: ${advancedPath}`,
  ];

  if (practicalPath && practicalPath !== beginnerPath) {
    lines.push(`**Practical**: ${practicalPath}`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Format the Extended Research section.
 * Topics mentioned in videos that warrant further exploration.
 */
function formatExtendedResearch(
  topics: ExtendedResearchTopic[],
  videoById: Map<string, VideoSummary>
): string {
  if (topics.length === 0) return "";

  const lines = [
    `## Extended Research`,
    "Topics mentioned but not covered:",
    "",
  ];

  topics.forEach((t) => {
    lines.push(`### ${t.topic}`);

    if (t.mentionedInVideoId) {
      const video = videoById.get(t.mentionedInVideoId);
      const videoTitle = video?.title ?? t.mentionedInVideoId;
      const url = video
        ? videoUrl(video)
        : `https://www.youtube.com/watch?v=${t.mentionedInVideoId}`;
      lines.push(`- **Mentioned in**: [${videoTitle}](${url})`);
    }

    lines.push(`- **Why explore**: ${t.whyExplore}`);
    lines.push(`- **Search**: "${t.searchQuery}"`);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Format the Video Catalog section.
 * Columns: # | Title | Topic | Summary | Link
 */
function formatVideoCatalog(videos: VideoSummary[]): string {
  const catalogRows = videos.map((v, i) => [
    String(i + 1),
    truncate(v.title, 25),
    v.topic ?? "",
    truncate(v.summary ?? v.keyTakeaway ?? "", 30),
    `[Watch](${videoUrl(v)})`,
  ]);

  const catalogTable = formatTable(
    ["#", "Title", "Topic", "Summary", "Link"],
    catalogRows,
    30
  );

  return [`## Video Catalog`, "", catalogTable, ""].join("\n");
}

/**
 * Format a creator crash course report as a markdown string.
 *
 * Matches the assimilate-creator skill output format:
 * # Crash Course: {Domain} by {Creator}
 * **Source**: ... | **Videos**: {n} | **Date**: ...
 * ## Executive Summary
 * ## Core Thesis
 * ## Curriculum (modules with Core Concepts + Actionable Takeaways)
 * ## Cross-Cutting Themes (with Video | Application | Quote table)
 * ## Learning Paths
 * ## Extended Research
 * ## Video Catalog (# | Title | Topic | Summary | Link)
 */
export function formatCreatorReport(input: CreatorReportInput): string {
  const { profile, videos, themes, extendedResearch } = input;

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

  // Resolve domain for the title
  const domain = input.domain ?? profile.platform ?? "Content";

  // Subscriber count for profile line
  const subscriberStr = profile.subscriberCount
    ? formatSubscriberCount(profile.subscriberCount)
    : "N/A";

  const coreThesis = input.coreThesis ?? profile.description ?? "";

  // ── Header ───────────────────────────────────────────────────────────────
  const sourceStr = profile.channelUrl
    ? `[${profile.name}](${profile.channelUrl})`
    : profile.name;

  const header = formatReportHeader(
    `Crash Course: ${domain} by ${profile.name}`,
    coreThesis,
    {
      date: todayISO(),
      type: "creator-analysis",
      extra: {
        Source: sourceStr,
        Videos: `${videos.length} analyzed`,
        Subscribers: subscriberStr,
      },
    }
  );

  // ── Assemble full report ─────────────────────────────────────────────────
  const sectionParts: string[] = [
    header,
    formatExecutiveSummary(input),
    formatCoreThesis(input),
    formatCurriculum(modules, videoById),
  ];

  const themesSection = formatCrossCuttingThemes(themes ?? [], videoById);
  if (themesSection) {
    sectionParts.push(themesSection);
  }

  const learningPathsSection = formatLearningPaths(modules, videoById);
  if (learningPathsSection) {
    sectionParts.push(learningPathsSection);
  }

  const extendedResearchSection = formatExtendedResearch(
    extendedResearch ?? [],
    videoById
  );
  if (extendedResearchSection) {
    sectionParts.push(extendedResearchSection);
  }

  sectionParts.push(formatVideoCatalog(videos));

  sectionParts.push(
    `---\n*Assimilated by /assimilate-creator on ${todayISO()}*`
  );

  return sectionParts.join("\n");
}
