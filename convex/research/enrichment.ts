'use node';

import { type JinaSearchResult, jinaReaderBatch, jinaSearch } from '../lib/jina';

export interface RecommendationPlatformLink {
  platform: string;
  url: string;
  rating?: number;
  reviewCount?: number;
}

export interface RecommendationSourceEvidence {
  source: string;
  url: string;
  excerpt: string;
  rating?: number;
  reviewCount?: number;
  sourceType: 'expert' | 'ratings' | 'editorial' | 'community';
}

export interface RecommendationItemForEnrichment {
  name: string;
  description: string;
  whyRecommended: string;
  rank?: number;
  websiteUrl?: string;
  sourceScore?: number;
  sourceEvidence?: RecommendationSourceEvidence[];
  rating?: number;
  reviewCount?: number;
  platformLinks?: RecommendationPlatformLink[];
  location?: string;
  pricing?: string;
  sourcePlatform?: string;
  contact?: {
    phone?: string;
    url?: string;
    email?: string;
  };
}

export interface SelectiveEnrichmentArgs {
  query: string;
  location?: string;
  constraints?: string[];
  signal?: AbortSignal;
  apiKey?: string;
}

interface EnrichmentQuery {
  platform: string;
  query: string;
  site?: string;
}

interface EnrichmentCandidate {
  platform: string;
  url: string;
  rating?: number;
  reviewCount?: number;
}

interface EnrichmentDeps {
  executeSearch?: (
    query: EnrichmentQuery,
    options: { apiKey: string; signal?: AbortSignal }
  ) => Promise<JinaSearchResult[]>;
  readUrls?: (
    urls: string[],
    options: { apiKey: string; signal?: AbortSignal }
  ) => Promise<Map<string, string>>;
}

const ENTITY_SEARCH_LIMIT = 3;
const READER_TIMEOUT_MS = 4_000;

const PLATFORM_QUERIES: ReadonlyArray<{ platform: string; site?: string }> = [
  { platform: 'yelp', site: 'yelp.com' },
  { platform: 'google', site: 'google.com' },
  { platform: 'facebook', site: 'facebook.com' },
];

function createAbortError(): Error {
  try {
    return new DOMException('The operation was aborted', 'AbortError');
  } catch {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
  }
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.includes('aborted') ||
      error.message.includes('AbortError')
    );
  }
  const asString = String(error);
  return asString.includes('aborted') || asString.includes('AbortError');
}

function hasUsablePlatformLinks(item: RecommendationItemForEnrichment): boolean {
  if (!item.platformLinks || item.platformLinks.length === 0) {
    return false;
  }

  return item.platformLinks.some((link) => {
    if (!link.platform || !link.url) {
      return false;
    }
    return isDirectPlatformUrl(link.platform, link.url);
  });
}

export function shouldEnrichItem(item: RecommendationItemForEnrichment): boolean {
  return !hasUsablePlatformLinks(item);
}

export function buildSelectiveEnrichmentPlan(items: RecommendationItemForEnrichment[]): number[] {
  return items
    .map((item, index) => (shouldEnrichItem(item) ? index : -1))
    .filter((index) => index >= 0);
}

function compactQuery(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function buildEntityQueries(
  item: RecommendationItemForEnrichment,
  args: SelectiveEnrichmentArgs
): EnrichmentQuery[] {
  const constraints = args.constraints?.join(' ');
  return PLATFORM_QUERIES.map((entry) => ({
    platform: entry.platform,
    site: entry.site,
    query: compactQuery([`"${item.name}"`, args.location ?? item.location, 'reviews', constraints]),
  }));
}

function toInt(value: string): number | undefined {
  const parsed = Number.parseInt(value.replace(/,/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRatingAndReviewCount(text: string): {
  rating?: number;
  reviewCount?: number;
} {
  const ratingMatch = text.match(/(?:^|\s)([1-5](?:\.[0-9])?)\s*(?:\/\s*5|stars?|★)/i);
  const reviewMatch = text.match(/(\d[\d,]*)\s+(?:reviews?|ratings?)/i);
  const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;
  const reviewCount = reviewMatch ? toInt(reviewMatch[1]) : undefined;

  return {
    rating: Number.isFinite(rating) ? rating : undefined,
    reviewCount,
  };
}

function detectPlatformFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('yelp.')) return 'yelp';
    if (host.includes('google.')) return 'google';
    if (host.includes('facebook.')) return 'facebook';
    if (host.includes('tripadvisor.')) return 'tripadvisor';
    if (host.includes('reddit.')) return 'reddit';
    return undefined;
  } catch {
    return undefined;
  }
}

function isDirectPlatformUrl(platform: string, rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (platform === 'yelp') {
      return host.includes('yelp.') && path.startsWith('/biz/');
    }
    if (platform === 'google') {
      return host.includes('google.') && path.includes('/maps/');
    }
    if (platform === 'facebook') {
      return host.includes('facebook.') && path.length > 1;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeCandidate(
  result: JinaSearchResult,
  platformHint: string
): EnrichmentCandidate | null {
  const url =
    typeof result.url === 'string' && result.url
      ? result.url
      : typeof result.link === 'string'
        ? result.link
        : '';
  if (!url) {
    return null;
  }

  const platform = detectPlatformFromUrl(url) ?? platformHint;
  if (!isDirectPlatformUrl(platform, url)) {
    return null;
  }

  const snippet =
    typeof result.content === 'string'
      ? result.content
      : typeof result.description === 'string'
        ? result.description
        : '';
  const parsed = parseRatingAndReviewCount(snippet);

  return {
    platform,
    url,
    rating: parsed.rating,
    reviewCount: parsed.reviewCount,
  };
}

function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

function mergePlatformLinks(
  existing: RecommendationPlatformLink[] | undefined,
  discovered: EnrichmentCandidate[]
): RecommendationPlatformLink[] | undefined {
  const ordered: RecommendationPlatformLink[] = [];
  const dedup = new Map<string, RecommendationPlatformLink>();

  for (const link of existing ?? []) {
    const key = `${link.platform}:${canonicalizeUrl(link.url)}`;
    if (!dedup.has(key)) {
      const normalized = { ...link };
      dedup.set(key, normalized);
      ordered.push(normalized);
    }
  }

  for (const candidate of discovered) {
    const key = `${candidate.platform}:${canonicalizeUrl(candidate.url)}`;
    const existingLink = dedup.get(key);

    if (existingLink) {
      if (existingLink.rating === undefined && candidate.rating !== undefined) {
        existingLink.rating = candidate.rating;
      }
      if (existingLink.reviewCount === undefined && candidate.reviewCount !== undefined) {
        existingLink.reviewCount = candidate.reviewCount;
      }
      continue;
    }

    const nextLink: RecommendationPlatformLink = {
      platform: candidate.platform,
      url: candidate.url,
      ...(candidate.rating !== undefined ? { rating: candidate.rating } : {}),
      ...(candidate.reviewCount !== undefined ? { reviewCount: candidate.reviewCount } : {}),
    };
    dedup.set(key, nextLink);
    ordered.push(nextLink);
  }

  return ordered.length > 0 ? ordered : undefined;
}

function pickPreferredCandidate(
  candidates: EnrichmentCandidate[]
): EnrichmentCandidate | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort((a, b) => {
    const reviewDelta = (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
    if (reviewDelta !== 0) {
      return reviewDelta;
    }
    return (b.rating ?? -1) - (a.rating ?? -1);
  })[0];
}

export function mergeEnrichedItem(
  original: RecommendationItemForEnrichment,
  candidates: EnrichmentCandidate[]
): RecommendationItemForEnrichment {
  if (candidates.length === 0) {
    return original;
  }

  const preferred = pickPreferredCandidate(candidates);
  const platformLinks = mergePlatformLinks(original.platformLinks, candidates);

  return {
    ...original,
    ...(original.rating === undefined && preferred?.rating !== undefined
      ? { rating: preferred.rating }
      : {}),
    ...(original.reviewCount === undefined && preferred?.reviewCount !== undefined
      ? { reviewCount: preferred.reviewCount }
      : {}),
    ...(original.sourcePlatform === undefined && preferred?.platform
      ? { sourcePlatform: preferred.platform }
      : {}),
    ...(platformLinks ? { platformLinks } : {}),
  };
}

async function defaultExecuteSearch(
  query: EnrichmentQuery,
  options: { apiKey: string; signal?: AbortSignal }
): Promise<JinaSearchResult[]> {
  return jinaSearch(query.query, {
    apiKey: options.apiKey,
    signal: options.signal,
    site: query.site,
    limit: ENTITY_SEARCH_LIMIT,
    timeout: 5_000,
  });
}

async function defaultReadUrls(
  urls: string[],
  options: { apiKey: string; signal?: AbortSignal }
): Promise<Map<string, string>> {
  if (urls.length === 0) {
    return new Map<string, string>();
  }
  return jinaReaderBatch(urls, {
    apiKey: options.apiKey,
    signal: options.signal,
    timeout: READER_TIMEOUT_MS,
  });
}

function mergeReaderEvidence(
  candidates: EnrichmentCandidate[],
  contentMap: Map<string, string>
): EnrichmentCandidate[] {
  return candidates.map((candidate) => {
    const content = contentMap.get(candidate.url);
    if (!content) {
      return candidate;
    }

    const parsed = parseRatingAndReviewCount(content);
    return {
      ...candidate,
      rating: candidate.rating ?? parsed.rating,
      reviewCount: candidate.reviewCount ?? parsed.reviewCount,
    };
  });
}

export async function selectivelyEnrichRecommendations(
  items: RecommendationItemForEnrichment[],
  args: SelectiveEnrichmentArgs,
  deps: EnrichmentDeps = {}
): Promise<RecommendationItemForEnrichment[]> {
  if (args.signal?.aborted) {
    throw createAbortError();
  }

  const apiKey = args.apiKey ?? process.env.JINA_API_KEY;
  const plan = buildSelectiveEnrichmentPlan(items);
  if (!apiKey || plan.length === 0) {
    return items;
  }

  const executeSearch = deps.executeSearch ?? defaultExecuteSearch;
  const readUrls = deps.readUrls ?? defaultReadUrls;
  const nextItems = [...items];

  const settled = await Promise.allSettled(
    plan.map(async (index) => {
      const item = items[index];
      const entityQueries = buildEntityQueries(item, args);

      const searchSettled = await Promise.allSettled(
        entityQueries.map((query) => executeSearch(query, { apiKey, signal: args.signal }))
      );
      const searchResults = searchSettled.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        if (args.signal?.aborted) {
          throw createAbortError();
        }
        if (isAbortLikeError(result.reason)) {
          throw result.reason;
        }
        return [];
      });

      const candidates = searchResults
        .flatMap((results, queryIndex) =>
          results
            .map((result) => normalizeCandidate(result, entityQueries[queryIndex].platform))
            .filter((candidate): candidate is EnrichmentCandidate => !!candidate)
        )
        .slice(0, ENTITY_SEARCH_LIMIT);

      const requiresReaderEvidence = candidates.some(
        (candidate) => candidate.rating === undefined || candidate.reviewCount === undefined
      );
      const urlsToRead = requiresReaderEvidence
        ? [...new Set(candidates.map((candidate) => candidate.url))]
        : [];
      const contentMap = urlsToRead.length
        ? await readUrls(urlsToRead, {
            apiKey,
            signal: args.signal,
          })
        : new Map<string, string>();
      return {
        index,
        item: mergeEnrichedItem(item, mergeReaderEvidence(candidates, contentMap)),
      };
    })
  );

  for (const result of settled) {
    if (args.signal?.aborted) {
      throw createAbortError();
    }
    if (result.status === 'rejected') {
      if (isAbortLikeError(result.reason)) {
        throw result.reason;
      }
      continue;
    }
    nextItems[result.value.index] = result.value.item;
  }

  if (args.signal?.aborted) {
    throw createAbortError();
  }

  return nextItems;
}

export const enrichRecommendationsSecondPass = selectivelyEnrichRecommendations;
