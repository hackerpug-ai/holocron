/** Sprint 19 gateway baseline: real MCP SDK transport, auth/origin, and 44-tool registry parity. */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';
import { executePostgresMcpTool } from '../../src/mcp/executor';
import { defaultManifestPath, loadManifest } from '../../src/mcp/manifest-loader';
import { toolsAsRecord } from '../../src/tools/registry';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's19-rn', mcp: 's19-mcp', control: 's19-control' };

describe('Sprint 19 MCP rehost gateway', () => {
  let sql: Sql | undefined;
  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });
  afterAll(async () => {
    if (sql) {
      await sql`DELETE FROM documents WHERE title LIKE 's19-mcp-%'`;
      await sql`DELETE FROM subscription_sources WHERE identifier LIKE 's19-mcp-%' OR identifier LIKE 's19-parity-%'`;
      await sql`DELETE FROM documents WHERE title LIKE 's19-parity-%'`;
      await sql`DELETE FROM toolbelt_tools WHERE title LIKE 's19-parity-%'`;
      await sql`DELETE FROM improvement_requests WHERE description LIKE 's19-parity-%'`;
      await sql`DELETE FROM shop_sessions WHERE query LIKE 's19-parity-%' OR query LIKE 'USB-C hub%' OR query LIKE 's19 replay product%' OR query LIKE 's19-cancel-%'`;
      await sql`DELETE FROM assimilation_sessions WHERE repository_url LIKE 's19-parity-%'`;
      await sql`DELETE FROM transcript_jobs WHERE content_id LIKE 's19-parity-%' OR content_id LIKE 's19-creator-%'`;
      await sql`DELETE FROM subscription_content WHERE content_id LIKE 's19-creator-%'`;
      await sql`DELETE FROM creator_profiles WHERE handle = 's19-creator'`;
      await sql.end({ timeout: 5 });
    }
  });

  it('serves initialize and tools/list over stateless Streamable HTTP', async () => {
    const app = createHonoApp({ keys: KEYS });
    const headers = {
      authorization: `Bearer ${KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const initialize = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'sprint-19-test', version: '1' },
        },
      }),
    });
    expect(initialize.status).toBe(200);
    expect((await initialize.json()).result.serverInfo.name).toBe('holocron-postgres');

    const list = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    const listed = await list.json();
    expect(list.status).toBe(200);
    expect(listed.result.tools).toHaveLength(44);
    expect(new Set(listed.result.tools.map((tool: { name: string }) => tool.name))).toEqual(
      new Set(Object.keys(toolsAsRecord()))
    );
    expect(loadManifest(defaultManifestPath()).tools).toHaveLength(44);
  });

  it('fails closed on missing key and foreign origin', async () => {
    const app = createHonoApp({ keys: KEYS });
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect((await app.request('/mcp', { method: 'POST', body })).status).toBe(401);
    expect(
      (
        await app.request('/mcp', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${KEYS.mcp}`,
            origin: 'https://evil.example',
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body,
        })
      ).status
    ).toBe(403);
    const sampling = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'sampling/createMessage',
        params: {},
      }),
    });
    expect((await sampling.json()).error).toBeDefined();
  });

  it('validates every frozen success fixture against the shared output schema', () => {
    const fixtureDir = 'services/platform/tests/fixtures/mcp-manifest';
    const tools = toolsAsRecord();
    const successFixtures = readdirSync(fixtureDir).filter((name) =>
      name.endsWith('_success.json')
    );
    expect(successFixtures).toHaveLength(44);
    for (const fixture of successFixtures) {
      const id = fixture.slice(0, -'_success.json'.length);
      const value = JSON.parse(readFileSync(`${fixtureDir}/${fixture}`, 'utf8'));
      const outputSchema = (
        tools[id] as unknown as {
          outputSchema: { safeParse: (value: unknown) => { success: boolean } };
        }
      ).outputSchema;
      expect(outputSchema.safeParse(value).success, `${id} fixture`).toBe(true);
    }
  });

  it('rejects an already-cancelled tool request before database dispatch', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executePostgresMcpTool(
        'list_documents',
        {},
        {
          databaseUrl: DATABASE_URL,
          signal: controller.signal,
        }
      )
    ).rejects.toThrow('MCP request cancelled');
  });

  itLive(
    'cancels an active retailer request and marks its Postgres session cancelled',
    async () => {
      if (!sql) throw new Error('Postgres is required');
      const controller = new AbortController();
      const query = `s19-cancel-${Date.now()}`;
      const request = executePostgresMcpTool(
        'shop_products',
        { query, retailers: ['amazon'] },
        { databaseUrl: DATABASE_URL, signal: controller.signal }
      );
      controller.abort();
      await expect(request).rejects.toThrow(/cancel/i);
      const rows = await sql`SELECT status FROM shop_sessions WHERE query = ${query}`;
      expect(rows[0]?.status).toBe('cancelled');
    }
  );

  itLive(
    'executes initialize, list, and a tool call over real stdio',
    async () => {
      const child = spawn('bun', ['services/platform/src/cli/holo.ts', 'mcp:stdio'], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let buffer = '';
      const nextMessage = () =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('stdio MCP response timeout')), 15_000);
          const consume = () => {
            const newline = buffer.indexOf('\n');
            if (newline < 0) return false;
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            clearTimeout(timeout);
            child.stdout.off('data', onData);
            try {
              resolve(JSON.parse(line) as Record<string, unknown>);
            } catch (error) {
              reject(error);
            }
            return true;
          };
          const onData = (chunk: Buffer) => {
            buffer += chunk.toString();
            consume();
          };
          child.stdout.on('data', onData);
          child.once('error', reject);
          consume();
        });
      try {
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-11-25',
              capabilities: {},
              clientInfo: { name: 'sprint-19-stdio-test', version: '1' },
            },
          })}\n`
        );
        const initialized = await nextMessage();
        expect((initialized.result as { serverInfo: { name: string } }).serverInfo.name).toBe(
          'holocron-postgres'
        );
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
        );
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          })}\n`
        );
        const listed = await nextMessage();
        expect((listed.result as { tools: unknown[] }).tools).toHaveLength(44);
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'list_documents', arguments: { limit: 1 } },
          })}\n`
        );
        const called = await nextMessage();
        expect(called.result).toBeDefined();
        expect((called.result as { isError?: boolean }).isError).not.toBe(true);
      } finally {
        child.kill('SIGTERM');
      }
    },
    60_000
  );

  itLive(
    'executes every manifest tool through the real HTTP gateway',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const headers = {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      };
      const schemaSample = (schema: unknown, key: string): unknown => {
        const def = (schema as { def?: Record<string, unknown> }).def ?? {};
        const type = def.type;
        if (type === 'optional' || type === 'nullable' || type === 'default') {
          return schemaSample(def.innerType, key);
        }
        if (type === 'object') {
          const shape = (def.shape ?? {}) as Record<string, unknown>;
          return Object.fromEntries(
            Object.entries(shape).map(([name, value]) => [name, schemaSample(value, name)])
          );
        }
        if (type === 'array') return [schemaSample(def.element, key)];
        if (type === 'enum') {
          const entries = def.entries as Record<string, string>;
          return Object.values(entries)[0];
        }
        if (type === 'number') return key === 'count' || key === 'limit' ? 5 : 1;
        if (type === 'boolean') return false;
        if (type === 'record') return {};
        if (type === 'unknown') return {};
        if (type === 'string') {
          if (key === 'url' || key === 'feedUrl' || key === 'sourceUrl' || key === 'repositoryUrl')
            return 'https://example.com/s19';
          if (/^(id|sessionId|documentId|toolId|profileId)$/.test(key)) return crypto.randomUUID();
          if (key === 'sourceType') return 'github';
          if (key === 'category') return 'libraries';
          if (key === 'status') return 'draft';
          if (key === 'items') return [{ description: 's19-parity-item' }];
          return `s19-parity-${key}`;
        }
        return {};
      };
      const tools = Object.keys(toolsAsRecord());
      const failures: Array<{ id: string; status: number; body: unknown }> = [];
      for (const [index, id] of tools.entries()) {
        const inputSchema = (toolsAsRecord()[id] as unknown as { inputSchema: unknown })
          .inputSchema;
        const response = await app.request('/mcp', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: index + 100,
            method: 'tools/call',
            params: { name: id, arguments: schemaSample(inputSchema, id) },
          }),
        });
        const body = await response.json();
        if (response.status !== 200 || (!body.result && !body.error)) {
          failures.push({ id, status: response.status, body });
          continue;
        }
        if (body.result && body.result.isError !== true) {
          const outputSchema = (
            toolsAsRecord()[id] as unknown as {
              outputSchema?: { safeParse?: (value: unknown) => { success: boolean } };
            }
          ).outputSchema;
          const structured =
            body.result.structuredContent ?? JSON.parse(body.result.content?.[0]?.text ?? 'null');
          const parsed = outputSchema?.safeParse?.(structured);
          if (!parsed?.success) failures.push({ id, status: response.status, body });
        }
      }
      expect(failures).toEqual([]);
      expect(tools).toHaveLength(44);
    },
    180_000
  );

  itLive(
    'runs shop_products through a real retailer search and persists its result',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const response = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.mcp}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: {
            name: 'shop_products',
            arguments: { query: 'USB-C hub', retailers: ['amazon'] },
          },
        }),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.result.isError).not.toBe(true);
      expect(body.result.structuredContent.status).toBe('completed');
      expect(body.result.structuredContent.error).toBeUndefined();
      expect(body.result.structuredContent.totalListings).toBeGreaterThan(0);
      expect(body.result.structuredContent.listings.length).toBeGreaterThan(0);
      const session = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.mcp}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: {
            name: 'get_shop_session',
            arguments: { sessionId: body.result.structuredContent.sessionId },
          },
        }),
      });
      const sessionBody = await session.json();
      expect(sessionBody.result.structuredContent.session.status).toBe('completed');
    },
    60_000
  );

  itLive(
    'runs findRecommendations through the real search service',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const response = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.mcp}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 30,
          method: 'tools/call',
          params: {
            name: 'findRecommendations',
            arguments: { query: 'Salt Lake City independent bookstores', count: 3 },
          },
        }),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.result.isError).not.toBe(true);
      const recommendations = JSON.parse(body.result.content[0].text);
      expect(recommendations).toBeInstanceOf(Array);
      expect(recommendations.length).toBeGreaterThan(0);
    },
    60_000
  );

  itLive('queues creator transcript jobs against real Postgres', async () => {
    if (!sql) throw new Error('Postgres is required');
    const profileId = crypto.randomUUID();
    const contentId = `s19-creator-${Date.now()}`;
    await sql`
      INSERT INTO creator_profiles (id, name, handle, canonical_type)
      VALUES (${profileId}::uuid, 'Sprint 19 Creator', 's19-creator', 'creator')
    `;
    await sql`
      INSERT INTO subscription_content (id, source_id, content_id, title, url)
      VALUES (${crypto.randomUUID()}::uuid, ${profileId}, ${contentId}, 'Sprint 19 Video', 'https://example.com/s19-video')
    `;
    const app = createHonoApp({ keys: KEYS });
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/call',
        params: { name: 'assimilate_creator', arguments: { profileId } },
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.result.isError).not.toBe(true);
    expect(body.result.structuredContent.status).toBe('queued');
    expect(body.result.structuredContent.videosFound).toBe(1);
    const job = await sql`SELECT status FROM transcript_jobs WHERE content_id = ${contentId}`;
    expect(job[0]?.status).toBe('pending');
  });

  itLive(
    'executes document tools against real Postgres',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const headers = {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      };
      const call = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'store_document',
            arguments: { title: 's19-mcp-real', content: 'Postgres gateway' },
          },
        }),
      });
      const result = await call.json();
      expect(call.status).toBe(200);
      expect(result.result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain('s19-mcp-real');
      const search = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'hybrid_search', arguments: { query: 'Postgres gateway', limit: 10 } },
        }),
      });
      expect(search.status).toBe(200);
      expect(JSON.stringify(await search.json())).toContain('s19-mcp-real');

      const addBody = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'add_subscription',
          arguments: {
            sourceType: 'github',
            identifier: `s19-mcp-${Date.now()}`,
            name: 'Sprint 19',
          },
        },
      };
      const add = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(addBody),
      });
      const addAgain = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...addBody, id: 6 }),
      });
      const addResult = await add.json();
      const addAgainResult = await addAgain.json();
      expect(addResult.result).toEqual(addAgainResult.result);

      const shopBody = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'shop_products',
          arguments: { query: 'USB-C hub replay', condition: 'any', retailers: ['amazon'] },
        },
      };
      const shop = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(shopBody),
      });
      const shopAgain = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...shopBody, id: 8 }),
      });
      const firstShop = await shop.json();
      const replayShop = await shopAgain.json();
      expect(firstShop.result.structuredContent).toEqual(replayShop.result.structuredContent);
      const conflicting = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...shopBody,
          id: 8,
          params: {
            name: 'shop_products',
            arguments: {
              query: 'USB-C hub replay',
              condition: 'any',
              retailers: ['bestbuy'],
              verifiedOnly: true,
            },
          },
        }),
      });
      const conflictingBody = await conflicting.json();
      expect(conflictingBody.result.structuredContent.sessionId).not.toBe(
        firstShop.result.structuredContent.sessionId
      );

      const invalidApprove = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'approve_assimilation_plan',
            arguments: { sessionId: crypto.randomUUID() },
          },
        }),
      });
      const invalidBody = await invalidApprove.json();
      expect(invalidBody.result.isError).toBe(true);
      expect(JSON.parse(invalidBody.result.content[0].text).code).toBe('INVALID_STATE');
    },
    60_000
  );
});
