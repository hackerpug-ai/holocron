/**
 * imp-prod-tool-audit-remediation AC-1 — subscription-monitor performs a real
 * RSS/Atom fetch per source with SSRF hardening.
 *
 * Real Postgres only (DATABASE_URL, fail closed — no skip-to-green) + a real
 * local HTTPS feed server (self-signed cert; TLS verification relaxed for the
 * test process only). No fetch/framework mocks.
 *
 *   - AC-1a: monitor fetches each feed_url source over real HTTPS, inserts new
 *           entries into subscription_content, advances last_checked per-source.
 *   - AC-1b: idempotent — re-run inserts no duplicate content rows.
 *   - AC-1c: source without feed_url advances last_checked without a fetch.
 *   - AC-1d: a failed fetch records an error and does NOT advance last_checked
 *           for that source; other sources still complete.
 *   - AC-1e (SECURITY): https-only scheme gate — even allowlisted hosts.
 *   - AC-1f (SECURITY): loopback/private/link-local/metadata IPs blocked by
 *           default; operator allowlist (HOLO_FEED_ALLOWLIST) permits explicitly
 *           named hosts only.
 *   - AC-1g (SECURITY): cross-host redirects rejected; same-host followed.
 *   - AC-1h (SECURITY): response body bounded by maxBytes.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { feedAllowlistFromEnv, fetchFeedEntries } from '../../src/mcp/executor.ts';
import { subscriptionMonitor } from '../../src/queue/jobs-handlers/subscription-monitor.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

const NS = `ac1feed-${Date.now()}`;

const FEED_A = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed A</title>
  <entry><id>tag:ac1a,2026:e1</id><title>Alpha One</title><link rel="alternate" href="https://example.com/a1"/><published>2026-07-01T00:00:00Z</published><summary>First alpha entry</summary></entry>
  <entry><id>tag:ac1a,2026:e2</id><title>Alpha Two</title><link rel="alternate" href="https://example.com/a2"/><published>2026-07-02T00:00:00Z</published><summary>Second alpha entry</summary></entry>
</feed>`;

const FEED_B = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed B</title>
  <entry><id>tag:ac1b,2026:e1</id><title>Beta One</title><link rel="alternate" href="https://example.com/b1"/><published>2026-07-03T00:00:00Z</published><summary>First beta entry</summary></entry>
</feed>`;

const FEED_C = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed C</title>
  <entry><id>tag:ac1c,2026:e1</id><title>Gamma One</title><link rel="alternate" href="https://example.com/c1"/><published>2026-07-04T00:00:00Z</published><summary>First gamma entry</summary></entry>
</feed>`;

function requireDatabaseUrl(): void {
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for subscription-monitor-fetch — refusing skip-to-green'
    );
  }
}

async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = createSql(DATABASE_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

type ServerStub = {
  url: (path: string) => string;
  requests: string[];
  close: () => Promise<void>;
  port: number;
};

async function startFeedServer(): Promise<ServerStub> {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'ac1-feed-'));
  const keyPath = resolve(fixtureRoot, 'key.pem');
  const certPath = resolve(fixtureRoot, 'cert.pem');
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '2',
    '-nodes',
    '-subj',
    '/CN=127.0.0.1',
  ]);
  const requests: string[] = [];
  const server = https.createServer(
    { key: readFileSync(keyPath), cert: readFileSync(certPath) },
    (req, res) => {
      const path = req.url ?? '/';
      requests.push(path);
      if (path === '/feed.xml') {
        res.writeHead(200, { 'content-type': 'application/atom+xml' });
        res.end(FEED_A);
      } else if (path === '/feed-b.xml') {
        res.writeHead(200, { 'content-type': 'application/atom+xml' });
        res.end(FEED_B);
      } else if (path === '/hop.xml') {
        // Same-host redirect (allowed) to /feed-c.xml
        res.writeHead(302, { location: '/feed-c.xml' });
        res.end();
      } else if (path === '/feed-c.xml') {
        res.writeHead(200, { 'content-type': 'application/atom+xml' });
        res.end(FEED_C);
      } else if (path === '/cross-host.xml') {
        // Cross-host redirect (forbidden) — must never be followed.
        res.writeHead(302, { location: 'https://example.com/evil.xml' });
        res.end();
      } else if (path === '/big.xml') {
        res.writeHead(200, { 'content-type': 'application/atom+xml' });
        res.end(`${FEED_A}${'#'.repeat(64_000)}`);
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    }
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('feed server did not bind');
  return {
    port: addr.port,
    url: (path: string) => `https://127.0.0.1:${addr.port}${path}`,
    requests,
    close: () =>
      new Promise<void>((done) =>
        server.close(() => {
          rmSync(fixtureRoot, { recursive: true, force: true });
          done();
        })
      ),
  };
}

let feedServer: ServerStub;
let previousTlsSetting: string | undefined;

async function seedSource(feedUrl: string | null): Promise<string> {
  return withSql(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO subscription_sources (source_type, identifier, name, url, feed_url)
      VALUES ('rss', ${`${NS}-${Math.random().toString(36).slice(2)}`}, 'AC-1 source', 'https://example.com', ${feedUrl})
      RETURNING id::text AS id
    `;
    return rows[0]?.id ?? '';
  });
}

async function deleteSource(id: string): Promise<void> {
  await withSql(async (sql) => {
    await sql`DELETE FROM subscription_content WHERE source_id = ${id}::uuid`;
    await sql`DELETE FROM subscription_sources WHERE id = ${id}::uuid`;
  });
}

async function sourceState(id: string): Promise<{ lastChecked: Date | null; contentRows: number }> {
  return withSql(async (sql) => {
    const src = await sql<{ last_checked: Date | null }[]>`
      SELECT last_checked FROM subscription_sources WHERE id = ${id}::uuid`;
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM subscription_content WHERE source_id = ${id}::uuid`;
    return { lastChecked: src[0]?.last_checked ?? null, contentRows: Number(rows[0]?.count ?? 0) };
  });
}

describe('subscription-monitor real feed fetch (imp-prod-tool-audit AC-1)', () => {
  beforeAll(async () => {
    requireDatabaseUrl();
    feedServer = await startFeedServer();
    previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  });

  afterAll(async () => {
    if (previousTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
    await feedServer?.close();
  });

  beforeEach(() => {
    process.env.HOLO_FEED_ALLOWLIST = '127.0.0.1';
  });

  it('AC-1a: fetches each feed source over real HTTPS, inserts entries, advances last_checked per-source', async () => {
    const withFeed = await seedSource(feedServer.url('/feed.xml'));
    const noFeed = await seedSource(null);
    try {
      const result = await subscriptionMonitor({ databaseUrl: DATABASE_URL, now: new Date() });
      expect(result.ok).toBe(true);

      const fed = await sourceState(withFeed);
      expect(fed.contentRows).toBe(2);
      expect(fed.lastChecked).not.toBeNull();

      const bare = await sourceState(noFeed);
      expect(bare.contentRows).toBe(0);
      expect(bare.lastChecked).not.toBeNull();

      expect(Number(result.detail.entries_queued)).toBeGreaterThanOrEqual(2);
      expect(result.detail.heartbeat_ok).toBe(true);
    } finally {
      await deleteSource(withFeed);
      await deleteSource(noFeed);
    }
  }, 30_000);

  it('AC-1b: re-run is idempotent — no duplicate content rows', async () => {
    const withFeed = await seedSource(feedServer.url('/feed.xml'));
    try {
      const first = await subscriptionMonitor({ databaseUrl: DATABASE_URL, now: new Date() });
      expect(first.ok).toBe(true);
      const afterFirst = await sourceState(withFeed);
      expect(afterFirst.contentRows).toBe(2);

      const second = await subscriptionMonitor({ databaseUrl: DATABASE_URL, now: new Date() });
      expect(second.ok).toBe(true);
      const afterSecond = await sourceState(withFeed);
      expect(afterSecond.contentRows).toBe(2);
    } finally {
      await deleteSource(withFeed);
    }
  }, 30_000);

  it('AC-1d: failed fetch records an error, does not advance that source, others still complete', async () => {
    const dead = await seedSource(`https://127.0.0.1:9/feed.xml`);
    const alive = await seedSource(feedServer.url('/feed.xml'));
    try {
      const result = await subscriptionMonitor({ databaseUrl: DATABASE_URL, now: new Date() });
      expect(result.ok).toBe(true);

      const errors = String(result.detail.errors ?? '');
      expect(errors).toContain('127.0.0.1:9');

      const deadState = await sourceState(dead);
      expect(deadState.lastChecked).toBeNull();
      expect(deadState.contentRows).toBe(0);

      const aliveState = await sourceState(alive);
      expect(aliveState.lastChecked).not.toBeNull();
      expect(aliveState.contentRows).toBe(2);
    } finally {
      await deleteSource(dead);
      await deleteSource(alive);
    }
  }, 30_000);

  it('AC-1f: monitor refuses a loopback feed when the host is not allowlisted', async () => {
    delete process.env.HOLO_FEED_ALLOWLIST;
    const source = await seedSource(feedServer.url('/feed.xml'));
    try {
      const result = await subscriptionMonitor({ databaseUrl: DATABASE_URL, now: new Date() });
      expect(result.ok).toBe(true); // monitor completed; the hostile source is reported
      const errors = String(result.detail.errors ?? '');
      expect(errors).toMatch(/loopback|private|blocked|not allowlisted/i);
      const state = await sourceState(source);
      expect(state.lastChecked).toBeNull();
      expect(state.contentRows).toBe(0);
    } finally {
      await deleteSource(source);
      process.env.HOLO_FEED_ALLOWLIST = '127.0.0.1';
    }
  }, 30_000);

  it('AC-1e: https-only scheme gate holds even for allowlisted hosts', async () => {
    await expect(
      fetchFeedEntries('http://127.0.0.1:9/feed.xml', { allowedHosts: ['127.0.0.1'] })
    ).rejects.toThrow(/https/i);
  });

  it('AC-1f: metadata + link-local addresses are blocked by default', async () => {
    await expect(fetchFeedEntries('https://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /link-local|metadata|blocked|private/i
    );
    await expect(fetchFeedEntries('https://localhost/feed.xml')).rejects.toThrow(
      /loopback|private|blocked/i
    );
  });

  it('AC-1g: cross-host redirects are rejected; same-host redirects are followed', async () => {
    await expect(
      fetchFeedEntries(feedServer.url('/cross-host.xml'), { allowedHosts: ['127.0.0.1'] })
    ).rejects.toThrow(/cross-host redirect/i);

    const entries = await fetchFeedEntries(feedServer.url('/hop.xml'), {
      allowedHosts: ['127.0.0.1'],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('Gamma One');
  }, 15_000);

  it('AC-1h: response body is bounded by maxBytes', async () => {
    await expect(
      fetchFeedEntries(feedServer.url('/big.xml'), { allowedHosts: ['127.0.0.1'], maxBytes: 1024 })
    ).rejects.toThrow(/too large|exceed/i);
  }, 15_000);

  it('feedAllowlistFromEnv parses the operator allowlist', () => {
    const previous = process.env.HOLO_FEED_ALLOWLIST;
    process.env.HOLO_FEED_ALLOWLIST = 'feeds.example.com, 127.0.0.1';
    try {
      expect(feedAllowlistFromEnv()).toEqual(['feeds.example.com', '127.0.0.1']);
    } finally {
      if (previous === undefined) delete process.env.HOLO_FEED_ALLOWLIST;
      else process.env.HOLO_FEED_ALLOWLIST = previous;
    }
  });
});
