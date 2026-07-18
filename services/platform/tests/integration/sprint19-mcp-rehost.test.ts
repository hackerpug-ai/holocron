/** Sprint 19 gateway baseline: real MCP SDK transport, auth/origin, and 44-tool registry parity. */
import { describe, expect, it } from 'vitest';
import { createHonoApp } from '../../src/http/hono-app';
import { defaultManifestPath, loadManifest } from '../../src/mcp/manifest-loader';
import { toolsAsRecord } from '../../src/tools/registry';

const KEYS = { rn: 's19-rn', mcp: 's19-mcp', control: 's19-control' };

describe('Sprint 19 MCP rehost gateway', () => {
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
});
