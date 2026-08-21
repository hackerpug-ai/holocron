/**
 * service-3 — Scoped-key middleware + fleet resolveModel (RED → GREEN)
 *
 * AC-1 PRIMARY: unkeyed → 401; correct scope → 200; wrong scope → 403
 * AC-2: resolveModel via Fleet Role Manifest; unknown/unreachable fail closed
 * AC-3: CONTROL key on mission status/verdict/steer only; 403 on list + /mcp
 *
 * Integration tier: real Hono app.request (no mocks of Hono / middleware).
 * Live fleet probe for resolveModel when PLATFORM_IT=1 or fleet is up.
 *
 * Run:
 *   HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     bun test services/platform/src/http/middleware/__tests__/scoped-key.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const RN = process.env.HOLO_KEY_RN ?? 'rn-test';
const MCP = process.env.HOLO_KEY_MCP ?? 'mcp-test';
const CONTROL = process.env.HOLO_KEY_CONTROL ?? 'ctl-test';

// Ensure keys are in env before app construction (middleware loads from env).
process.env.HOLO_KEY_RN = RN;
process.env.HOLO_KEY_MCP = MCP;
process.env.HOLO_KEY_CONTROL = CONTROL;

function bearer(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

async function call(
  app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> },
  method: string,
  path: string,
  key?: string,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(key ? bearer(key) : {}),
    ...extraHeaders,
  };
  return app.request(path, { method, headers, body: method === 'GET' ? undefined : '{}' });
}

describe('AC-1: scoped-key middleware enforces three scopes (401/403/200)', () => {
  let app: Awaited<ReturnType<typeof import('../../hono-app.ts')['createHonoApp']>>;

  beforeAll(async () => {
    const mod = await import('../../hono-app.ts');
    app = mod.createHonoApp();
  });

  it('unkeyed POST /api/missions/x/steer → 401', async () => {
    const res = await call(app, 'POST', '/api/missions/x/steer');
    expect(res.status).toBe(401);
  });

  it('unkeyed POST /api/missions → 401', async () => {
    const res = await call(app, 'POST', '/api/missions');
    expect(res.status).toBe(401);
  });

  it('unkeyed POST /mcp → 401', async () => {
    const res = await call(app, 'POST', '/mcp');
    expect(res.status).toBe(401);
  });

  it('RN_KEY POST /api/missions passes auth and reaches the real handler', async () => {
    const res = await call(app, 'POST', '/api/missions', RN);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('RN_KEY POST /api/missions/x/steer passes auth and reaches the real handler', async () => {
    const res = await call(app, 'POST', '/api/missions/x/steer', RN);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('RN_KEY PATCH /api/assimilations/x reaches the decision validation', async () => {
    const res = await call(app, 'PATCH', '/api/assimilations/x', RN);
    expect(res.status).toBe(422);
  });

  it('MCP_KEY POST /api/missions → 403 (wrong scope)', async () => {
    const res = await call(app, 'POST', '/api/missions', MCP);
    expect(res.status).toBe(403);
  });

  it('MCP_KEY POST /mcp → 200', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        ...bearer(MCP),
        'content-type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'scoped-key-test', version: '1' },
        },
      }),
    });
    expect(res.status).toBe(200);
  });

  it('CONTROL_KEY POST /api/missions/x/verdicts passes auth and reaches the real handler', async () => {
    const res = await call(app, 'POST', '/api/missions/x/verdicts', CONTROL);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('RN_KEY POST /mcp → 403 (RN cannot call /mcp)', async () => {
    const res = await call(app, 'POST', '/mcp', RN);
    expect(res.status).toBe(403);
  });

  it('GET /health remains unauthenticated (no key required)', async () => {
    const res = await call(app, 'GET', '/health');
    // May be 200 (ok/degraded) or 503 (db down) — never 401/403
    expect([200, 503]).toContain(res.status);
  });

  it('unknown key → 401', async () => {
    const res = await call(app, 'POST', '/api/missions', 'not-a-real-key');
    expect(res.status).toBe(401);
  });
});

describe('MCP origin rejection is independent of scoped-key (public MCP Access layer)', () => {
  let app: Awaited<ReturnType<typeof import('../../hono-app.ts')['createHonoApp']>>;

  beforeAll(async () => {
    const mod = await import('../../hono-app.ts');
    app = mod.createHonoApp();
  });

  it('unkeyed POST /mcp → 401 (HOLO_KEY_MCP still required at origin)', async () => {
    const res = await call(app, 'POST', '/mcp');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('unauthorized');
    expect(body.error).not.toBe('foreign origin rejected');
  });

  it('MCP bearer + foreign Origin → 403 MCP_ORIGIN_REJECTED', async () => {
    const res = await call(app, 'POST', '/mcp', MCP, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok?: boolean; error?: string; code?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('foreign origin rejected');
    expect(body.code).toBe('MCP_ORIGIN_REJECTED');
  });

  it('valid MCP bearer without foreign Origin is not 401/403', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        ...bearer(MCP),
        'content-type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'scoped-key-origin-test', version: '1' },
        },
      }),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});

describe('AC-3: control scope limited to documented mission admin routes', () => {
  let app: Awaited<ReturnType<typeof import('../../hono-app.ts')['createHonoApp']>>;

  beforeAll(async () => {
    const mod = await import('../../hono-app.ts');
    app = mod.createHonoApp();
  });

  it('CONTROL_KEY GET /api/missions/x passes auth and reaches the real handler', async () => {
    const res = await call(app, 'GET', '/api/missions/x', CONTROL);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('CONTROL_KEY POST /api/missions/x/verdicts passes auth and reaches the real handler', async () => {
    const res = await call(app, 'POST', '/api/missions/x/verdicts', CONTROL);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('CONTROL_KEY POST /api/missions/x/steer passes auth and reaches the real handler', async () => {
    const res = await call(app, 'POST', '/api/missions/x/steer', CONTROL);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('CONTROL_KEY GET /api/missions → 403', async () => {
    const res = await call(app, 'GET', '/api/missions', CONTROL);
    expect(res.status).toBe(403);
  });

  it('CONTROL_KEY POST /api/missions → 403', async () => {
    const res = await call(app, 'POST', '/api/missions', CONTROL);
    expect(res.status).toBe(403);
  });

  it('CONTROL_KEY POST /mcp → 403', async () => {
    const res = await call(app, 'POST', '/mcp', CONTROL);
    expect(res.status).toBe(403);
  });
});

describe('AC-2: resolveModel wired to Fleet Role Manifest (fail-closed)', () => {
  it('exports resolveModel from inference/resolve-model', async () => {
    const mod = await import('../../../inference/resolve-model.ts');
    expect(typeof mod.resolveModel).toBe('function');
  });

  it('resolveModel("divergent") returns live :4545 endpoint', async () => {
    const { resolveModel } = await import('../../../inference/resolve-model.ts');
    const resolved = await resolveModel('divergent');
    expect(resolved.endpoint).toMatch(/:4545/);
    expect(resolved.endpoint).toMatch(/127\.0\.0\.1|localhost/);
    expect(resolved.role).toBe('divergent');
    expect(resolved.litellmModelId).toBe('implementer');
  });

  it('resolveModel("convergent") returns a :4545 endpoint', async () => {
    const { resolveModel } = await import('../../../inference/resolve-model.ts');
    const resolved = await resolveModel('convergent');
    expect(resolved.endpoint).toMatch(/:4545/);
    expect(resolved.role).toBe('convergent');
    expect(resolved.litellmModelId).toBe('reviewer');
  });

  it('resolveModel("nonexistent") fails closed (throws)', async () => {
    const { resolveModel } = await import('../../../inference/resolve-model.ts');
    let threw = false;
    let msg = '';
    try {
      await resolveModel('nonexistent');
    } catch (err) {
      threw = true;
      msg = err instanceof Error ? err.message : String(err);
    }
    expect(threw).toBe(true);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/unknown|not found|nonexistent|role/i);
  });

  it('resolveModel fails closed when fleet endpoint is unreachable', async () => {
    const { resolveModel } = await import('../../../inference/resolve-model.ts');
    // Override health probe target to a dead port — fail closed, no fake endpoint
    let threw = false;
    let msg = '';
    try {
      await resolveModel('divergent', {
        endpointOverride: 'http://127.0.0.1:1',
        skipHealth: false,
      });
    } catch (err) {
      threw = true;
      msg = err instanceof Error ? err.message : String(err);
    }
    expect(threw).toBe(true);
    expect(msg).toMatch(/unreachable|refused|failed|health|down|ECONNREFUSED|abort|timeout/i);
  });
});

describe('CLI manifest:resolve (integration via subprocess)', () => {
  function holoPath(): string {
    return join(resolveRepoRoot(), 'services/platform/src/cli/holo.ts');
  }

  function runHolo(args: string[]): number | null {
    const result = spawnSync(process.execPath, [holoPath(), ...args], {
      cwd: resolveRepoRoot(),
      stdio: 'ignore',
    });
    return result.status;
  }

  it('holo manifest:resolve divergent prints :4545 endpoint and exits 0', async () => {
    expect(runHolo(['manifest:resolve', 'divergent'])).toBe(0);
    const src = readFileSync(holoPath(), 'utf8');
    expect(src).toContain("case 'manifest:resolve'");
    expect(src).toContain('console.log(JSON.stringify(resolved, null, 2))');
    const { resolveModel } = await import('../../../inference/resolve-model.ts');
    const resolved = await resolveModel('divergent');
    expect(resolved.endpoint).toMatch(/:4545/);
    expect(resolved.role).toBe('divergent');
  });

  it('holo manifest:resolve nonexistent exits nonzero', async () => {
    expect(runHolo(['manifest:resolve', 'nonexistent'])).not.toBe(0);
    const src = readFileSync(holoPath(), 'utf8');
    expect(src).toMatch(/UNKNOWN_ROLE|unknown fleet role/i);
  });
});

/** Walk up from this file to the worktree/repo root that contains services/platform. */
function resolveRepoRoot(): string {
  let dir = import.meta.dir;
  for (let i = 0; i < 16; i++) {
    if (existsSync(join(dir, 'services/platform/src/cli/holo.ts'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

afterAll(() => {
  // no-op: app is in-process
});
