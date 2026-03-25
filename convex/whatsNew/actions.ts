/**
 * What's New Actions
 *
 * Server-side report generation with automatic caching.
 * Fetches from external APIs (Reddit, HN, GitHub, Dev.to, Lobsters),
 * synthesizes into markdown, stores as document with embedding.
 */

"use node";

import { v } from "convex/values";
import { internalAction, action } from "../_generated/server";
import { api, internal } from "../_generated/api";

// ============================================================================
// Types
// ============================================================================

interface Finding {
  title: string;
  url: string;
  source: string;
  category: "discovery" | "release" | "trend" | "discussion";
  score?: number;
  summary?: string;
  publishedAt?: string;
}

interface FetchResult {
  source: string;
  findings: Finding[];
  error?: string;
}

// ============================================================================
// RSS Parser Helper (shared with subscriptions module)
// ============================================================================

async function parseRSSFeed(
  url: string
): Promise<Array<{ title: string; link: string; published: string }>> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Holocron-WhatsNew/1.0" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const text = await response.text();

  const items: Array<{ title: string; link: string; published: string }> = [];
  const regex = /<entry[^>]*>[\s\S]*?<\/entry>|<item[^>]*>[\s\S]*?<\/item>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const entry = match[0];

    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch =
      entry.match(/<link[^>]*>([\s\S]*?)<\/link>/) ||
      entry.match(/<link[^>]*href=['"]([^'"]*)['"]/) ||
      entry.match(/<id[^>]*>([\s\S]*?)<\/id>/);
    const publishedMatch =
      entry.match(/<published[^>]*>([\s\S]*?)<\/published>/) ||
      entry.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) ||
      entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);

    let title = titleMatch
      ? titleMatch[1].replace(/<[^>]*>/g, "").trim()
      : "Unknown";
    // Handle CDATA
    title = title.replace(/^<!\[CDATA\[|\]\]>$/g, "");

    const link = linkMatch
      ? (linkMatch[2] || linkMatch[1]).replace(/<[^>]*>/g, "").trim()
      : "";
    const published = publishedMatch
      ? publishedMatch[1].trim()
      : new Date().toISOString();

    if (link) {
      items.push({ title, link, published });
    }
  }
  return items;
}

// ============================================================================
// Source Fetchers
// ============================================================================

/**
 * Fetch AI/ML related posts from Reddit
 */
async function fetchReddit(days: number): Promise<FetchResult> {
  const subreddits = ["LocalLLaMA", "MachineLearning", "ClaudeAI", "artificial"];
  const findings: Finding[] = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  for (const subreddit of subreddits) {
    try {
      const feedUrl = `https://www.reddit.com/r/${subreddit}/hot/.rss`;
      const items = await parseRSSFeed(feedUrl);

      for (const item of items.slice(0, 10)) {
        const publishedDate = new Date(item.published);
        if (publishedDate < cutoffDate) continue;

        findings.push({
          title: item.title,
          url: item.link,
          source: `r/${subreddit}`,
          category: "discussion",
          publishedAt: item.published,
        });
      }
    } catch (error) {
      console.error(`[fetchReddit] Error fetching r/${subreddit}:`, error);
    }
  }

  return { source: "Reddit", findings };
}

/**
 * Fetch from Hacker News (top/new stories)
 */
async function fetchHackerNews(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    // Fetch top stories
    const topResponse = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json"
    );
    const topStoryIds: number[] = await topResponse.json();

    // Fetch details for top 30 stories
    const storyPromises = topStoryIds.slice(0, 30).map(async (id) => {
      const res = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      );
      return res.json();
    });

    const stories = await Promise.all(storyPromises);

    // AI/ML keywords for filtering
    const aiKeywords = [
      "ai",
      "ml",
      "llm",
      "gpt",
      "claude",
      "anthropic",
      "openai",
      "model",
      "transformer",
      "neural",
      "deep learning",
      "machine learning",
      "embedding",
      "inference",
      "gemini",
      "llama",
      "mistral",
      "agent",
      "copilot",
      "chatbot",
      "diffusion",
      "stable",
    ];

    for (const story of stories) {
      if (!story || !story.title || !story.url) continue;

      // Filter by date
      const storyDate = new Date(story.time * 1000);
      if (storyDate < cutoffDate) continue;

      // Filter by AI keywords (case insensitive)
      const titleLower = story.title.toLowerCase();
      const isAIRelated = aiKeywords.some((kw) => titleLower.includes(kw));
      if (!isAIRelated) continue;

      findings.push({
        title: story.title,
        url: story.url,
        source: "Hacker News",
        category: story.title.toLowerCase().includes("release")
          ? "release"
          : "discovery",
        score: story.score,
        publishedAt: new Date(story.time * 1000).toISOString(),
      });
    }
  } catch (error) {
    console.error("[fetchHackerNews] Error:", error);
  }

  return { source: "Hacker News", findings };
}

/**
 * Fetch trending AI repositories from GitHub
 */
async function fetchGitHub(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const dateStr = cutoffDate.toISOString().split("T")[0];

  try {
    // Search for trending AI/ML repos
    const queries = [
      `topic:artificial-intelligence created:>${dateStr}`,
      `topic:llm created:>${dateStr}`,
      `topic:machine-learning created:>${dateStr}`,
    ];

    for (const query of queries) {
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`,
        {
          headers: {
            "User-Agent": "Holocron-WhatsNew/1.0",
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) continue;

      const data = await response.json();

      for (const repo of data.items || []) {
        findings.push({
          title: `${repo.full_name}: ${repo.description || "No description"}`,
          url: repo.html_url,
          source: "GitHub",
          category: "discovery",
          score: repo.stargazers_count,
          publishedAt: repo.created_at,
        });
      }
    }
  } catch (error) {
    console.error("[fetchGitHub] Error:", error);
  }

  return { source: "GitHub", findings };
}

/**
 * Fetch from Dev.to AI tag
 */
async function fetchDevTo(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    const response = await fetch(
      "https://dev.to/api/articles?tag=ai&per_page=25",
      {
        headers: { "User-Agent": "Holocron-WhatsNew/1.0" },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const articles = await response.json();

    for (const article of articles) {
      const publishedDate = new Date(article.published_at);
      if (publishedDate < cutoffDate) continue;

      findings.push({
        title: article.title,
        url: article.url,
        source: "Dev.to",
        category: "discovery",
        summary: article.description,
        publishedAt: article.published_at,
      });
    }
  } catch (error) {
    console.error("[fetchDevTo] Error:", error);
  }

  return { source: "Dev.to", findings };
}

/**
 * Fetch from Lobsters (tech discussion)
 */
async function fetchLobsters(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    const feedUrl = "https://lobste.rs/t/ai.rss";
    const items = await parseRSSFeed(feedUrl);

    for (const item of items.slice(0, 15)) {
      const publishedDate = new Date(item.published);
      if (publishedDate < cutoffDate) continue;

      findings.push({
        title: item.title,
        url: item.link,
        source: "Lobsters",
        category: "discussion",
        publishedAt: item.published,
      });
    }
  } catch (error) {
    console.error("[fetchLobsters] Error:", error);
  }

  return { source: "Lobsters", findings };
}

/**
 * Fetch from Bluesky AT Protocol (AI accounts)
 *
 * Uses public Bluesky API - no auth required.
 * Monitors AI company accounts for official announcements.
 */
async function fetchBluesky(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // AI company accounts to monitor
  const aiAccounts = [
    "anthropic.bsky.social",
    "openai.bsky.social",
    "cursor.bsky.social",
  ];

  try {
    for (const handle of aiAccounts) {
      try {
        const response = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=25`,
          {
            headers: { Accept: "application/json" },
          }
        );

        if (!response.ok) {
          console.error(`[fetchBluesky] HTTP ${response.status} for ${handle}`);
          continue;
        }

        const data = await response.json();

        for (const feedItem of data.feed || []) {
          const post = feedItem.post;
          if (!post?.record) continue;

          const publishedDate = new Date(post.record.createdAt);
          if (publishedDate < cutoffDate) continue;

          // Extract text and create title
          const text = post.record.text || "";
          const title = text.length > 100 ? text.substring(0, 100) + "..." : text;

          // Build post URL
          const uri = post.uri; // at://did:plc:xxx/app.bsky.feed.post/xxx
          const parts = uri.split("/");
          const did = parts[2];
          const rkey = parts[parts.length - 1];
          const link = `https://bsky.app/profile/${did}/post/${rkey}`;

          findings.push({
            title,
            url: link,
            source: `Bluesky (@${handle})`,
            category: "discussion",
            publishedAt: post.record.createdAt,
          });
        }
      } catch (error) {
        console.error(`[fetchBluesky] Error fetching ${handle}:`, error);
      }
    }
  } catch (error) {
    console.error("[fetchBluesky] Error:", error);
  }

  return { source: "Bluesky", findings };
}

/**
 * Fetch from Twitter/X via Nitter RSS
 *
 * Uses Nitter instances to fetch tweets without authentication.
 * Best-effort only - wraps all fetches in try/catch.
 */
async function fetchTwitter(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // AI accounts to monitor
  const aiAccounts = ["AnthropicAI", "OpenAI", "cursor_ai"];

  // Try multiple Nitter instances for reliability
  const nitterInstances = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
  ];

  for (const handle of aiAccounts) {
    let fetched = false;

    for (const instance of nitterInstances) {
      if (fetched) break;

      try {
        const feedUrl = `${instance}/${handle}/rss`;
        const items = await parseRSSFeed(feedUrl);

        for (const item of items.slice(0, 10)) {
          const publishedDate = new Date(item.published);
          if (publishedDate < cutoffDate) continue;

          findings.push({
            title: item.title,
            url: item.link,
            source: `Twitter/X (@${handle})`,
            category: "discussion",
            publishedAt: item.published,
          });
        }

        fetched = true;
      } catch {
        // Try next instance
        continue;
      }
    }
  }

  return { source: "Twitter/X", findings };
}

// ============================================================================
// Report Synthesis
// ============================================================================

/**
 * Deduplicate findings by URL
 */
function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const finding of findings) {
    // Normalize URL for deduplication
    const normalizedUrl = finding.url
      .toLowerCase()
      .replace(/\/$/, "")
      .replace(/^https?:\/\//, "");

    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      unique.push(finding);
    }
  }

  return unique;
}

/**
 * Categorize findings
 */
function categorizeFindings(findings: Finding[]) {
  const discoveries = findings.filter((f) => f.category === "discovery");
  const releases = findings.filter((f) => f.category === "release");
  const trends = findings.filter((f) => f.category === "trend");
  const discussions = findings.filter((f) => f.category === "discussion");

  return { discoveries, releases, trends, discussions };
}

/**
 * Pick the top N findings by score, falling back to array order
 */
function topByScore(items: Finding[], n: number): Finding[] {
  return [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, n);
}

/**
 * Format a finding's score for display
 */
function formatScore(item: Finding): string {
  if (!item.score) return "";
  if (item.source === "GitHub") return ` ⭐ ${item.score}`;
  return ` (${item.score} pts)`;
}

/**
 * Generate markdown report from findings, matching the rich skill output format
 */
function synthesizeReport(
  findings: Finding[],
  days: number,
  periodStart: Date,
  periodEnd: Date
): string {
  const { discoveries, releases, trends, discussions } =
    categorizeFindings(findings);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Build source breakdown
  const sourceCounts = findings.reduce(
    (acc, f) => {
      acc[f.source] = (acc[f.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const sourceBreakdown = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source}: ${count}`)
    .join(" · ");

  let markdown = `# What's New in AI Software Engineering

**Period:** ${formatDate(periodStart)} to ${formatDate(periodEnd)} (${days} days)
**Generated:** ${new Date().toISOString()}
**Findings:** ${findings.length} total (${discoveries.length} discoveries, ${releases.length} releases, ${trends.length} trends, ${discussions.length} discussions)

---

`;

  // ── TL;DR (Top 5) ──
  const top5 = topByScore(findings, 5);
  if (top5.length > 0) {
    markdown += `## TL;DR\n\n`;
    for (let i = 0; i < top5.length; i++) {
      const item = top5[i];
      markdown += `${i + 1}. **[${item.title}](${item.url})**${formatScore(item)}\n`;
    }
    markdown += "\n---\n\n";
  }

  // ── Releases & Updates ──
  if (releases.length > 0) {
    markdown += `## 📦 Releases & Updates\n\n`;
    markdown += `| Release | Source | Score |\n`;
    markdown += `|---------|--------|-------|\n`;
    for (const item of releases.slice(0, 10)) {
      const score = item.score ? `${item.score}` : "—";
      markdown += `| [${item.title}](${item.url}) | ${item.source} | ${score} |\n`;
    }
    markdown += "\n";
  }

  // ── Discoveries & New Tools ──
  if (discoveries.length > 0) {
    // Split GitHub (repos) from other discoveries
    const githubFinds = discoveries.filter((f) => f.source === "GitHub");
    const otherFinds = discoveries.filter((f) => f.source !== "GitHub");

    markdown += `## 🔬 New Tools & Discoveries\n\n`;

    if (otherFinds.length > 0) {
      for (const item of otherFinds.slice(0, 10)) {
        markdown += `- **[${item.title}](${item.url})** — *${item.source}*${formatScore(item)}\n`;
        if (item.summary) {
          markdown += `  ${item.summary}\n`;
        }
      }
      markdown += "\n";
    }

    if (githubFinds.length > 0) {
      markdown += `### Trending Repos\n\n`;
      markdown += `| Repository | Stars |\n`;
      markdown += `|------------|-------|\n`;
      for (const item of topByScore(githubFinds, 10)) {
        markdown += `| [${item.title}](${item.url}) | ${item.score ? `⭐ ${item.score}` : "—"} |\n`;
      }
      markdown += "\n";
    }
  }

  // ── Community Pulse ──
  if (discussions.length > 0) {
    // Split by source
    const redditPosts = discussions.filter((f) => f.source.startsWith("r/"));
    const lobsterPosts = discussions.filter((f) => f.source === "Lobsters");
    const otherDiscussions = discussions.filter(
      (f) => !f.source.startsWith("r/") && f.source !== "Lobsters"
    );

    markdown += `## 💬 Community Pulse\n\n`;

    if (redditPosts.length > 0) {
      markdown += `### Reddit\n\n`;
      markdown += `| Post | Subreddit |\n`;
      markdown += `|------|-----------|\n`;
      for (const item of redditPosts.slice(0, 10)) {
        markdown += `| [${item.title}](${item.url}) | ${item.source} |\n`;
      }
      markdown += "\n";
    }

    if (lobsterPosts.length > 0) {
      markdown += `### Lobsters\n\n`;
      for (const item of lobsterPosts.slice(0, 5)) {
        markdown += `- [${item.title}](${item.url})\n`;
      }
      markdown += "\n";
    }

    if (otherDiscussions.length > 0) {
      for (const item of otherDiscussions.slice(0, 5)) {
        markdown += `- [${item.title}](${item.url}) — *${item.source}*\n`;
      }
      markdown += "\n";
    }
  }

  // ── Trends ──
  if (trends.length > 0) {
    markdown += `## 📈 Trends\n\n`;
    for (const item of trends.slice(0, 10)) {
      markdown += `- **[${item.title}](${item.url})** — *${item.source}*\n`;
    }
    markdown += "\n";
  }

  // ── Sources ──
  markdown += `---\n\n`;
  markdown += `**Sources:** ${sourceBreakdown}\n\n`;
  markdown += `*Generated by Holocron's What's New system*\n`;

  return markdown;
}

// ============================================================================
// Main Generation Action
// ============================================================================

/**
 * Generate daily What's New report
 *
 * This is the main cron-triggered action that:
 * 1. Checks if today's report exists (unless force=true)
 * 2. Fetches from all external sources in parallel
 * 3. Deduplicates and synthesizes findings
 * 4. Stores as document with embedding
 * 5. Creates whatsNewReports entry
 */
export const generateDailyReport = internalAction({
  args: {
    days: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    reportId: string;
    documentId: string;
    findingsCount: number;
    isNew: boolean;
  }> => {
    const days = args.days ?? 1;
    const force = args.force ?? false;

    console.log(
      `[generateDailyReport] Starting generation (days=${days}, force=${force})`
    );

    // 1. Check if today's report exists (unless force)
    if (!force) {
      const existingReport = await ctx.runQuery(
        internal.whatsNew.internal.getTodaysReport
      );
      if (existingReport) {
        console.log(
          "[generateDailyReport] Today's report already exists, returning cached"
        );
        return {
          reportId: existingReport._id,
          documentId: existingReport.documentId || "",
          findingsCount: existingReport.findingsCount,
          isNew: false,
        };
      }
    }

    // 2. Fetch from all sources in parallel
    console.log("[generateDailyReport] Fetching from external sources...");
    const fetchResults = await Promise.allSettled([
      fetchReddit(days),
      fetchHackerNews(days),
      fetchGitHub(days),
      fetchDevTo(days),
      fetchLobsters(days),
      fetchBluesky(days),
      fetchTwitter(days),
    ]);

    // Collect all findings
    const allFindings: Finding[] = [];
    for (const result of fetchResults) {
      if (result.status === "fulfilled") {
        allFindings.push(...result.value.findings);
        console.log(
          `[generateDailyReport] ${result.value.source}: ${result.value.findings.length} findings`
        );
      } else {
        console.error("[generateDailyReport] Fetch failed:", result.reason);
      }
    }

    // 3. Deduplicate and categorize
    const uniqueFindings = deduplicateFindings(allFindings);
    const { discoveries, releases, trends, discussions } =
      categorizeFindings(uniqueFindings);

    console.log(
      `[generateDailyReport] ${uniqueFindings.length} unique findings (${discoveries.length} discoveries, ${releases.length} releases, ${trends.length} trends, ${discussions.length} discussions)`
    );

    // 4. Generate markdown report
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const reportMarkdown = synthesizeReport(
      uniqueFindings,
      days,
      periodStart,
      periodEnd
    );

    // 5. Store document with embedding
    console.log("[generateDailyReport] Creating document with embedding...");
    const documentResult = await ctx.runAction(
      api.documents.storage.createWithEmbedding,
      {
        title: `What's New: ${now.toISOString().split("T")[0]}`,
        content: reportMarkdown,
        category: "whats-new",
        date: now.toISOString().split("T")[0],
        status: "complete",
      }
    );

    // 6. Create whatsNewReports entry
    console.log("[generateDailyReport] Creating report entry...");
    const reportId = await ctx.runMutation(
      internal.whatsNew.mutations.createReport,
      {
        periodStart: periodStart.getTime(),
        periodEnd: periodEnd.getTime(),
        days,
        focus: "all",
        discoveryOnly: false,
        findingsCount: uniqueFindings.length,
        discoveryCount: discoveries.length,
        releaseCount: releases.length,
        trendCount: trends.length,
        reportPath: "", // Not using file paths, using documentId instead
        summaryJson: {
          topSources: Object.entries(
            uniqueFindings.reduce(
              (acc, f) => {
                acc[f.source] = (acc[f.source] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            )
          ).sort((a, b) => b[1] - a[1]),
        },
        documentId: documentResult.documentId,
      }
    );

    console.log(
      `[generateDailyReport] Complete! reportId=${reportId}, documentId=${documentResult.documentId}`
    );

    // Notify that a new What's New report is available
    await ctx.runMutation(internal.notifications.internal.create, {
      type: "whats_new",
      title: "What's New Report Ready",
      body: `Your daily AI digest is ready with ${uniqueFindings.length} findings.`,
      route: `/whats-new/${reportId}`,
      referenceId: reportId,
    });

    return {
      reportId,
      documentId: documentResult.documentId,
      findingsCount: uniqueFindings.length,
      isNew: true,
    };
  },
});

/**
 * Public action to trigger report generation (with force option)
 *
 * This allows MCP clients to force-generate a new report.
 */
export const generate = action({
  args: {
    days: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runAction(internal.whatsNew.actions.generateDailyReport, {
      days: args.days,
      force: args.force,
    });
  },
});
