import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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
// Source Fetchers
// ============================================================================

async function fetchYouTube(
  source: any,
  filter: RelevancyRule[],
  ctx: any
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
    const videoId = entry.link.split('v=')[1]?.split('&')[0] || entry.link.split('/').pop();

    // Check if already exists
    const existing = await ctx.runQuery(
      internal.subscriptions.getContentBySourceAndId,
      { sourceId: source._id, contentId: videoId }
    );

    if (existing) continue;

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
  ctx: any
): Promise<any[]> {
  const feedUrl = source.feedUrl;
  if (!feedUrl) return [];

  const items = await parseRSSFeed(feedUrl);
  const newItems: any[] = [];

  for (const entry of items.slice(0, 5)) {
    const contentId = entry.link.split('/').filter(Boolean).pop() || entry.link;

    const existing = await ctx.runQuery(
      internal.subscriptions.getContentBySourceAndId,
      { sourceId: source._id, contentId }
    );

    if (existing) continue;

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

async function fetchReddit(
  source: any,
  filter: RelevancyRule[],
  ctx: any
): Promise<any[]> {
  const subreddit = source.identifier.replace('r/', '');
  const feedUrl = `https://www.reddit.com/r/${subreddit}/new/.rss`;

  const items = await parseRSSFeed(feedUrl);
  const newItems: any[] = [];

  for (const entry of items.slice(0, 25)) {
    const postId = entry.link.split('/').slice(-2, -1)[0];

    const existing = await ctx.runQuery(
      internal.subscriptions.getContentBySourceAndId,
      { sourceId: source._id, contentId: postId }
    );

    if (existing) continue;

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
  ctx: any
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

    const existing = await ctx.runQuery(
      internal.subscriptions.getContentBySourceAndId,
      { sourceId: source._id, contentId: tagOrId }
    );

    if (existing) continue;

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

// ============================================================================
// Mutations
// ============================================================================

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
  }> => {
    const sources = await ctx.runQuery(internal.subscriptions.getActiveSources);

    const results = {
      sourcesChecked: sources.length,
      totalFetched: 0,
      totalQueued: 0,
      errors: [] as Array<{ source: string; error: string }>,
    };

    for (const source of sources) {
      try {
        // Get filters for this source
        const dbFilters = await ctx.runQuery(internal.subscriptions.getFiltersForSource, {
          sourceId: source._id,
          sourceType: source.sourceType,
        });

        // Map database filters to RelevancyRule format
        const filters = dbFilters.map((f) => ({
          ruleName: f.ruleName,
          ruleType: f.ruleType,
          ruleValue: f.ruleValue,
          weight: f.weight,
          sourceId: f.sourceId?.toString() ?? null,
        }));

        let items: Array<{
          sourceId: any;
          contentId: string;
          title: string;
          url: string;
          relevancyScore: number;
          relevancyReason: string;
          passedFilter: boolean;
        }> = [];

        switch (source.sourceType) {
          case 'youtube':
            items = await fetchYouTube(source, filters, ctx);
            break;
          case 'newsletter':
            items = await fetchNewsletter(source, filters, ctx);
            break;
          case 'reddit':
            items = await fetchReddit(source, filters, ctx);
            break;
          case 'changelog':
            items = await fetchChangelog(source, filters, ctx);
            break;
          default:
            results.errors.push({
              source: source.identifier,
              error: `Unknown source type: ${source.sourceType}`,
            });
            continue;
        }

        let queued = 0;
        for (const item of items) {
          await ctx.runMutation(internal.subscriptions.insertContent, {
            sourceId: item.sourceId,
            contentId: item.contentId,
            title: item.title,
            url: item.url,
            relevancyScore: item.relevancyScore,
            relevancyReason: item.relevancyReason,
            passedFilter: item.passedFilter,
            metadataJson: undefined,
          });
          if (item.passedFilter) {
            queued++;
          }
        }

        // Update last_checked
        await ctx.runMutation(internal.subscriptions.updateSourceLastChecked, {
          sourceId: source._id,
          lastChecked: Date.now(),
        });

        results.totalFetched += items.length;
        results.totalQueued += queued;
      } catch (error) {
        results.errors.push({
          source: source.identifier,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  },
});
