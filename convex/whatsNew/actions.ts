/**
 * What's New Actions
 *
 * Server-side report generation with automatic caching.
 * Fetches from external APIs (Reddit, HN, GitHub, Dev.to, Lobsters, Bluesky, Twitter/X),
 * with Twitter/Bluesky accounts pulled dynamically from subscriptionSources.
 * Synthesizes into markdown, stores as document with embedding.
 */

"use node";

import { v } from "convex/values";
import { internalAction, action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { synthesizeReport as llmSynthesizeReport } from "./llm";

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
 * Fetch from Twitter/X via Jina Reader
 *
 * Uses Jina Reader (r.jina.ai) to scrape X profile pages.
 * Accepts dynamic account list from subscriptions.
 * Best-effort only - wraps all fetches in try/catch.
 */
async function fetchTwitter(days: number, accounts: Array<{ handle: string; name: string }>): Promise<FetchResult> {
  const findings: Finding[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Fallback to defaults if no subscription accounts configured yet
  const aiAccounts = accounts.length > 0
    ? accounts
    : [
        { handle: "AnthropicAI", name: "Anthropic" },
        { handle: "OpenAI", name: "OpenAI" },
        { handle: "cursor_ai", name: "Cursor" },
      ];

  for (const account of aiAccounts) {
    const cleanHandle = account.handle.replace(/^@/, '');

    try {
      const response = await fetch(`https://r.jina.ai/https://x.com/${cleanHandle}`, {
        headers: {
          "Accept": "text/plain",
          "User-Agent": "Holocron-WhatsNew/1.0",
          "X-Return-Format": "markdown",
        },
      });

      if (!response.ok) {
        console.error(`[fetchTwitter] HTTP ${response.status} for @${cleanHandle}`);
        continue;
      }

      const markdown = await response.text();

      // Parse tweets from the markdown output
      const tweets = parseTwitterProfileMarkdown(markdown, cleanHandle);

      for (const tweet of tweets) {
        // Filter tweets to AI coding/tools topics only
        const aiCodingKeywords = [
          'ai', 'llm', 'gpt', 'claude', 'gemini', 'model', 'agent', 'copilot',
          'coding', 'developer', 'dev', 'api', 'sdk', 'framework', 'release',
          'benchmark', 'inference', 'embedding', 'rag', 'cursor', 'vscode',
          'mcp', 'tool', 'launch', 'open source', 'opensource', 'prompt',
          'token', 'context', 'fine-tune', 'finetune', 'training', 'neural',
          'transformer', 'diffusion', 'multimodal', 'reasoning', 'agentic',
          'langchain', 'llamaindex', 'anthropic', 'openai', 'hugging face',
          'mistral', 'ollama', 'local llm', 'code gen', 'autocomplete',
        ];
        const tweetTextLower = tweet.title.toLowerCase();
        const isRelevant = aiCodingKeywords.some(kw => tweetTextLower.includes(kw));
        if (!isRelevant) continue;

        // We can't reliably get exact timestamps from profile scraping,
        // so include all visible tweets (they're recent by nature)
        findings.push({
          title: tweet.title,
          url: tweet.link,
          source: `Twitter/X (@${account.name || cleanHandle})`,
          category: "discussion",
          publishedAt: tweet.published,
          author: cleanHandle,
        });
      }
    } catch (error) {
      console.error(`[fetchTwitter] Error fetching @${cleanHandle}:`, error);
    }
  }

  return { source: "Twitter/X", findings };
}

/**
 * Parse tweet data from Jina Reader markdown output of an X profile page.
 */
function parseTwitterProfileMarkdown(markdown: string, _handle: string): Array<{
  title: string;
  link: string;
  published: string;
}> {
  const items: Array<{ title: string; link: string; published: string }> = [];

  // Strategy 1: Find tweet status URLs and extract surrounding text as content
  const lines = markdown.split('\n');
  let currentTweet = '';
  let currentLink = '';

  for (const line of lines) {
    const statusMatch = line.match(/https?:\/\/(?:x|twitter)\.com\/\w+\/status\/(\d+)/);
    if (statusMatch) {
      if (currentTweet.trim() && currentLink) {
        const title = currentTweet.trim().length > 200
          ? currentTweet.trim().substring(0, 200) + '...'
          : currentTweet.trim();
        if (title.length > 10) {
          items.push({
            title,
            link: currentLink,
            published: new Date().toISOString(),
          });
        }
      }
      currentTweet = '';
      currentLink = statusMatch[0];
      continue;
    }

    // Skip UI chrome and engagement metrics
    if (line.match(/^(Home|Explore|Messages|Notifications|Premium|Profile|More|Follow|Followers|Following|\d+[KMB]?\s+(replies|reposts|likes|views|bookmarks))/i)) continue;
    if (line.match(/^\s*[\d,.]+[KMB]?\s*$/)) continue;
    if (line.match(/^(Reply|Repost|Like|Share|Bookmark|More)\s*$/i)) continue;

    if (currentLink && line.trim()) {
      currentTweet += (currentTweet ? ' ' : '') + line.trim();
    }
  }

  // Don't forget the last tweet
  if (currentTweet.trim() && currentLink) {
    const title = currentTweet.trim().length > 200
      ? currentTweet.trim().substring(0, 200) + '...'
      : currentTweet.trim();
    if (title.length > 10) {
      items.push({
        title,
        link: currentLink,
        published: new Date().toISOString(),
      });
    }
  }

  // Strategy 2: Fallback - extract all tweet URLs with surrounding context
  if (items.length === 0) {
    const urlRegex = /https?:\/\/(?:x|twitter)\.com\/\w+\/status\/(\d+)/g;
    let match;
    while ((match = urlRegex.exec(markdown)) !== null) {
      const start = Math.max(0, match.index - 200);
      const context = markdown.substring(start, match.index).trim();
      const lastBlock = context.split(/\n\n/).pop()?.trim() || '';
      const title = lastBlock.length > 200
        ? lastBlock.substring(0, 200) + '...'
        : lastBlock;

      if (title.length > 10) {
        items.push({
          title,
          link: match[0],
          published: new Date().toISOString(),
        });
      }
    }
  }

  return items.slice(0, 25);
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
    // Normalize source to base name (e.g., "Twitter/X (@foo)" -> "Twitter/X")
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

    // 2. Fetch creator accounts from subscriptions for dynamic Twitter/Bluesky lists
    console.log("[generateDailyReport] Loading creator accounts from subscriptions...");
    const [twitterAccounts, blueskyAccounts] = await Promise.all([
      ctx.runQuery(internal.subscriptions.internal.getCreatorAccountsByPlatform, { platform: "twitter" }),
      ctx.runQuery(internal.subscriptions.internal.getCreatorAccountsByPlatform, { platform: "bluesky" }),
    ]);
    console.log(
      `[generateDailyReport] Found ${twitterAccounts.length} Twitter, ${blueskyAccounts.length} Bluesky accounts`
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
      fetchTwitter(days, twitterAccounts),
      fetchChangelog(days),
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

    // 3b. AI-score Twitter findings to filter noise
    const twitterFindings = allFindings.filter(f => f.source.startsWith("Twitter"));
    if (twitterFindings.length > 0) {
      try {
        const twitterScores = await ctx.runAction(
          internal.subscriptions.ai_scoring.scoreContentRelevance,
          {
            items: twitterFindings.map(f => ({
              title: f.title,
              platform: "twitter",
            })),
            sourceName: "Twitter/X",
            topic: "AI coding tools, agentic workflows, developer tooling",
          }
        );

        // Collect titles of low-scoring findings (score < 0.5)
        const lowScoredTitles = new Set<string>();
        for (let i = 0; i < twitterFindings.length; i++) {
          const scoreEntry = twitterScores[i];
          if (scoreEntry && scoreEntry.score < 0.5) {
            lowScoredTitles.add(twitterFindings[i].title);
          }
        }

        // Filter out low-scoring Twitter findings
        const beforeCount = allFindings.length;
        const filtered = allFindings.filter(
          f => !f.source.startsWith("Twitter") || !lowScoredTitles.has(f.title)
        );
        const removedCount = beforeCount - filtered.length;
        if (removedCount > 0) {
          console.log(`[generateDailyReport] AI-filtered ${removedCount} irrelevant Twitter findings`);
        }
        allFindings.length = 0;
        allFindings.push(...filtered);
      } catch (err) {
        console.warn("[generateDailyReport] Twitter AI scoring failed, keeping all:", err);
      }
    }

    // 4. Deduplicate and categorize
    const uniqueFindings = deduplicateFindings(allFindings);
    const cappedFindings = capFindingsPerSource(uniqueFindings, 15);
    const { discoveries, releases, trends, discussions } =
      categorizeFindings(cappedFindings);

    // Calculate extended metrics
    const topEngagementVelocity = calculateTopEngagementVelocity(cappedFindings);
    const totalCorroborationCount = calculateCorroboration(cappedFindings);
    const sources = extractSources(cappedFindings);

    console.log(
      `[generateDailyReport] ${cappedFindings.length} unique findings (${discoveries.length} discoveries, ${releases.length} releases, ${trends.length} trends, ${discussions.length} discussions)`
    );
    console.log(
      `[generateDailyReport] Extended metrics: topEngagementVelocity=${topEngagementVelocity}, totalCorroborationCount=${totalCorroborationCount}, sources=${sources.length}`
    );

    // 5. Generate markdown report using two-pass LLM synthesis with static fallback
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
