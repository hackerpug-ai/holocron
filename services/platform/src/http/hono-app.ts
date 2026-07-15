/**
 * Hono HTTP + SSE surface for the single Mastra service.
 *
 * Sprint 05 service-1: /health + SSE capability shell.
 * Sprint 05 service-3: scoped-key middleware + protected mission/MCP auth surface.
 *
 * Placeholder handlers for /api/missions* and /mcp return 200 ONLY after
 * middleware authorizes — they are the auth surface under test, not the
 * full mission engine (Sprint 15).
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { type HealthBody, runHealthCheck } from './health.ts';
import {
  createScopedKeyMiddleware,
  loadScopedKeysFromEnv,
  type Scope,
  type ScopedKeyConfig,
} from './middleware/scoped-key.ts';

export type HonoAppVariables = {
  scope: Scope;
  keyFingerprint: string;
};

export type HonoApp = Hono<{ Variables: HonoAppVariables }>;

export type CreateHonoAppOptions = {
  /** Override scoped keys (tests). Defaults to env via loadScopedKeysFromEnv(). */
  keys?: ScopedKeyConfig;
};

/**
 * Build the Hono app. Health handler runs live probes on every request.
 * Scoped-key middleware protects /api/* and /mcp; /health is exempt.
 */
export function createHonoApp(options?: CreateHonoAppOptions): HonoApp {
  const app = new Hono<{ Variables: HonoAppVariables }>();
  const keys = options?.keys ?? loadScopedKeysFromEnv();

  // Global scoped-key gate — exempt paths decided inside middleware (/health, /article/*)
  app.use('*', createScopedKeyMiddleware(keys));

  app.get('/health', async (c) => {
    const result = await runHealthCheck();
    return c.json(result.body as HealthBody, result.statusCode);
  });

  /**
   * Minimal SSE capability surface — proves Hono streaming is wired.
   * Protected by RN scope (under /api/*).
   */
  app.get('/api/sse-ping', (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'ping',
        data: JSON.stringify({ ok: true, ts: new Date().toISOString() }),
      });
    });
  });

  // ── Auth surface placeholders (service-3) ─────────────────────────
  // Return 200 only when middleware has already authorized the scope.

  app.post('/api/missions', (c) => {
    return c.json({
      ok: true,
      route: 'POST /api/missions',
      scope: c.get('scope'),
      note: 'placeholder — mission engine lands in Sprint 15',
    });
  });

  app.get('/api/missions', (c) => {
    return c.json({
      ok: true,
      route: 'GET /api/missions',
      scope: c.get('scope'),
      missions: [],
      note: 'placeholder — mission list lands later',
    });
  });

  app.get('/api/missions/:id', (c) => {
    return c.json({
      ok: true,
      route: 'GET /api/missions/:id',
      id: c.req.param('id'),
      scope: c.get('scope'),
    });
  });

  app.post('/api/missions/:id/verdicts', (c) => {
    return c.json({
      ok: true,
      route: 'POST /api/missions/:id/verdicts',
      id: c.req.param('id'),
      scope: c.get('scope'),
      note: 'placeholder — verdict enforcement lands later',
    });
  });

  app.post('/api/missions/:id/steer', (c) => {
    return c.json({
      ok: true,
      route: 'POST /api/missions/:id/steer',
      id: c.req.param('id'),
      scope: c.get('scope'),
      note: 'placeholder — steering lands later',
    });
  });

  app.all('/mcp', (c) => {
    return c.json({
      ok: true,
      route: `${c.req.method} /mcp`,
      scope: c.get('scope'),
      note: 'placeholder — MCP Streamable HTTP mount lands later',
    });
  });

  app.all('/mcp/*', (c) => {
    return c.json({
      ok: true,
      route: `${c.req.method} ${new URL(c.req.url).pathname}`,
      scope: c.get('scope'),
      note: 'placeholder — MCP Streamable HTTP mount lands later',
    });
  });

  return app;
}
