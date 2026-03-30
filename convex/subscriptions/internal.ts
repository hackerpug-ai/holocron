import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { readUrlWithJina, readUrlWithJinaAndLinks } from "../research/search.js";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

// ============================================================================
// Embedding Generation Helpers
// ============================================================================

/**
 * Generate embedding for subscription content title
 */
async function generateContentEmbedding(title: string): Promise<number[]> {
  const MAX_LENGTH = 2000;
  const truncated = title.slice(0, MAX_LENGTH);

  const { embedding } = await embed({
    model: cohereEmbedding,
    value: truncated,
  });

  return embedding;
}

/**
 * Generate embeddings in batch for multiple content items
 */
async function generateEmbeddingsBatch(titles: string[]): Promise<number[][]> {
  return await Promise.all(
    titles.map(title => generateContentEmbedding(title))
  );
}

// ============================================================================
// RSS Parser Helper
// ============================================================================

async function parseRSSFeed(url: string): Promise<Array<{
  title: string;
  link: string;
  published: string;
}>> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const text = await response.text();

  // Simple RSS/Atom parser
  const items: Array<{ title: string; link: string; published: string }> = [];
  const regex = /<entry[^>]*>[\s\S]*?<\/entry>|<item[^>]*>[\s\S]*?<\/item>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const entry = match[0];

    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch = entry.match(/<link[^>]*>([\s\S]*?)<\/link>/) ||
                      entry.match(/<link[^>]*href=['"]([^'"]*)['"]/) ||
                      entry.match(/<id[^>]*>([\s\S]*?)<\/id>/);
    const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/) ||
                         entry.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) ||
                         entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);

    let title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Unknown';
    // Handle CDATA
    title = title.replace(/^<!\[CDATA\[|\]\]>$/g, '');

    const link = linkMatch ? (linkMatch[2] || linkMatch[1]).replace(/<[^>]*>/g, '').trim() : '';
    const published = publishedMatch ? publishedMatch[1].trim() : new Date().toISOString();

    if (link) {
      items.push({ title, link, published });
    }
  }
  return items;
}

// ============================================================================
// Relevancy Filter
// ============================================================================

interface RelevancyRule {
  _id: string;
  sourceId: string | null;
  sourceType: string | null;
  ruleName: string;
  ruleType: string;
  ruleValue: any;
  weight: number;
}

function calculateRelevancyScore(
  content: { title: string; redditScore?: number; published?: string },
  rules: RelevancyRule[]
): { score: number; reason: string } {
  const title = content.title.toLowerCase();
  let score = 0.5;
  let reason = "neutral";

  // Blacklist hard fails
  for (const rule of rules) {
    if (rule.ruleType === 'keyword_blacklist') {
      const keywords = rule.ruleValue as string[];
      for (const kw of keywords) {
        if (title.includes(kw.toLowerCase())) {
          return { score: 0, reason: `Blacklist match: '${kw}'` };
        }
      }
    }
  }

  // Min score threshold
  const minScoreRule = rules.find(r => r.ruleType === 'min_score');
  if (minScoreRule && content.redditScore !== undefined) {
    const minScore = parseFloat(minScoreRule.ruleValue);
    if (content.redditScore < minScore) {
      return { score: 0, reason: `Below min score (${content.redditScore} < ${minScore})` };
    }
  }

  // Max age threshold
  const maxAgeRule = rules.find(r => r.ruleType === 'max_age_hours');
  if (maxAgeRule && content.published) {
    const maxAge = parseFloat(maxAgeRule.ruleValue);
    const contentAge = (Date.now() - new Date(content.published).getTime()) / 3600000;
    if (contentAge > maxAge) {
      return { score: 0, reason: `Too old (${Math.round(contentAge)}h > ${maxAge}h)` };
    }
  }

  // Whitelist boosts
  for (const rule of rules) {
    if (rule.ruleType === 'keyword_whitelist') {
      const keywords = rule.ruleValue as string[];
      for (const kw of keywords) {
        if (title.includes(kw.toLowerCase())) {
          score = Math.min(1.0, score + 0.2);
          reason = `Whitelist match: '${kw}'`;
        }
      }
    }
  }

  return { score, reason };
}

// ============================================================================
// AI Relevance Scoring
// ============================================================================


// ============================================================================
// Source Fetchers
// ============================================================================

/**
 * Fetch YouTube videos with in-memory duplicate checking.
 * @param existingIds - Set of contentIds that already exist for this source
 */
async function fetchYouTube(
  source: any,
  filter: RelevancyRule[],
  existingIds: Set<string>
): Promise<Array<{
  sourceId: string;
  contentId: string;
  title: string;
  url: string;
  relevancyScore: number;
  relevancyReason: string;
  passedFilter: boolean;
}>> {
  const feedUrl = source.feedUrl;
  if (!feedUrl) return [];

  const items = await parseRSSFeed(feedUrl);
  const newItems: any[] = [];

  for (const entry of items.slice(0, 10)) {
    const videoId = entry.link.split('v=')[1]?.split('&')[0] || entry.link.split('/').pop() || '';

    // Check if already exists (in-memory, O(1))
    if (existingIds.has(videoId)) continue;

    newItems.push({
      sourceId: source._id,
      contentId: videoId,
      title: entry.title,
      url: entry.link,
      relevancyScore: 0.7,
      relevancyReason: "trusted_source",
      passedFilter: true,
    });
  }

  return newItems;
}

async function fetchNewsletter(
  source: any,
  filter: RelevancyRule[],
  existingIds: Set<string>
): Promise<any[]> {
  const feedUrl = source.feedUrl;
  if (!feedUrl) return [];

  const items = await parseRSSFeed(feedUrl);
  const newItems: any[] = [];

  for (const entry of items.slice(0, 5)) {
    const contentId = entry.link.split('/').filter(Boolean).pop() || entry.link;

    // Check if already exists (in-memory, O(1))
    if (existingIds.has(contentId)) continue;

    newItems.push({
      sourceId: source._id,
      contentId,
      title: entry.title,
      url: entry.link,
      relevancyScore: 0.8,
      relevancyReason: "trusted_newsletter",
      passedFilter: true,
    });
  }

  return newItems;
}

// ============================================================================
// Blog Scraping Helpers
// ============================================================================

/**
 * Extract markdown links from content: [text](url)
 */
function _extractMarkdownLinks(markdown: string): Array<{ title: string; url: string }> {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ title: string; url: string }> = [];
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    links.push({ title: match[1], url: match[2] });
  }
  return links;
}

/**
 * Check if URL is likely a blog article (not navigation/static pages)
 */
function isLikelyArticle(link: { url: string }, baseUrl: string): boolean {
  try {
    const url = new URL(link.url, baseUrl);
    const base = new URL(baseUrl);

    // Same domain only
    if (url.hostname !== base.hostname) return false;

    // Skip common non-article paths
    const skipPaths = [
      '/about', '/contact', '/privacy', '/terms', '/login', '/signup',
      '/tag/', '/category/', '/author/', '/page/', '/feed', '/rss',
      '/search', '/subscribe', '/newsletter', '/podcast', '/events'
    ];
    const pathname = url.pathname.toLowerCase();
    if (skipPaths.some(p => pathname.includes(p))) return false;

    // Must have path depth (not just homepage)
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 1) return false;

    // Skip if it's just a hash link
    if (link.url.startsWith('#')) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate stable content ID from URL
 */
function generateContentId(url: string): string {
  try {
    const parsed = new URL(url);
    // Use pathname as ID, strip trailing slash
    return parsed.pathname.replace(/\/$/, '') || 'home';
  } catch {
    // Fallback to URL hash
    return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 100);
  }
}

/**
 * Fetch blog articles by scraping the blog homepage with Jina Reader.
 * @param existingIds - Set of contentIds that already exist for this source
 */
async function fetchBlog(
  source: any,
  filter: RelevancyRule[],
  existingIds: Set<string>
): Promise<any[]> {
  const url = source.url;
  if (!url) {
    return [];
  }

  // Use Jina Reader to get blog homepage content with links
  const homepage = await readUrlWithJinaAndLinks(url, 30000, 50000);
  if (!homepage.success) {
    console.log(`[fetchBlog] Failed to read ${url}: ${homepage.error}`);
    return [];
  }

  // Convert structured links to the format expected by isLikelyArticle
  const links = homepage.links.map(link => ({
    title: link.text,
    url: link.url
  }));

  // Filter to same-domain links likely to be articles
  const articleLinks = links.filter(link => isLikelyArticle(link, url));

  // Check each link against existing content (limit to first 10)
  const newItems: any[] = [];
  for (const link of articleLinks.slice(0, 10)) {
    // Resolve relative URLs
    let fullUrl: string;
    try {
      fullUrl = new URL(link.url, url).toString();
    } catch {
      continue;
    }

    const contentId = generateContentId(fullUrl);

    // Check if already exists (in-memory, O(1))
    if (existingIds.has(contentId)) continue;

    // Apply relevancy filter
    const content = { title: link.title };
    const { score, reason } = calculateRelevancyScore(content, filter);

    // Skip if blacklisted
    if (score < 0.1) continue;

    newItems.push({
      sourceId: source._id,
      contentId,
      title: link.title,
      url: fullUrl,
      relevancyScore: Math.max(score, 0.7), // Boost since it's a trusted source
      relevancyReason: reason === "neutral" ? "blog_article" : reason,
      passedFilter: true,
    });
  }

  return newItems;
}

async function fetchReddit(
  source: any,
  filter: RelevancyRule[],
  existingIds: Set<string>
): Promise<any[]> {
  const subreddit = source.identifier.replace('r/', '');
  const feedUrl = `https://www.reddit.com/r/${subreddit}/new/.rss`;

  const items = await parseRSSFeed(feedUrl);
  const newItems: any[] = [];

  for (const entry of items.slice(0, 25)) {
    const postId = entry.link.split('/').slice(-2, -1)[0];

    // Check if already exists (in-memory, O(1))
    if (existingIds.has(postId)) continue;

    const content = {
      title: entry.title,
      redditScore: 0,
      published: entry.published,
    };

    const { score, reason } = calculateRelevancyScore(content, filter);

    if (score < 0.3) continue;

    newItems.push({
      sourceId: source._id,
      contentId: postId,
      title: entry.title,
      url: entry.link,
      relevancyScore: score,
      relevancyReason: reason,
      passedFilter: true,
    });
  }

  return newItems;
}

async function fetchChangelog(
  source: any,
  filter: RelevancyRule[],
  existingIds: Set<string>
): Promise<any[]> {
  const identifier = source.identifier;
  const [owner, repo] = identifier.includes('/') ? identifier.split('/', 2) : ['anthropics', identifier];

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`;

  const response = await fetch(apiUrl, {
    headers: { "User-Agent": "Holocron-Subscription-Fetch" },
  });

  if (!response.ok) return [];

  const releases = await response.json();
  const newItems: any[] = [];

  for (const release of releases) {
    if (release.draft) continue;

    const tagOrId = release.tag_name || release.id;

    // Check if already exists (in-memory, O(1))
    if (existingIds.has(tagOrId)) continue;

    newItems.push({
      sourceId: source._id,
      contentId: tagOrId,
      title: release.name || tagOrId,
      url: release.html_url,
      relevancyScore: 0.8,
      relevancyReason: "changelog_release",
      passedFilter: true,
    });
  }

  return newItems;
}

// ============================================================================
// Creator Platform Fetchers
// ============================================================================

interface CreatorConfig {
  platforms?: {
    twitter?: string;
    bluesky?: string;
    youtube?: string;
    github?: string;
  };
}

/**
 * Fetch posts from Twitter/X via Jina Reader
 *
 * Jina Reader (r.jina.ai) converts web pages to clean markdown.
 * We fetch the user's X profile page and parse visible tweets from the output.
 */
async function fetchTwitterViaJina(handle: string): Promise<Array<{
  title: string;
  link: string;
  published: string;
  platform: string;
}>> {
  const cleanHandle = handle.replace(/^@/, '');
  const targetUrl = `https://x.com/${cleanHandle}`;

  try {
    const response = await fetch(`https://r.jina.ai/${targetUrl}`, {
      headers: {
        "Accept": "text/plain",
        "User-Agent": "Holocron/1.0",
        "X-Return-Format": "markdown",
      },
    });

    if (!response.ok) {
      console.error(`[fetchTwitterViaJina] HTTP ${response.status} for @${cleanHandle}`);
      return [];
    }

    const markdown = await response.text();
    return parseTwitterMarkdown(markdown, cleanHandle);
  } catch (error) {
    console.error(`[fetchTwitterViaJina] Error fetching @${cleanHandle}:`, error);
    return [];
  }
}

/**
 * Parse tweet data from Jina Reader markdown output of an X profile page.
 *
 * Jina renders X profiles as markdown with tweet text blocks.
 * We extract individual tweets by looking for patterns in the output.
 */
function parseTwitterMarkdown(markdown: string, _handle: string): Array<{
  title: string;
  link: string;
  published: string;
  platform: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    published: string;
    platform: string;
  }> = [];

  // Split by common tweet separators in Jina markdown output
  // Tweets typically appear as text blocks separated by --- or blank lines
  // with metadata like timestamps and engagement counts
  const lines = markdown.split('\n');
  let currentTweet = '';
  let currentLink = '';

  for (const line of lines) {
    // Look for tweet links (x.com/{handle}/status/{id})
    const statusMatch = line.match(/https?:\/\/(?:x|twitter)\.com\/\w+\/status\/(\d+)/);
    if (statusMatch) {
      // If we have a pending tweet, save it
      if (currentTweet.trim() && currentLink) {
        const title = currentTweet.trim().length > 200
          ? currentTweet.trim().substring(0, 200) + '...'
          : currentTweet.trim();
        if (title.length > 10) { // Skip very short fragments
          // Skip "unavailable" placeholder tweets
          if (!isUnavailableTweet(title)) {
            items.push({
              title,
              link: currentLink,
              published: new Date().toISOString(), // X doesn't expose exact timestamps in profile view
              platform: 'twitter',
            });
          }
        }
      }
      currentTweet = '';
      currentLink = statusMatch[0];
      continue;
    }

    // Skip navigation/UI elements and engagement metrics
    if (line.match(/^(Home|Explore|Messages|Notifications|Premium|Profile|More|Follow|Followers|Following|\d+[KMB]?\s+(replies|reposts|likes|views|bookmarks))/i)) continue;
    if (line.match(/^\s*[\d,.]+[KMB]?\s*$/)) continue; // Pure numbers (engagement counts)
    if (line.match(/^(Reply|Repost|Like|Share|Bookmark|More)\s*$/i)) continue;

    // Accumulate tweet text
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
      // Skip "unavailable" placeholder tweets
      if (!isUnavailableTweet(title)) {
        items.push({
          title,
          link: currentLink,
          published: new Date().toISOString(),
          platform: 'twitter',
        });
      }
    }
  }

  // Fallback: if structured parsing found nothing, extract any tweet URLs
  // and use surrounding text as titles
  if (items.length === 0) {
    const urlRegex = /https?:\/\/(?:x|twitter)\.com\/\w+\/status\/(\d+)/g;
    let match;
    while ((match = urlRegex.exec(markdown)) !== null) {
      // Grab surrounding context (100 chars before the URL)
      const start = Math.max(0, match.index - 200);
      const context = markdown.substring(start, match.index).trim();
      const lastBlock = context.split(/\n\n/).pop()?.trim() || '';
      const title = lastBlock.length > 200
        ? lastBlock.substring(0, 200) + '...'
        : lastBlock;

      if (title.length > 10) {
        // Skip "unavailable" placeholder tweets
        if (!isUnavailableTweet(title)) {
          items.push({
            title,
            link: match[0],
            published: new Date().toISOString(),
            platform: 'twitter',
          });
        }
      }
    }
  }

  return items.slice(0, 25); // Cap at 25 tweets
}

/**
 * Returns true if the given text matches known "unavailable" tweet placeholder patterns.
 * Used to filter out Twitter/X placeholder messages that appear when a tweet is deleted
 * or made unavailable.
 */
function isUnavailableTweet(text: string): boolean {
  return (
    /this post is unavailable/i.test(text) ||
    /this tweet is unavailable/i.test(text) ||
    /content is not available/i.test(text)
  );
}

/**
 * Fetch posts from Bluesky via AT Protocol
 */
async function fetchBlueskyFeed(handle: string): Promise<Array<{
  title: string;
  link: string;
  published: string;
  platform: string;
}>> {
  // Handle can be either a DID or a handle like "user.bsky.social"
  const actor = handle.includes('.') ? handle : `${handle}.bsky.social`;

  try {
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=25`,
      {
        headers: { "Accept": "application/json" },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const items: Array<{
      title: string;
      link: string;
      published: string;
      platform: string;
    }> = [];

    for (const feedItem of data.feed || []) {
      const post = feedItem.post;
      if (!post) continue;

      // Extract text from post record
      const text = post.record?.text || '';
      const title = text.length > 100 ? text.substring(0, 100) + '...' : text;

      // Build the post URL
      const uri = post.uri; // at://did:plc:xxx/app.bsky.feed.post/xxx
      const parts = uri.split('/');
      const did = parts[2];
      const rkey = parts[parts.length - 1];
      const link = `https://bsky.app/profile/${did}/post/${rkey}`;

      items.push({
        title,
        link,
        published: post.record?.createdAt || new Date().toISOString(),
        platform: 'bluesky',
      });
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Fetch videos from YouTube via RSS
 */
async function fetchYouTubeCreatorRSS(handle: string): Promise<Array<{
  title: string;
  link: string;
  published: string;
  platform: string;
}>> {
  // Clean up handle
  const cleanHandle = handle.replace(/^@/, '');

  // Try channel handle URL first
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?user=${cleanHandle}`;

  try {
    const items = await parseRSSFeed(feedUrl);
    return items.map(item => ({
      ...item,
      platform: 'youtube',
    }));
  } catch {
    // YouTube doesn't support @handle RSS directly
    // Users should provide channel URLs in feedUrl field
    return [];
  }
}

/**
 * Fetch public events from GitHub
 */
async function fetchGitHubEvents(username: string): Promise<Array<{
  title: string;
  link: string;
  published: string;
  platform: string;
}>> {
  try {
    const response = await fetch(
      `https://api.github.com/users/${username}/events/public?per_page=30`,
      {
        headers: { "User-Agent": "Holocron-Subscription-Fetch" },
      }
    );

    if (!response.ok) return [];

    const events = await response.json();
    const items: Array<{
      title: string;
      link: string;
      published: string;
      platform: string;
    }> = [];

    for (const event of events) {
      let title = '';
      let link = '';

      switch (event.type) {
        case 'PushEvent': {
          const commits = event.payload?.commits || [];
          if (commits.length > 0) {
            title = `Pushed ${commits.length} commit(s) to ${event.repo?.name}`;
            link = `https://github.com/${event.repo?.name}/commits`;
          }
          break;
        }
        case 'ReleaseEvent': {
          const release = event.payload?.release;
          if (release) {
            title = `Released ${release.tag_name} of ${event.repo?.name}`;
            link = release.html_url;
          }
          break;
        }
        case 'CreateEvent':
          if (event.payload?.ref_type === 'repository') {
            title = `Created repository ${event.repo?.name}`;
            link = `https://github.com/${event.repo?.name}`;
          } else if (event.payload?.ref_type === 'tag') {
            title = `Created tag ${event.payload?.ref} in ${event.repo?.name}`;
            link = `https://github.com/${event.repo?.name}/releases/tag/${event.payload?.ref}`;
          }
          break;
        case 'PublicEvent':
          title = `Made ${event.repo?.name} public`;
          link = `https://github.com/${event.repo?.name}`;
          break;
        case 'IssuesEvent': {
          const issue = event.payload?.issue;
          if (issue && event.payload?.action === 'opened') {
            title = `Opened issue: ${issue.title}`;
            link = issue.html_url;
          }
          break;
        }
        case 'PullRequestEvent': {
          const pr = event.payload?.pull_request;
          if (pr && event.payload?.action === 'opened') {
            title = `Opened PR: ${pr.title}`;
            link = pr.html_url;
          }
          break;
        }
      }

      if (title && link) {
        items.push({
          title,
          link,
          published: event.created_at,
          platform: 'github',
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Fetch content from all platforms configured for a creator.
 * @param existingIds - Set of contentIds that already exist for this source
 */
async function fetchCreator(
  source: any,
  filter: RelevancyRule[],
  existingIds: Set<string>
): Promise<any[]> {
  const config: CreatorConfig = source.configJson || {};
  const platforms = config.platforms || {};
  const allItems: any[] = [];

  // Fetch from each configured platform in parallel
  const fetchPromises: Promise<Array<{
    title: string;
    link: string;
    published: string;
    platform: string;
  }>>[] = [];

  if (platforms.twitter) {
    fetchPromises.push(fetchTwitterViaJina(platforms.twitter));
  }
  if (platforms.bluesky) {
    fetchPromises.push(fetchBlueskyFeed(platforms.bluesky));
  }
  if (platforms.youtube) {
    fetchPromises.push(fetchYouTubeCreatorRSS(platforms.youtube));
  }
  if (platforms.github) {
    fetchPromises.push(fetchGitHubEvents(platforms.github));
  }

  const results = await Promise.all(fetchPromises);
  const platformItems = results.flat();

  // Deduplicate by URL and build candidate list
  const seenUrls = new Set<string>();
  type Candidate = {
    item: { title: string; link: string; published: string; platform: string };
    contentId: string;
    keywordScore: number;
  };
  const candidates: Candidate[] = [];

  for (const item of platformItems) {
    if (seenUrls.has(item.link)) continue;
    seenUrls.add(item.link);

    // Create a unique content ID from platform + URL
    const contentId = `${item.platform}:${item.link.split('/').pop() || item.link}`;

    // Check if already exists (in-memory, O(1))
    if (existingIds.has(contentId)) continue;

    // Apply keyword relevancy filter (hard blacklist / age / min-score gates)
    const content = {
      title: item.title,
      published: item.published,
    };
    const { score } = calculateRelevancyScore(content, filter);

    // For trusted creators, lower the hard-fail threshold
    if (score < 0.2) continue;

    candidates.push({ item, contentId, keywordScore: score });
  }

  for (const { item, contentId, keywordScore } of candidates) {
    allItems.push({
      sourceId: source._id,
      contentId,
      title: item.title,
      url: item.link,
      relevancyScore: Math.max(keywordScore, 0.6), // Boost score for trusted creators
      relevancyReason: `creator_${item.platform}`,
      passedFilter: true,
      metadataJson: {
        platform: item.platform,
        creatorName: source.name,
        publishedAt: item.published,
      },
    });
  }

  return allItems;
}

// ============================================================================
// Queries
// ============================================================================

export const getActiveSources = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db
      .query("subscriptionSources")
      .withIndex("by_auto_research", (q) => q.eq("autoResearch", true))
      .collect();

    return sources;
  },
});

/**
 * Get creator subscription accounts by platform.
 * Used by What's New to dynamically pull Twitter/Bluesky accounts
 * instead of hardcoding them.
 */
export const getCreatorAccountsByPlatform = internalQuery({
  args: {
    platform: v.union(
      v.literal("twitter"),
      v.literal("bluesky"),
      v.literal("youtube"),
      v.literal("github")
    ),
  },
  handler: async (ctx, args) => {
    const creators = await ctx.db
      .query("subscriptionSources")
      .withIndex("by_type", (q) => q.eq("sourceType", "creator"))
      .collect();

    // Filter to creators that have the requested platform configured
    return creators
      .filter((c) => {
        const config = (c.configJson as CreatorConfig) || {};
        return config.platforms?.[args.platform];
      })
      .map((c) => {
        const config = (c.configJson as CreatorConfig) || {};
        return {
          handle: config.platforms![args.platform]!,
          name: c.name,
          tier: (c.configJson as any)?.tier || 3,
        };
      });
  },
});

export const getContentBySourceAndId = internalQuery({
  args: {
    sourceId: v.id("subscriptionSources"),
    contentId: v.string(),
  },
  handler: async (ctx, args) => {
    const content = await ctx.db
      .query("subscriptionContent")
      .withIndex("by_source_content", (q) =>
        q.eq("sourceId", args.sourceId).eq("contentId", args.contentId)
      )
      .first();

    return content;
  },
});

export const getFiltersForSource = internalQuery({
  args: {
    sourceId: v.id("subscriptionSources"),
    sourceType: v.string(),
  },
  handler: async (ctx, args) => {
    const filters = await ctx.db
      .query("subscriptionFilters")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    // Also get global filters for this type
    const globalFilters = await ctx.db
      .query("subscriptionFilters")
      .withIndex("by_type", (q) => q.eq("sourceType", args.sourceType))
      .collect();

    return [...filters, ...globalFilters];
  },
});

export const getQueuedContent = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptionContent")
      .withIndex("by_status", (q) => q.eq("researchStatus", "queued"))
      .order("asc") // Oldest first (FIFO)
      .take(args.limit);
  },
});

/**
 * Patch a creator's configJson (used for fixing bad handles).
 */
export const patchCreatorConfig = internalMutation({
  args: {
    id: v.id("subscriptionSources"),
    configJson: v.any(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { configJson: args.configJson, updatedAt: Date.now() };
    if (args.url) updates.url = args.url;
    await ctx.db.patch(args.id, updates);
  },
});

export const getSource = internalQuery({
  args: {
    id: v.id("subscriptionSources"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// Mutations
// ============================================================================

const SOURCE_TYPE_TO_CATEGORY: Record<string, string> = {
  youtube: "video",
  reddit: "social",
  newsletter: "article",
  changelog: "article",
  blog: "article",
  twitter: "social",
  bluesky: "social",
  ebay: "blog",
  "whats-new": "article",
};

/**
 * Derive content category from URL when sourceType is generic (e.g. "creator").
 * Falls back to "social" for creator types since most are Twitter/X accounts.
 */
function deriveCategoryFromUrl(url: string, sourceType: string): string {
  if (SOURCE_TYPE_TO_CATEGORY[sourceType]) return SOURCE_TYPE_TO_CATEGORY[sourceType];
  if (url.includes("twitter.com") || url.includes("x.com")) return "social";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "video";
  if (url.includes("reddit.com")) return "social";
  if (url.includes("bsky.app") || url.includes("bluesky")) return "social";
  if (sourceType === "creator") return "social"; // Most creators are social accounts
  return "article";
}

export const insertContent = internalMutation({
  args: {
    sourceId: v.id("subscriptionSources"),
    contentId: v.string(),
    title: v.string(),
    url: v.string(),
    relevancyScore: v.number(),
    relevancyReason: v.string(),
    passedFilter: v.boolean(),
    metadataJson: v.optional(v.any()),
    embedding: v.optional(v.array(v.float64())),
    contentCategory: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    duration: v.optional(v.number()),
    aiRelevanceScore: v.optional(v.number()),
    aiRelevanceReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("subscriptionContent", {
      sourceId: args.sourceId,
      contentId: args.contentId,
      title: args.title,
      url: args.url,
      metadataJson: args.metadataJson,
      passedFilter: args.passedFilter,
      filterReason: args.passedFilter ? args.relevancyReason : undefined,
      researchStatus: args.passedFilter ? "queued" : "skipped",
      discoveredAt: now,
      researchedAt: undefined,
      embedding: args.embedding,
      inFeed: false,
      contentCategory: args.contentCategory,
      thumbnailUrl: args.thumbnailUrl,
      authorHandle: args.authorHandle,
      duration: args.duration,
      aiRelevanceScore: args.aiRelevanceScore,
      aiRelevanceReason: args.aiRelevanceReason,
    });

    return id;
  },
});

export const updateSourceLastChecked = internalMutation({
  args: {
    sourceId: v.id("subscriptionSources"),
    lastChecked: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, { lastChecked: args.lastChecked });
  },
});

export const updateContentResearchStatus = internalMutation({
  args: {
    contentId: v.id("subscriptionContent"),
    status: v.union(v.literal("researched"), v.literal("skipped")),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const updates: {
      researchStatus: "researched" | "skipped";
      researchedAt: number;
      documentId?: typeof args.documentId;
    } = {
      researchStatus: args.status,
      researchedAt: Date.now(),
    };

    // Link to document if provided (only for researched status)
    if (args.documentId) {
      updates.documentId = args.documentId;
    }

    await ctx.db.patch(args.contentId, updates);
  },
});

export const createDocumentFromContent = internalMutation({
  args: {
    title: v.string(),
    content: v.string(),
    category: v.string(),
    status: v.optional(v.string()),
    date: v.optional(v.string()),
    researchType: v.optional(v.string()),
    filePath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Process a single subscription source with error isolation.
 * Uses in-memory duplicate checking to avoid per-item database queries.
 *
 * @param source - The subscription source to process
 * @param existingContentMap - Map of sourceId -> contentId[] for all existing content
 * @param ctx - Convex action context
 * @returns Result object with success status and metrics
 */
async function processSingleSource(
  source: any,
  existingContentMap: Record<string, string[]>,
  ctx: any
): Promise<{
  sourceId: any;
  identifier: string;
  success: boolean;
  error?: string;
  itemsFetched: number;
  itemsQueued: number;
}> {
  const sourceIdStr = source._id.toString();
  const existingIds = new Set(existingContentMap[sourceIdStr] || []);

  // Get filters for this source
  const dbFilters = await ctx.runQuery(internal.subscriptions.internal.getFiltersForSource, {
    sourceId: source._id,
    sourceType: source.sourceType,
  });

  // Map database filters to RelevancyRule format
  const filters = dbFilters.map((f: typeof dbFilters[number]) => ({
    ruleName: f.ruleName,
    ruleType: f.ruleType,
    ruleValue: f.ruleValue,
    weight: f.weight,
    sourceId: f.sourceId?.toString() ?? null,
  }));

  // Route to appropriate fetcher based on source type
  const fetchFn = getSourceFetcher(source.sourceType);
  if (!fetchFn) {
    return {
      sourceId: source._id,
      identifier: source.identifier,
      success: false,
      error: `Unknown source type: ${source.sourceType}`,
      itemsFetched: 0,
      itemsQueued: 0,
    };
  }

  // Fetch items (fetchers use in-memory duplicate checking)
  const items = await fetchFn(source, filters, existingIds);

  // AI relevance scoring for creator sources (runs in separate Node.js action)
  if (source.sourceType === 'creator' && items.length > 0) {
    const config = (source.configJson || {}) as Record<string, unknown>;
    const topic = (config.topic as string) || (config.category as string) || "general tech";
    try {
      const aiScores = await ctx.runAction(
        internal.subscriptions.ai_scoring.scoreContentRelevance,
        {
          items: items.map((item: any) => ({
            title: item.title,
            platform: (item.metadataJson as Record<string, unknown>)?.platform as string || "unknown",
          })),
          sourceName: source.name ?? source.identifier ?? "unknown",
          topic,
        }
      );
      for (let i = 0; i < items.length; i++) {
        const aiScore = aiScores[i];
        if (aiScore) {
          items[i].aiRelevanceScore = aiScore.score;
          items[i].aiRelevanceReason = aiScore.reason;

          // Stricter threshold for twitter/bluesky — most social posts are noise
          const platform = ((items[i].metadataJson as Record<string, unknown>)?.platform as string || "").toLowerCase();
          const threshold = (platform === 'twitter' || platform === 'bluesky') ? 0.5 : 0.3;

          if (aiScore.score < threshold) {
            items[i].passedFilter = false;
          }
        }
      }
    } catch (err) {
      console.warn("[checkAllSubscriptions] AI scoring failed, using keyword scores:", err);
    }
  }

  // Generate embeddings in batch for all items
  const titles = items.map(item => item.title);
  const embeddings = await generateEmbeddingsBatch(titles);

  // Insert new items into database with embeddings
  let queued = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const meta = item.metadataJson as Record<string, unknown> | undefined;
    const thumbnailUrl = (meta?.thumbnailUrl ?? meta?.thumbnail ?? meta?.image) as string | undefined;
    const duration = meta?.duration as number | undefined;
    await ctx.runMutation(internal.subscriptions.internal.insertContent, {
      sourceId: item.sourceId,
      contentId: item.contentId,
      title: item.title,
      url: item.url,
      relevancyScore: item.relevancyScore,
      relevancyReason: item.relevancyReason,
      passedFilter: item.passedFilter,
      metadataJson: item.metadataJson,
      embedding: embeddings[i],
      contentCategory: deriveCategoryFromUrl(item.url, source.sourceType),
      thumbnailUrl,
      authorHandle: source.name ?? source.identifier,
      duration,
      aiRelevanceScore: item.aiRelevanceScore,
      aiRelevanceReason: item.aiRelevanceReason,
    });
    if (item.passedFilter) queued++;

    // TR-006: Create transcript job for YouTube videos (fire-and-forget)
    if (source.sourceType === 'youtube') {
      try {
        const result = await ctx.runMutation(internal.transcripts.mutations.createTranscriptJob, {
          contentId: item.contentId,
          sourceUrl: item.url,
          priority: 5, // Medium priority
        });
        if (result.created) {
          console.log(`[TR-006] Created transcript job for YouTube video ${item.contentId}`);
        }
      } catch (error) {
        // Don't block video discovery if transcript job creation fails
        console.error(`[TR-006] Failed to create transcript job for ${item.contentId}:`, error);
      }
    }
  }

  // Update last_checked timestamp
  await ctx.runMutation(internal.subscriptions.internal.updateSourceLastChecked, {
    sourceId: source._id,
    lastChecked: Date.now(),
  });

  return {
    sourceId: source._id,
    identifier: source.identifier,
    success: true,
    itemsFetched: items.length,
    itemsQueued: queued,
  };
}

/**
 * Get the appropriate fetcher function for a given source type.
 * Returns null for unsupported source types.
 */
function getSourceFetcher(sourceType: string): ((source: any, filters: any[], existingIds: Set<string>) => Promise<any[]>) | null {
  switch (sourceType) {
    case 'youtube':
      return fetchYouTube;
    case 'newsletter':
      // Note: newsletter sources may use either RSS (fetchNewsletter) or blog scraping (fetchBlog)
      // This is handled in checkAllSubscriptions by checking feedUrl vs url
      return null; // Special case handled in caller
    case 'reddit':
      return fetchReddit;
    case 'changelog':
      return fetchChangelog;
    case 'creator':
      return fetchCreator;
    default:
      return null;
  }
}

// ============================================================================
// Main Cron Action
// ============================================================================

export const checkAllSubscriptions = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    sourcesChecked: number;
    totalFetched: number;
    totalQueued: number;
    errors: Array<{ source: string; error: string }>;
    durationMs: number;
  }> => {
    const startTime = Date.now();

    // Batch fetch all existing content for duplicate checking (1 query instead of N queries)
    const existingContentMap = await ctx.runQuery(
      api.subscriptions.queries.batchGetExistingContent,
      {}
    );

    // Get all active sources
    const sources = await ctx.runQuery(internal.subscriptions.internal.getActiveSources);

    // Process all sources in parallel with error isolation
    const processingPromises = sources.map(async (source: typeof sources[number]) => {
      try {
        // Special handling for newsletter sources (RSS vs blog scraping)
        if (source.sourceType === 'newsletter') {
          const sourceIdStr = source._id.toString();
          const existingIds = new Set<string>((existingContentMap as Record<string, string[]>)[sourceIdStr] || []);

          // Get filters
          const dbFilters = await ctx.runQuery(internal.subscriptions.internal.getFiltersForSource, {
            sourceId: source._id,
            sourceType: source.sourceType,
          });

          const filters: RelevancyRule[] = dbFilters.map((f: typeof dbFilters[number]) => ({
            _id: f._id.toString(),
            sourceType: null,
            ruleName: f.ruleName,
            ruleType: f.ruleType,
            ruleValue: f.ruleValue,
            weight: f.weight,
            sourceId: f.sourceId?.toString() ?? null,
          }));

          // Try RSS feed first, fall back to blog scraping
          const items = source.feedUrl
            ? await fetchNewsletter(source, filters, existingIds)
            : source.url
            ? await fetchBlog(source, filters, existingIds)
            : [];

          // Generate embeddings in batch for all items
          const titles = items.map(item => item.title);
          const embeddings = await generateEmbeddingsBatch(titles);

          // Insert items with embeddings
          let queued = 0;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const meta = item.metadataJson as Record<string, unknown> | undefined;
            const thumbnailUrl = (meta?.thumbnailUrl ?? meta?.thumbnail ?? meta?.image) as string | undefined;
            const duration = meta?.duration as number | undefined;
            await ctx.runMutation(internal.subscriptions.internal.insertContent, {
              sourceId: item.sourceId,
              contentId: item.contentId,
              title: item.title,
              url: item.url,
              relevancyScore: item.relevancyScore,
              relevancyReason: item.relevancyReason,
              passedFilter: item.passedFilter,
              metadataJson: item.metadataJson,
              embedding: embeddings[i],
              contentCategory: deriveCategoryFromUrl(item.url, source.sourceType),
              thumbnailUrl,
              authorHandle: source.name ?? source.identifier,
              duration,
            });
            if (item.passedFilter) queued++;
          }

          // Update last_checked
          await ctx.runMutation(internal.subscriptions.internal.updateSourceLastChecked, {
            sourceId: source._id,
            lastChecked: Date.now(),
          });

          return {
            sourceId: source._id,
            identifier: source.identifier,
            success: true,
            itemsFetched: items.length,
            itemsQueued: queued,
          };
        }

        // Skip unsupported source types
        if (source.sourceType === 'ebay' || source.sourceType === 'whats-new') {
          return {
            sourceId: source._id,
            identifier: source.identifier,
            success: true,
            itemsFetched: 0,
            itemsQueued: 0,
          };
        }

        // Use the general processSingleSource function
        return await processSingleSource(source, existingContentMap, ctx);
      } catch (error) {
        return {
          sourceId: source._id,
          identifier: source.identifier,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          itemsFetched: 0,
          itemsQueued: 0,
        };
      }
    });

    // Wait for all sources to complete processing
    const results = await Promise.all(processingPromises);

    // Aggregate results
    const totalFetched = results.reduce((sum: number, r: typeof results[number]) => sum + r.itemsFetched, 0);
    const totalQueued = results.reduce((sum: number, r: typeof results[number]) => sum + r.itemsQueued, 0);
    const errors = results
      .filter((r: typeof results[number]) => !r.success)
      .map((r: typeof results[number]) => ({ source: r.identifier, error: r.error || 'Unknown error' }));

    const durationMs = Date.now() - startTime;

    // Log performance metrics
    console.log(`[checkAllSubscriptions] Processed ${results.length} sources in ${durationMs}ms (${totalFetched} items fetched, ${totalQueued} queued)`);

    // Trigger feed build immediately if new content was fetched
    if (totalFetched > 0) {
      await ctx.scheduler.runAfter(0, internal.feeds.internal.buildFeed, {});
    }

    return {
      sourcesChecked: results.length,
      totalFetched,
      totalQueued,
      errors,
      durationMs,
    };
  },
});

/**
 * Process queued subscription content
 *
 * Reads content from URLs using Jina Reader and stores as documents.
 * For YouTube: Will include transcription once Jina supports it
 * For Blogs: Extracts article content as markdown
 */
export const processQueuedContent = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    processed: number;
    succeeded: number;
    skipped: number;
    failed: number;
    errors: Array<{ contentId: string; error: string }>;
  }> => {
    const BATCH_SIZE = 5;
    const SIMILARITY_THRESHOLD = 0.88; // High threshold to avoid false positives

    // Get queued content items
    const queuedItems = await ctx.runQuery(
      internal.subscriptions.internal.getQueuedContent,
      { limit: BATCH_SIZE }
    );

    const results = {
      processed: queuedItems.length,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ contentId: string; error: string }>,
    };

    for (const item of queuedItems) {
      try {
        // Skip if no URL
        if (!item.url) {
          await ctx.runMutation(
            internal.subscriptions.internal.updateContentResearchStatus,
            { contentId: item._id, status: "skipped" }
          );
          continue;
        }

        // Check for semantic duplicates if embedding exists
        if (item.embedding) {
          const similarDocs = await ctx.vectorSearch("documents", "by_embedding", {
            vector: item.embedding,
            limit: 3,
          });

          // Filter by threshold and fetch full documents
          const duplicates: Array<{ title: string; similarity: number }> = [];
          for (const result of similarDocs) {
            if (result._score >= SIMILARITY_THRESHOLD) {
              const doc = await ctx.runQuery(api.documents.queries.get, {
                id: result._id,
              });
              if (doc) {
                duplicates.push({ title: doc.title, similarity: result._score });
              }
            }
          }

          if (duplicates.length > 0) {
            // Found duplicate, skip processing
            console.log(
              `[subscription-dedup] Skipping duplicate content: "${item.title}" ` +
              `(similar to: "${duplicates[0].title}" similarity: ${duplicates[0].similarity.toFixed(3)})`
            );
            await ctx.runMutation(
              internal.subscriptions.internal.updateContentResearchStatus,
              { contentId: item._id, status: "skipped" }
            );
            results.skipped++;
            continue;
          }
        }

        // Read content using Jina Reader
        const content = await readUrlWithJina(item.url, 30000, 50000);

        if (!content.success || !content.content) {
          results.errors.push({
            contentId: item._id.toString(),
            error: content.error || "Failed to read content",
          });
          results.failed++;
          // Mark as skipped to prevent infinite retry
          await ctx.runMutation(
            internal.subscriptions.internal.updateContentResearchStatus,
            { contentId: item._id, status: "skipped" }
          );
          continue;
        }

        // Get source info for categorization
        const source = await ctx.runQuery(
          internal.subscriptions.internal.getSource,
          { id: item.sourceId }
        );

        // Determine category based on source type
        const categoryMap: Record<string, string> = {
          youtube: "video",
          newsletter: "article",
          reddit: "discussion",
          changelog: "release",
          creator: "creator",
        };
        const category = categoryMap[source?.sourceType || ""] || "article";

        // Create document with content and embedding
        const result = await ctx.runAction(
          api.documents.storage.createWithEmbedding,
          {
            title: item.title,
            content: content.content,
            category: category,
            status: "complete",
            date: new Date().toISOString().split("T")[0],
            researchType: "subscription",
            filePath: item.url, // Store source URL as filePath
          }
        );
        const documentId = result.documentId;

        // Update content status with document link
        await ctx.runMutation(
          internal.subscriptions.internal.updateContentResearchStatus,
          {
            contentId: item._id,
            status: "researched",
            documentId: documentId,
          }
        );

        // Notify that subscription content has been researched and saved as a document
        await ctx.runMutation(internal.notifications.internal.create, {
          type: "subscription_update",
          title: "Subscription Content Ready",
          body: item.title ? `"${item.title}" has been saved to your library.` : "New subscription content has been saved to your library.",
          route: `/document/${documentId}`,
          referenceId: documentId,
        });

        results.succeeded++;
      } catch (error) {
        results.errors.push({
          contentId: item._id.toString(),
          error: error instanceof Error ? error.message : String(error),
        });
        results.failed++;

        // Mark as skipped to prevent infinite retry
        await ctx.runMutation(
          internal.subscriptions.internal.updateContentResearchStatus,
          { contentId: item._id, status: "skipped" }
        );
      }
    }

    console.log(
      `[subscription-auto-research] Processed ${results.processed} items: ${results.succeeded} succeeded, ${results.skipped} skipped (duplicates), ${results.failed} failed`
    );

    return results;
  },
});

// ============================================================================
// Creator Account Seeding
// ============================================================================

/**
 * Recommended AI creator accounts for Twitter/X and Bluesky.
 * Organized by tier:
 *   1 = Must-follow (AI coding & agentic engineering)
 *   2 = High-value signal (tools, infra, products)
 *   3 = Depth & context (research, critical analysis)
 *   4 = Corporate accounts
 */
const RECOMMENDED_CREATORS = [
  // Tier 1: Must-Follow (AI Coding & Agentic Engineering)
  { name: "Andrej Karpathy", identifier: "karpathy", tier: 1, platforms: { twitter: "karpathy" }, category: "core-thinking" },
  { name: "Simon Willison", identifier: "simonw", tier: 1, platforms: { twitter: "simonw" }, category: "builder-signal" },
  { name: "Peter Steinberger", identifier: "steipete", tier: 1, platforms: { twitter: "steipete" }, category: "agentic-coding" },
  { name: "swyx", identifier: "swyx", tier: 1, platforms: { twitter: "swyx" }, category: "ai-engineering" },
  { name: "Sebastian Raschka", identifier: "rasbt", tier: 1, platforms: { twitter: "rasbt" }, category: "practical-ml" },
  { name: "AK", identifier: "_akhaliq", tier: 1, platforms: { twitter: "_akhaliq" }, category: "discovery-firehose" },

  // Tier 2: High-Value Signal
  { name: "Logan Kilpatrick", identifier: "OfficialLoganK", tier: 2, platforms: { twitter: "OfficialLoganK" }, category: "platform-insider" },
  { name: "Ethan Mollick", identifier: "emollick", tier: 2, platforms: { twitter: "emollick" }, category: "impact-analysis" },
  { name: "DAIR.AI", identifier: "dair_ai", tier: 2, platforms: { twitter: "dair_ai" }, category: "research-digest" },
  { name: "The Rundown AI", identifier: "TheRundownAI", tier: 2, platforms: { twitter: "TheRundownAI" }, category: "news-firehose" },

  // Tier 3: Depth & Context
  { name: "Thomas Wolf", identifier: "Thom_Wolf", tier: 3, platforms: { twitter: "Thom_Wolf" }, category: "open-source-ml" },
  { name: "Jim Fan", identifier: "DrJimFan", tier: 3, platforms: { twitter: "DrJimFan" }, category: "research-frontier" },
  { name: "Gary Marcus", identifier: "GaryMarcus", tier: 3, platforms: { twitter: "GaryMarcus" }, category: "critical-analysis" },
  { name: "Andrew Ng", identifier: "AndrewYNg", tier: 3, platforms: { twitter: "AndrewYNg" }, category: "education-industry" },
  { name: "Chip Huyen", identifier: "chipro", tier: 3, platforms: { twitter: "chipro" }, category: "systems-design" },

  // Tier 4: Corporate Accounts (Twitter + Bluesky where available)
  { name: "Anthropic", identifier: "AnthropicAI", tier: 4, platforms: { twitter: "AnthropicAI", bluesky: "anthropic.bsky.social" }, category: "corporate" },
  { name: "OpenAI", identifier: "OpenAI", tier: 4, platforms: { twitter: "OpenAI", bluesky: "openai.bsky.social" }, category: "corporate" },
  { name: "Cursor", identifier: "cursor_ai", tier: 4, platforms: { twitter: "cursor_ai", bluesky: "cursor.bsky.social" }, category: "corporate" },
  { name: "Google DeepMind", identifier: "GoogleDeepMind", tier: 4, platforms: { twitter: "GoogleDeepMind" }, category: "corporate" },
  { name: "Meta AI", identifier: "MetaAI", tier: 4, platforms: { twitter: "MetaAI" }, category: "corporate" },
  { name: "Mistral AI", identifier: "MistralAI", tier: 4, platforms: { twitter: "MistralAI" }, category: "corporate" },
  { name: "Groq", identifier: "GroqInc", tier: 4, platforms: { twitter: "GroqInc" }, category: "corporate" },
  { name: "LangChain", identifier: "LangChainAI", tier: 4, platforms: { twitter: "LangChainAI" }, category: "corporate" },
];

/**
 * Seed all recommended creator accounts as subscriptions.
 * Skips any that already exist (by identifier). Idempotent.
 */
export const seedCreatorAccounts = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ created: number; skipped: number }> => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const creator of RECOMMENDED_CREATORS) {
      // Check if already exists
      const existing = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_identifier", (q) => q.eq("identifier", creator.identifier))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("subscriptionSources", {
        sourceType: "creator",
        identifier: creator.identifier,
        name: creator.name,
        url: `https://x.com/${creator.platforms.twitter || creator.identifier}`,
        fetchMethod: "jina",
        configJson: {
          platforms: creator.platforms,
          tier: creator.tier,
          category: creator.category,
        },
        autoResearch: creator.tier <= 2, // Auto-research tier 1 & 2 only
        createdAt: now,
        updatedAt: now,
      });

      created++;
    }

    console.log(`[seedCreatorAccounts] Created ${created}, skipped ${skipped} (already exist)`);
    return { created, skipped };
  },
});

// ============================================================================
// Expanded Creator & Newsletter Seeding (YouTube, Twitter additions, RSS)
// ============================================================================

/**
 * YouTube creators to add as subscriptions.
 * These are the top AI/engineering YouTube channels matched to the user's
 * taste profile (practical builders, AI engineering, research distillation).
 */
const YOUTUBE_CREATORS = [
  { name: "Fireship", identifier: "fireship", tier: 1, platforms: { twitter: "fireship_dev", youtube: "UCsBjURrPoezykLs9EqgamOA" }, category: "rapid-explainers" },
  { name: "ThePrimeagen", identifier: "ThePrimeagen", tier: 1, platforms: { twitter: "ThePrimeagen", youtube: "UC8ENHE5xdFSwx71u3fDH5Xw" }, category: "unfiltered-takes" },
  { name: "Sentdex", identifier: "sentdex", tier: 1, platforms: { twitter: "Sentdex", youtube: "UCfzlCWGWYyIQ0aLC5w48gBQ" }, category: "practical-ml" },
  { name: "LangChain", identifier: "langchain-yt", tier: 2, platforms: { twitter: "LangChainAI", youtube: "UCC-lyoTfSrcJzA1ab3APAgw" }, category: "agent-tutorials" },
  { name: "Yannic Kilcher", identifier: "yannic-kilcher", tier: 2, platforms: { twitter: "ykilcher", youtube: "UCZHmQk67mSJgfCCTn7xBfew" }, category: "paper-reviews" },
  { name: "All About AI", identifier: "all-about-ai", tier: 2, platforms: { youtube: "UCUyeluBRhGPCW4rPe_UvBZQ" }, category: "practical-coding" },
  { name: "AI Jason", identifier: "ai-jason", tier: 2, platforms: { twitter: "jasonzhou1993", youtube: "UCaC_ojf4AH_SGjlbUbQBemg" }, category: "short-explainers" },
  { name: "Matthew Berman", identifier: "matthew-berman", tier: 2, platforms: { twitter: "MatthewBerman", youtube: "UCmN4MlruSQmHvaK1EfFBSqg" }, category: "tool-reviews" },
  { name: "Umar Jamil", identifier: "umar-jamil", tier: 3, platforms: { youtube: "UC6gOFkvAM3GBn9MUi4ONAOA" }, category: "deep-technical" },
  { name: "Dwarkesh Patel", identifier: "dwarkesh-patel", tier: 2, platforms: { twitter: "dwarkesh_sp", youtube: "UC2LqM2ChFZHRUMGd142pF0Q" }, category: "intellectual-interviews" },
];

/**
 * Additional Twitter-only creators not yet in the system.
 */
const ADDITIONAL_TWITTER_CREATORS = [
  { name: "Nathan Lambert", identifier: "NathanLambert", tier: 2, platforms: { twitter: "natolambert" }, category: "rlhf-research" },
  { name: "Hamel Husain", identifier: "HamelHusain", tier: 2, platforms: { twitter: "HamelHusain" }, category: "practical-ai-eng" },
  { name: "Jason Liu", identifier: "JasonLiu200", tier: 2, platforms: { twitter: "jxnlco" }, category: "structured-outputs" },
  { name: "Eugene Yan", identifier: "EugeneYan", tier: 2, platforms: { twitter: "eugeneyan" }, category: "production-ml" },
  { name: "Alex Volkov (ThursdAI)", identifier: "altryne", tier: 2, platforms: { twitter: "altryne" }, category: "oss-ai-news" },
];

/**
 * Newsletter/RSS feeds to add as subscriptions.
 */
const NEWSLETTER_FEEDS = [
  { name: "Latent Space (swyx)", identifier: "latent-space-newsletter", feedUrl: "https://www.latent.space/feed", url: "https://www.latent.space", category: "ai-engineering" },
  { name: "Interconnects (Nathan Lambert)", identifier: "interconnects-newsletter", feedUrl: "https://www.interconnects.ai/feed", url: "https://www.interconnects.ai", category: "rlhf-research" },
  { name: "Import AI (Jack Clark)", identifier: "import-ai-newsletter", feedUrl: "https://importai.substack.com/feed", url: "https://importai.substack.com", category: "policy-research" },
  { name: "TLDR AI", identifier: "tldr-ai-newsletter", feedUrl: "https://tldr.tech/ai/rss", url: "https://tldr.tech/ai", category: "daily-aggregator" },
  { name: "PulseMCP", identifier: "pulsemcp-newsletter", feedUrl: "https://www.pulsemcp.com/feed", url: "https://www.pulsemcp.com", category: "mcp-ecosystem" },
  { name: "Simon Willison's Blog", identifier: "simonwillison-blog", feedUrl: "https://simonwillison.net/atom/everything/", url: "https://simonwillison.net", category: "practical-ai" },
  { name: "Ahead of AI (Sebastian Raschka)", identifier: "ahead-of-ai-newsletter", feedUrl: "https://magazine.sebastianraschka.com/feed", url: "https://magazine.sebastianraschka.com", category: "deep-technical-ml" },
  { name: "AI Snake Oil (Arvind Narayanan)", identifier: "ai-snake-oil-newsletter", feedUrl: "https://www.aisnakeoil.com/feed", url: "https://www.aisnakeoil.com", category: "critical-analysis" },
  { name: "Lilian Weng's Blog", identifier: "lilianweng-blog", feedUrl: "https://lilianweng.github.io/index.xml", url: "https://lilianweng.github.io", category: "research-deep-dives" },
  { name: "Eugene Yan's Blog", identifier: "eugeneyan-blog", feedUrl: "https://eugeneyan.com/rss/", url: "https://eugeneyan.com", category: "production-ml" },
  { name: "Gwern", identifier: "gwern-blog", feedUrl: "https://gwern.net/feed", url: "https://gwern.net", category: "ml-research-safety" },
];

/**
 * Seed expanded creator recommendations (YouTube, Twitter additions, newsletters).
 * Skips any that already exist by identifier. Idempotent.
 */
export const seedExpandedRecommendations = internalMutation({
  args: {},
  handler: async (ctx): Promise<{
    creators: { created: number; skipped: number };
    newsletters: { created: number; skipped: number };
  }> => {
    const now = Date.now();
    const creatorsResult = { created: 0, skipped: 0 };
    const newslettersResult = { created: 0, skipped: 0 };

    // Seed YouTube + additional Twitter creators
    const allCreators = [...YOUTUBE_CREATORS, ...ADDITIONAL_TWITTER_CREATORS];
    for (const creator of allCreators) {
      const existing = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_identifier", (q) => q.eq("identifier", creator.identifier))
        .first();

      if (existing) {
        creatorsResult.skipped++;
        continue;
      }

      const twitterHandle = creator.platforms.twitter;
      const youtubeId = (creator.platforms as { youtube?: string }).youtube;

      await ctx.db.insert("subscriptionSources", {
        sourceType: "creator",
        identifier: creator.identifier,
        name: creator.name,
        url: twitterHandle
          ? `https://x.com/${twitterHandle}`
          : youtubeId
            ? `https://www.youtube.com/channel/${youtubeId}`
            : undefined,
        feedUrl: youtubeId
          ? `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeId}`
          : undefined,
        fetchMethod: youtubeId ? "rss" : "jina",
        configJson: {
          platforms: creator.platforms,
          tier: creator.tier,
          category: creator.category,
        },
        autoResearch: creator.tier <= 2,
        createdAt: now,
        updatedAt: now,
      });

      creatorsResult.created++;
    }

    // Seed newsletter/RSS feeds
    for (const newsletter of NEWSLETTER_FEEDS) {
      const existing = await ctx.db
        .query("subscriptionSources")
        .withIndex("by_identifier", (q) => q.eq("identifier", newsletter.identifier))
        .first();

      if (existing) {
        newslettersResult.skipped++;
        continue;
      }

      await ctx.db.insert("subscriptionSources", {
        sourceType: "newsletter",
        identifier: newsletter.identifier,
        name: newsletter.name,
        url: newsletter.url,
        feedUrl: newsletter.feedUrl,
        fetchMethod: "rss",
        configJson: {
          category: newsletter.category,
          source: "deep-research-recommendation",
        },
        autoResearch: true,
        createdAt: now,
        updatedAt: now,
      });

      newslettersResult.created++;
    }

    console.log(
      `[seedExpandedRecommendations] Creators: ${creatorsResult.created} created, ${creatorsResult.skipped} skipped. Newsletters: ${newslettersResult.created} created, ${newslettersResult.skipped} skipped.`
    );

    return { creators: creatorsResult, newsletters: newslettersResult };
  },
});
