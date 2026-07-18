/**
 * Hono HTTP + SSE surface for the single Mastra service.
 *
 * Sprint 05 service-1: /health + SSE capability shell.
 * Sprint 05 service-3: scoped-key middleware + protected mission/MCP auth surface.
 *
 * Mission control routes are backed by the Postgres mission runtime; /mcp
 * remains a protected placeholder until Streamable HTTP lands.
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
import {
  appendMissionSteeringFromHttp,
  appendMissionVerdictFromHttp,
  createMissionRunFromHttp,
  getMissionStatusFromHttp,
  missionHttpErrorFromUnknown,
} from './missions.ts';

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
      return Response.json(err.body, { status: err.status });
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
      return Response.json(err.body, { status: err.status });
    }
  });

  app.post('/api/uploads/:id/finalize', async (c) => {
    try {
      const result = await finalizeUploadIntent(c.req.param('id'));
      return c.json(result, 200);
    } catch (error) {
      const err = jsonError(error);
      return Response.json(err.body, { status: err.status });
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

  app.post('/api/missions', async (c) => {
    try {
      const body = await c.req.json();
      const result = await createMissionRunFromHttp(body, {
        scope: c.get('scope'),
      });
      return c.json(result, 200);
    } catch (error) {
      const err = missionHttpErrorFromUnknown(error);
      return Response.json(err.body, { status: err.status });
    }
  });

  app.get('/api/missions', () => {
    return Response.json(
      {
        ok: false,
        error: 'mission list is not implemented in Sprint 15',
        code: 'MISSION_LIST_NOT_IMPLEMENTED',
        errorCode: 'MISSION_LIST_NOT_IMPLEMENTED',
      },
      { status: 501 }
    );
  });

  app.get('/api/missions/:id', async (c) => {
    try {
      const result = await getMissionStatusFromHttp(c.req.param('id'), {
        scope: c.get('scope'),
      });
      if (result.errorCode === 'MISSION_NOT_FOUND') {
        return c.json(
          {
            ok: false,
            error: result.error ?? `mission run not found: ${c.req.param('id')}`,
            code: 'MISSION_NOT_FOUND',
            errorCode: 'MISSION_NOT_FOUND',
          },
          404
        );
      }
      return c.json(result, 200);
    } catch (error) {
      const err = missionHttpErrorFromUnknown(error);
      return Response.json(err.body, { status: err.status });
    }
  });

  app.post('/api/missions/:id/verdicts', async (c) => {
    try {
      const body = await c.req.json();
      const result = await appendMissionVerdictFromHttp(c.req.param('id'), c.get('scope'), body);
      return c.json(
        {
          ok: true,
          replay: result.replay,
          runId: result.run.runId,
          verdict: result.verdict,
          event: result.event,
          run: result.run,
        },
        200
      );
    } catch (error) {
      const err = missionHttpErrorFromUnknown(error);
      return Response.json(err.body, { status: err.status });
    }
  });

  app.post('/api/missions/:id/steer', async (c) => {
    try {
      const body = await c.req.json();
      const result = await appendMissionSteeringFromHttp(c.req.param('id'), c.get('scope'), body);
      return c.json(
        {
          ok: true,
          replay: result.replay,
          runId: result.run.runId,
          steering: result.steering,
          event: result.event,
          run: result.run,
        },
        200
      );
    } catch (error) {
      const err = missionHttpErrorFromUnknown(error);
      return Response.json(err.body, { status: err.status });
    }
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
