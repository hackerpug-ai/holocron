/**
 * Production MCP tool audit — drives the shipped executePostgresMcpTool for
 * every registered id against real Postgres / live HTTP, then launches the
 * deployed MCP twice and proves embed traffic is served by inference1/2.
 *
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://holocron.tail011a51.ts.net:4545 \
 *     pnpm vitest run --project integration \
 *     packages/platform/tests/integration/mcp-production-tool-audit.test.ts
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSecretValue } from '../../src/config/secrets';
import { createSql, type Sql } from '../../src/db/client';
import { embed } from '../../src/inference/embed';
import { executePostgresMcpTool } from '../../src/mcp/executor';
import { getTool, listTools, toolsAsRecord } from '../../src/tools/registry';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR =
  process.env.HOLO_TOOL_AUDIT_EVIDENCE_DIR?.trim() ||
  resolve(REPO_ROOT, '.tmp/mcp-production-tool-audit');
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const NONPROD_DATABASE_URL = DATABASE_URL.includes('holocron_nonprod')
  ? DATABASE_URL
  : 'postgres://127.0.0.1:5432/holocron_nonprod';
const FLEET_URL = process.env.FLEET_URL?.trim() || 'http://holocron.tail011a51.ts.net:4545';
const PRODUCTION_MCP_URL =
  process.env.HOLO_PRODUCTION_MCP_URL?.trim() || 'https://holocron.tail011a51.ts.net:44111/mcp';
const VENDOR_TOOLS = new Set(['shop_products', 'findRecommendations']);
const RUN_ID = `mcp-e2e-${Date.now().toString(36)}`;
const NS = RUN_ID;
const SEMANTIC_TITLE = `${NS} fleet retrieval proof`;
const SEMANTIC_PASSAGE =
  'The escape hatch engages whenever the on-premises token generator stops answering during a scheduled service window.';
const SEMANTIC_QUERY = 'what occurs if the local LLM box quits replying while being patched';

type SweepVerdict = {
  id: string;
  ok: boolean;
  reasons: string[];
  outputKind: string;
};

type ProductionLaunch = {
  run: number;
  toolsListCount: number;
  toolIds: string[];
  listDocumentsOk: boolean;
  getDocument: { id: string; title: string; contentLength: number; dataPlane: unknown };
  hybrid: { searchMethod: unknown; totalResults: number; score: number };
};

function writeEvidence(name: string, value: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(EVIDENCE_DIR, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function verifiedClosedPort(): Promise<number> {
  const port = await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      const bound = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(bound)));
    });
  });
  await new Promise<void>((resolvePort, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error(`port ${port} unexpectedly accepted a connection`));
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolvePort();
      else reject(error);
    });
  });
  return port;
}

async function liveEmbedViaLiteLlm(label: string): Promise<{
  dimension: number;
  nonzero: boolean;
  apiBase: string;
}> {
  const response = await fetch(`${FLEET_URL.replace(/\/$/, '')}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.FLEET_KEY ?? 'sk-none'}`,
    },
    body: JSON.stringify({
      model: 'qwen3-embedding',
      input: `query: ${label}`,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const apiBase = response.headers.get('x-litellm-model-api-base') ?? '';
  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
    error?: unknown;
  };
  const embedding = payload.data?.[0]?.embedding ?? [];
  return {
    dimension: embedding.length,
    nonzero: embedding.some((value) => value !== 0),
    apiBase,
  };
}

function parseMcpJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as Record<string, unknown>;
  const dataLines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line.length > 0 && line !== '[DONE]');
  const last = dataLines.at(-1);
  if (!last) throw new Error(`MCP response was not JSON or SSE: ${trimmed.slice(0, 400)}`);
  return JSON.parse(last) as Record<string, unknown>;
}

async function productionRpc(
  method: string,
  params: Record<string, unknown>,
  id: number,
  mcpKey: string
): Promise<Record<string, unknown>> {
  const response = await fetch(PRODUCTION_MCP_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${mcpKey}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(`production MCP ${method} HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return parseMcpJson(text);
}

function toolPayload(result: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const record = result as { structuredContent?: unknown; content?: Array<{ text?: string }> };
  if (record.structuredContent !== undefined) return record.structuredContent;
  const text = record.content?.[0]?.text;
  if (typeof text === 'string' && text.length > 0) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

describe('MCP production tool audit', () => {
  let sql: Sql | undefined;
  let mcpKey = '';
  const created = {
    documents: [] as string[],
    subscriptions: [] as string[],
    tools: [] as string[],
    improvements: [] as string[],
    assimilations: [] as string[],
    research: [] as string[],
    sources: [] as string[],
    passages: [] as string[],
    creators: [] as string[],
    contents: [] as string[],
    jobs: [] as string[],
    shop: [] as string[],
    whatsNew: [] as string[],
  };

  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error('mcp-production-tool-audit requires PLATFORM_IT=1 — refusing skip-to-green');
    }
    if (!NONPROD_DATABASE_URL.includes('holocron_nonprod')) {
      throw new Error(
        'mcp-production-tool-audit requires DATABASE_URL to name holocron_nonprod (refusing production)'
      );
    }
    mcpKey = getSecretValue('HOLO_KEY_MCP') ?? '';
    if (!mcpKey) {
      throw new Error('mcp-production-tool-audit requires HOLO_KEY_MCP');
    }
    process.env.FLEET_URL = FLEET_URL;
    sql = createSql(NONPROD_DATABASE_URL);
    await sql`SELECT pg_advisory_lock(450019)`;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  }, 30_000);

  afterAll(async () => {
    if (!sql) return;
    try {
      if (created.jobs.length)
        await sql`DELETE FROM transcript_jobs WHERE id = ANY(${created.jobs}::uuid[])`;
      if (created.contents.length)
        await sql`DELETE FROM subscription_content WHERE id = ANY(${created.contents}::uuid[])`;
      if (created.subscriptions.length) {
        await sql`DELETE FROM subscription_filters WHERE source_id = ANY(${created.subscriptions}::uuid[])`;
        await sql`DELETE FROM subscription_sources WHERE id = ANY(${created.subscriptions}::uuid[])`;
      }
      if (created.creators.length)
        await sql`DELETE FROM creator_profiles WHERE id = ANY(${created.creators}::uuid[])`;
      if (created.tools.length)
        await sql`DELETE FROM toolbelt_tools WHERE id = ANY(${created.tools}::uuid[])`;
      if (created.improvements.length)
        await sql`DELETE FROM improvement_requests WHERE id = ANY(${created.improvements}::uuid[])`;
      if (created.assimilations.length)
        await sql`DELETE FROM assimilation_sessions WHERE id = ANY(${created.assimilations}::uuid[])`;
      if (created.research.length)
        await sql`DELETE FROM research_sessions WHERE id = ANY(${created.research}::uuid[])`;
      if (created.passages.length)
        await sql`DELETE FROM passages WHERE id = ANY(${created.passages}::uuid[])`;
      if (created.sources.length)
        await sql`DELETE FROM sources WHERE id = ANY(${created.sources}::uuid[])`;
      if (created.documents.length)
        await sql`DELETE FROM documents WHERE id = ANY(${created.documents}::uuid[])`;
      if (created.shop.length) {
        await sql`DELETE FROM shop_listings WHERE session_id = ANY(${created.shop}::uuid[])`;
        await sql`DELETE FROM shop_sessions WHERE id = ANY(${created.shop}::uuid[])`;
      }
      if (created.whatsNew.length)
        await sql`DELETE FROM whats_new_reports WHERE id = ANY(${created.whatsNew}::uuid[])`;
      await sql`DELETE FROM documents WHERE title LIKE ${`${NS}%`}`;
      await sql`DELETE FROM subscription_sources WHERE identifier LIKE ${`${NS}%`}`;
      await sql`DELETE FROM toolbelt_tools WHERE title LIKE ${`${NS}%`}`;
      await sql`DELETE FROM improvement_requests WHERE description LIKE ${`${NS}%`}`;
      await sql`DELETE FROM assimilation_sessions WHERE repository_url LIKE ${`%${NS}%`}`;
      await sql`DELETE FROM shop_listings WHERE session_id IN (SELECT id FROM shop_sessions WHERE query LIKE ${`${NS}%`})`;
      await sql`DELETE FROM shop_sessions WHERE query LIKE ${`${NS}%`}`;
    } finally {
      await sql`SELECT pg_advisory_unlock(450019)`;
      await sql.end({ timeout: 5 });
    }
  }, 60_000);

  it('executes every registered tool against real Postgres or live HTTP', async () => {
    if (!sql) throw new Error('Postgres required');
    const tools = listTools();
    expect(tools.length).toBeGreaterThanOrEqual(44);

    const storedDoc = (await executePostgresMcpTool(
      'store_document',
      { title: `${NS} seed document`, content: `${NS} seed body ${SEMANTIC_PASSAGE}` },
      { databaseUrl: NONPROD_DATABASE_URL }
    )) as { documentId: string; title: string };
    created.documents.push(storedDoc.documentId);

    const listed = (await executePostgresMcpTool(
      'list_documents',
      { limit: 20 },
      { databaseUrl: NONPROD_DATABASE_URL }
    )) as { documents: Array<{ id?: string; title?: string; content?: string }> };
    const discovered = listed.documents.find((row) => row.id === storedDoc.documentId);
    expect(discovered?.title).toBe(storedDoc.title);
    expect(String(discovered?.content ?? '')).toContain(NS);

    const sub = (await executePostgresMcpTool(
      'add_subscription',
      {
        sourceType: 'github',
        identifier: `${NS}-sub`,
        name: `${NS}-sub`,
        url: 'https://example.com/mcp-e2e',
        feedUrl: 'https://hnrss.org/frontpage',
      },
      { databaseUrl: NONPROD_DATABASE_URL }
    )) as { subscriptionId: string };
    created.subscriptions.push(sub.subscriptionId);

    const removable = (await executePostgresMcpTool(
      'add_subscription',
      {
        sourceType: 'github',
        identifier: `${NS}-sub-rm`,
        name: `${NS}-sub-rm`,
        url: 'https://example.com/mcp-e2e-rm',
      },
      { databaseUrl: NONPROD_DATABASE_URL }
    )) as { subscriptionId: string };
    created.subscriptions.push(removable.subscriptionId);

    const tool = (await executePostgresMcpTool(
      'store_tool',
      {
        title: `${NS}-tool`,
        sourceType: 'github',
        category: 'libraries',
        description: `${NS} toolbelt seed`,
        status: 'draft',
      },
      { databaseUrl: NONPROD_DATABASE_URL }
    )) as { toolId: string };
    created.tools.push(tool.toolId);

    const improvement = (await executePostgresMcpTool(
      'add_improvement',
      { items: [{ description: `${NS}-improvement` }] },
      { databaseUrl: NONPROD_DATABASE_URL }
    )) as { ids: string[] };
    created.improvements.push(...improvement.ids);

    for (const kind of ['approve', 'reject', 'cancel', 'steer'] as const) {
      const session = (await executePostgresMcpTool(
        'start_assimilation',
        { repositoryUrl: `https://example.com/${NS}-${kind}` },
        { databaseUrl: NONPROD_DATABASE_URL }
      )) as { sessionId: string };
      created.assimilations.push(session.sessionId);
    }

    const researchId = randomUUID();
    await sql`
      INSERT INTO research_sessions (id, system, topic, status)
      VALUES (${researchId}::uuid, 'simple', ${`${NS} research topic`}, 'completed')
    `;
    created.research.push(researchId);

    const whatsNewId = randomUUID();
    await sql`
      INSERT INTO whats_new_reports (id, findings_count, summary_json, findings_json)
      VALUES (
        ${whatsNewId}::uuid,
        1,
        ${JSON.stringify({ title: `${NS} whats-new` })}::jsonb,
        ${JSON.stringify([{ title: `${NS} finding` }])}::jsonb
      )
    `;
    created.whatsNew.push(whatsNewId);

    const creatorId = randomUUID();
    const contentRowId = randomUUID();
    const contentId = `${NS}-video`;
    await sql`
      INSERT INTO creator_profiles (id, name, handle, canonical_type)
      VALUES (${creatorId}::uuid, ${`${NS} creator`}, ${`${NS}-handle`}, 'creator')
    `;
    created.creators.push(creatorId);
    await sql`
      UPDATE subscription_sources
      SET creator_profile_id = ${creatorId}::uuid
      WHERE id = ${sub.subscriptionId}::uuid
    `;
    await sql`
      INSERT INTO subscription_content (id, source_id, content_id, title, url)
      VALUES (
        ${contentRowId}::uuid,
        ${sub.subscriptionId}::uuid,
        ${contentId},
        ${`${NS} video`},
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      )
    `;
    created.contents.push(contentRowId);

    const documentVector = await embed(SEMANTIC_PASSAGE, 'document');
    expect(documentVector).toHaveLength(1024);
    expect(documentVector.some((value) => value !== 0)).toBe(true);
    const sourceId = randomUUID();
    const passageId = randomUUID();
    await sql`
      INSERT INTO sources (id, source_kind, content_hash, title, document_id, metadata_json)
      VALUES (
        ${sourceId}::uuid,
        'document',
        ${`${NS}-semantic`},
        ${SEMANTIC_TITLE},
        ${storedDoc.documentId},
        ${JSON.stringify({ ns: NS })}::jsonb
      )
    `;
    created.sources.push(sourceId);
    await sql`
      INSERT INTO passages (id, source_id, document_id, ordinal, text, embedding, metadata_json)
      VALUES (
        ${passageId}::uuid,
        ${sourceId}::uuid,
        ${storedDoc.documentId},
        0,
        ${SEMANTIC_PASSAGE},
        ${vectorLiteral(documentVector)}::vector,
        ${JSON.stringify({ ns: NS })}::jsonb
      )
    `;
    created.passages.push(passageId);

    const queryVector = await embed(SEMANTIC_QUERY, 'query');
    const seed = {
      documentId: storedDoc.documentId,
      subscriptionId: sub.subscriptionId,
      removableSubscriptionId: removable.subscriptionId,
      toolId: tool.toolId,
      improvementId: improvement.ids[0] ?? '',
      approveSessionId: created.assimilations[0] ?? '',
      rejectSessionId: created.assimilations[1] ?? '',
      cancelSessionId: created.assimilations[2] ?? '',
      steerSessionId: created.assimilations[3] ?? '',
      researchSessionId: researchId,
      profileId: creatorId,
      contentId,
      embedding: queryVector,
    };

    const argsFor = (id: string): Record<string, unknown> => {
      switch (id) {
        case 'get_research_session':
          return { sessionId: seed.researchSessionId };
        case 'search_research':
          return { query: NS, limit: 5 };
        case 'search_fts':
          return { query: NS, limit: 5 };
        case 'search_vector':
          return { embedding: seed.embedding, limit: 5 };
        case 'hybrid_search':
          return { query: SEMANTIC_QUERY, limit: 10 };
        case 'store_document':
          return { title: `${NS} extra-doc`, content: `${NS} extra body` };
        case 'update_document':
        case 'get_document':
        case 'share_document':
        case 'unshare_document':
          return { documentId: seed.documentId };
        case 'list_documents':
          return { limit: 20 };
        case 'add_subscription':
          return {
            sourceType: 'github',
            identifier: `${NS}-sub-extra`,
            name: `${NS}-sub-extra`,
          };
        case 'remove_subscription':
          return { subscriptionId: seed.removableSubscriptionId };
        case 'list_subscriptions':
          return { limit: 20 };
        case 'check_subscriptions':
          return { sourceType: 'github' };
        case 'get_subscription_content':
        case 'get_subscription_filters':
          return { subscriptionId: seed.subscriptionId };
        case 'set_subscription_filter':
          return {
            sourceId: seed.subscriptionId,
            ruleName: `${NS}-rule`,
            ruleType: 'include',
            ruleValue: 'mcp-e2e',
          };
        case 'store_tool':
          return {
            title: `${NS}-tool-extra`,
            sourceType: 'github',
            category: 'libraries',
            status: 'draft',
          };
        case 'get_tool':
        case 'update_tool':
        case 'remove_tool':
          return { toolId: seed.toolId, title: `${NS}-tool-updated` };
        case 'list_tools':
          return { limit: 20 };
        case 'search_tools':
          return { query: NS, limit: 5 };
        case 'shop_products':
          return { query: `${NS} USB-C hub`, retailers: ['amazon', 'ebay', 'newegg', 'bestbuy'] };
        case 'get_shop_session':
        case 'get_shop_listings':
          return { sessionId: created.shop[0] ?? randomUUID() };
        case 'get_whats_new_report':
          return {};
        case 'list_whats_new_reports':
          return { limit: 10 };
        case 'start_assimilation':
          return { repositoryUrl: `https://example.com/${NS}-extra` };
        case 'get_assimilation_status':
        case 'approve_assimilation_plan':
          return { sessionId: seed.approveSessionId };
        case 'reject_assimilation_plan':
          return { sessionId: seed.rejectSessionId, feedback: `${NS}-feedback` };
        case 'cancel_assimilation':
          return { sessionId: seed.cancelSessionId };
        case 'steer_assimilation':
          return { sessionId: seed.steerSessionId, note: `${NS}-steer` };
        case 'assimilate_creator':
        case 'get_creator_transcripts':
          return { profileId: seed.profileId };
        case 'regenerate_transcript':
          return { contentId: seed.contentId };
        case 'search_improvements':
          return { query: NS, limit: 5 };
        case 'get_improvement':
        case 'close_improvement':
          return { id: seed.improvementId };
        case 'list_improvements':
          return { limit: 20 };
        case 'add_improvement':
          return { items: [{ description: `${NS}-improvement-extra` }] };
        case 'set_improvement_status':
          return { id: seed.improvementId, status: 'open' };
        case 'findRecommendations':
          return { query: 'Salt Lake City independent bookstores', count: 3 };
        default:
          return {};
      }
    };

    const verdicts: SweepVerdict[] = [];
    for (const row of tools) {
      const reasons: string[] = [];
      let output: unknown;
      try {
        if (row.id === 'get_shop_session' || row.id === 'get_shop_listings') {
          if (created.shop.length === 0) {
            const shop = (await executePostgresMcpTool(
              'shop_products',
              { query: `${NS} USB-C hub seed`, retailers: ['amazon'] },
              { databaseUrl: NONPROD_DATABASE_URL }
            )) as { sessionId?: string };
            if (typeof shop.sessionId === 'string') created.shop.push(shop.sessionId);
          }
        }
        output = await executePostgresMcpTool(row.id, argsFor(row.id), {
          databaseUrl: NONPROD_DATABASE_URL,
        });
        if (row.id === 'store_document') {
          const extra = asRecord(output)?.documentId;
          if (typeof extra === 'string') created.documents.push(extra);
        }
        if (row.id === 'add_subscription') {
          const extra = asRecord(output)?.subscriptionId;
          if (typeof extra === 'string') created.subscriptions.push(extra);
        }
        if (row.id === 'store_tool') {
          const extra = asRecord(output)?.toolId;
          if (typeof extra === 'string') created.tools.push(extra);
        }
        if (row.id === 'add_improvement') {
          const ids = asRecord(output)?.ids;
          if (Array.isArray(ids)) created.improvements.push(...ids.map(String));
        }
        if (row.id === 'start_assimilation') {
          const extra = asRecord(output)?.sessionId;
          if (typeof extra === 'string') created.assimilations.push(extra);
        }
        if (row.id === 'shop_products') {
          const extra = asRecord(output)?.sessionId;
          if (typeof extra === 'string') created.shop.push(extra);
        }
        if (row.id === 'regenerate_transcript') {
          const jobId = asRecord(asRecord(output)?.data)?.jobId;
          if (typeof jobId === 'string') created.jobs.push(jobId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          VENDOR_TOOLS.has(row.id) &&
          /CONFIGURATION_ERROR|RETAILER_ERROR|RECOMMENDATION_ERROR|HTTP /i.test(message)
        ) {
          verdicts.push({
            id: row.id,
            ok: true,
            reasons: [`vendor_named_error:${message.split(':')[0]}`],
            outputKind: 'named-error',
          });
          continue;
        }
        reasons.push(`threw:${message.slice(0, 200)}`);
        verdicts.push({ id: row.id, ok: false, reasons, outputKind: 'throw' });
        continue;
      }

      const serialized = JSON.stringify(output);
      if (/convex/i.test(serialized)) reasons.push('convex_residue');
      const parsed = getTool(row.id).outputSchema.safeParse(output);
      if (!parsed.success) reasons.push('output_schema_mismatch');

      if (row.id === 'hybrid_search') {
        const record = asRecord(output);
        if (record?.searchMethod !== 'hybrid') reasons.push('hybrid_search_method');
        if (Number(record?.totalResults) < 1) reasons.push('hybrid_empty');
        const results = Array.isArray(record?.results) ? record.results : [];
        const hit = results.find((item) => asRecord(item)?.title === SEMANTIC_TITLE);
        if (!hit) reasons.push('hybrid_missed_seed');
        if (!(Number(asRecord(hit)?.score) > 0)) reasons.push('hybrid_score');
      }
      if (row.id === 'get_document') {
        const record = asRecord(output);
        if (!record?.title || !record?.content) reasons.push('empty_document');
        if (record?.data_plane && record.data_plane !== 'postgres') {
          reasons.push(`data_plane:${String(record.data_plane)}`);
        }
        if (record?.source === 'convex') reasons.push('convex_source');
      }
      if (row.id === 'list_documents') {
        const docs = asRecord(output)?.documents;
        if (!Array.isArray(docs) || docs.length === 0) reasons.push('empty_list_documents');
      }
      if (VENDOR_TOOLS.has(row.id)) {
        const record = asRecord(output);
        const listings = Array.isArray(record?.listings)
          ? record.listings
          : Array.isArray(output)
            ? output
            : [];
        if (listings.length === 0) reasons.push('vendor_empty_success');
      }

      verdicts.push({
        id: row.id,
        ok: reasons.length === 0,
        reasons,
        outputKind: Array.isArray(output) ? 'array' : typeof output,
      });
    }

    writeEvidence('tool-audit-sweep.json', {
      runId: RUN_ID,
      fleetUrl: FLEET_URL,
      database: 'holocron_nonprod',
      registered: tools.map((row) => row.id),
      verdicts,
      failed: verdicts.filter((row) => !row.ok),
    });
    expect(
      verdicts,
      JSON.stringify(
        verdicts.filter((row) => !row.ok),
        null,
        2
      )
    ).toHaveLength(tools.length);
    expect(verdicts.filter((row) => !row.ok)).toEqual([]);
    expect(Object.keys(toolsAsRecord()).sort()).toEqual(tools.map((row) => row.id).sort());
  }, 300_000);

  it('fails closed with ROLE_UNAVAILABLE naming embed when LiteLLM is unreachable', async () => {
    const closed = `http://127.0.0.1:${await verifiedClosedPort()}`;
    const previous = process.env.FLEET_URL;
    process.env.FLEET_URL = closed;
    try {
      let thrown: unknown;
      try {
        await executePostgresMcpTool(
          'hybrid_search',
          { query: SEMANTIC_QUERY, limit: 5 },
          { databaseUrl: NONPROD_DATABASE_URL }
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      expect(message).toContain('ROLE_UNAVAILABLE');
      expect(message).toContain("fleet role 'embed'");
      expect(message).toContain(closed);
      expect(message).not.toContain('searchMethod');
    } finally {
      process.env.FLEET_URL = previous;
    }
  }, 60_000);

  it('embeds twice via holocron LiteLLM onto inference1 or inference2', async () => {
    const first = await liveEmbedViaLiteLlm(`${NS}-embed-1`);
    const second = await liveEmbedViaLiteLlm(`${NS}-embed-2`);
    writeEvidence('embed-via-litellm.json', { fleetUrl: FLEET_URL, first, second });
    for (const result of [first, second]) {
      expect(result.dimension).toBe(1024);
      expect(result.nonzero).toBe(true);
      expect(result.apiBase).toMatch(/inference[12]\.tail011a51\.ts\.net:8003\/v1$/);
      expect(result.apiBase).not.toContain('laptop.tail011a51.ts.net');
      expect(result.apiBase).not.toMatch(/127\.0\.0\.1|localhost/);
    }
  }, 180_000);

  it('launches the production MCP entry twice with list + document + hybrid', async () => {
    const launches: ProductionLaunch[] = [];
    for (const run of [1, 2] as const) {
      await productionRpc(
        'initialize',
        {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'mcp-production-tool-audit', version: '1' },
        },
        run * 10 + 1,
        mcpKey
      );
      const listed = await productionRpc('tools/list', {}, run * 10 + 2, mcpKey);
      const tools = (asRecord(listed.result)?.tools ?? []) as Array<{ name?: string }>;
      const ids = tools.map((tool) => String(tool.name)).sort();
      expect(ids.length).toBeGreaterThanOrEqual(44);

      const listDocs = await productionRpc(
        'tools/call',
        { name: 'list_documents', arguments: { limit: 5 } },
        run * 10 + 3,
        mcpKey
      );
      const listResult = asRecord(listDocs.result);
      expect(listResult?.isError).not.toBe(true);
      const listPayload = asRecord(toolPayload(listResult));
      const documents = Array.isArray(listPayload?.documents) ? listPayload.documents : [];
      expect(documents.length).toBeGreaterThan(0);
      const firstDoc = asRecord(documents[0]);
      const documentId = String(firstDoc?.id ?? firstDoc?.documentId ?? '');
      expect(documentId.length).toBeGreaterThan(0);

      const got = await productionRpc(
        'tools/call',
        { name: 'get_document', arguments: { documentId } },
        run * 10 + 4,
        mcpKey
      );
      const gotResult = asRecord(got.result);
      expect(gotResult?.isError).not.toBe(true);
      const gotPayload = asRecord(toolPayload(gotResult));
      expect(String(gotPayload?.title ?? '')).not.toBe('');
      expect(String(gotPayload?.content ?? '')).not.toBe('');
      expect(gotPayload?.data_plane ?? 'postgres').toBe('postgres');
      expect(gotPayload?.source).not.toBe('convex');

      const corpusQuery = String(gotPayload?.title ?? firstDoc?.title ?? '').trim();
      expect(corpusQuery.length).toBeGreaterThan(0);
      const hybrid = await productionRpc(
        'tools/call',
        { name: 'hybrid_search', arguments: { query: corpusQuery, limit: 10 } },
        run * 10 + 5,
        mcpKey
      );
      const hybridResult = asRecord(hybrid.result);
      expect(hybridResult?.isError).not.toBe(true);
      const hybridPayload = asRecord(toolPayload(hybridResult));
      const results = Array.isArray(hybridPayload?.results) ? hybridPayload.results : [];
      const score = Number(asRecord(results[0])?.score ?? 0);
      expect(hybridPayload?.searchMethod).toBe('hybrid');
      expect(Number(hybridPayload?.totalResults)).toBeGreaterThanOrEqual(1);
      expect(score).toBeGreaterThan(0);

      const launch: ProductionLaunch = {
        run,
        toolsListCount: ids.length,
        toolIds: ids,
        listDocumentsOk: true,
        getDocument: {
          id: documentId,
          title: String(gotPayload?.title ?? ''),
          contentLength: String(gotPayload?.content ?? '').length,
          dataPlane: gotPayload?.data_plane ?? gotPayload?.source,
        },
        hybrid: {
          searchMethod: hybridPayload?.searchMethod,
          totalResults: Number(hybridPayload?.totalResults),
          score,
        },
      };
      launches.push(launch);
      writeEvidence(`mcp-launch-${run}.log`, JSON.stringify(launch, null, 2));
    }
    expect(launches).toHaveLength(2);
    expect(launches[0]?.toolIds).toEqual(launches[1]?.toolIds);
    expect(launches[0]?.hybrid.searchMethod).toBe('hybrid');
    expect(launches[1]?.hybrid.searchMethod).toBe('hybrid');
  }, 240_000);
});
