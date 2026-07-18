/** Sprint 19 gateway baseline: real MCP SDK transport, auth/origin, and 44-tool registry parity. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';
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
      await sql`DELETE FROM subscription_sources WHERE identifier LIKE 's19-mcp-%'`;
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
  });

  itLive('executes document tools against real Postgres', async () => {
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
  });
});
