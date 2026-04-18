'use node';

import { JinaError, type JinaSearchResult, jinaSearch } from '../lib/jina';

export interface PlatformSearchArgs {
  query: string;
  location?: string;
  constraints?: string[];
}

export type PlatformSearchKind =
  | 'generalWeb'
  | 'review'
  | 'maps'
  | 'community'
  | 'ratings'
  | 'productExpert'
  | 'productRatings';

export interface PlatformSearchPlanItem {
  kind: PlatformSearchKind;
  query: string;
  site?: string;
  limit: number;
  timeoutMs: number;
}

export interface DiscoverySource {
  title: string;
  url: string;
  snippet: string;
  sourcePlatform: PlatformSearchKind;
  provenance: PlatformSearchKind[];
}

export interface ExecutePlatformSearchesOptions {
  apiKey?: string;
  signal?: AbortSignal;
  executeSearch?: (
    item: PlatformSearchPlanItem,
    options: { apiKey: string; signal?: AbortSignal }
  ) => Promise<JinaSearchResult[]>;
}

export const RECOMMENDATION_TOTAL_TIMEOUT_MS = 45_000;
export const PLATFORM_SEARCH_TIMEOUT_MS = 6_000;
export const PLATFORM_RESULT_LIMIT = 4;
export const MIN_POST_DISCOVERY_HEADROOM_MS = 30_000;

const PLATFORM_PATTERNS: ReadonlyArray<{
  kind: PlatformSearchKind;
  site?: string;
  buildQuery: (query: string, location?: string, modifiers?: string) => string;
}> = [
  {
    kind: 'generalWeb',
    buildQuery: (query, location, modifiers) =>
      compactQuery([query, location, 'reviews', modifiers]),
  },
  {
    kind: 'review',
    site: 'yelp.com',
    buildQuery: (query, location, modifiers) =>
      compactQuery([query, location, 'reviews', modifiers]),
  },
  {
    kind: 'maps',
    site: 'google.com',
    buildQuery: (query, location, modifiers) => compactQuery([query, location, 'maps', modifiers]),
  },
  {
    kind: 'community',
    site: 'reddit.com',
    buildQuery: (query, location, modifiers) =>
      compactQuery([query, location, 'recommendations', modifiers]),
  },
  {
    kind: 'ratings',
    buildQuery: (query, location, modifiers) =>
      compactQuery([query, location, 'ratings reviews best', modifiers]),
  },
  {
    kind: 'productExpert',
    site: 'thewirecutter.com',
    buildQuery: (query, _location, modifiers) =>
      compactQuery([query, 'review best', modifiers]),
  },
  {
    kind: 'productRatings',
    site: 'rtings.com',
    buildQuery: (query, _location, modifiers) =>
      compactQuery([query, 'review ratings', modifiers]),
  },
];

function compactQuery(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function normalizeConstraintTerms(constraints?: string[]): string | undefined {
  if (!constraints || constraints.length === 0) {
    return undefined;
  }

  return constraints
    .map((constraint) => constraint.trim())
    .filter(Boolean)
    .join(' ');
}

export function buildPlatformSearchPlan(args: PlatformSearchArgs): PlatformSearchPlanItem[] {
  const modifiers = normalizeConstraintTerms(args.constraints);

  return PLATFORM_PATTERNS.map((pattern) => ({
    kind: pattern.kind,
    query: pattern.buildQuery(args.query, args.location, modifiers),
    site: pattern.site,
    limit: PLATFORM_RESULT_LIMIT,
    timeoutMs: PLATFORM_SEARCH_TIMEOUT_MS,
  }));
}

function normalizeSearchResult(
  result: JinaSearchResult,
  sourcePlatform: PlatformSearchKind
): DiscoverySource | null {
  const url =
    typeof result.url === 'string' && result.url
      ? result.url
      : typeof result.link === 'string'
        ? result.link
        : '';

  const canonicalUrl = canonicalizeUrl(url);
  if (!canonicalUrl) {
    return null;
  }

  return {
    title: (typeof result.title === 'string' && result.title.trim()) || canonicalUrl,
    url,
    snippet: (
      (typeof result.content === 'string' && result.content) ||
      (typeof result.description === 'string' && result.description) ||
      ''
    ).slice(0, 200),
    sourcePlatform,
    provenance: [sourcePlatform],
  };
}

function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';

    const retainedEntries = [...parsed.searchParams.entries()].filter(
      ([key]) => !key.toLowerCase().startsWith('utm_')
    );
    parsed.search = '';
    for (const [key, value] of retainedEntries) {
      parsed.searchParams.append(key, value);
    }

    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function mergeDiscoverySource(
  existing: DiscoverySource,
  incoming: DiscoverySource
): DiscoverySource {
  const provenance = [...existing.provenance];
  for (const platform of incoming.provenance) {
    if (!provenance.includes(platform)) {
      provenance.push(platform);
    }
  }

  return {
    title: existing.title || incoming.title,
    url: existing.url,
    snippet: existing.snippet || incoming.snippet,
    sourcePlatform: existing.sourcePlatform,
    provenance,
  };
}

async function defaultExecuteSearch(
  item: PlatformSearchPlanItem,
  options: { apiKey: string; signal?: AbortSignal }
): Promise<JinaSearchResult[]> {
  return jinaSearch(item.query, {
    apiKey: options.apiKey,
    signal: options.signal,
    limit: item.limit,
    timeout: item.timeoutMs,
    site: item.site,
  });
}

export async function executePlatformSearches(
  plan: PlatformSearchPlanItem[],
  options: ExecutePlatformSearchesOptions = {}
): Promise<DiscoverySource[]> {
  const apiKey = options.apiKey ?? process.env.JINA_API_KEY;
  if (!apiKey) {
    return [];
  }

  const executeSearch = options.executeSearch ?? defaultExecuteSearch;
  const normalizedResults = await Promise.all(
    plan.map(async (item) => {
      try {
        const results = await executeSearch(item, {
          apiKey,
          signal: options.signal,
        });
        return results.map((result) => normalizeSearchResult(result, item.kind));
      } catch (error) {
        if (error instanceof JinaError) {
          return [];
        }
        return [];
      }
    })
  );

  const deduplicated = new Map<string, DiscoverySource>();

  for (const results of normalizedResults) {
    for (const source of results) {
      if (!source) {
        continue;
      }

      const canonicalUrl = canonicalizeUrl(source.url);
      const existing = deduplicated.get(canonicalUrl);
      if (!existing) {
        deduplicated.set(canonicalUrl, source);
        continue;
      }

      deduplicated.set(canonicalUrl, mergeDiscoverySource(existing, source));
    }
  }

  return [...deduplicated.values()];
}
