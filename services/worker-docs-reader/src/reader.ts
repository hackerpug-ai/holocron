/**
 * Public document reader: cache-then-origin proxy.
 * Public /d/<token> → Access-authenticated origin GET /article/<token>.
 * No R2. No purge. Never log Access headers.
 */

export const CACHE_MAX_AGE_SECONDS = 60; // kb: Option A freshness AND revocation ceiling

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ORIGIN_SHARE_TOKEN_RE = new RegExp(
  `^(?:mcp-)?${UUID}$|^share-[A-Za-z0-9]+-[A-Za-z0-9]+$`,
  'i'
);

export type ReaderEnv = {
  ORIGIN_BASE_URL: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
};

export type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

export type ReaderRuntime = {
  fetch: typeof fetch;
  cache?: CacheLike;
};

export function isOriginShareToken(token: string): boolean {
  return ORIGIN_SHARE_TOKEN_RE.test(token);
}

export function noLongerSharedHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>No longer shared</title>
</head>
<body>
  <h1>No longer shared</h1>
  <p>This document is no longer shared.</p>
</body>
</html>`;
}

function applyReaderCacheHeaders(headers: Headers, cacheable: boolean): void {
  if (cacheable) {
    headers.set(
      'Cache-Control',
      `public, max-age=${CACHE_MAX_AGE_SECONDS}, s-maxage=${CACHE_MAX_AGE_SECONDS}`
    );
    // Free-plan zone edge TTL floor is 7200s; this header is the 60s revocation SLA.
    headers.set('Cloudflare-CDN-Cache-Control', `max-age=${CACHE_MAX_AGE_SECONDS}`);
  } else {
    headers.set('Cache-Control', 'no-store');
  }
}

function htmlResponse(status: number, body: string, cacheable: boolean): Response {
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  applyReaderCacheHeaders(headers, cacheable);
  return new Response(body, { status, headers });
}

function resolveCache(runtime?: ReaderRuntime): CacheLike | undefined {
  if (runtime?.cache) return runtime.cache;
  const stores = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches;
  return stores?.default;
}

function accessHeaders(env: ReaderEnv): Headers {
  const headers = new Headers({ Accept: 'text/html' });
  headers.set('CF-Access-Client-Id', env.CF_ACCESS_CLIENT_ID);
  headers.set('CF-Access-Client-Secret', env.CF_ACCESS_CLIENT_SECRET);
  return headers;
}

export async function handlePublicReaderRequest(
  request: Request,
  env: ReaderEnv,
  runtime?: ReaderRuntime
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const url = new URL(request.url);
  const pathMatch = url.pathname.match(/^\/d\/([^/]+)$/);
  if (!pathMatch?.[1] || !isOriginShareToken(pathMatch[1])) {
    return htmlResponse(404, noLongerSharedHtml(), true);
  }
  const token = pathMatch[1];

  const cacheKey = new Request(`${url.origin}/d/${token}`, { method: 'GET' });
  const cache = resolveCache(runtime);
  const cached = cache ? await cache.match(cacheKey) : undefined;
  if (cached) return cached;

  const originBase = env.ORIGIN_BASE_URL.replace(/\/+$/, '');
  const id = env.CF_ACCESS_CLIENT_ID;
  const secret = env.CF_ACCESS_CLIENT_SECRET;
  if (!originBase || !id || !secret) {
    return htmlResponse(502, '<p>temporarily unavailable</p>', false);
  }

  const doFetch = runtime?.fetch ?? fetch;
  let originRes: Response;
  try {
    originRes = await doFetch(`${originBase}/article/${token}`, {
      method: 'GET',
      headers: accessHeaders(env),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return htmlResponse(502, '<p>temporarily unavailable</p>', false);
  }

  if (originRes.status === 404) {
    const notShared = htmlResponse(404, noLongerSharedHtml(), true);
    await cache?.put(cacheKey, notShared.clone());
    return notShared;
  }
  if (originRes.status !== 200) {
    return htmlResponse(502, '<p>temporarily unavailable</p>', false);
  }

  const body = await originRes.arrayBuffer();
  const headers = new Headers();
  headers.set('Content-Type', originRes.headers.get('Content-Type') ?? 'text/html; charset=utf-8');
  applyReaderCacheHeaders(headers, true);
  const out = new Response(body, { status: 200, headers });
  await cache?.put(cacheKey, out.clone());
  return out;
}
