import { createHash, randomUUID } from 'node:crypto';
import { getSecretValue } from '../config/secrets.ts';
import { readDocumentFromObservedPlane } from '../cutover/data-plane-content.ts';
import {
  isExportWatermarkActive,
  recordPostExportAcceptedWrite,
} from '../cutover/post-export-write-audit.ts';
import { assertMcpWritable } from '../cutover/soak-fence.ts';
import type { Sql } from '../db/client.ts';
import { createDb, createSql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { RoleUnavailableError } from '../inference/resolve-model.ts';
import { buildPublicShareUrl } from '../public-docs.ts';
import { rrfHybridSearch } from '../search/rrf.ts';

function resolveJinaApiKey(): string | undefined {
  return getSecretValue('JINA_API_KEY');
}

type ShopSearchResult = {
  title: string;
  price: number;
  priceFormatted: string;
  retailer: string;
  condition: string;
  url: string;
  dealScore: number;
  trustTier: number;
  sellerTrustScore: number;
  isVerifiedSeller: boolean;
  trustLabel: 'Authorized' | 'Verified Seller' | 'Unverified';
};

const SHOP_RETAILERS: Record<string, { domain: string; trustTier: number; verified: boolean }> = {
  amazon: { domain: 'amazon.com', trustTier: 2, verified: false },
  ebay: { domain: 'ebay.com', trustTier: 2, verified: false },
  newegg: { domain: 'newegg.com', trustTier: 1, verified: true },
  bestbuy: { domain: 'bestbuy.com', trustTier: 1, verified: true },
};

type JinaSearchItem = {
  title: string;
  url: string;
  description: string;
  content: string;
};

type FeedEntry = {
  contentId: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  summary: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeXml(value: string): string {
  return value
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim();
}

function xmlTag(block: string, names: string[]): string | null {
  for (const name of names) {
    const match = block.match(
      new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, 'i')
    );
    if (match?.[1]) return decodeXml(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  }
  return null;
}

function xmlLink(block: string): string | null {
  const tags = block.match(/<(?:[\w.-]+:)?link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const href = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)')/i);
    const rel = tag.match(/\brel=(?:"([^"]+)"|'([^']+)')/i);
    const value = href?.[1] ?? href?.[2];
    const relation = rel?.[1] ?? rel?.[2];
    if (value && (!relation || relation === 'alternate')) return decodeXml(value);
  }
  return xmlTag(block, ['link']);
}

function parseFeedEntries(xml: string): FeedEntry[] {
  const blocks = [
    ...(xml.match(/<(?:[\w.-]+:)?entry\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?entry>/gi) ?? []),
    ...(xml.match(/<(?:[\w.-]+:)?item\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?item>/gi) ?? []),
  ];
  return blocks.slice(0, 50).flatMap((block) => {
    const title = xmlTag(block, ['title']);
    const url = xmlLink(block);
    const stableId = xmlTag(block, ['id', 'guid']) ?? url;
    if (!title || !stableId) return [];
    const published = xmlTag(block, ['published', 'updated', 'pubDate']);
    const publishedDate = published ? new Date(published) : null;
    return [
      {
        contentId: stableId,
        title,
        url,
        publishedAt:
          publishedDate && !Number.isNaN(publishedDate.valueOf())
            ? publishedDate.toISOString()
            : null,
        summary: xmlTag(block, ['summary', 'description', 'content']),
      },
    ];
  });
}

function toDatabaseToolStatus(status: unknown): string {
  return status === 'complete' ? 'completed' : String(status);
}

function asJinaSearchItem(value: unknown): JinaSearchItem | null {
  if (!isRecord(value)) return null;
  const title = typeof value.title === 'string' ? value.title : '';
  const url = typeof value.url === 'string' ? value.url : '';
  if (!title || !url) return null;
  return {
    title,
    url,
    description: typeof value.description === 'string' ? value.description : '',
    content: typeof value.content === 'string' ? value.content : '',
  };
}

function belongsToRetailer(url: string, domain: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === domain || hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function retailerSearchUrl(retailer: string, query: string): string {
  const encoded = encodeURIComponent(query);
  switch (retailer) {
    case 'amazon':
      return `https://www.amazon.com/s?k=${encoded}`;
    case 'ebay':
      return `https://www.ebay.com/sch/i.html?_nkw=${encoded}`;
    case 'newegg':
      return `https://www.newegg.com/p/pl?d=${encoded}`;
    case 'bestbuy':
      return `https://www.bestbuy.com/site/searchpage.jsp?st=${encoded}`;
    default:
      throw new Error(`unsupported retailer: ${retailer}`);
  }
}

async function fetchJinaSearchItems(
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<JinaSearchItem[]> {
  const response = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  return data.map(asJinaSearchItem).filter((item): item is JinaSearchItem => item !== null);
}

async function fetchRetailerPage(
  retailer: string,
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<JinaSearchItem[]> {
  const targetUrl = retailerSearchUrl(retailer, query);
  const response = await fetch(`https://r.jina.ai/${targetUrl}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
  if (!data) throw new Error('response omitted data');
  const item = asJinaSearchItem({
    title: data.title,
    url: typeof data.url === 'string' ? data.url : targetUrl,
    description: data.description,
    content: data.content,
  });
  return item ? [item] : [];
}

function parseShopPrice(text: string): number | null {
  // Accept $, €, £, and common "USD 12.34" / "12.34 USD" forms from retailer dumps.
  const match =
    text.match(/(?:[$€£]|USD|EUR|GBP)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ??
    text.match(/\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:USD|EUR|GBP)\b/i);
  const matchedPrice = match?.[1];
  if (!matchedPrice) return null;
  const value = Number(matchedPrice.replaceAll(',', ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function runLiveRecommendations(
  query: string,
  count: number,
  location: string | null,
  constraints: string[],
  signal?: AbortSignal
): Promise<Array<{ name: string; recommendation: string; contact: { url: string } }>> {
  const apiKey = resolveJinaApiKey();
  if (!apiKey)
    throw new Error('CONFIGURATION_ERROR: JINA_API_KEY is required for findRecommendations');
  const suffix = [location, ...constraints].filter(Boolean).join(' ');
  const response = await fetch(
    `https://s.jina.ai/?q=${encodeURIComponent(`${query} ${suffix}`.trim())}`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal }
  );
  if (!response.ok) throw new Error(`RECOMMENDATION_ERROR: HTTP ${response.status}`);
  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  return (payload.data ?? [])
    .map((item) => {
      const name = typeof item.title === 'string' ? item.title : '';
      const url = typeof item.url === 'string' ? item.url : '';
      const recommendation =
        typeof item.description === 'string' && item.description.length > 0
          ? item.description
          : typeof item.content === 'string'
            ? item.content.slice(0, 500)
            : name;
      return name && url ? { name, recommendation, contact: { url } } : null;
    })
    .filter(
      (item): item is { name: string; recommendation: string; contact: { url: string } } =>
        item !== null
    )
    .slice(0, count);
}

async function runLiveShopSearch(
  sql: Sql,
  sessionId: string,
  query: string,
  retailers: string[],
  condition: string,
  priceMin: number | null,
  priceMax: number | null,
  verifiedOnly: boolean,
  signal?: AbortSignal
): Promise<{ listings: ShopSearchResult[]; durationMs: number }> {
  const apiKey = resolveJinaApiKey();
  if (!apiKey) throw new Error('CONFIGURATION_ERROR: JINA_API_KEY is required for shop_products');
  const started = Date.now();
  const listings: ShopSearchResult[] = [];
  const errors: string[] = [];
  let searchItems: JinaSearchItem[] = [];
  try {
    // Search once, then bind results to the requested retailer by URL.
    // Site-scoped fallback below covers retailers absent from the general SERP.
    searchItems = await fetchJinaSearchItems(query, apiKey, signal);
  } catch (error) {
    errors.push(`search: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const retailerKey of retailers) {
    const retailer = SHOP_RETAILERS[retailerKey];
    if (!retailer) continue;
    if (signal?.aborted) throw new Error('MCP request cancelled');
    const beforeRetailer = listings.length;
    const collect = (items: JinaSearchItem[]) => {
      for (const item of items) {
        const text = [item.title, item.description, item.content].join(' ');
        const price = parseShopPrice(text);
        if (
          price == null ||
          (priceMin != null && price < priceMin) ||
          (priceMax != null && price > priceMax)
        )
          continue;
        if (condition !== 'any' && !text.toLowerCase().includes(condition)) continue;
        if (verifiedOnly && !retailer.verified) continue;
        const trustLabel = retailer.verified ? 'Authorized' : 'Unverified';
        listings.push({
          title: item.title || `${retailerKey} listing`,
          price,
          priceFormatted: `$${price.toFixed(2)}`,
          retailer: retailerKey,
          condition: condition === 'any' ? 'new' : condition,
          url: item.url,
          dealScore: retailer.verified ? 0.75 : 0.5,
          trustTier: retailer.trustTier,
          sellerTrustScore: retailer.verified ? 95 : 70,
          isVerifiedSeller: retailer.verified,
          trustLabel,
        });
      }
    };

    collect(searchItems.filter((item) => belongsToRetailer(item.url, retailer.domain)));
    if (listings.length === beforeRetailer) {
      // Site-scoped SERP when the general result set omitted this retailer.
      // Soft-fail: upstream 4xx/5xx on site: queries must not poison the whole
      // shop run (write-fence RED TC-7 expects unfenced shop_products to resolve).
      try {
        const scoped = await fetchJinaSearchItems(
          `${query} site:${retailer.domain}`,
          apiKey,
          signal
        );
        collect(scoped.filter((item) => belongsToRetailer(item.url, retailer.domain)));
      } catch {
        /* optional fallback */
      }
    }
    if (listings.length === beforeRetailer) {
      try {
        collect(await fetchRetailerPage(retailerKey, query, apiKey, signal));
      } catch (error) {
        errors.push(`${retailerKey}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (errors.length > 0 && listings.length === 0)
    throw new Error(`RETAILER_ERROR: ${errors.join('; ')}`);
  const unique = [
    ...new Map(
      listings.map((item) => [
        createHash('sha256').update(`${item.title}:${item.retailer}`).digest('hex'),
        item,
      ])
    ).values(),
  ]
    .sort((a, b) => b.dealScore - a.dealScore || a.price - b.price)
    .slice(0, 50);
  await sql.begin(async (tx) => {
    let bestDealId: string | null = null;
    for (const [index, listing] of unique.entries()) {
      const listingId = randomUUID();
      if (index === 0) bestDealId = listingId;
      await tx`
        INSERT INTO shop_listings (id, session_id, title, price, currency, condition, retailer, url,
          product_hash, deal_score, trust_tier, seller_trust_score, is_verified_seller, is_duplicate)
        VALUES (${listingId}::uuid, ${sessionId}, ${listing.title}, ${listing.price}, 'USD', ${listing.condition},
          ${listing.retailer}, ${listing.url}, ${createHash('sha256').update(`${listing.title}:${listing.retailer}`).digest('hex')},
          ${listing.dealScore}, ${String(listing.trustTier)}, ${listing.sellerTrustScore}, ${listing.isVerifiedSeller}, ${index > 0 && unique[index - 1]?.title === listing.title})
      `;
    }
    await tx`
      UPDATE shop_sessions SET status = 'completed', total_listings = ${unique.length},
        best_deal_id = ${bestDealId}::uuid, completed_at = now(), updated_at = now()
      WHERE id = ${sessionId}::uuid
    `;
  });
  return { listings: unique, durationMs: Date.now() - started };
}

export async function executePostgresMcpTool(
  id: string,
  input: Record<string, unknown>,
  options?: { databaseUrl?: string; signal?: AbortSignal }
): Promise<unknown> {
  // D06-05 / D06-01: mutation-tool fence — fresh HOLO_MIGRATION_READ_ONLY read
  assertMcpWritable(id);

  const sql = createSql(
    resolveHolocronNonprodDatabaseUrl({
      databaseUrl: options?.databaseUrl,
      context: `MCP tool ${id}`,
    })
  );
  try {
    if (options?.signal?.aborted) throw new Error('MCP request cancelled');
    switch (id) {
      case 'get_research_session': {
        const sessionId = String(input.sessionId);
        const sessions = await sql`
          SELECT id::text AS "_id", id::text AS "sessionId", topic, status
          FROM research_sessions WHERE id = ${sessionId}::uuid LIMIT 1
        `;
        if (!sessions[0]) return null;
        const iterations = await sql`
          SELECT id::text AS "_id", iteration_number AS "iterationNumber", status,
                 findings_summary AS "findingsSummary", summary, sources, findings
          FROM research_iterations WHERE session_id = ${sessionId} ORDER BY iteration_number ASC
        `;
        return { ...sessions[0], topic: sessions[0].topic ?? '', iterations };
      }
      case 'search_research': {
        const query = String(input.query).toLowerCase();
        const limit = Math.min(Number(input.limit ?? 20), 100);
        const rows = await sql`
          SELECT id::text AS "sessionId", COALESCE(topic, '') AS topic, status,
                 (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt",
                 (CASE WHEN lower(COALESCE(topic, '')) LIKE ${`%${query}%`} THEN 1.0 ELSE 0.0 END)::float8 AS "relevanceScore"
          FROM research_sessions
          WHERE lower(COALESCE(topic, '')) LIKE ${`%${query}%`}
          ORDER BY "relevanceScore" DESC, created_at DESC LIMIT ${limit}
        `;
        return { sessions: rows, totalResults: rows.length };
      }
      case 'shop_products': {
        const query = String(input.query);
        const condition = String(input.condition ?? 'any');
        const priceMin = typeof input.priceMin === 'number' ? input.priceMin : null;
        const priceMax = typeof input.priceMax === 'number' ? input.priceMax : null;
        const retailers = (
          Array.isArray(input.retailers)
            ? input.retailers.map(String)
            : ['amazon', 'ebay', 'newegg', 'bestbuy']
        ).sort();
        const verifiedOnly = Boolean(input.verifiedOnly);
        const existing = await sql`
          SELECT id::text AS "sessionId", status, total_listings AS "totalListings"
          FROM shop_sessions
          WHERE query = ${query} AND condition = ${condition}
            AND price_min IS NOT DISTINCT FROM ${priceMin}
            AND price_max IS NOT DISTINCT FROM ${priceMax}
            AND retailers = ${sql.json(retailers)}
            AND verified_only IS NOT DISTINCT FROM ${verifiedOnly}
            AND status = 'completed'
            AND COALESCE(total_listings, 0) > 0
          ORDER BY created_at DESC LIMIT 1
        `;
        if (existing[0]) {
          const listings = await sql`
            SELECT title, price, retailer, condition, url, deal_score AS "dealScore",
                   trust_tier::int AS "trustTier", seller_trust_score AS "sellerTrustScore",
                   is_verified_seller AS "isVerifiedSeller"
            FROM shop_listings WHERE session_id = ${existing[0].sessionId}
            ORDER BY deal_score DESC NULLS LAST, price ASC
          `;
          const replayListings = listings.map((listing) => ({
            ...listing,
            priceFormatted: `$${Number(listing.price).toFixed(2)}`,
            trustLabel: listing.isVerifiedSeller ? 'Authorized' : 'Unverified',
          }));
          // Empty completed sessions are not durable successes — re-run live search.
          if (replayListings.length > 0) {
            return {
              sessionId: existing[0].sessionId,
              status: existing[0].status,
              totalListings: Number(existing[0].totalListings ?? replayListings.length),
              bestDeal: replayListings[0] ?? null,
              listings: replayListings,
            };
          }
        }
        const rows = await sql<Array<{ sessionId: string; status: string }>>`
          INSERT INTO shop_sessions (id, query, condition, price_min, price_max, retailers, verified_only, status)
          VALUES (${randomUUID()}::uuid, ${query}, ${condition}, ${priceMin}, ${priceMax},
                  ${sql.json(retailers)}, ${verifiedOnly}, 'pending')
          RETURNING id::text AS "sessionId", status
        `;
        const session = rows[0];
        if (!session) {
          throw new Error('SHOP_SESSION_CREATE_FAILED: insert returned no session');
        }
        try {
          const result = await runLiveShopSearch(
            sql,
            session.sessionId,
            query,
            retailers,
            condition,
            priceMin,
            priceMax,
            verifiedOnly,
            options?.signal
          );
          return {
            sessionId: session.sessionId,
            status: 'completed',
            totalListings: result.listings.length,
            bestDeal: result.listings[0] ?? null,
            listings: result.listings,
          };
        } catch (error) {
          const cancelled = options?.signal?.aborted === true;
          await sql`
            UPDATE shop_sessions SET status = ${cancelled ? 'cancelled' : 'failed'},
              error_reason = ${error instanceof Error ? error.message : String(error)},
              completed_at = now(), updated_at = now()
            WHERE id = ${session.sessionId}::uuid
          `;
          throw error;
        }
      }
      case 'assimilate_creator': {
        const profileId = String(input.profileId);
        const profile = await sql`
          SELECT id::text AS id FROM creator_profiles WHERE id = ${profileId}::uuid LIMIT 1
        `;
        if (!profile[0])
          return { success: false, status: 'failed', error: 'creator profile not found' };
        const videos = await sql`
          SELECT c.content_id AS "contentId", c.url AS "sourceUrl"
          FROM subscription_sources s
          JOIN subscription_content c ON c.source_id = s.id
          WHERE s.creator_profile_id = ${profileId}::uuid
        `;
        const existing = await sql`
          SELECT count(*)::int AS count
          FROM video_transcripts v
          WHERE v.content_id IN (
            SELECT c.content_id
            FROM subscription_sources s
            JOIN subscription_content c ON c.source_id = s.id
            WHERE s.creator_profile_id = ${profileId}::uuid
          )
        `;
        const forceRegenerate = Boolean(input.forceRegenerate);
        let queued = 0;
        for (const video of videos) {
          const alreadyQueued = await sql`
            SELECT 1 FROM transcript_jobs
            WHERE content_id = ${video.contentId} AND status IN ('pending', 'running', 'in_progress')
            LIMIT 1
          `;
          if (alreadyQueued[0] && !forceRegenerate) continue;
          if (!forceRegenerate) {
            const transcript = await sql`
              SELECT 1 FROM video_transcripts WHERE content_id = ${video.contentId} LIMIT 1
            `;
            if (transcript[0]) continue;
          }
          await sql`
            INSERT INTO transcript_jobs (id, content_id, source_url, status, priority)
            VALUES (${randomUUID()}::uuid, ${video.contentId}, ${video.sourceUrl ?? null}, 'pending', 5)
          `;
          queued += 1;
        }
        return {
          success: true,
          status: queued > 0 ? 'queued' : 'completed',
          videosFound: videos.length,
          transcriptsCreated: Number(existing[0]?.count ?? 0),
          transcriptsSkipped: Math.max(0, videos.length - queued - Number(existing[0]?.count ?? 0)),
          error: null,
        };
      }
      case 'get_creator_transcripts': {
        const limit = Math.min(Number(input.limit ?? 100), 100);
        const profile = await sql`
          SELECT handle FROM creator_profiles WHERE id = ${String(input.profileId)}::uuid LIMIT 1
        `;
        if (!profile[0]) return { success: false, error: 'creator profile not found' };
        const rows = await sql`
          SELECT v.content_id AS "contentId", v.source_url AS "sourceUrl",
                 v.transcript_source AS "transcriptSource", v.preview_text AS "previewText",
                 v.word_count AS "wordCount", EXTRACT(EPOCH FROM v.generated_at) * 1000 AS "generatedAt"
          FROM subscription_sources s
          JOIN subscription_content c ON c.source_id = s.id
          JOIN video_transcripts v ON v.content_id = c.content_id
          WHERE s.creator_profile_id = ${String(input.profileId)}::uuid
          LIMIT ${limit}
        `;
        return {
          success: true,
          data: {
            profileId: String(input.profileId),
            creatorHandle: profile[0].handle ?? '',
            transcriptCount: rows.length,
            transcripts: rows,
          },
        };
      }
      case 'regenerate_transcript': {
        const contentId = String(input.contentId);
        const known = await sql`
          SELECT 1 AS ok FROM subscription_content WHERE content_id = ${contentId} LIMIT 1
        `;
        const knownVideo = known[0]
          ? known
          : await sql`SELECT 1 AS ok FROM video_transcripts WHERE content_id = ${contentId} LIMIT 1`;
        if (!knownVideo[0]) {
          throw new Error('NOT_FOUND: content does not exist');
        }
        const existing = await sql`
          SELECT id::text AS "jobId" FROM transcript_jobs
          WHERE content_id = ${contentId} AND status IN ('pending', 'running', 'in_progress')
          ORDER BY created_at DESC LIMIT 1
        `;
        if (existing[0]) {
          return {
            success: true,
            data: {
              ...existing[0],
              created: false,
              contentId,
              message: 'transcript job already exists',
            },
          };
        }
        const sourceUrl =
          typeof input.sourceUrl === 'string'
            ? input.sourceUrl
            : `https://www.youtube.com/watch?v=${contentId}`;
        const rows = await sql`
          INSERT INTO transcript_jobs (id, content_id, source_url, status, priority)
          VALUES (${randomUUID()}::uuid, ${contentId}, ${sourceUrl}, 'pending', ${Number(input.priority ?? 5)})
          RETURNING id::text AS "jobId"
        `;
        return {
          success: true,
          data: {
            jobId: rows[0]?.jobId,
            created: true,
            contentId,
            message: 'transcript job queued',
          },
        };
      }
      case 'findRecommendations': {
        return await runLiveRecommendations(
          String(input.query),
          Math.min(Number(input.count ?? 5), 7),
          typeof input.location === 'string' ? input.location : null,
          Array.isArray(input.constraints) ? input.constraints.map(String) : [],
          options?.signal
        );
      }
      case 'get_whats_new_report': {
        const rows = await sql`
          SELECT id::text AS id, period_start AS "periodStart", period_end AS "periodEnd",
                 summary_json AS report, findings_json AS findings, findings_count AS "findingsCount",
                 created_at AS "generatedAt"
          FROM whats_new_reports ORDER BY created_at DESC LIMIT 1
        `;
        const row = rows[0];
        if (!row) return null;
        // Match getWhatsNewReportOutputSchema (content/generatedAt number/report object).
        const generatedAt =
          row.generatedAt instanceof Date
            ? row.generatedAt.getTime()
            : typeof row.generatedAt === 'number'
              ? row.generatedAt
              : typeof row.generatedAt === 'string'
                ? Date.parse(row.generatedAt)
                : undefined;
        const reportObj =
          row.report && typeof row.report === 'object' && !Array.isArray(row.report)
            ? (row.report as Record<string, unknown>)
            : undefined;
        return {
          content: JSON.stringify(row.report ?? row.findings ?? {}),
          ...(Number.isFinite(generatedAt) ? { generatedAt } : {}),
          ...(reportObj ? { report: reportObj } : {}),
        };
      }
      case 'list_whats_new_reports': {
        const limit = Math.min(Number(input.limit ?? 50), 100);
        return await sql`
          SELECT id::text AS id, period_start AS "periodStart", period_end AS "periodEnd",
                 findings_count AS "findingsCount", discovery_count AS "discoveryCount",
                 release_count AS "releaseCount", trend_count AS "trendCount", created_at AS "createdAt"
          FROM whats_new_reports ORDER BY created_at DESC LIMIT ${limit}
        `;
      }
      case 'get_shop_session': {
        const rows = await sql`
          SELECT id::text AS "sessionId", query, condition, price_min AS "priceMin", price_max AS "priceMax",
                 retailers, status, total_listings AS "totalListings", best_deal_id AS "bestDealId",
                 error_reason AS "errorReason", created_at AS "createdAt", completed_at AS "completedAt"
          FROM shop_sessions WHERE id = ${String(input.sessionId)}::uuid LIMIT 1
        `;
        return { session: rows[0] ?? null };
      }
      case 'get_shop_listings': {
        const limit = Math.min(Number(input.limit ?? 100), 100);
        const rows = await sql`
          SELECT id::text AS id, title, price, original_price AS "originalPrice", currency, condition,
                 retailer, seller, seller_rating AS "sellerRating", url, image_url AS "imageUrl",
                 in_stock AS "inStock", deal_score AS "dealScore", is_duplicate AS "isDuplicate"
          FROM shop_listings WHERE session_id = ${String(input.sessionId)}
          ORDER BY ${input.sortBy === 'price' ? sql`price ASC` : sql`created_at DESC`} LIMIT ${limit}
        `;
        return { listings: rows };
      }
      case 'start_assimilation': {
        const repositoryUrl = String(input.repositoryUrl);
        const existing = await sql`
          SELECT id::text AS "sessionId", status FROM assimilation_sessions
          WHERE repository_url = ${repositoryUrl} AND status NOT IN ('cancelled', 'completed')
          ORDER BY created_at DESC LIMIT 1
        `;
        if (existing[0]) return { ...existing[0], existing: true };
        const rows = await sql`
          INSERT INTO assimilation_sessions (id, repository_url, profile, status, auto_approve)
          VALUES (${randomUUID()}::uuid, ${repositoryUrl}, ${String(input.profile ?? 'standard')}, 'planning', ${Boolean(input.autoApprove)})
          RETURNING id::text AS "sessionId", status
        `;
        return { ...rows[0], existing: false };
      }
      case 'get_assimilation_status': {
        const rows = await sql`
          SELECT id::text AS "_id", status, profile, repository_name AS "repositoryName",
                 repository_url AS "repositoryUrl", current_iteration AS "currentIteration",
                 max_iterations AS "maxIterations", dimension_scores AS "dimensionScores",
                 estimated_cost_usd AS "estimatedCostUsd", plan_summary AS "planSummary",
                 plan_content AS "planContent", document_id AS "documentId", error_reason AS "errorReason",
                 (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt",
                 (EXTRACT(EPOCH FROM completed_at) * 1000)::float8 AS "completedAt"
          FROM assimilation_sessions WHERE id = ${String(input.sessionId)}::uuid LIMIT 1
        `;
        return rows[0] ?? null;
      }
      case 'approve_assimilation_plan': {
        const sessionId = String(input.sessionId);
        const current = await sql`
          SELECT status FROM assimilation_sessions WHERE id = ${sessionId}::uuid LIMIT 1
        `;
        if (!current[0]) throw new Error('NOT_FOUND: assimilation session does not exist');
        // Idempotent by sessionId — already-approved (running) is a safe no-op.
        if (current[0].status === 'running' || current[0].status === 'in_progress') {
          return { approved: true, sessionId };
        }
        const rows = await sql`
          UPDATE assimilation_sessions SET status = 'running', updated_at = now()
          WHERE id = ${sessionId}::uuid AND status IN ('pending_approval', 'planning')
          RETURNING id
        `;
        if (!rows[0])
          throw new Error('INVALID_STATE: assimilation session is not awaiting approval');
        return { approved: true, sessionId };
      }
      case 'reject_assimilation_plan': {
        const sessionId = String(input.sessionId);
        const feedback = typeof input.feedback === 'string' ? input.feedback : null;
        const current = await sql`
          SELECT status, plan_feedback AS "planFeedback"
          FROM assimilation_sessions WHERE id = ${sessionId}::uuid LIMIT 1
        `;
        if (!current[0]) throw new Error('NOT_FOUND: assimilation session does not exist');
        const targetStatus = feedback ? 'planning' : 'rejected';
        // Idempotent by (sessionId, feedback) — same reject/replan is a safe no-op.
        if (
          current[0].status === targetStatus &&
          (feedback == null || current[0].planFeedback === feedback)
        ) {
          return { rejected: true, sessionId, replanning: Boolean(feedback) };
        }
        const rows = await sql`
          UPDATE assimilation_sessions
          SET status = ${targetStatus}, plan_feedback = ${feedback}, updated_at = now()
          WHERE id = ${sessionId}::uuid AND status IN ('pending_approval', 'planning')
          RETURNING id
        `;
        if (!rows[0])
          throw new Error('INVALID_STATE: assimilation session is not awaiting approval');
        return {
          rejected: true,
          sessionId,
          replanning: Boolean(feedback),
        };
      }
      case 'cancel_assimilation': {
        const sessionId = String(input.sessionId);
        const current = await sql`
          SELECT status FROM assimilation_sessions WHERE id = ${sessionId}::uuid LIMIT 1
        `;
        if (!current[0]) throw new Error('NOT_FOUND: assimilation session does not exist');
        // Idempotent by sessionId — already-cancelled is a safe no-op.
        if (current[0].status === 'cancelled' || current[0].status === 'canceled') {
          return { cancelled: true, sessionId };
        }
        const rows = await sql`
          UPDATE assimilation_sessions SET status = 'cancelled', updated_at = now(), completed_at = now()
          WHERE id = ${sessionId}::uuid AND status NOT IN ('completed', 'cancelled', 'canceled')
          RETURNING id
        `;
        if (!rows[0]) throw new Error('NOT_FOUND: assimilation session is not cancellable');
        return { cancelled: true, sessionId };
      }
      case 'steer_assimilation': {
        const rows = await sql`
          UPDATE assimilation_sessions SET steering_note = ${String(input.note)}, updated_at = now()
          WHERE id = ${String(input.sessionId)}::uuid AND status NOT IN ('completed', 'cancelled', 'canceled')
          RETURNING id
        `;
        if (!rows[0]) throw new Error('NOT_FOUND: assimilation session is not steerable');
        return { steered: true, sessionId: String(input.sessionId) };
      }
      case 'search_improvements': {
        const query = String(input.query);
        const limit = Math.min(Number(input.limit ?? 20), 100);
        return await sql`
          SELECT id::text AS "_id", description, title, status, source_screen AS "sourceScreen",
                 ts_rank(search_vector, websearch_to_tsquery('english', ${query}))::float8 AS score
          FROM improvement_requests
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
          ORDER BY score DESC, created_at DESC LIMIT ${limit}
        `;
      }
      case 'get_improvement': {
        const rows = await sql`
          SELECT id::text AS "_id", description, status, source_screen AS "sourceScreen",
                 closure_reason AS "closedReason", (EXTRACT(EPOCH FROM closed_at) * 1000)::float8 AS "closedAt",
                 (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt"
          FROM improvement_requests WHERE id = ${String(input.id)}::uuid LIMIT 1
        `;
        return rows[0] ?? null;
      }
      case 'list_improvements': {
        const status =
          input.status === 'closed' ? 'completed' : input.status === 'open' ? 'pending' : null;
        const limit = Math.min(Number(input.limit ?? 100), 100);
        return await sql`
          SELECT id::text AS "_id", description, status, source_screen AS "sourceScreen",
                 EXTRACT(EPOCH FROM created_at) * 1000 AS "createdAt"
          FROM improvement_requests
          WHERE (${status}::text IS NULL OR status = ${status})
          ORDER BY created_at DESC LIMIT ${limit}
        `;
      }
      case 'add_improvement': {
        const ids: string[] = [];
        for (const item of input.items as Array<{ description: string; sourceScreen?: string }>) {
          const rows = await sql`
            INSERT INTO improvement_requests (id, description, source_screen, status)
            VALUES (${randomUUID()}::uuid, ${item.description}, ${item.sourceScreen ?? null}, 'pending')
            RETURNING id::text AS id
          `;
          if (rows[0]) ids.push(String(rows[0].id));
        }
        return { created: ids.length, ids };
      }
      case 'close_improvement':
      case 'set_improvement_status': {
        const requestId = String(input.id);
        const closed = id === 'close_improvement' || input.status === 'closed';
        const dbStatus = closed ? 'completed' : 'pending';
        await sql`
          UPDATE improvement_requests
          SET status = ${dbStatus},
              closure_reason = ${typeof input.reason === 'string' ? input.reason : null},
              closure_evidence = ${sql.json(toSqlJsonValue(input.evidence ?? []))},
              closed_at = CASE WHEN ${closed} THEN now() ELSE NULL END,
              updated_at = now()
          WHERE id = ${requestId}::uuid
          RETURNING id::text AS id, status
        `;
        return { id: requestId, status: closed ? 'closed' : 'open' };
      }
      case 'search_vector': {
        const embedding = `[${(input.embedding as number[]).join(',')}]`;
        const limit = Math.min(Number(input.limit ?? 20), 100);
        const rows = await sql`
          SELECT id::text AS _id, situating_header AS title, text AS content, (1 - (embedding <=> ${embedding}::vector))::float8 AS score
          FROM passages
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${embedding}::vector LIMIT ${limit}
        `;
        return {
          results: rows.map((row) => {
            const score = Number((row as { score?: unknown }).score);
            return {
              ...row,
              score: Number.isFinite(score) ? score : 0,
            };
          }),
          totalResults: rows.length,
        };
      }
      case 'get_subscription_content': {
        const limit = Math.min(Number(input.limit ?? 100), 100);
        const researchStatus =
          typeof input.researchStatus === 'string' ? input.researchStatus : null;
        const rows = await sql`
          SELECT id::text AS id, source_id AS "sourceId", content_id AS "contentId", title, url,
                 metadata_json AS metadata, research_status AS "researchStatus", discovered_at AS "discoveredAt"
          FROM subscription_content
          WHERE source_id = ${String(input.subscriptionId)}
            AND (${researchStatus}::text IS NULL OR research_status = ${researchStatus})
          ORDER BY discovered_at DESC LIMIT ${limit}
        `;
        return { content: rows };
      }
      case 'set_subscription_filter': {
        // Idempotent by (sourceId|sourceType, ruleName) — return existing row on replay.
        const sourceId = typeof input.sourceId === 'string' ? input.sourceId : null;
        const sourceType = typeof input.sourceType === 'string' ? input.sourceType : null;
        const ruleName = String(input.ruleName);
        const ruleValue =
          typeof input.ruleValue === 'string' ? input.ruleValue : JSON.stringify(input.ruleValue);
        const weight = typeof input.weight === 'number' ? input.weight : null;
        if (!sourceId && !sourceType) {
          throw new Error('VALIDATION_ERROR: Neither sourceId nor sourceType provided');
        }
        const existing = await sql`
          SELECT id::text AS "filterId", rule_name AS "ruleName", rule_type AS "ruleType",
                 rule_value AS "ruleValue", weight
          FROM subscription_filters
          WHERE rule_name = ${ruleName}
            AND (
              (${sourceId}::text IS NOT NULL AND source_id = ${sourceId})
              OR (
                ${sourceId}::text IS NULL
                AND ${sourceType}::text IS NOT NULL
                AND source_type = ${sourceType}
              )
            )
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (existing[0]) {
          await sql`
            UPDATE subscription_filters
            SET rule_type = ${String(input.ruleType)},
                rule_value = ${ruleValue},
                weight = ${weight},
                source_id = COALESCE(${sourceId}, source_id),
                source_type = COALESCE(${sourceType}, source_type)
            WHERE id = ${String(existing[0].filterId)}::uuid
          `;
          return {
            filterId: existing[0].filterId,
            ruleName,
            ruleType: String(input.ruleType),
            ruleValue,
            weight,
          };
        }
        const rows = await sql`
          INSERT INTO subscription_filters (id, source_id, source_type, rule_name, rule_type, rule_value, weight)
          VALUES (${randomUUID()}::uuid, ${sourceId}, ${sourceType}, ${ruleName},
                  ${String(input.ruleType)}, ${ruleValue}, ${weight})
          RETURNING id::text AS "filterId", rule_name AS "ruleName", rule_type AS "ruleType", rule_value AS "ruleValue", weight
        `;
        return rows[0];
      }
      case 'get_subscription_filters': {
        const subscriptionId =
          typeof input.subscriptionId === 'string' ? input.subscriptionId : null;
        const sourceType = typeof input.sourceType === 'string' ? input.sourceType : null;
        const rows = await sql`
          SELECT id::text AS "filterId", source_id AS "sourceId", source_type AS "sourceType",
                 rule_name AS "ruleName", rule_type AS "ruleType", rule_value AS "ruleValue", weight
          FROM subscription_filters
          WHERE (${subscriptionId}::text IS NULL OR source_id = ${subscriptionId})
            AND (${sourceType}::text IS NULL OR source_type = ${sourceType})
          ORDER BY created_at DESC
        `;
        return { filters: rows };
      }
      case 'check_subscriptions': {
        const sourceType = typeof input.sourceType === 'string' ? input.sourceType : null;
        const sources = await sql<
          Array<{
            id: string;
            identifier: string;
            name: string | null;
            sourceType: string;
            feedUrl: string;
          }>
        >`
          SELECT id::text AS id, identifier, name, source_type AS "sourceType",
                 feed_url AS "feedUrl"
          FROM subscription_sources
          WHERE feed_url IS NOT NULL
            AND (${sourceType}::text IS NULL OR source_type = ${sourceType})
          ORDER BY created_at ASC
        `;
        let totalFetched = 0;
        let totalQueued = 0;
        const errors: string[] = [];
        for (const source of sources) {
          try {
            if (options?.signal?.aborted) throw new Error('MCP request cancelled');
            const response = await fetch(source.feedUrl, {
              headers: {
                Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml',
                'User-Agent': 'Holocron/1.0 subscription-check',
              },
              signal: options?.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body = await response.text();
            const entries = parseFeedEntries(body);
            if (entries.length === 0) throw new Error('feed contained no Atom/RSS entries');
            totalFetched += entries.length;
            for (const entry of entries) {
              const inserted = await sql`
                INSERT INTO subscription_content (
                  id, source_id, content_id, title, url, metadata_json,
                  passed_filter, research_status, discovered_at
                )
                SELECT ${randomUUID()}::uuid, ${source.id}::uuid, ${entry.contentId},
                       ${entry.title}, ${entry.url},
                       ${sql.json(
                         toSqlJsonValue({
                           feedUrl: source.feedUrl,
                           publishedAt: entry.publishedAt,
                           summary: entry.summary,
                         })
                       )},
                       true, 'pending', COALESCE(${entry.publishedAt}::timestamptz, now())
                WHERE NOT EXISTS (
                  SELECT 1 FROM subscription_content
                  WHERE source_id = ${source.id}::uuid AND content_id = ${entry.contentId}
                )
                RETURNING id::text AS id
              `;
              totalQueued += inserted.length;
            }
            await sql`
              UPDATE subscription_sources SET last_checked = now(), updated_at = now()
              WHERE id = ${source.id}::uuid
            `;
          } catch (error) {
            errors.push(
              `${source.identifier}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
        return {
          sourcesChecked: sources.length,
          totalFetched,
          totalQueued,
          errors,
        };
      }
      case 'search_fts': {
        const query = String(input.query);
        const limit = Math.min(Number(input.limit ?? 20), 100);
        const rows = await sql`
          SELECT id::text AS _id, title, content,
                 ts_rank(search_vector, websearch_to_tsquery('english', ${query}))::float8 AS score
          FROM documents
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
          ORDER BY score DESC, created_at DESC
          LIMIT ${limit}
        `;
        return {
          results: rows,
          totalResults: rows.length,
        };
      }
      case 'hybrid_search': {
        const query = String(input.query);
        const limit = Math.min(Number(input.limit ?? 20), 100);
        try {
          const hybrid = await rrfHybridSearch(createDb(sql), sql, { query, limit });
          return {
            results: hybrid.results.map(({ _id, title, content, score }) => ({
              _id,
              ...(title !== undefined ? { title } : {}),
              ...(content !== undefined ? { content } : {}),
              ...(score !== undefined ? { score } : {}),
            })),
            totalResults: hybrid.totalResults,
            searchMethod: 'hybrid',
          };
        } catch (error) {
          if (error instanceof RoleUnavailableError) {
            throw new Error(`ROLE_UNAVAILABLE: ${error.message}`);
          }
          throw error;
        }
      }
      case 'add_subscription': {
        const sourceType = String(input.sourceType);
        const identifier = String(input.identifier);
        const existing = await sql`
          SELECT id::text AS "subscriptionId", source_type AS "sourceType", identifier, name,
                 (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt"
          FROM subscription_sources
          WHERE source_type = ${sourceType} AND identifier = ${identifier}
          LIMIT 1
        `;
        if (existing[0]) return existing[0];
        const rows = await sql`
          INSERT INTO subscription_sources (id, source_type, identifier, name, url, feed_url)
          VALUES (${randomUUID()}::uuid, ${sourceType}, ${identifier}, ${String(input.name)},
                  ${typeof input.url === 'string' ? input.url : null},
                  ${typeof input.feedUrl === 'string' ? input.feedUrl : null})
          RETURNING id::text AS "subscriptionId", source_type AS "sourceType", identifier, name,
                    (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt"
        `;
        return rows[0];
      }
      case 'remove_subscription': {
        const subscriptionId = String(input.subscriptionId);
        await sql`DELETE FROM subscription_content WHERE source_id = ${subscriptionId}::uuid`;
        await sql`DELETE FROM subscription_filters WHERE source_id = ${subscriptionId}::uuid`;
        const rows = await sql`
          DELETE FROM subscription_sources WHERE id = ${subscriptionId}::uuid
          RETURNING id::text AS "subscriptionId", source_type AS "sourceType", identifier, name
        `;
        return { deleted: rows.length === 1, ...(rows[0] ? { subscription: rows[0] } : {}) };
      }
      case 'list_subscriptions': {
        const limit = Math.min(Number(input.limit ?? 100), 100);
        const sourceType = typeof input.sourceType === 'string' ? input.sourceType : null;
        const autoResearchOnly = input.autoResearchOnly === true;
        const rows = await sql`
          SELECT id::text AS "subscriptionId", source_type AS "sourceType", identifier, name,
                 url, feed_url AS "feedUrl", auto_research AS "autoResearch"
          FROM subscription_sources
          WHERE (${sourceType}::text IS NULL OR source_type = ${sourceType})
            AND (${autoResearchOnly} = false OR auto_research = true)
          ORDER BY created_at DESC LIMIT ${limit}
        `;
        return { subscriptions: rows };
      }
      case 'store_tool': {
        const tags = Array.isArray(input.tags) ? input.tags : [];
        const useCases = Array.isArray(input.useCases) ? input.useCases : [];
        const keywords = Array.isArray(input.keywords) ? input.keywords : [];
        const rows = await sql`
          INSERT INTO toolbelt_tools (
            id, title, description, content, source_url, source_type, category, status,
            tags, use_cases, keywords, language, date, time
          ) VALUES (
            ${randomUUID()}::uuid, ${String(input.title)}, ${typeof input.description === 'string' ? input.description : null},
            ${typeof input.content === 'string' ? input.content : null}, ${typeof input.sourceUrl === 'string' ? input.sourceUrl : null},
            ${String(input.sourceType)}, ${String(input.category)}, ${toDatabaseToolStatus(input.status ?? 'draft')},
            ${sql.json(toSqlJsonValue(tags))}, ${sql.json(toSqlJsonValue(useCases))},
            ${sql.json(toSqlJsonValue(keywords))}, ${typeof input.language === 'string' ? input.language : null},
            ${typeof input.date === 'string' ? input.date : null}, ${typeof input.time === 'string' ? input.time : null}
          )
          RETURNING id::text AS "toolId", title
        `;
        return { ...rows[0], embeddingStatus: 'pending' };
      }
      case 'get_tool': {
        const rows = await sql`
          SELECT id::text AS "toolId", title, description, content, source_url AS "sourceUrl",
                 source_type AS "sourceType", category,
                 CASE WHEN status = 'completed' THEN 'complete' ELSE status END AS status,
                 tags, use_cases AS "useCases",
                 keywords, language, date, time
          FROM toolbelt_tools WHERE id = ${String(input.toolId)}::uuid LIMIT 1
        `;
        return rows[0] ?? null;
      }
      case 'list_tools': {
        const limit = Math.min(Number(input.limit ?? 100), 100);
        const category = typeof input.category === 'string' ? input.category : null;
        const status = typeof input.status === 'string' ? toDatabaseToolStatus(input.status) : null;
        const sourceType = typeof input.sourceType === 'string' ? input.sourceType : null;
        const rows = await sql`
          SELECT id::text AS "toolId", title, description, category,
                 CASE WHEN status = 'completed' THEN 'complete' ELSE status END AS status,
                 source_type AS "sourceType", source_url AS "sourceUrl"
          FROM toolbelt_tools
          WHERE (${category}::text IS NULL OR category = ${category})
            AND (${status}::text IS NULL OR status = ${status})
            AND (${sourceType}::text IS NULL OR source_type = ${sourceType})
          ORDER BY created_at DESC LIMIT ${limit}
        `;
        return { tools: rows, total: rows.length };
      }
      case 'search_tools': {
        const query = String(input.query);
        const limit = Math.min(Number(input.limit ?? 20), 100);
        const category = typeof input.category === 'string' ? input.category : null;
        const rows = await sql`
          SELECT id::text AS "toolId", title, description, content,
                 ts_rank(search_vector, websearch_to_tsquery('english', ${query}))::float8 AS score
          FROM toolbelt_tools
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
            AND (${category}::text IS NULL OR category = ${category})
          ORDER BY score DESC, created_at DESC LIMIT ${limit}
        `;
        return { results: rows, totalResults: rows.length, searchMethod: 'postgres-fts' };
      }
      case 'remove_tool': {
        const rows = await sql`
          DELETE FROM toolbelt_tools WHERE id = ${String(input.toolId)}::uuid RETURNING id::text AS "toolId"
        `;
        return { deleted: rows.length === 1, toolId: String(input.toolId) };
      }
      case 'update_tool': {
        const toolId = String(input.toolId);
        if (typeof input.title === 'string')
          await sql`UPDATE toolbelt_tools SET title = ${input.title} WHERE id = ${toolId}::uuid`;
        if (typeof input.description === 'string')
          await sql`UPDATE toolbelt_tools SET description = ${input.description} WHERE id = ${toolId}::uuid`;
        if (typeof input.content === 'string')
          await sql`UPDATE toolbelt_tools SET content = ${input.content} WHERE id = ${toolId}::uuid`;
        if (typeof input.status === 'string')
          await sql`
            UPDATE toolbelt_tools SET status = ${toDatabaseToolStatus(input.status)}
            WHERE id = ${toolId}::uuid
          `;
        return { toolId, updated: true, embeddingStatus: 'pending' };
      }
      case 'get_document': {
        // REDHAT-FIX-RH-S30-02: route content reads via observed data plane.
        const planeRead = await readDocumentFromObservedPlane(String(input.documentId));
        if (planeRead.status >= 500) {
          throw new Error(
            `DATA_PLANE_READ_FAILED: ${planeRead.error ?? 'postgres_document_read_failed'}`
          );
        }
        if (planeRead.source === 'convex') {
          throw new Error(
            `RETIRED_DATA_PLANE: ${planeRead.error ?? 'retired_cloud_plane_removed_d08_02'} (data_plane=${planeRead.data_plane ?? 'unknown'})`
          );
        }
        const rows = await sql`
          SELECT id::text AS "documentId", title, content, status, is_public AS "isPublic",
                 share_token AS "shareToken", date, created_at AS "createdAt"
          FROM documents WHERE id = ${String(input.documentId)}::uuid LIMIT 1
        `;
        const row = rows[0] as Record<string, unknown> | undefined;
        if (!row) return null;
        return { ...row, data_plane: planeRead.data_plane ?? 'postgres', source: 'postgres' };
      }
      case 'list_documents': {
        const limit = Math.min(Number(input.limit ?? 50), 100);
        const rows = await sql`
          SELECT id::text AS id, title, content, status, is_public AS "isPublic", date,
                 created_at AS "createdAt"
          FROM documents ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}
        `;
        const hasMore = rows.length > limit;
        return { documents: rows.slice(0, limit), hasMore, nextCursor: null };
      }
      case 'store_document': {
        const rows = await sql`
          INSERT INTO documents (id, title, content, status, is_public)
          VALUES (${randomUUID()}::uuid, ${String(input.title)}, ${String(input.content)}, 'draft', false)
          RETURNING id::text AS "documentId", title
        `;
        const stored = rows[0] as { documentId?: string; title?: string } | undefined;
        // REDHAT-FIX-RH-S30-03: production-bound write audit when export watermark active.
        // Fail closed: do not return success if the audit ledger write fails.
        if (stored?.documentId && isExportWatermarkActive()) {
          const audit = await recordPostExportAcceptedWrite({
            surface: 'mcp.store_document',
            writeRowId: stored.documentId,
            committedAtMs: Date.now(),
          });
          if (audit.ok !== true) {
            throw new Error(
              `POST_EXPORT_WRITE_AUDIT_FAILED: ${audit.code}: ${audit.message} (documentId=${stored.documentId})`
            );
          }
        }
        return { ...stored, embeddingStatus: 'pending' };
      }
      case 'update_document': {
        const documentId = String(input.documentId);
        if (typeof input.title === 'string') {
          await sql`UPDATE documents SET title = ${input.title} WHERE id = ${documentId}::uuid`;
        }
        if (typeof input.content === 'string') {
          await sql`UPDATE documents SET content = ${input.content} WHERE id = ${documentId}::uuid`;
        }
        return { documentId, updated: true, embeddingStatus: 'pending' };
      }
      case 'share_document': {
        const documentId = String(input.documentId);
        if (input.isPublic === false) {
          throw new Error('INVALID_ARGUMENT: revoke a public link with unshare_document');
        }
        const existing = await sql`
          SELECT id::text AS "documentId", is_public AS "isPublic", share_token AS "shareToken"
          FROM documents WHERE id = ${documentId}::uuid LIMIT 1
        `;
        const row = existing[0] as
          | { documentId: string; isPublic: boolean; shareToken: string | null }
          | undefined;
        if (!row) {
          throw new Error('NOT_FOUND: document does not exist');
        }
        const keepToken =
          typeof row.shareToken === 'string' && row.shareToken.length > 0 ? row.shareToken : null;
        if (Boolean(row.isPublic) && keepToken) {
          return {
            documentId: row.documentId,
            isPublic: true as const,
            shareToken: keepToken,
            shareUrl: buildPublicShareUrl(keepToken),
          };
        }
        const shareToken = keepToken ?? `mcp-${randomUUID()}`;
        const rows = await sql`
          UPDATE documents SET is_public = true, share_token = ${shareToken}
          WHERE id = ${documentId}::uuid
          RETURNING id::text AS "documentId", share_token AS "shareToken"
        `;
        const updated = rows[0] as { documentId: string; shareToken: string } | undefined;
        if (!updated?.shareToken) {
          throw new Error('INTERNAL_SERVER_ERROR: Postgres share_document update failed');
        }
        return {
          documentId: updated.documentId,
          isPublic: true as const,
          shareToken: updated.shareToken,
          shareUrl: buildPublicShareUrl(updated.shareToken),
        };
      }
      case 'unshare_document': {
        const documentId = String(input.documentId);
        const existing = await sql`
          SELECT id::text AS "documentId", is_public AS "isPublic"
          FROM documents WHERE id = ${documentId}::uuid LIMIT 1
        `;
        const row = existing[0] as { documentId: string; isPublic: boolean } | undefined;
        if (!row) {
          throw new Error('NOT_FOUND: document does not exist');
        }
        if (!row.isPublic) {
          return { documentId: row.documentId, isPublic: false as const };
        }
        await sql`
          UPDATE documents SET is_public = false, share_token = null
          WHERE id = ${documentId}::uuid
        `;
        return { documentId, isPublic: false as const };
      }
      default:
        throw new Error(`MCP tool '${id}' has no Postgres executor yet`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
