import { createHash, randomUUID } from 'node:crypto';
import { assertMcpWritable } from '../cutover/soak-fence.ts';
import type { Sql } from '../db/client.ts';
import { createSql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const match = text.match(/(?:[$€£])\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
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
  const apiKey = process.env.JINA_API_KEY;
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
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error('CONFIGURATION_ERROR: JINA_API_KEY is required for shop_products');
  const started = Date.now();
  const listings: ShopSearchResult[] = [];
  const errors: string[] = [];
  let searchItems: JinaSearchItem[] = [];
  try {
    // Jina's site-scoped search currently returns upstream 500s. Search once,
    // then bind results to the requested retailer by URL before extracting them.
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
          title: item.title,
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
    for (const [index, listing] of unique.entries()) {
      await tx`
        INSERT INTO shop_listings (id, session_id, title, price, currency, condition, retailer, url,
          product_hash, deal_score, trust_tier, seller_trust_score, is_verified_seller, is_duplicate)
        VALUES (${randomUUID()}::uuid, ${sessionId}, ${listing.title}, ${listing.price}, 'USD', ${listing.condition},
          ${listing.retailer}, ${listing.url}, ${createHash('sha256').update(`${listing.title}:${listing.retailer}`).digest('hex')},
          ${listing.dealScore}, ${String(listing.trustTier)}, ${listing.sellerTrustScore}, ${listing.isVerifiedSeller}, ${index > 0 && unique[index - 1]?.title === listing.title})
      `;
    }
    const best = unique[0];
    await tx`
      UPDATE shop_sessions SET status = 'completed', total_listings = ${unique.length},
        best_deal_id = ${best?.url ?? null}, completed_at = now(), updated_at = now()
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
                 CASE WHEN lower(COALESCE(topic, '')) LIKE ${`%${query}%`} THEN 1.0 ELSE 0.0 END AS "relevanceScore"
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
          return {
            sessionId: existing[0].sessionId,
            status: existing[0].status,
            totalListings: Number(existing[0].totalListings ?? replayListings.length),
            bestDeal: replayListings[0] ?? null,
            listings: replayListings,
          };
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
          SELECT content_id AS "contentId", url AS "sourceUrl"
          FROM subscription_content WHERE source_id = ${profileId}
        `;
        const existing = await sql`
          SELECT count(*)::int AS count
          FROM video_transcripts WHERE content_id IN (SELECT content_id FROM subscription_content WHERE source_id = ${profileId})
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
          FROM subscription_content c
          JOIN video_transcripts v ON v.content_id = c.content_id
          WHERE c.source_id = ${String(input.profileId)} LIMIT ${limit}
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
        const existing = await sql`
          SELECT id::text AS "jobId" FROM transcript_jobs WHERE content_id = ${contentId} LIMIT 1
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
        const rows = await sql`
          UPDATE assimilation_sessions SET status = 'running', updated_at = now()
          WHERE id = ${String(input.sessionId)}::uuid AND status IN ('pending_approval', 'planning')
          RETURNING id
        `;
        if (!rows[0])
          throw new Error('INVALID_STATE: assimilation session is not awaiting approval');
        return { approved: true, sessionId: String(input.sessionId) };
      }
      case 'reject_assimilation_plan': {
        const feedback = typeof input.feedback === 'string' ? input.feedback : null;
        const rows = await sql`
          UPDATE assimilation_sessions
          SET status = ${feedback ? 'planning' : 'rejected'}, plan_feedback = ${feedback}, updated_at = now()
          WHERE id = ${String(input.sessionId)}::uuid AND status IN ('pending_approval', 'planning')
          RETURNING id
        `;
        if (!rows[0])
          throw new Error('INVALID_STATE: assimilation session is not awaiting approval');
        return {
          rejected: true,
          sessionId: String(input.sessionId),
          replanning: Boolean(feedback),
        };
      }
      case 'cancel_assimilation': {
        const rows = await sql`
          UPDATE assimilation_sessions SET status = 'cancelled', updated_at = now(), completed_at = now()
          WHERE id = ${String(input.sessionId)}::uuid AND status NOT IN ('completed', 'cancelled', 'canceled')
          RETURNING id
        `;
        if (!rows[0]) throw new Error('NOT_FOUND: assimilation session is not cancellable');
        return { cancelled: true, sessionId: String(input.sessionId) };
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
        return { results: rows, totalResults: rows.length };
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
        const ruleValue =
          typeof input.ruleValue === 'string' ? input.ruleValue : JSON.stringify(input.ruleValue);
        const rows = await sql`
          INSERT INTO subscription_filters (id, source_id, source_type, rule_name, rule_type, rule_value, weight)
          VALUES (${randomUUID()}::uuid, ${typeof input.sourceId === 'string' ? input.sourceId : null},
                  ${typeof input.sourceType === 'string' ? input.sourceType : null}, ${String(input.ruleName)},
                  ${String(input.ruleType)}, ${ruleValue}, ${typeof input.weight === 'number' ? input.weight : null})
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
        const rows = await sql`SELECT count(*)::int AS count FROM subscription_sources`;
        return {
          sourcesChecked: Number(rows[0]?.count ?? 0),
          totalFetched: 0,
          totalQueued: 0,
          errors: [],
        };
      }
      case 'search_fts':
      case 'hybrid_search': {
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
          ...(id === 'hybrid_search' ? { searchMethod: 'postgres-fts' } : {}),
        };
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
        const rows = await sql`
          DELETE FROM subscription_sources WHERE id = ${String(input.subscriptionId)}::uuid
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
            ${String(input.sourceType)}, ${String(input.category)}, ${String(input.status ?? 'draft')},
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
                 source_type AS "sourceType", category, status, tags, use_cases AS "useCases",
                 keywords, language, date, time
          FROM toolbelt_tools WHERE id = ${String(input.toolId)}::uuid LIMIT 1
        `;
        return rows[0] ?? null;
      }
      case 'list_tools': {
        const limit = Math.min(Number(input.limit ?? 100), 100);
        const category = typeof input.category === 'string' ? input.category : null;
        const status = typeof input.status === 'string' ? input.status : null;
        const sourceType = typeof input.sourceType === 'string' ? input.sourceType : null;
        const rows = await sql`
          SELECT id::text AS "toolId", title, description, category, status,
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
          await sql`UPDATE toolbelt_tools SET status = ${input.status} WHERE id = ${toolId}::uuid`;
        return { toolId, updated: true, embeddingStatus: 'pending' };
      }
      case 'get_document': {
        const rows = await sql`
          SELECT id::text AS "documentId", title, content, status, is_public AS "isPublic",
                 share_token AS "shareToken", date, created_at AS "createdAt"
          FROM documents WHERE id = ${String(input.documentId)}::uuid LIMIT 1
        `;
        return rows[0] ?? null;
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
        return { ...rows[0], embeddingStatus: 'pending' };
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
        const isPublic = Boolean(input.isPublic);
        const shareToken = isPublic ? `mcp-${randomUUID()}` : null;
        const rows = await sql`
          UPDATE documents SET is_public = ${isPublic}, share_token = ${shareToken}
          WHERE id = ${String(input.documentId)}::uuid
          RETURNING id::text AS "documentId", is_public AS "isPublic", share_token AS "shareToken"
        `;
        return rows[0] ?? { documentId: String(input.documentId), isPublic };
      }
      default:
        throw new Error(`MCP tool '${id}' has no Postgres executor yet`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
