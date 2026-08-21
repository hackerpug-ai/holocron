/**
 * Drives the shipped public-reader handler (cache-then-origin) without a
 * Cloudflare edge. Live public curls remain the reachability proof.
 */
import { describe, expect, it } from 'vitest';
import worker from '../../services/worker-docs-reader/src/index';
import {
  CACHE_MAX_AGE_SECONDS,
  type CacheLike,
  handlePublicReaderRequest,
  isOriginShareToken,
  noLongerSharedHtml,
  type ReaderEnv,
} from '../../services/worker-docs-reader/src/reader';

const TOKEN = 'mcp-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ORIGIN_BODY = '<!DOCTYPE html><html><body>origin-article-body</body></html>';

function env(overrides: Partial<ReaderEnv> = {}): ReaderEnv {
  return {
    ORIGIN_BASE_URL: 'https://origin-docs.holocrnlib.com',
    CF_ACCESS_CLIENT_ID: 'access-client-id',
    CF_ACCESS_CLIENT_SECRET: 'access-client-secret',
    ...overrides,
  };
}

function memoryCache(): CacheLike & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    store,
    async match(request) {
      const hit = store.get(new URL(request.url).pathname);
      return hit?.clone();
    },
    async put(request, response) {
      store.set(new URL(request.url).pathname, response.clone());
    },
  };
}

describe('holocron-docs-reader', () => {
  it('accepts minted share-token shapes and rejects garbage (no origin)', () => {
    expect(isOriginShareToken(TOKEN)).toBe(true);
    expect(isOriginShareToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(true);
    expect(isOriginShareToken('share-lxyz-abcd1234')).toBe(true);
    expect(isOriginShareToken('tok-abc')).toBe(false);
    expect(isOriginShareToken('never-existed')).toBe(false);
  });

  it('proxies /d/<token> to origin /article/<token> with Access headers, byte-identical', async () => {
    const pulls: Array<{ url: string; headers: Record<string, string> }> = [];
    const cache = memoryCache();
    const res = await handlePublicReaderRequest(
      new Request(`https://docs.holocrnlib.com/d/${TOKEN}`),
      env(),
      {
        cache,
        fetch: async (input, init) => {
          const url = String(input);
          const headers = new Headers(init?.headers);
          pulls.push({
            url,
            headers: {
              id: headers.get('CF-Access-Client-Id') ?? '',
              secret: headers.get('CF-Access-Client-Secret') ?? '',
            },
          });
          return new Response(ORIGIN_BODY, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        },
      }
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ORIGIN_BODY);
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${CACHE_MAX_AGE_SECONDS}, s-maxage=${CACHE_MAX_AGE_SECONDS}`
    );
    expect(res.headers.get('Cloudflare-CDN-Cache-Control')).toBe(
      `max-age=${CACHE_MAX_AGE_SECONDS}`
    );
    expect(CACHE_MAX_AGE_SECONDS).toBe(60);
    expect(pulls).toEqual([
      {
        url: `https://origin-docs.holocrnlib.com/article/${TOKEN}`,
        headers: { id: 'access-client-id', secret: 'access-client-secret' },
      },
    ]);
    expect(res.headers.get('CF-Access-Client-Id')).toBeNull();
    expect(res.headers.get('CF-Access-Client-Secret')).toBeNull();
  });

  it('default fetch entry serves no-longer-shared for a never-existing token', async () => {
    const res = await worker.fetch(
      new Request('https://docs.holocrnlib.com/d/never-existed'),
      env()
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(noLongerSharedHtml());
  });

  it('serves no-longer-shared 404 for origin 404 and for never-existing tokens without origin pull', async () => {
    const pulls: string[] = [];
    const runtime = {
      cache: memoryCache(),
      fetch: async (input: RequestInfo | URL) => {
        pulls.push(String(input));
        return new Response('origin-not-found', { status: 404 });
      },
    };

    const unknown = await handlePublicReaderRequest(
      new Request('https://docs.holocrnlib.com/d/never-existed'),
      env(),
      runtime
    );
    expect(unknown.status).toBe(404);
    const unknownBody = await unknown.text();
    expect(unknownBody).toBe(noLongerSharedHtml());
    expect(unknownBody).toContain('no longer shared');
    expect(pulls).toEqual([]);

    const unshared = await handlePublicReaderRequest(
      new Request(`https://docs.holocrnlib.com/d/${TOKEN}`),
      env(),
      runtime
    );
    expect(unshared.status).toBe(404);
    const unsharedBody = await unshared.text();
    expect(unsharedBody).toContain('no longer shared');
    expect(unsharedBody).not.toContain('origin-not-found');
    expect(pulls).toEqual([`https://origin-docs.holocrnlib.com/article/${TOKEN}`]);
  });

  it('does not send blob/api/mcp paths to origin; second /d/ hit is a cache hit', async () => {
    let pulls = 0;
    const cache = memoryCache();
    const runtime = {
      cache,
      fetch: async () => {
        pulls += 1;
        return new Response(ORIGIN_BODY, { status: 200 });
      },
    };
    for (const path of ['/api/documents', '/mcp', `/blobs/${'a'.repeat(64)}`]) {
      const res = await handlePublicReaderRequest(
        new Request(`https://docs.holocrnlib.com${path}`),
        env(),
        runtime
      );
      expect(res.status).toBe(404);
    }
    expect(pulls).toBe(0);

    const first = await handlePublicReaderRequest(
      new Request(`https://docs.holocrnlib.com/d/${TOKEN}`),
      env(),
      runtime
    );
    const second = await handlePublicReaderRequest(
      new Request(`https://docs.holocrnlib.com/d/${TOKEN}`),
      env(),
      runtime
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.text()).toBe(ORIGIN_BODY);
    expect(pulls).toBe(1);
  });
});
