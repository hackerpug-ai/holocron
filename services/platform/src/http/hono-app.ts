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
import { upsertFileObject } from '../blob/file-objects.ts';
import { BlobStore, defaultBlobRoot } from '../blob/store.ts';
import { isSha256Hex } from '../blob/utils.ts';
import { createSoakFenceMiddleware } from '../cutover/soak-fence.ts';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { handleMcpRequest } from '../mcp/gateway.ts';
import {
  finalizeUploadIntent,
  initUploadIntent,
  putUploadStream,
  UploadServiceError,
} from '../uploads/service.ts';
import {
  articleHtml,
  notFoundHtml,
  selectPublicArticle,
  selectPublicArticleAsset,
} from './article.ts';
import { cancelChatRun, createChatRun, getChatRun, listChatEvents } from './chat-runs.ts';
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

function narrationChunks(markdown: string): string[] {
  const normalized = markdown
    .replace(/```[\s\S]*?```/g, 'Code block omitted from narration.')
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > 0) {
    if (remaining.length <= 3_500) {
      chunks.push(remaining);
      break;
    }
    const boundary = Math.max(
      remaining.lastIndexOf('. ', 3_500),
      remaining.lastIndexOf(' ', 3_500)
    );
    const end = boundary > 0 ? boundary + 1 : 3_500;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  return chunks;
}

export function createHonoApp(options?: CreateHonoAppOptions): HonoApp {
  const app = new Hono<{ Variables: HonoAppVariables }>();
  const keys = options?.keys ?? loadScopedKeysFromEnv();
  const blobStore = new BlobStore(defaultBlobRoot());

  // Public article routes are the sole unauthenticated egress.
  app.get('/article/:shareToken', async (c) => {
    const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'public article route' });
    const sql = createSql(databaseUrl);
    try {
      const article = await selectPublicArticle(sql, c.req.param('shareToken'));
      if (!article) {
        return new Response(notFoundHtml(), {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(articleHtml(article), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  app.get('/article/:shareToken/assets/:fileObjectId', async (c) => {
    const databaseUrl = resolveHolocronNonprodDatabaseUrl({
      context: 'public article asset route',
    });
    const sql = createSql(databaseUrl);
    try {
      const asset = await selectPublicArticleAsset(
        sql,
        c.req.param('shareToken'),
        c.req.param('fileObjectId')
      );
      if (!asset || !isSha256Hex(asset.content_hash) || !blobStore.exists(asset.content_hash)) {
        return c.json({ error: 'not_found', message: 'article asset not found' }, 404);
      }
      const bytes = blobStore.get(asset.content_hash);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': asset.mime_type ?? 'application/octet-stream',
          'Content-Length': String(bytes.length),
          'Cache-Control': 'no-store',
        },
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  // Global scoped-key gate — exempt paths decided inside middleware (/health, /article/*)
  app.use('*', createScopedKeyMiddleware(keys));

  // D06-05: HOLO_MIGRATION_READ_ONLY fence on non-GET /api/* (fresh env read per request)
  app.use('*', createSoakFenceMiddleware());

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

  app.post('/api/chat-runs', async (c) => {
    try {
      const result = await createChatRun(await c.req.json(), c.get('scope'));
      return c.json(result, 200);
    } catch (error) {
      return Response.json(
        {
          error: 'chat_run_error',
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 422 }
      );
    }
  });

  app.post('/api/chat-runs/:id/cancel', async (c) => {
    const result = await cancelChatRun(c.req.param('id'), { ownerScope: c.get('scope') });
    if (!result) return c.json({ error: 'not_found', message: 'chat run not found' }, 404);
    return c.json(result, 200);
  });

  app.get('/api/chat-runs/:id', async (c) => {
    const result = await getChatRun(c.req.param('id'), { ownerScope: c.get('scope') });
    if (!result) return c.json({ error: 'not_found', message: 'chat run not found' }, 404);
    return c.json(result, 200);
  });

  app.get('/api/chat-runs/:id/events', async (c) => {
    const runId = c.req.param('id');
    const parsed = Number.parseInt(c.req.header('Last-Event-ID') ?? '0', 10);
    const afterSeq = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    return streamSSE(c, async (stream) => {
      let cursor = afterSeq;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const result = await listChatEvents(runId, cursor, { ownerScope: c.get('scope') });
        if (!result) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ code: 'CHAT_RUN_NOT_FOUND' }),
          });
          return;
        }
        for (const event of result.events) {
          await stream.writeSSE({
            id: String(event.seq),
            event: event.event_type,
            data: JSON.stringify(event.data_json),
          });
          cursor = event.seq;
        }
        if (['completed', 'blocked', 'failed'].includes(result.run.status)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
  });

  /** Durable conversation identity command for the native drawer. */
  app.patch('/api/conversations/:id', async (c) => {
    try {
      const body = (await c.req.json()) as { title?: unknown };
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return c.json({ error: 'invalid_title', message: 'title must not be empty' }, 422);
      }

      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'conversation rename' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string; title: string }[]>`
          UPDATE conversations
          SET title = ${title}, title_set_by_user = true, updated_at = now()
          WHERE id = ${c.req.param('id')}::uuid
          RETURNING id::text AS id, title
        `;
        if (!rows[0]) {
          return c.json({ error: 'not_found', message: 'conversation not found' }, 404);
        }
        return c.json({ conversation: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'conversation_rename_error', message }, 422);
    }
  });

  /** Durable destructive conversation command for the native drawer. */
  app.delete('/api/conversations/:id', async (c) => {
    try {
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'conversation delete' });
      const sql = createSql(databaseUrl);
      try {
        const deleted = await sql.begin(async (tx) => {
          await tx`DELETE FROM chat_messages WHERE conversation_id = ${c.req.param('id')}`;
          const rows = await tx<{ id: string }[]>`
            DELETE FROM conversations
            WHERE id = ${c.req.param('id')}::uuid
            RETURNING id::text AS id
          `;
          return rows[0];
        });
        if (!deleted) {
          return c.json({ error: 'not_found', message: 'conversation not found' }, 404);
        }
        return c.json({ deleted: true, id: deleted.id }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'conversation_delete_error', message }, 422);
    }
  });

  /** Durable Markdown article creation for the native import modal. */
  app.post('/api/documents', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const category = typeof body.category === 'string' ? body.category.trim() : 'general';
      if (!title || !content) {
        return c.json(
          { error: 'invalid_document', message: 'title and content are required' },
          422
        );
      }
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'document create' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string; title: string; content: string; category: string }[]>`
          INSERT INTO documents (id, title, content, category, status, date)
          VALUES (${crypto.randomUUID()}::uuid, ${title}, ${content}, ${category}, 'draft', ${new Date().toISOString()})
          RETURNING id::text AS id, title, content, category
        `;
        return c.json({ document: rows[0] }, 201);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'document_create_error', message }, 422);
    }
  });

  /**
   * Generate durable, authenticated narration audio for a document. Audio is
   * deliberately produced server-side so provider credentials never reach the
   * native client; the resulting blob ids are published through Zero for the
   * existing player and active-block UI.
   */
  app.post('/api/documents/:id/narration', async (c) => {
    const documentId = c.req.param('id');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: 'narration_unavailable', message: 'audio service is not configured' },
        503
      );
    }

    let force = false;
    try {
      const body = (await c.req.json().catch(() => ({}))) as { force?: unknown };
      force = body.force === true;
    } catch {
      return c.json({ error: 'invalid_request', message: 'narration body must be JSON' }, 422);
    }

    const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'document narration' });
    const sql = createSql(databaseUrl);
    try {
      const documentRows = await sql<{ title: string | null; content: string | null }[]>`
        SELECT title, content FROM documents WHERE id = ${documentId}::uuid
      `;
      const document = documentRows[0];
      if (!document) return c.json({ error: 'not_found', message: 'document not found' }, 404);

      if (!force) {
        const existing = await sql<{ id: string; status: string }[]>`
          SELECT id::text, status FROM audio_jobs
          WHERE document_id = ${documentId} AND status = 'completed'
          ORDER BY created_at DESC LIMIT 1
        `;
        if (existing[0]) return c.json({ job: existing[0], reused: true }, 200);
      }

      const chunks = narrationChunks(document.content ?? '');
      if (chunks.length === 0) {
        return c.json({ error: 'not_narratable', message: 'document has no narratable text' }, 422);
      }

      if (force) {
        await sql`DELETE FROM audio_segments WHERE document_id = ${documentId}`;
        await sql`DELETE FROM audio_jobs WHERE document_id = ${documentId}`;
      }

      const jobId = crypto.randomUUID();
      await sql`
        INSERT INTO audio_jobs (id, document_id, status, total_segments, completed_segments, failed_segments)
        VALUES (${jobId}::uuid, ${documentId}, 'in_progress', ${chunks.length}, 0, 0)
      `;

      const completed: Array<{ id: string; blobId: string }> = [];
      for (const [paragraphIndex, input] of chunks.entries()) {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice: 'alloy',
            input,
            response_format: 'mp3',
          }),
        });
        if (!response.ok) {
          throw new Error(`audio provider returned ${response.status}`);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0) throw new Error('audio provider returned an empty response');
        const blob = await blobStore.put(bytes, { filename: 'narration.mp3' });
        const fileObject = await upsertFileObject(sql, {
          contentHash: blob.sha256,
          mimeType: 'audio/mpeg',
          byteSize: blob.byteLength,
          storagePath: blob.relativePath,
          originalName: 'narration.mp3',
          metadata: { producers: ['document-narration'], sourceRefs: [documentId] },
        });
        const segmentId = crypto.randomUUID();
        await sql`
          INSERT INTO audio_segments (
            id, document_id, paragraph_index, blob_id, file_object_id, status, duration_ms, job_id
          ) VALUES (
            ${segmentId}::uuid, ${documentId}, ${paragraphIndex}, ${blob.sha256},
            ${fileObject.id}::uuid, 'completed', ${Math.max(1_000, Math.round((input.split(/\s+/).length / 150) * 60_000))}, ${jobId}::uuid
          )
        `;
        completed.push({ id: segmentId, blobId: blob.sha256 });
      }

      await sql`
        UPDATE audio_jobs
        SET status = 'completed', completed_segments = ${completed.length}, updated_at = now()
        WHERE id = ${jobId}::uuid
      `;
      return c.json(
        { job: { id: jobId, status: 'completed' }, segments: completed, reused: false },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await sql`
          UPDATE audio_jobs SET status = 'failed', error_message = ${message}, updated_at = now()
          WHERE document_id = ${documentId} AND status = 'in_progress'
        `;
      } catch {
        // Preserve the original provider/database failure below.
      }
      return c.json({ error: 'narration_error', message }, 502);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  /**
   * Issue a short-lived OpenAI Realtime credential after an explicit native
   * microphone gesture. The long-lived provider key remains server-only.
   */
  app.post('/api/voice-sessions', async (c) => {
    try {
      const body = (await c.req.json()) as { conversationId?: unknown };
      const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
      if (!conversationId) {
        return c.json(
          { error: 'invalid_voice_session', message: 'conversationId is required' },
          422
        );
      }
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return c.json(
          { error: 'voice_unavailable', message: 'voice service is not configured' },
          503
        );
      }

      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'voice session create' });
      const sql = createSql(databaseUrl);
      try {
        const conversation = await sql<{ title: string | null }[]>`
          SELECT title FROM conversations WHERE id = ${conversationId}::uuid
        `;
        if (!conversation[0]) {
          return c.json({ error: 'not_found', message: 'conversation not found' }, 404);
        }

        const title = conversation[0].title?.trim() || 'this conversation';
        const instructions = `You are Holocron, a concise and helpful voice assistant. Continue ${title}.`;
        const credentialResponse = await fetch(
          'https://api.openai.com/v1/realtime/client_secrets',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              session: {
                type: 'realtime',
                model: 'gpt-realtime',
                instructions,
                audio: {
                  input: {
                    turn_detection: {
                      type: 'server_vad',
                      threshold: 0.5,
                      prefix_padding_ms: 300,
                      silence_duration_ms: 500,
                      idle_timeout_ms: 30000,
                    },
                    transcription: { model: 'gpt-4o-transcribe' },
                  },
                  output: { voice: 'cedar' },
                },
                truncation: { type: 'retention_ratio', retention_ratio: 0.8 },
              },
            }),
          }
        );
        if (!credentialResponse.ok) {
          return c.json(
            { error: 'voice_unavailable', message: 'voice service is unavailable' },
            503
          );
        }
        const credential = (await credentialResponse.json()) as { value?: unknown };
        if (typeof credential.value !== 'string' || !credential.value) {
          return c.json(
            { error: 'voice_unavailable', message: 'voice credential was invalid' },
            503
          );
        }

        const sessionId = crypto.randomUUID();
        await sql.begin(async (tx) => {
          await tx`
            UPDATE voice_sessions
            SET completed_at = now(), total_duration_ms = GREATEST(0, EXTRACT(EPOCH FROM now() - started_at) * 1000)::integer,
                error_message = 'Replaced by new session', updated_at = now()
            WHERE conversation_id = ${conversationId} AND completed_at IS NULL
          `;
          await tx`
            INSERT INTO voice_sessions (id, conversation_id, started_at, turn_count)
            VALUES (${sessionId}::uuid, ${conversationId}, now(), 0)
          `;
        });
        return c.json(
          { session: { ephemeralKey: credential.value, sessionId, instructions } },
          201
        );
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'voice_session_create_error', message }, 422);
    }
  });

  /** Complete a durable voice session when the native overlay closes. */
  app.post('/api/voice-sessions/:id/end', async (c) => {
    try {
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'voice session end' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string }[]>`
          UPDATE voice_sessions
          SET completed_at = COALESCE(completed_at, now()),
              total_duration_ms = COALESCE(total_duration_ms, GREATEST(0, EXTRACT(EPOCH FROM now() - started_at) * 1000)::integer),
              updated_at = now()
          WHERE id = ${c.req.param('id')}::uuid
          RETURNING id::text AS id
        `;
        if (!rows[0])
          return c.json({ error: 'not_found', message: 'voice session not found' }, 404);
        return c.json({ session: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'voice_session_end_error', message }, 422);
    }
  });

  /** Durable native improvement creation. */
  app.post('/api/improvements', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (!title || !description) {
        return c.json(
          { error: 'invalid_improvement', message: 'title and description are required' },
          422
        );
      }
      const sourceScreen = typeof body.sourceScreen === 'string' ? body.sourceScreen : null;
      const sourceComponent =
        typeof body.sourceComponent === 'string' ? body.sourceComponent : null;
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'improvement create' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string }[]>`
          INSERT INTO improvement_requests (id, title, description, status, source_screen, source_component)
          VALUES (${crypto.randomUUID()}::uuid, ${title}, ${description}, 'pending', ${sourceScreen}, ${sourceComponent})
          RETURNING id::text AS id
        `;
        return c.json({ improvement: rows[0] }, 201);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'improvement_create_error', message }, 422);
    }
  });

  /** Durable native improvement edit and open/closed transition. */
  app.patch('/api/improvements/:id', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : undefined;
      const description =
        typeof body.description === 'string' ? body.description.trim() : undefined;
      const status =
        body.status === 'pending' || body.status === 'completed' ? body.status : undefined;
      if ((title !== undefined && !title) || (description !== undefined && !description)) {
        return c.json(
          { error: 'invalid_improvement', message: 'text fields must not be empty' },
          422
        );
      }
      if (title === undefined && description === undefined && status === undefined) {
        return c.json({ error: 'invalid_improvement', message: 'no changes supplied' }, 422);
      }
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'improvement update' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string }[]>`
          UPDATE improvement_requests
          SET title = COALESCE(${title ?? null}, title),
              description = COALESCE(${description ?? null}, description),
              status = COALESCE(${status ?? null}, status),
              closed_at = CASE WHEN ${status ?? null} = 'completed' THEN now() WHEN ${status ?? null} = 'pending' THEN NULL ELSE closed_at END,
              processed_at = CASE WHEN ${status ?? null} = 'completed' THEN now() WHEN ${status ?? null} = 'pending' THEN NULL ELSE processed_at END,
              updated_at = now()
          WHERE id = ${c.req.param('id')}::uuid
          RETURNING id::text AS id
        `;
        if (!rows[0]) return c.json({ error: 'not_found', message: 'improvement not found' }, 404);
        return c.json({ improvement: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'improvement_update_error', message }, 422);
    }
  });

  /** Durable native improvement removal. */
  app.delete('/api/improvements/:id', async (c) => {
    try {
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'improvement delete' });
      const sql = createSql(databaseUrl);
      try {
        const deleted = await sql.begin(async (tx) => {
          await tx`DELETE FROM improvement_images WHERE request_id = ${c.req.param('id')}`;
          const rows = await tx<{ id: string }[]>`
            DELETE FROM improvement_requests WHERE id = ${c.req.param('id')}::uuid RETURNING id::text AS id
          `;
          return rows[0];
        });
        if (!deleted) return c.json({ error: 'not_found', message: 'improvement not found' }, 404);
        return c.json({ deleted: true, id: deleted.id }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'improvement_delete_error', message }, 422);
    }
  });

  /** Persist automatic-research changes from the native subscriptions list. */
  app.patch('/api/subscriptions/:id', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      if (typeof body.autoResearch !== 'boolean') {
        return c.json(
          { error: 'invalid_subscription', message: 'autoResearch must be a boolean' },
          422
        );
      }
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'subscription update' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string; auto_research: boolean }[]>`
          UPDATE subscription_sources
          SET auto_research = ${body.autoResearch}, updated_at = now()
          WHERE id = ${c.req.param('id')}::uuid
          RETURNING id::text AS id, auto_research
        `;
        if (!rows[0]) return c.json({ error: 'not_found', message: 'subscription not found' }, 404);
        return c.json({ subscription: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'subscription_update_error', message }, 422);
    }
  });

  /** Durable relevance feedback for a feed item; repeated values are idempotent. */
  app.post('/api/feed-items/:id/feedback', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      if (body.feedback !== 'up' && body.feedback !== 'down') {
        return c.json(
          { error: 'invalid_feedback', message: 'feedback must be "up" or "down"' },
          422
        );
      }
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'feed feedback' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string; user_feedback: string; user_feedback_at: string }[]>`
          UPDATE feed_items
          SET user_feedback = ${body.feedback}, user_feedback_at = now()
          WHERE id = ${c.req.param('id')}::uuid
          RETURNING id::text AS id, user_feedback, user_feedback_at::text
        `;
        if (!rows[0]) return c.json({ error: 'not_found', message: 'feed item not found' }, 404);
        return c.json({ feedItem: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'feed_feedback_error', message }, 422);
    }
  });

  /** Apply a reviewer decision once the assimilation plan is ready for approval. */
  app.patch('/api/assimilations/:id', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      if (body.decision !== 'approve' && body.decision !== 'reject') {
        return c.json(
          {
            error: 'invalid_assimilation_decision',
            message: 'decision must be "approve" or "reject"',
          },
          422
        );
      }
      if (body.feedback !== undefined && typeof body.feedback !== 'string') {
        return c.json(
          { error: 'invalid_assimilation_feedback', message: 'feedback must be a string' },
          422
        );
      }

      const decision = body.decision;
      const feedback = typeof body.feedback === 'string' ? body.feedback.trim() || null : null;
      const nextStatus = decision === 'approve' ? 'running' : feedback ? 'planning' : 'rejected';
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'assimilation decision' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string; status: string; plan_feedback: string | null }[]>`
          UPDATE assimilation_sessions
          SET status = ${nextStatus},
              plan_feedback = CASE WHEN ${decision} = 'reject' THEN ${feedback} ELSE plan_feedback END,
              updated_at = now()
          WHERE id = ${c.req.param('id')}::uuid
            AND status IN ('pending_approval', 'planning')
          RETURNING id::text AS id, status, plan_feedback
        `;
        if (!rows[0]) {
          return c.json(
            {
              error: 'invalid_assimilation_state',
              message: 'session is not awaiting a reviewer decision',
            },
            409
          );
        }
        return c.json({ session: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'assimilation_decision_error', message }, 422);
    }
  });

  /** Remove a source and its dependent collected content as one durable operation. */
  app.delete('/api/subscriptions/:id', async (c) => {
    try {
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'subscription delete' });
      const sql = createSql(databaseUrl);
      try {
        const deleted = await sql.begin(async (tx) => {
          await tx`DELETE FROM subscription_content WHERE source_id = ${c.req.param('id')}`;
          const rows = await tx<{ id: string }[]>`
            DELETE FROM subscription_sources WHERE id = ${c.req.param('id')}::uuid RETURNING id::text AS id
          `;
          return rows[0];
        });
        if (!deleted) return c.json({ error: 'not_found', message: 'subscription not found' }, 404);
        return c.json({ deleted: true, id: deleted.id }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'subscription_delete_error', message }, 422);
    }
  });

  /** Durable append for the native article import modal. */
  app.post('/api/documents/:id/import', async (c) => {
    try {
      const body = (await c.req.json()) as { text?: unknown };
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) {
        return c.json({ error: 'invalid_import', message: 'text must not be empty' }, 422);
      }
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'document import' });
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ id: string; content: string }[]>`
          UPDATE documents
          SET content = CASE
            WHEN content IS NULL OR content = '' THEN ${text}
            ELSE content || E'\\n\\n' || ${text}
          END
          WHERE id = ${c.req.param('id')}::uuid
          RETURNING id::text AS id, content
        `;
        if (!rows[0]) {
          return c.json({ error: 'not_found', message: 'document not found' }, 404);
        }
        return c.json({ document: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'document_import_error', message }, 422);
    }
  });

  /** Durable publication for native article sharing. */
  app.post('/api/documents/:id/publish', async (c) => {
    try {
      const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'document publish' });
      const sql = createSql(databaseUrl);
      try {
        const newToken = `share-${crypto.randomUUID()}`;
        const rows = await sql<{ id: string; shareToken: string; isPublic: boolean }[]>`
          UPDATE documents
          SET is_public = true, share_token = COALESCE(share_token, ${newToken})
          WHERE id = ${c.req.param('id')}::uuid
          RETURNING id::text AS id, share_token AS "shareToken", is_public AS "isPublic"
        `;
        if (!rows[0]) {
          return c.json({ error: 'not_found', message: 'document not found' }, 404);
        }
        return c.json({ document: rows[0] }, 200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'document_publish_error', message }, 422);
    }
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

  const mcpHandler = async (c: Parameters<HonoApp['all']>[1]) => {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.json(
        { ok: false, error: 'foreign origin rejected', code: 'MCP_ORIGIN_REJECTED' },
        403
      );
    }
    return handleMcpRequest(c.req.raw);
  };
  app.all('/mcp', mcpHandler);
  app.all('/mcp/*', mcpHandler);

  return app;
}
