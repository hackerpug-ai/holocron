import { randomUUID } from 'node:crypto';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';

export async function executePostgresMcpTool(
  id: string,
  input: Record<string, unknown>,
  options?: { databaseUrl?: string; signal?: AbortSignal }
): Promise<unknown> {
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
                 EXTRACT(EPOCH FROM created_at) * 1000 AS "createdAt",
                 CASE WHEN lower(COALESCE(topic, '')) LIKE ${`%${query}%`} THEN 1.0 ELSE 0.0 END AS "relevanceScore"
          FROM research_sessions
          WHERE lower(COALESCE(topic, '')) LIKE ${`%${query}%`}
          ORDER BY "relevanceScore" DESC, created_at DESC LIMIT ${limit}
        `;
        return { sessions: rows, totalResults: rows.length };
      }
      case 'get_whats_new_report': {
        const rows = await sql`
          SELECT id::text AS id, period_start AS "periodStart", period_end AS "periodEnd",
                 summary_json AS report, findings_json AS findings, findings_count AS "findingsCount",
                 created_at AS "generatedAt"
          FROM whats_new_reports ORDER BY created_at DESC LIMIT 1
        `;
        const row = rows[0];
        return row ? { ...row, content: JSON.stringify(row.report ?? row.findings ?? {}) } : null;
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
          VALUES (${randomUUID()}::uuid, ${repositoryUrl}, ${String(input.profile ?? 'standard')}, 'pending', ${Boolean(input.autoApprove)})
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
                 EXTRACT(EPOCH FROM created_at) * 1000 AS "createdAt",
                 EXTRACT(EPOCH FROM completed_at) * 1000 AS "completedAt"
          FROM assimilation_sessions WHERE id = ${String(input.sessionId)}::uuid LIMIT 1
        `;
        return rows[0] ?? null;
      }
      case 'approve_assimilation_plan': {
        await sql`UPDATE assimilation_sessions SET status = 'in_progress', updated_at = now() WHERE id = ${String(input.sessionId)}::uuid`;
        return { approved: true, sessionId: String(input.sessionId) };
      }
      case 'reject_assimilation_plan': {
        await sql`UPDATE assimilation_sessions SET status = 'pending', plan_feedback = ${typeof input.feedback === 'string' ? input.feedback : null}, updated_at = now() WHERE id = ${String(input.sessionId)}::uuid`;
        return { rejected: true, sessionId: String(input.sessionId), replanning: true };
      }
      case 'cancel_assimilation': {
        await sql`UPDATE assimilation_sessions SET status = 'cancelled', updated_at = now(), completed_at = now() WHERE id = ${String(input.sessionId)}::uuid`;
        return { cancelled: true, sessionId: String(input.sessionId) };
      }
      case 'steer_assimilation': {
        await sql`UPDATE assimilation_sessions SET steering_note = ${String(input.note)}, updated_at = now() WHERE id = ${String(input.sessionId)}::uuid`;
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
                 closure_reason AS "closedReason", EXTRACT(EPOCH FROM closed_at) * 1000 AS "closedAt",
                 EXTRACT(EPOCH FROM created_at) * 1000 AS "createdAt"
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
              closure_evidence = ${sql.json((input.evidence as unknown[]) ?? [])},
              closed_at = CASE WHEN ${closed} THEN now() ELSE NULL END,
              updated_at = now()
          WHERE id = ${requestId}::uuid
          RETURNING id::text AS id, status
        `;
        return { id: requestId, status: closed ? 'closed' : 'open' };
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
                 EXTRACT(EPOCH FROM created_at) * 1000 AS "createdAt"
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
                    EXTRACT(EPOCH FROM created_at) * 1000 AS "createdAt"
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
        const rows = await sql`
          SELECT id::text AS "subscriptionId", source_type AS "sourceType", identifier, name,
                 url, feed_url AS "feedUrl", auto_research AS "autoResearch"
          FROM subscription_sources
          WHERE (${input.sourceType ?? null}::text IS NULL OR source_type = ${input.sourceType ?? null})
            AND (${input.autoResearchOnly ?? false} = false OR auto_research = true)
          ORDER BY created_at DESC LIMIT ${limit}
        `;
        return { subscriptions: rows };
      }
      case 'store_tool': {
        const rows = await sql`
          INSERT INTO toolbelt_tools (
            id, title, description, content, source_url, source_type, category, status,
            tags, use_cases, keywords, language, date, time
          ) VALUES (
            ${randomUUID()}::uuid, ${String(input.title)}, ${typeof input.description === 'string' ? input.description : null},
            ${typeof input.content === 'string' ? input.content : null}, ${typeof input.sourceUrl === 'string' ? input.sourceUrl : null},
            ${String(input.sourceType)}, ${String(input.category)}, ${String(input.status ?? 'draft')},
            ${sql.json((input.tags as unknown[]) ?? [])}, ${sql.json((input.useCases as unknown[]) ?? [])},
            ${sql.json((input.keywords as unknown[]) ?? [])}, ${typeof input.language === 'string' ? input.language : null},
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
        const rows = await sql`
          SELECT id::text AS "toolId", title, description, category, status,
                 source_type AS "sourceType", source_url AS "sourceUrl"
          FROM toolbelt_tools
          WHERE (${input.category ?? null}::text IS NULL OR category = ${input.category ?? null})
            AND (${input.status ?? null}::text IS NULL OR status = ${input.status ?? null})
            AND (${input.sourceType ?? null}::text IS NULL OR source_type = ${input.sourceType ?? null})
          ORDER BY created_at DESC LIMIT ${limit}
        `;
        return { tools: rows, total: rows.length };
      }
      case 'search_tools': {
        const query = String(input.query);
        const limit = Math.min(Number(input.limit ?? 20), 100);
        const rows = await sql`
          SELECT id::text AS "toolId", title, description, content,
                 ts_rank(search_vector, websearch_to_tsquery('english', ${query}))::float8 AS score
          FROM toolbelt_tools
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
            AND (${input.category ?? null}::text IS NULL OR category = ${input.category ?? null})
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
