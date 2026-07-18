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
import { BlobStore, defaultBlobRoot } from '../blob/store.ts';
import { isSha256Hex } from '../blob/utils.ts';
import {
  finalizeUploadIntent,
  initUploadIntent,
  putUploadStream,
  UploadServiceError,
} from '../uploads/service.ts';
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
function parseByteRange(
  header: string | null,
  total: number
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const startRaw = match[1] ?? '';
  const endRaw = match[2] ?? '';
  let start: number;
  let end: number;

  if (startRaw === '' && endRaw === '') return null;
  if (startRaw === '') {
    const suffix = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    end = endRaw === '' ? total - 1 : Number.parseInt(endRaw, 10);
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= total
  ) {
    return null;
  }
  return { start, end: Math.min(end, total - 1) };
}

function jsonError(error: unknown) {
  if (error instanceof UploadServiceError) {
    return { status: error.status, body: { error: 'upload_error', message: error.message } };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { status: 422, body: { error: 'invalid_request', message } };
}

export function createHonoApp(options?: CreateHonoAppOptions): HonoApp {
  const app = new Hono<{ Variables: HonoAppVariables }>();
  const keys = options?.keys ?? loadScopedKeysFromEnv();
  const blobStore = new BlobStore(defaultBlobRoot());

  // Global scoped-key gate — exempt paths decided inside middleware (/health, /article/*)
  app.use('*', createScopedKeyMiddleware(keys));

  app.get('/health', async (c) => {
    const result = await runHealthCheck();
    return c.json(result.body as HealthBody, result.statusCode);
  });

  app.get('/blobs/:id', async (c) => {
    const blobId = c.req.param('id');
    if (!isSha256Hex(blobId)) {
      return c.json(
        { error: 'invalid_request', message: `blob id must be 64 hex chars: ${blobId}` },
        422
      );
    }
    if (!blobStore.exists(blobId)) {
      return c.json({ error: 'not_found', message: `blob not found: ${blobId}` }, 404);
    }
    const bytes = blobStore.get(blobId);
    const meta = blobStore.metadataFor(blobId);
    const range = parseByteRange(c.req.header('Range') ?? null, bytes.length);

    c.header('Accept-Ranges', 'bytes');
    c.header('Content-Type', meta.mimeType);

    if (c.req.header('Range') && !range) {
      c.header('Content-Range', `bytes */${bytes.length}`);
      return new Response(null, { status: 416, headers: c.res.headers });
    }

    if (!range) {
      c.header('Content-Length', String(bytes.length));
      return new Response(bytes, { status: 200, headers: c.res.headers });
    }

    const sliced = bytes.subarray(range.start, range.end + 1);
    c.header('Content-Range', `bytes ${range.start}-${range.end}/${bytes.length}`);
    c.header('Content-Length', String(sliced.length));
    return new Response(sliced, { status: 206, headers: c.res.headers });
  });

  app.post('/api/uploads', async (c) => {
    try {
      const body = await c.req.json();
      const result = await initUploadIntent(body);
      return c.json(result, 200);
    } catch (error) {
      const err = jsonError(error);
      return c.json(err.body, err.status);
    }
  });

  app.put('/api/uploads/:id', async (c) => {
    try {
      const uploadId = c.req.param('id');
      const result = await putUploadStream(uploadId, c.req.raw.body, {
        contentLength: c.req.header('content-length') ?? null,
      });
      return c.json(result, 200);
    } catch (error) {
      const err = jsonError(error);
      return c.json(err.body, err.status);
    }
  });

  app.post('/api/uploads/:id/finalize', async (c) => {
    try {
      const result = await finalizeUploadIntent(c.req.param('id'));
      return c.json(result, 200);
    } catch (error) {
      const err = jsonError(error);
      return c.json(err.body, err.status);
    }
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
