/**
 * REDHAT-FIX-S27-14 / F-16 — Bound webhook fetch time for postBackupAlert.
 *
 * AC-1: Hung webhook (server accepts, never ends response) aborts within bound.
 * AC-2: Healthy webhook still delivers POST + JSON body.
 * AC-3: AbortController + signal wired in production source (asserted via source read).
 *
 * Real boundaries only:
 * - PLATFORM_IT=1 required (itLive skips otherwise)
 * - real local http.Server receivers (never mock fetch)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts
 *
 * Optional faster hang bound:
 *   BACKUP_ALERT_WEBHOOK_TIMEOUT_MS=2000
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const ALERTING_SRC = resolve(REPO_ROOT, 'packages/platform/src/backup/alerting.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/redhat-fix-s27-14');

/** Production default is 10s; tests may shorten via BACKUP_ALERT_WEBHOOK_TIMEOUT_MS. */
const WEBHOOK_TIMEOUT_MS = Number(process.env.BACKUP_ALERT_WEBHOOK_TIMEOUT_MS ?? 10_000);
/** Slack over timeout for OS scheduling / socket teardown. Cap AC-1 at 12s when default 10s. */
const MAX_ELAPSED_MS = Math.min(12_000, WEBHOOK_TIMEOUT_MS + 2_000);

type CapturedPost = {
  method: string;
  url: string;
  rawBody: string;
  json: Record<string, unknown> | null;
};

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeEvidence(name: string, body: unknown): string {
  ensureEvidenceDir();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function samplePayload() {
  return {
    job_name: 'wal-archive-primary',
    job_id: 'wal-archive-primary',
    reason: 'failed' as const,
    failure_reason: 'F-16 timeout probe — induced failure',
    last_success_at: null,
    overdue_by_minutes: 20,
    last_wal_segment: null,
    last_snapshot_id: null,
    trace_id: 'redhat-fix-s27-14',
    timestamp: new Date().toISOString(),
    status: 'failed',
  };
}

/**
 * Hanging receiver: accepts TCP + request body, never calls res.end.
 * Proves fetch without AbortSignal would hang indefinitely.
 */
async function startHangingWebhookServer(): Promise<{
  url: string;
  close: () => Promise<void>;
  accepted: number;
}> {
  let accepted = 0;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Drain body so fetch can finish writing; intentionally never end response.
    req.on('data', () => {
      /* discard */
    });
    req.on('end', () => {
      accepted += 1;
      // Hold the socket open — do not res.writeHead / res.end.
      void res;
    });
  });

  const port = await new Promise<number>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('hanging webhook has no TCP address'));
        return;
      }
      resolveListen(addr.port);
    });
  });

  return {
    url: `http://127.0.0.1:${port}/alert`,
    get accepted() {
      return accepted;
    },
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((e) => (e ? reject(e) : resolveClose()));
      }),
  };
}

/** Responsive 200 receiver that captures method + JSON body. */
async function startResponsiveWebhookServer(): Promise<{
  url: string;
  posts: CapturedPost[];
  close: () => Promise<void>;
}> {
  const posts: CapturedPost[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      chunks.push(c);
    });
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let json: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = rawBody ? JSON.parse(rawBody) : null;
        json =
          parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
      } catch {
        json = null;
      }
      posts.push({
        method: req.method ?? '',
        url: req.url ?? '',
        rawBody,
        json,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  const port = await new Promise<number>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('responsive webhook has no TCP address'));
        return;
      }
      resolveListen(addr.port);
    });
  });

  return {
    url: `http://127.0.0.1:${port}/alert`,
    posts,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((e) => (e ? reject(e) : resolveClose()));
      }),
  };
}

describe.sequential('REDHAT-FIX-S27-14 — webhook fetch timeout bound (F-16)', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for live backup-alerting timeout IT').toBe(true);
    // Pin timeout for this process so hang test is deterministic.
    process.env.BACKUP_ALERT_WEBHOOK_TIMEOUT_MS = String(WEBHOOK_TIMEOUT_MS);
  });

  itLive(
    'timeout: postBackupAlert rejects within bound against a hanging webhook server',
    async () => {
      const hang = await startHangingWebhookServer();
      try {
        const { postBackupAlert } = await import('../../src/backup/alerting.ts');
        const payload = samplePayload();
        const started = Date.now();
        let rejected: unknown;
        try {
          const result = await postBackupAlert(payload, hang.url);
          // must_not_observe: ok:true / silent resolve
          writeEvidence('timeout-unexpected-ok.json', { result, elapsed_ms: Date.now() - started });
          expect.fail(
            `postBackupAlert must reject on hanging webhook, got ${JSON.stringify(result)}`
          );
        } catch (err) {
          rejected = err;
        }
        const elapsed_ms = Date.now() - started;
        const message = rejected instanceof Error ? rejected.message : String(rejected);
        const name = rejected instanceof Error ? rejected.name : '';
        const combined = `${name} ${message}`;

        writeEvidence('timeout-reject.json', {
          elapsed_ms,
          max_elapsed_ms: MAX_ELAPSED_MS,
          webhook_timeout_ms: WEBHOOK_TIMEOUT_MS,
          error_name: name,
          error_message: message,
          hang_url: hang.url,
        });

        expect(
          elapsed_ms,
          `must reject within ${MAX_ELAPSED_MS}ms, got ${elapsed_ms}ms`
        ).toBeLessThanOrEqual(MAX_ELAPSED_MS);
        // Should not abort instantly before the timer (allow tiny scheduling slack).
        expect(elapsed_ms).toBeGreaterThanOrEqual(Math.max(0, WEBHOOK_TIMEOUT_MS - 500));
        expect(combined, `error must match abort|timeout|AbortError, got: ${combined}`).toMatch(
          /abort|timeout|AbortError/i
        );
      } finally {
        await hang.close();
      }
    },
    MAX_ELAPSED_MS + 5_000
  );

  itLive(
    'happy: postBackupAlert delivers POST JSON to a real 200 webhook receiver',
    async () => {
      const sink = await startResponsiveWebhookServer();
      try {
        const { postBackupAlert } = await import('../../src/backup/alerting.ts');
        const payload = samplePayload();
        const result = await postBackupAlert(payload, sink.url);

        writeEvidence('happy-path.json', {
          result,
          captures: sink.posts,
          url: sink.url,
        });

        expect(result.ok).toBe(true);
        expect(result.status).toBe(200);
        expect(sink.posts.length, 'must_not_observe: zero captures').toBeGreaterThanOrEqual(1);
        const captured = sink.posts[0];
        if (!captured) throw new Error('responsive webhook did not capture the alert POST');
        expect(captured.method).toBe('POST');
        expect(captured.json).toBeTruthy();
        expect(captured.json?.job_name).toBe(payload.job_name);
      } finally {
        await sink.close();
      }
    },
    15_000
  );

  itLive('source: AbortController + signal + ~10s default timeout wired in postBackupAlert', () => {
    expect(existsSync(ALERTING_SRC), `missing ${ALERTING_SRC}`).toBe(true);
    const src = readFileSync(ALERTING_SRC, 'utf8');
    expect(src).toMatch(/AbortController/);
    expect(src).toMatch(/signal\s*:/);
    expect(src).toMatch(/10_000|10000/);
    // fetch call site must pass signal (not bare method/headers/body only).
    expect(src).toMatch(/fetch\s*\(\s*url\s*,\s*\{[\s\S]*?signal\s*:/);
    writeEvidence('source-abort-wiring.txt', {
      hasAbortController: /AbortController/.test(src),
      hasSignal: /signal\s*:/.test(src),
      hasTenSecond: /10_000|10000/.test(src),
    });
  });
});
