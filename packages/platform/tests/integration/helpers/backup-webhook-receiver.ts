/**
 * REDHAT-FIX-S27-07 / F-7 — Independent backup-alert webhook HTTP capture.
 *
 * Canonical AlertPost envelope used by the D04-01 RED suite and gate evidence.
 * Captures are written on the **receiver** side (req.method / url / headers / body),
 * never fabricated from runBackupAlertSweep.posts[] (mutation M1 kill).
 *
 * Gate evidence path:
 *   .spec/.../sprint-27.../.gate-evidence/<run>/alerts-http-captures.json
 *   (array of AlertPost — jq envelope oracle required)
 *
 * Pre-fix alerts-received.json (payload-only posts[] dump) MUST fail:
 *   jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt'
 *
 * Negative control (mutation M1):
 *   stub postBackupAlert to return {ok:true,status:200,body:'ok'} without calling fetch
 *   → independent receiver.posts.length stays 0 → envelope oracle fails.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** Canonical HTTP capture shape (schema parity across RED suite + gate). */
export type AlertPost = {
  receivedAt: string;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  json: Record<string, unknown> | null;
};

export type WebhookReceiver = {
  /** e.g. http://127.0.0.1:9999/alert */
  url: string;
  port: number;
  posts: AlertPost[];
  /** Clear in-memory posts (call between cases). Does not rewrite durable files. */
  reset: () => void;
  close: () => Promise<void>;
};

export const ALERT_HTTP_ENVELOPE_KEYS = [
  'method',
  'url',
  'headers',
  'rawBody',
  'receivedAt',
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** True when an object has the full independent-HTTP envelope (not payload-only). */
export function hasHttpEnvelope(value: unknown): value is AlertPost {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.method === 'string' &&
    typeof rec.url === 'string' &&
    rec.headers !== null &&
    typeof rec.headers === 'object' &&
    !Array.isArray(rec.headers) &&
    typeof rec.rawBody === 'string' &&
    typeof rec.receivedAt === 'string' &&
    rec.receivedAt.length > 0
  );
}

/**
 * jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt'
 * equivalent for an array of captures.
 */
export function assertCapturesHaveHttpEnvelope(captures: unknown): asserts captures is AlertPost[] {
  if (!Array.isArray(captures) || captures.length === 0) {
    throw new Error(
      'HTTP capture oracle failed: expected non-empty array of independent receiver captures (method/url/headers/rawBody/receivedAt)'
    );
  }
  for (let i = 0; i < captures.length; i++) {
    if (!hasHttpEnvelope(captures[i])) {
      throw new Error(
        `HTTP capture oracle failed at index ${i}: missing envelope fields method/url/headers/rawBody/receivedAt (payload-only posts[] dumps are not proof of wire delivery)`
      );
    }
  }
}

/**
 * Extract AlertPost[] from mixed RED evidence shapes:
 * - bare AlertPost array
 * - { alert: AlertPost } failure-*-alert.json
 * - { posts: AlertPost[] } healthy-silence style
 */
export function extractAlertPosts(body: unknown): AlertPost[] {
  if (Array.isArray(body)) {
    return body.filter(hasHttpEnvelope);
  }
  if (!body || typeof body !== 'object') return [];
  const rec = body as Record<string, unknown>;
  if (hasHttpEnvelope(rec.alert)) return [rec.alert];
  if (Array.isArray(rec.posts)) return rec.posts.filter(hasHttpEnvelope);
  if (hasHttpEnvelope(body)) return [body as AlertPost];
  return [];
}

/**
 * Real local webhook sink — http.Server / createServer, live TCP delivery path.
 * Path /alert matches the CAP-BAK-01 contract receiver.
 *
 * STRICT: capture path is server-side (req.*), not client-side posts[] serialization.
 */
export async function startWebhookReceiver(preferredPort = 0): Promise<WebhookReceiver> {
  const posts: AlertPost[] = [];

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      chunks.push(c);
    });
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let json: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = rawBody ? JSON.parse(rawBody) : null;
        json = parsed && typeof parsed === 'object' ? asRecord(parsed) : null;
      } catch {
        json = null;
      }
      const url = req.url ?? '/';
      if (url.startsWith('/alert') && (req.method === 'POST' || req.method === 'PUT')) {
        // Server-side capture — mutation M1 (stub postBackupAlert without fetch) cannot forge this.
        posts.push({
          receivedAt: new Date().toISOString(),
          method: req.method ?? 'POST',
          url,
          headers: { ...req.headers },
          rawBody,
          json,
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, received: posts.length }));
        return;
      }
      if (url.startsWith('/alert') && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, posts: posts.length }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
  };

  const server: Server = createServer(onRequest);

  const listen = (port: number): Promise<number> =>
    new Promise((resolveListen, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off('error', onError);
        reject(err);
      };
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError);
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('webhook receiver has no TCP address'));
          return;
        }
        resolveListen(addr.port);
      });
    });

  let port: number;
  try {
    port = await listen(preferredPort);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EADDRINUSE' && preferredPort !== 0) throw err;
    port = await listen(0);
  }

  const url = `http://127.0.0.1:${port}/alert`;
  const ready = await fetch(url);
  if (!ready.ok) {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    throw new Error(`webhook receiver not ready at ${url}: HTTP ${ready.status}`);
  }

  return {
    url,
    port,
    posts,
    reset: () => {
      posts.length = 0;
    },
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((e) => (e ? reject(e) : resolveClose()));
      }),
  };
}
