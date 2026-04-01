/**
 * What's New Actions
 *
 * Server-side report generation with automatic caching.
 * Fetches from external APIs (Reddit, HN, GitHub, Dev.to, Lobsters, Bluesky),
 * with Bluesky accounts pulled dynamically from subscriptionSources.
 * Synthesizes into markdown, stores as document with embedding.
 */

"use node";

import { v } from "convex/values";
import { internalAction, action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { synthesizeReport as llmSynthesizeReport, generateFindingSummary } from "./llm";

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
  // Extended fields for enhanced filtering and ranking
  engagementVelocity?: number; // 0-100 score based on engagement rate
  crossSourceCorroboration?: number; // Count of sources mentioning this
  author?: string; // Author or creator name
  tags?: string[]; // Associated tags/topics
  metadataJson?: any; // Extensible metadata for future fields
  // Quality scoring fields
  qualityScore?: number; // 0-1 LLM-assessed quality score
  qualityReason?: string; // Brief explanation of quality assessment
  upvotes?: number; // Platform-specific upvote/like count
  commentCount?: number; // Number of comments/replies
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
 *
 * Uses JSON API instead of RSS to get engagement data (upvotes, comments)
 * for quality scoring. Falls back to RSS if JSON API fails.
 */
async function fetchReddit(days: number): Promise<FetchResult> {
  const subreddits = [
    "LocalLLaMA", "MachineLearning", "ClaudeAI", "artificial",
    "ChatGPT", "devtools", "OpenAI", "CursorAI", "SideProject",
  ];
  const findings: Finding[] = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  for (const subreddit of subreddits) {
    try {
      // Use JSON API for engagement data (upvotes, comments)
      const response = await fetch(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=15`,
        {
          headers: { "User-Agent": "Holocron-WhatsNew/1.0" },
        }
      );

      if (!response.ok) {
        // Fallback to RSS if JSON API fails
        console.warn(`[fetchReddit] JSON API failed for r/${subreddit} (${response.status}), falling back to RSS`);
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
        continue;
      }

      const data = await response.json();
      const posts = data?.data?.children ?? [];

      for (const child of posts) {
        const post = child.data;
        if (!post || post.stickied) continue;

        const publishedDate = new Date(post.created_utc * 1000);
        if (publishedDate < cutoffDate) continue;

        // Calculate engagement velocity: upvotes per hour since posting
        const ageHours = Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
        const velocity = post.score / ageHours;

        findings.push({
          title: post.title,
          url: `https://www.reddit.com${post.permalink}`,
          source: `r/${subreddit}`,
          category: "discussion",
          score: post.score,
          publishedAt: publishedDate.toISOString(),
          author: post.author,
          upvotes: post.score,
          commentCount: post.num_comments,
          engagementVelocity: Math.min(100, Math.round(velocity * 2)),
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
      `"AI coding" created:>${dateStr}`,
      `"developer tool" AI created:>${dateStr}`,
      `stars:>100 pushed:>${dateStr} topic:llm`,
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
 * Fetch from GitHub repository changelogs
 *
 * Fetches latest releases from specified repositories.
 * Focuses on AI/ML tools and frameworks.
 */
async function fetchChangelog(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Key AI/ML repositories to monitor for releases
  const repositories = [
    "anthropics/anthropic-sdk-python",
    "anthropics/anthropic-sdk-typescript",
    "openai/openai-python",
    "openai/openai-node",
    "langchain-ai/langchain",
    "langchain-ai/langchainjs",
    "microsoft/semantic-kernel",
    "mistralai/mistral-common",
    "huggingface/transformers",
    "modal/modal",
  ];

  try {
    for (const repo of repositories) {
      const [owner, name] = repo.split("/");
      const apiUrl = `https://api.github.com/repos/${owner}/${name}/releases?per_page=5`;

      try {
        const response = await fetch(apiUrl, {
          headers: {
            "User-Agent": "Holocron-WhatsNew/1.0",
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!response.ok) {
          console.error(`[fetchChangelog] HTTP ${response.status} for ${repo}`);
          continue;
        }

        const releases = await response.json();

        for (const release of releases) {
          // Skip draft releases
          if (release.draft) continue;

          const publishedDate = new Date(release.published_at);
          if (publishedDate < cutoffDate) continue;

          findings.push({
            title: `${repo}: ${release.name || release.tag_name}`,
            url: release.html_url,
            source: `GitHub (${repo})`,
            category: "release",
            score: 0, // Releases don't have a score per se
            publishedAt: release.published_at,
            author: release.author?.login,
            summary: release.body?.substring(0, 200),
            tags: ["github", "release", name],
          });
        }
      } catch (error) {
        console.error(`[fetchChangelog] Error fetching ${repo}:`, error);
      }
    }
  } catch (error) {
    console.error("[fetchChangelog] Error:", error);
  }

  return { source: "GitHub Changelogs", findings };
}

/**
 * Fetch from Bluesky AT Protocol
 *
 * Uses public Bluesky API - no auth required.
 * Accepts dynamic account list from subscriptions.
 */
async function fetchBluesky(days: number, accounts: Array<{ handle: string; name: string }>): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Fallback to defaults if no subscription accounts configured yet
  const aiAccounts = accounts.length > 0
    ? accounts
    : [
        { handle: "anthropic.bsky.social", name: "Anthropic" },
        { handle: "openai.bsky.social", name: "OpenAI" },
        { handle: "cursor.bsky.social", name: "Cursor" },
      ];

  try {
    for (const account of aiAccounts) {
      const handle = account.handle.includes('.') ? account.handle : `${account.handle}.bsky.social`;
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

          const text = post.record.text || "";
          const title = text.length > 100 ? text.substring(0, 100) + "..." : text;

          const uri = post.uri;
          const parts = uri.split("/");
          const did = parts[2];
          const rkey = parts[parts.length - 1];
          const link = `https://bsky.app/profile/${did}/post/${rkey}`;

          findings.push({
            title,
            url: link,
            source: `Bluesky (@${account.name || handle})`,
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
 * Fetch AI-related tweets from Twitter/X via Exa search
 *
 * Uses Exa API to find recent AI/ML tweets from high-signal accounts.
 * No Twitter API key needed — Exa crawls and indexes Twitter content.
 * Results pass through the same quality scoring pipeline as Reddit.
 */
async function fetchTwitter(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const dateStr = cutoffDate.toISOString().split("T")[0];

  const exaApiKey = process.env.EXA_API_KEY;
  if (!exaApiKey) {
    console.warn("[fetchTwitter] No EXA_API_KEY set, skipping Twitter fetch");
    return { source: "Twitter/X", findings: [] };
  }

  // High-signal AI/ML queries scoped to twitter.com/x.com
  const queries = [
    "AI coding tools new release announcement",
    "LLM benchmark results comparison",
    "developer tooling AI agent workflow",
  ];

  try {
    for (const query of queries) {
      try {
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": exaApiKey,
          },
          body: JSON.stringify({
            query,
            numResults: 10,
            startPublishedDate: dateStr,
            includeDomains: ["twitter.com", "x.com"],
            type: "neural",
          }),
        });

        if (!response.ok) {
          console.error(`[fetchTwitter] Exa HTTP ${response.status} for query: ${query}`);
          continue;
        }

        const data = await response.json();

        for (const result of data.results ?? []) {
          // Extract author from URL pattern: twitter.com/{handle}/status/...
          let author: string | undefined;
          try {
            const url = new URL(result.url);
            const pathParts = url.pathname.split("/");
            if (pathParts.length >= 2 && pathParts[1]) {
              author = `@${pathParts[1]}`;
            }
          } catch {
            // URL parse failed, skip author extraction
          }

          const publishedDate = result.publishedDate
            ? new Date(result.publishedDate)
            : undefined;

          if (publishedDate && publishedDate < cutoffDate) continue;

          const title = result.title
            ? result.title.replace(/\s+/g, " ").trim()
            : "";
          if (!title || title.length < 10) continue;

          findings.push({
            title,
            url: result.url,
            source: "Twitter/X",
            category: "discussion",
            publishedAt: publishedDate?.toISOString(),
            author,
            summary: result.text?.substring(0, 200),
          });
        }
      } catch (error) {
        console.error(`[fetchTwitter] Error for query "${query}":`, error);
      }
    }
  } catch (error) {
    console.error("[fetchTwitter] Error:", error);
  }

  // Deduplicate by URL (Exa may return same tweet across queries)
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    if (seen.has(f.url)) return false;
    seen.add(f.url);
    return true;
  });

  return { source: "Twitter/X", findings: unique };
}

/**
 * Fetch broader AI news via Exa web search (no domain restriction)
 *
 * Supplements the direct API fetches with neural web search to find
 * things that Reddit/HN/GitHub APIs might miss.
 */
async function fetchWebSearch(days: number): Promise<FetchResult> {
  const findings: Finding[] = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const dateStr = cutoffDate.toISOString().split("T")[0];

  const exaApiKey = process.env.EXA_API_KEY;
  if (!exaApiKey) {
    console.warn("[fetchWebSearch] No EXA_API_KEY set, skipping web search");
    return { source: "Web Search", findings: [] };
  }

  const now = new Date();
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const queries = [
    `AI developer tool release ${monthYear}`,
    "new coding assistant AI agent",
    "MCP server announcement Model Context Protocol",
  ];

  try {
    for (const query of queries) {
      try {
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": exaApiKey,
          },
          body: JSON.stringify({
            query,
            numResults: 10,
            startPublishedDate: dateStr,
            type: "neural",
          }),
        });

        if (!response.ok) {
          console.error(`[fetchWebSearch] Exa HTTP ${response.status} for query: ${query}`);
          continue;
        }

        const data = await response.json();

        for (const result of data.results ?? []) {
          const publishedDate = result.publishedDate
            ? new Date(result.publishedDate)
            : undefined;

          if (publishedDate && publishedDate < cutoffDate) continue;

          const title = result.title
            ? result.title.replace(/\s+/g, " ").trim()
            : "";
          if (!title || title.length < 10) continue;

          findings.push({
            title,
            url: result.url,
            source: "Web Search",
            category: "discovery",
            publishedAt: publishedDate?.toISOString(),
            summary: result.text?.substring(0, 300),
          });
        }
      } catch (error) {
        console.error(`[fetchWebSearch] Error for query "${query}":`, error);
      }
    }
  } catch (error) {
    console.error("[fetchWebSearch] Error:", error);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    if (seen.has(f.url)) return false;
    seen.add(f.url);
    return true;
  });

  return { source: "Web Search", findings: unique };
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
 * Cap findings per source to prevent any single source from dominating.
 * Keeps top N findings per source, sorted by score descending.
 */
function capFindingsPerSource(findings: Finding[], maxPerSource: number): Finding[] {
  const bySource = new Map<string, Finding[]>();
  for (const finding of findings) {
    // Normalize source to base name (e.g., "Bluesky (@foo)" -> "Bluesky")
    const baseSource = finding.source.replace(/\s*\(.*\)$/, '');
    if (!bySource.has(baseSource)) {
      bySource.set(baseSource, []);
    }
    bySource.get(baseSource)!.push(finding);
  }

  const capped: Finding[] = [];
  for (const [, sourceFindings] of bySource) {
    // Sort by score descending, take top N
    sourceFindings.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    capped.push(...sourceFindings.slice(0, maxPerSource));
  }

  return capped;
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
 * Calculate cross-source corroboration for findings
 * Returns the count of findings mentioned by multiple sources
 */
function calculateCorroboration(findings: Finding[]): number {
  // Group findings by URL pattern to detect cross-source mentions
  const urlGroups = new Map<string, number>();

  for (const finding of findings) {
    // Normalize URL for grouping (remove query params, fragments)
    try {
      const url = new URL(finding.url);
      const normalized = `${url.hostname}${url.pathname}`;
      urlGroups.set(normalized, (urlGroups.get(normalized) || 0) + 1);
    } catch {
      // If URL parsing fails, use the full URL as key
      urlGroups.set(finding.url, (urlGroups.get(finding.url) || 0) + 1);
    }
  }

  // Count URLs mentioned by 2+ sources
  let corroborated = 0;
  for (const count of urlGroups.values()) {
    if (count >= 2) corroborated++;
  }

  return corroborated;
}

/**
 * Populate crossSourceCorroboration on each finding.
 * Mutates the findings array in place.
 */
function populatePerFindingCorroboration(findings: Finding[]): void {
  const urlGroups = new Map<string, number>();

  for (const finding of findings) {
    try {
      const url = new URL(finding.url);
      const normalized = `${url.hostname}${url.pathname}`;
      urlGroups.set(normalized, (urlGroups.get(normalized) || 0) + 1);
    } catch {
      urlGroups.set(finding.url, (urlGroups.get(finding.url) || 0) + 1);
    }
  }

  for (const finding of findings) {
    try {
      const url = new URL(finding.url);
      const normalized = `${url.hostname}${url.pathname}`;
      finding.crossSourceCorroboration = urlGroups.get(normalized) ?? 1;
    } catch {
      finding.crossSourceCorroboration = urlGroups.get(finding.url) ?? 1;
    }
  }
}

/**
 * Calculate top engagement velocity from findings
 * Returns the highest engagement velocity score (0-100)
 */
function calculateTopEngagementVelocity(findings: Finding[]): number {
  let maxVelocity = 0;

  for (const finding of findings) {
    if (finding.engagementVelocity !== undefined && finding.engagementVelocity > maxVelocity) {
      maxVelocity = finding.engagementVelocity;
    }

    // Fallback: estimate velocity from score if engagementVelocity not set
    if (finding.engagementVelocity === undefined && finding.score !== undefined) {
      // Simple heuristic: normalize score to 0-100 range
      const estimatedVelocity = Math.min(100, finding.score * 10);
      if (estimatedVelocity > maxVelocity) {
        maxVelocity = estimatedVelocity;
      }
    }
  }

  return maxVelocity;
}

/**
 * Extract unique sources from findings
 */
function extractSources(findings: Finding[]): string[] {
  const uniqueSources = new Set<string>();
  for (const finding of findings) {
    uniqueSources.add(finding.source);
  }
  return Array.from(uniqueSources).sort();
}

// ============================================================================
// Quality Scoring
// ============================================================================

/**
 * Batch-score findings for content quality using LLM.
 *
 * Uses a two-axis scoring system (adapted from subscriptions/ai_scoring.ts):
 * - Intellectual Gravity: Does this require engineering knowledge to appreciate?
 * - Builder Relevance: Can a developer act on this information?
 *
 * Only scores social/discussion sources (Reddit, Bluesky, Lobsters).
 * Releases, GitHub repos, and HN (already score-filtered) pass through.
 */
async function scoreFindingsQuality(
  findings: Finding[]
): Promise<Finding[]> {
  // Separate findings that need scoring from those that don't
  const socialSources = new Set(["Reddit", "Bluesky", "Lobsters", "Dev.to", "Twitter/X"]);
  const needsScoring: Finding[] = [];
  const passThrough: Finding[] = [];

  for (const finding of findings) {
    const baseSource = finding.source.replace(/\s*\(.*\)$/, "");
    if (socialSources.has(baseSource) || finding.source.startsWith("r/")) {
      needsScoring.push(finding);
    } else {
      // HN (already keyword+score filtered), GitHub, Changelogs pass through
      passThrough.push({ ...finding, qualityScore: 0.8 });
    }
  }

  if (needsScoring.length === 0) {
    return passThrough;
  }

  console.log(
    `[scoreFindingsQuality] Scoring ${needsScoring.length} social findings`
  );

  // Build prompt for batch scoring
  const itemList = needsScoring
    .map((f, i) => {
      const meta = [
        f.upvotes !== undefined ? `upvotes:${f.upvotes}` : null,
        f.commentCount !== undefined ? `comments:${f.commentCount}` : null,
        f.author ? `by:${f.author}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `${i + 1}. [${f.source}] ${f.title}${meta ? ` (${meta})` : ""}`;
    })
    .join("\n");

  const prompt = `You are a quality scorer for an AI software engineering daily briefing. Score each item 0.0-1.0 for whether it belongs in a curated, high-quality daily digest for an AI engineer.

Items to score:
${itemList}

Score on TWO axes, then average:

AXIS 1 — Intellectual Gravity (does this require engineering knowledge to appreciate?):
  HIGH (0.7-1.0): Model architecture details, benchmark methodology, API design decisions,
    training insights, infrastructure scaling, technical comparisons, new tool deep-dives
  MEDIUM (0.4-0.6): Surface-level announcements of technical products, brief tool mentions
  LOW (0.0-0.3): Hot takes, reactions, memes, entertainment, personality commentary,
    anything a non-engineer would engage with equally, vague questions, help-me posts

AXIS 2 — Builder Relevance (can a developer act on this information?):
  HIGH (0.7-1.0): New tool/model with usage details, workflow technique, breaking API change,
    pricing update, integration guide, migration path, code examples
  MEDIUM (0.4-0.6): Awareness-level info (a tool exists, a model was released), no actionable detail
  LOW (0.0-0.3): Pure opinion, entertainment, social commentary, no developer action possible

FILTER OUT (score 0.0-0.2):
- "What model should I use?" / help-me-choose posts
- Memes, jokes, rage posts about AI companies
- Screenshots of chatbot conversations (unless demonstrating a technique)
- Vague speculation with no evidence ("AI will replace X")
- Self-promotion with no substance
- Duplicate/rehash of widely known news (everyone already knows GPT-5 exists)
- Posts with very low engagement (< 5 upvotes) unless genuinely novel

INCLUDE (score 0.7-1.0):
- Detailed benchmarks or comparisons with methodology
- New tool announcements with technical details
- Workflow tips that save real engineering time
- Bug reports / breaking changes that affect developers
- Architecture discussions with concrete examples
- Release notes with meaningful changes

Final score = average of both axes.

Respond with ONLY a JSON array: [{"score": 0.8, "reason": "brief reason"}, ...]
The array must have exactly ${needsScoring.length} entries in the same order.`;

  try {
    const { generateText } = await import("ai");
    const { zaiFlash } = await import("../lib/ai/zai_provider");

    const result = await generateText({
      model: zaiFlash(),
      prompt,
    });

    const text = result.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[scoreFindingsQuality] No JSON array in LLM response, passing all through");
      return [...passThrough, ...needsScoring.map((f) => ({ ...f, qualityScore: 0.5 }))];
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn("[scoreFindingsQuality] Parsed result not an array");
      return [...passThrough, ...needsScoring.map((f) => ({ ...f, qualityScore: 0.5 }))];
    }

    // Apply scores to findings
    const scored = needsScoring.map((finding, i) => {
      const entry = parsed[i] as Record<string, unknown> | undefined;
      const score =
        entry && typeof entry.score === "number"
          ? Math.min(1, Math.max(0, entry.score))
          : 0.5;
      const reason =
        entry && typeof entry.reason === "string" ? entry.reason : "ai_scored";
      return { ...finding, qualityScore: score, qualityReason: reason };
    });

    const filtered = scored.filter((f) => f.qualityScore! >= 0.4);
    const removed = scored.length - filtered.length;
    console.log(
      `[scoreFindingsQuality] Scored ${scored.length} items, filtered out ${removed} low-quality (< 0.4)`
    );

    return [...passThrough, ...filtered];
  } catch (err) {
    console.warn("[scoreFindingsQuality] LLM scoring failed, passing all through:", err);
    return [...passThrough, ...needsScoring.map((f) => ({ ...f, qualityScore: 0.5 }))];
  }
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

    // 2. Fetch creator accounts from subscriptions for dynamic Bluesky lists
    console.log("[generateDailyReport] Loading creator accounts from subscriptions...");
    const blueskyAccounts = await ctx.runQuery(
      internal.subscriptions.internal.getCreatorAccountsByPlatform, { platform: "bluesky" }
    );
    console.log(
      `[generateDailyReport] Found ${blueskyAccounts.length} Bluesky accounts`
    );

    // 3. Fetch from all sources in parallel
    console.log("[generateDailyReport] Fetching from external sources...");
    const fetchResults = await Promise.allSettled([
      fetchReddit(days),
      fetchHackerNews(days),
      fetchGitHub(days),
      fetchDevTo(days),
      fetchLobsters(days),
      fetchBluesky(days, blueskyAccounts),
      fetchChangelog(days),
      fetchTwitter(days),
      fetchWebSearch(days),
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

    // 4. Deduplicate, quality-score, and categorize
    const uniqueFindings = deduplicateFindings(allFindings);

    // Quality scoring: LLM-based filtering for social posts
    console.log("[generateDailyReport] Scoring findings quality...");
    const qualityFindings = await scoreFindingsQuality(uniqueFindings);
    console.log(
      `[generateDailyReport] Quality filter: ${uniqueFindings.length} → ${qualityFindings.length} findings`
    );

    const cappedFindings = capFindingsPerSource(qualityFindings, 15);
    const { discoveries, releases, trends, discussions } =
      categorizeFindings(cappedFindings);

    // Calculate extended metrics
    // Populate per-finding corroboration so synthesis LLM can use it for boosting
    populatePerFindingCorroboration(cappedFindings);

    const topEngagementVelocity = calculateTopEngagementVelocity(cappedFindings);
    const totalCorroborationCount = calculateCorroboration(cappedFindings);
    const sources = extractSources(cappedFindings);

    console.log(
      `[generateDailyReport] ${cappedFindings.length} unique findings (${discoveries.length} discoveries, ${releases.length} releases, ${trends.length} trends, ${discussions.length} discussions)`
    );
    console.log(
      `[generateDailyReport] Extended metrics: topEngagementVelocity=${topEngagementVelocity}, totalCorroborationCount=${totalCorroborationCount}, sources=${sources.length}`
    );

    // 5. Content enrichment: fetch summaries for top findings lacking them
    const findingsNeedingSummary = cappedFindings
      .filter((f) => !f.summary || f.summary.length < 20)
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 15);

    if (findingsNeedingSummary.length > 0) {
      console.log(`[generateDailyReport] Enriching ${findingsNeedingSummary.length} findings with content summaries...`);
      const enrichResults = await Promise.allSettled(
        findingsNeedingSummary.map(async (finding) => {
          try {
            const response = await fetch(`https://r.jina.ai/${finding.url}`, {
              headers: {
                Accept: "text/plain",
                "User-Agent": "Holocron-WhatsNew/1.0",
              },
              signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) return null;
            const text = await response.text();
            return { url: finding.url, content: text.substring(0, 2000) };
          } catch {
            return null;
          }
        })
      );

      // Batch-summarize fetched content
      const fetchedContent: Array<{ url: string; content: string }> = [];
      for (const result of enrichResults) {
        if (result.status === "fulfilled" && result.value) {
          fetchedContent.push(result.value);
        }
      }

      if (fetchedContent.length > 0) {
        try {
          const { generateText } = await import("ai");
          const { zaiFlash } = await import("../lib/ai/zai_provider");

          const batchPrompt = `For each article below, write a concise 1-2 sentence summary for an AI engineer. Return a JSON array of objects with "url" and "summary" fields.

${fetchedContent.map((c, i) => `Article ${i + 1} (${c.url}):\n${c.content.substring(0, 500)}`).join("\n\n")}

Respond with ONLY a JSON array: [{"url": "...", "summary": "..."}]`;

          const summaryResult = await generateText({
            model: zaiFlash(),
            prompt: batchPrompt,
          });

          const jsonMatch = summaryResult.text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const summaries = JSON.parse(jsonMatch[0]) as Array<{ url: string; summary: string }>;
            const summaryMap = new Map(summaries.map((s) => [s.url, s.summary]));
            for (const finding of cappedFindings) {
              const summary = summaryMap.get(finding.url);
              if (summary) {
                finding.summary = summary;
              }
            }
            console.log(`[generateDailyReport] Enriched ${summaries.length} findings with summaries`);
          }
        } catch (err) {
          console.warn("[generateDailyReport] Content enrichment summarization failed:", err);
        }
      }
    }

    // 5.5. AI summary generation for findings lacking summaries
    // Use individual LLM calls for high-quality 80-150 char summaries
    const findingsNeedingAiSummary = cappedFindings
      .filter((f) => !f.summary || f.summary.length < 50)
      .slice(0, 20); // Limit to top 20 to avoid excessive LLM calls

    if (findingsNeedingAiSummary.length > 0) {
      console.log(`[generateDailyReport] Generating AI summaries for ${findingsNeedingAiSummary.length} findings...`);

      for (const finding of findingsNeedingAiSummary) {
        try {
          const summary = await generateFindingSummary(ctx, finding);
          if (summary) {
            finding.summary = summary;
            console.log(`[generateDailyReport] Generated summary for "${finding.title.substring(0, 50)}..." (${summary.length} chars)`);
          }
        } catch (error) {
          // Summary generation failed - continue without it
          console.warn(`[generateDailyReport] Summary generation failed for "${finding.title.substring(0, 50)}...":`, error);
        }
      }

      const enrichedCount = findingsNeedingAiSummary.filter((f) => f.summary && f.summary.length >= 80).length;
      console.log(`[generateDailyReport] Successfully enriched ${enrichedCount}/${findingsNeedingAiSummary.length} findings with AI summaries`);
    }

    // 6. Generate markdown report using two-pass LLM synthesis with static fallback
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    console.log("[generateDailyReport] Generating report with LLM synthesis...");
    const synthesisResult = await llmSynthesizeReport(
      cappedFindings,
      days,
      periodStart,
      periodEnd
    );

    console.log(
      `[generateDailyReport] Report generated using method: ${synthesisResult.method}`
    );
    if (synthesisResult.error) {
      console.error("[generateDailyReport] LLM synthesis error:", synthesisResult.error);
    }

    const reportMarkdown = synthesisResult.markdown;

    // 6. Store document with embedding
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

    // 7. Create whatsNewReports entry
    console.log("[generateDailyReport] Creating report entry...");

    // Serialize tool suggestions for storage
    const toolSuggestionsJson = synthesisResult.toolSuggestions
      ? JSON.stringify(synthesisResult.toolSuggestions)
      : undefined;

    if (synthesisResult.toolSuggestions) {
      console.log(`[generateDailyReport] Storing ${synthesisResult.toolSuggestions.length} tool suggestions`);
    }

    const findingsJson = JSON.stringify(cappedFindings);

    const reportId = await ctx.runMutation(
      internal.whatsNew.mutations.createReport,
      {
        periodStart: periodStart.getTime(),
        periodEnd: periodEnd.getTime(),
        days,
        focus: "all",
        discoveryOnly: false,
        findingsCount: cappedFindings.length,
        discoveryCount: discoveries.length,
        releaseCount: releases.length,
        trendCount: trends.length,
        reportPath: "", // Not using file paths, using documentId instead
        summaryJson: {
          topSources: Object.entries(
            cappedFindings.reduce(
              (acc, f) => {
                acc[f.source] = (acc[f.source] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            )
          ).sort((a, b) => b[1] - a[1]),
          // Extended metrics for UI display
          topEngagementVelocity,
          totalCorroborationCount,
          sources,
        },
        documentId: documentResult.documentId,
        toolSuggestionsJson,
        findingsJson,
      }
    );

    console.log(
      `[generateDailyReport] Complete! reportId=${reportId}, documentId=${documentResult.documentId}`
    );

    // Notify that a new What's New report is available
    await ctx.runMutation(internal.notifications.internal.create, {
      type: "whats_new",
      title: "What's New Report Ready",
      body: `Your daily AI digest is ready with ${cappedFindings.length} findings.`,
      route: `/whats-new/${reportId}`,
      referenceId: reportId,
    });

    // Add to subscription feed so it appears in the daily feed
    await ctx.runMutation(internal.feeds.internal.createFeedItem, {
      groupKey: `whats-new:${reportId}`,
      title: `AI Engineering Daily: ${cappedFindings.length} findings`,
      summary: `Discoveries: ${discoveries.length}, Releases: ${releases.length}, Trends: ${trends.length}`,
      contentType: "blog",
      itemCount: 1,
      itemIds: [],
      subscriptionIds: [],
      publishedAt: Date.now(),
      discoveredAt: Date.now(),
      createdAt: Date.now(),
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

// ============================================================================
// Backfill: Quality Re-Score Existing Reports
// ============================================================================

/**
 * Backfill quality scores on existing report findings.
 *
 * Iterates through all reports, parses findingsJson, runs LLM quality scoring,
 * filters out low-quality items, and updates the report.
 */
export const backfillQualityScores = internalAction({
  args: {
    skip: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    processed: number;
    updated: number;
    totalRemoved: number;
    hasMore: boolean;
  }> => {
    const skip = args.skip ?? 0;
    const dryRun = args.dryRun ?? false;

    console.log(
      `[backfillQualityScores] Starting batch (skip=${skip}, dryRun=${dryRun})`
    );

    const reports = await ctx.runQuery(
      internal.whatsNew.internal.getReportsForBackfill,
      { skip }
    );

    if (reports.length === 0) {
      console.log("[backfillQualityScores] No more reports to process");
      return { processed: 0, updated: 0, totalRemoved: 0, hasMore: false };
    }

    let updated = 0;
    let totalRemoved = 0;

    for (const report of reports) {
      if (!report.findingsJson) {
        console.log(`[backfillQualityScores] Report ${report._id} has no findingsJson, skipping`);
        continue;
      }

      let findings: Finding[];
      try {
        findings = JSON.parse(report.findingsJson);
      } catch {
        console.warn(`[backfillQualityScores] Failed to parse findingsJson for ${report._id}`);
        continue;
      }

      const before = findings.length;
      const scored = await scoreFindingsQuality(findings);
      const removed = before - scored.length;

      console.log(
        `[backfillQualityScores] Report ${report._id}: ${before} → ${scored.length} findings (removed ${removed})`
      );

      if (removed > 0 || scored.some((f) => f.qualityScore !== undefined)) {
        const discoveries = scored.filter((f) => f.category === "discovery").length;
        const releases = scored.filter((f) => f.category === "release").length;
        const trends = scored.filter((f) => f.category === "trend").length;

        if (!dryRun) {
          await ctx.runMutation(
            internal.whatsNew.mutations.updateReportFindings,
            {
              reportId: report._id,
              findingsJson: JSON.stringify(scored),
              findingsCount: scored.length,
              discoveryCount: discoveries,
              releaseCount: releases,
              trendCount: trends,
            }
          );
        }

        updated++;
        totalRemoved += removed;
      }
    }

    const hasMore = reports.length === 5;

    console.log(
      `[backfillQualityScores] Batch complete: ${reports.length} processed, ${updated} updated, ${totalRemoved} findings removed, hasMore=${hasMore}`
    );

    // Auto-continue to next batch if there are more
    if (hasMore) {
      console.log(`[backfillQualityScores] Scheduling next batch (skip=${skip + 5})`);
      await ctx.scheduler.runAfter(1000, internal.whatsNew.actions.backfillQualityScores, {
        skip: skip + 5,
        dryRun,
      });
    }

    return { processed: reports.length, updated, totalRemoved, hasMore };
  },
});
