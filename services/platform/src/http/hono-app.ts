/**
 * Hono HTTP + SSE surface for the single Mastra service.
 *
 * Sprint 05 service-1: /health + SSE capability shell.
 * Later routes (chat-runs, missions, MCP mount, auth middleware) land in
 * service-2 / service-3 and beyond — this is the composition surface only.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { type HealthBody, runHealthCheck } from './health.ts';

export type HonoApp = Hono;

/**
 * Build the Hono app. Health handler runs live probes on every request.
 */
export function createHonoApp(): HonoApp {
  const app = new Hono();

  app.get('/health', async (c) => {
    const result = await runHealthCheck();
    return c.json(result.body as HealthBody, result.statusCode);
  });

  /**
   * Minimal SSE capability surface — proves Hono streaming is wired.
   * Full chat-runs event stream lands in a later service task.
   */
  app.get('/api/sse-ping', (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'ping',
        data: JSON.stringify({ ok: true, ts: new Date().toISOString() }),
      });
    });
  });

  return app;
}
