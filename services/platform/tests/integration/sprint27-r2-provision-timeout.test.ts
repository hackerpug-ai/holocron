/**
 * REDHAT-FIX-S27-24 / R-11 — cfApi AbortController timeout against real local HTTP servers.
 * PLATFORM_IT=1 required. No fetch mocks.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cfApi,
  DEFAULT_CF_API_TIMEOUT_MS,
  resolveCfApiTimeoutMs,
} from '../../src/backup/r2-provision.ts';

const live = process.env.PLATFORM_IT === '1';
const describeLive = live ? describe : describe.skip;

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else reject(new Error('no port'));
    });
    server.on('error', reject);
  });
}

describeLive('REDHAT-FIX-S27-24 cfApi timeout (real HTTP)', () => {
  let hangServer: Server;
  let happyServer: Server;
  let hangBase: string;
  let happyBase: string;

  beforeAll(async () => {
    hangServer = createServer((_req, _res) => {
      // intentionally never respond — blackhole
    });
    happyServer = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            result: { id: 'ok', method: req.method, path: req.url, bodyLen: body.length },
            errors: [],
          })
        );
      });
    });
    const hangPort = await listen(hangServer);
    const happyPort = await listen(happyServer);
    hangBase = `http://127.0.0.1:${hangPort}`;
    happyBase = `http://127.0.0.1:${happyPort}`;
  });

  afterAll(async () => {
    await Promise.all([
      new Promise<void>((r) => hangServer.close(() => r())),
      new Promise<void>((r) => happyServer.close(() => r())),
    ]);
  });

  it('AC-1/TC-1: hung Cloudflare API aborts within timeout bound', async () => {
    const timeoutMs = 800;
    const t0 = Date.now();
    await expect(
      cfApi('test-token', 'GET', '/accounts/x/r2/buckets', undefined, {
        baseUrl: hangBase,
        timeoutMs,
      })
    ).rejects.toThrow(/timed out|abort/i);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(timeoutMs + 2000);
    expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 100);
  }, 15_000);

  it('AC-2/TC-2: healthy Cloudflare-shaped response still succeeds', async () => {
    const res = await cfApi<{ id: string; method: string }>(
      'tok',
      'POST',
      '/client/v4/ok',
      { a: 1 },
      {
        baseUrl: happyBase,
        timeoutMs: 5000,
      }
    );
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.result?.id).toBe('ok');
    expect(res.result?.method).toBe('POST');
  });

  it('AC-4: timeout fails closed — never ok:true', async () => {
    let threw = false;
    try {
      await cfApi('t', 'GET', '/hang', undefined, { baseUrl: hangBase, timeoutMs: 500 });
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/timed out|abort/i);
    }
    expect(threw).toBe(true);
  }, 10_000);

  it('AC-5: production default remains ~30s', () => {
    expect(DEFAULT_CF_API_TIMEOUT_MS).toBe(30_000);
    expect(resolveCfApiTimeoutMs(undefined, {})).toBe(30_000);
    expect(resolveCfApiTimeoutMs(undefined, { BACKUP_CF_API_TIMEOUT_MS: '2000' })).toBe(2000);
  });
});
