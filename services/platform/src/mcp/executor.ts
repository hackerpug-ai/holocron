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
