/**
 * REDHAT-FIX-S27-11 / F-11 — Redact webhook credentials from alerting errors and disk logs.
 *
 * AC-1: postBackupAlert non-2xx Error.message is host-only; SECRET_TOKEN_XYZ absent
 * AC-2: runBackupAlertSweep errors[] + result.webhookUrl host-only after failed delivery
 * AC-3: Negative control — suite fails if path token appears in error string
 * AC-4: Remote http rejected; loopback http + https accepted (scheme gate)
 * AC-5: Successful delivery still POSTs to full path (credentials work for fetch)
 *
 * Real boundaries only:
 * - PLATFORM_IT=1 required (itLive skips otherwise)
 * - real local http.Server receivers (never mock fetch / postBackupAlert)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const ALERTING_SRC = resolve(REPO_ROOT, 'services/platform/src/backup/alerting.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/redhat-fix-s27-11');

/** Path token that MUST NEVER appear in Error.message / errors[] / result.webhookUrl. */
const SECRET_TOKEN = 'SECRET_TOKEN_XYZ';
const DISCORD_SECRET = 'DISCORD_SECRET_TOKEN_ABC';
const REMOTE_HTTP_SECRET = 'SECRET_SHOULD_NOT_LEAK';

/** Slack-shaped path segments that must not leak into log surfaces. */
const SLACK_PATH_MARKER = '/services/';

const JOB_NAME = 's27-11-redact-job';
const OVERDUE_MS = 1_000;

type CapturedPost = {
  method: string;
  url: string;
  rawBody: string;
  json: Record<string, unknown> | null;
  statusWritten: number;
};

type AlertSweepResult = {
  alerted: number;
  posts: Array<{ job_name: string; reason: string }>;
  healthy: number;
  total: number;
  webhookUrl: string;
  overdueMs: number;
  errors: string[];
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertNoSecretLeak(surface: string, label: string): void {
  expect(surface, `${label} must not contain SECRET_TOKEN_XYZ`).not.toContain(SECRET_TOKEN);
  expect(surface, `${label} must not contain DISCORD_SECRET_TOKEN_ABC`).not.toContain(
    DISCORD_SECRET
  );
  expect(surface, `${label} must not contain SECRET_SHOULD_NOT_LEAK`).not.toContain(
    REMOTE_HTTP_SECRET
  );
  expect(surface, `${label} must not contain /services/ path`).not.toContain(SLACK_PATH_MARKER);
  expect(surface, `${label} must not contain /webhooks/ path`).not.toContain('/webhooks/');
  expect(surface, `${label} must not contain /api/webhooks path`).not.toContain('/api/webhooks');
}

function samplePayload() {
  return {
    job_name: JOB_NAME,
    job_id: JOB_NAME,
    reason: 'failed' as const,
    failure_reason: 'F-11 redaction probe — induced failure',
    last_success_at: null,
    overdue_by_minutes: 20,
    last_wal_segment: null,
    last_snapshot_id: null,
    trace_id: 'redhat-fix-s27-11',
    timestamp: new Date().toISOString(),
    status: 'failed',
  };
}

/**
 * Receiver that returns a fixed status and captures the request path.
 * Path is part of the public URL so secrets in the path are real.
 */
async function startStatusWebhookServer(statusCode: number): Promise<{
  baseUrl: string;
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
          parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? asRecord(parsed) : null;
      } catch {
        json = null;
      }
      posts.push({
        method: req.method ?? '',
        url: req.url ?? '',
        rawBody,
        json,
        statusWritten: statusCode,
      });
      if (statusCode >= 200 && statusCode < 300) {
        res.writeHead(statusCode, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(statusCode, { 'content-type': 'text/plain' });
      res.end('upstream-fail');
    });
  });

  const port = await new Promise<number>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('status webhook has no TCP address'));
        return;
      }
      resolveListen(addr.port);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    posts,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((e) => (e ? reject(e) : resolveClose()));
      }),
  };
}

async function seedFailedJob(): Promise<void> {
  const { upsertBackupHeartbeat, ensureBackupHeartbeatTable } = await import(
    '../../src/backup/heartbeat.ts'
  );
  const { createSql } = await import('../../src/db/client.ts');
  const sql = createSql();
  try {
    await ensureBackupHeartbeatTable(sql);
    await sql`
      UPDATE backup_heartbeat
      SET status = 'success', last_success_at = now(), updated_at = now()
    `;
    await upsertBackupHeartbeat(
      {
        jobName: JOB_NAME,
        status: 'failed',
        lastSuccessAt: new Date(Date.now() - 60 * 60 * 1000),
        traceId: 's27-11-redact',
      },
      sql
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedAllHealthy(): Promise<void> {
  const { runHealthyBackupJob } = await import('../../src/backup/alerting.ts');
  // Clear ALL heartbeats (incl. JOB_NAME) so sibling S27 suites are not left failed.
  await runHealthyBackupJob('all');
}

async function runSweep(webhookUrl: string): Promise<{
  result: AlertSweepResult | null;
  threw: boolean;
  throwMessage: string | null;
}> {
  const { runBackupAlertSweep, configureBackupAlerting } = await import(
    '../../src/backup/alerting.ts'
  );
  await configureBackupAlerting({ webhookUrl, overdueMs: OVERDUE_MS });
  try {
    const result = (await runBackupAlertSweep({
      webhookUrl,
      overdueMs: OVERDUE_MS,
    })) as AlertSweepResult;
    return { result, threw: false, throwMessage: null };
  } catch (err) {
    const throwMessage = err instanceof Error ? err.message : String(err);
    const withResult = err as { result?: AlertSweepResult };
    const result =
      withResult && typeof withResult === 'object' && withResult.result ? withResult.result : null;
    return { result, threw: true, throwMessage };
  }
}

describe.sequential('REDHAT-FIX-S27-11 — redact webhook credentials (F-11)', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for live webhook redaction IT').toBe(true);
    expect(existsSync(ALERTING_SRC), `alerting module missing: ${ALERTING_SRC}`).toBe(true);
  });

  beforeEach(async () => {
    try {
      await seedAllHealthy();
    } catch {
      /* DB may be optional for pure postBackupAlert cases */
    }
  });

  afterAll(async () => {
    try {
      await seedAllHealthy();
    } catch {
      /* ignore cleanup */
    }
  });

  itLive(
    'AC-1/AC-3: postBackupAlert non-2xx Error.message is host-only; secret token absent',
    async () => {
      const sink = await startStatusWebhookServer(500);
      // Loopback-legal URL with Slack-shaped path secret (F-12 + path-token oracle).
      const webhookUrl = `${sink.baseUrl}/services/T00000000/B00000000/${SECRET_TOKEN}`;
      try {
        const { postBackupAlert } = await import('../../src/backup/alerting.ts');
        const payload = samplePayload();
        let rejected: unknown;
        try {
          const result = await postBackupAlert(payload, webhookUrl);
          writeEvidence('ac1-unexpected-ok.json', { result, webhookUrl });
          expect.fail(`postBackupAlert must reject on HTTP 500, got ${JSON.stringify(result)}`);
        } catch (err) {
          rejected = err;
        }
        const message = rejected instanceof Error ? rejected.message : String(rejected);

        writeEvidence('ac1-error-message.json', {
          error_message: message,
          webhookUrl_full_for_oracle_only: webhookUrl,
          must_not_contain: [SECRET_TOKEN, SLACK_PATH_MARKER],
          must_contain_host: '127.0.0.1',
        });

        expect(message, 'error must mention HTTP status').toMatch(/HTTP\s+500|500/i);
        expect(message, 'error must include host-only url surface').toMatch(
          /url=https?:\/\/127\.0\.0\.1/i
        );
        assertNoSecretLeak(message, 'Error.message');
        // Host-only: no path after host (optional port allowed).
        expect(message, 'url= must not retain path after host').not.toMatch(
          /url=https?:\/\/[^/\s]+\/\S+/
        );
      } finally {
        await sink.close();
      }
    },
    30_000
  );

  itLive(
    'AC-2: runBackupAlertSweep errors[] + result.webhookUrl are host-only after failed delivery',
    async () => {
      const sink = await startStatusWebhookServer(500);
      const webhookUrl = `${sink.baseUrl}/services/T00000000/B00000000/${SECRET_TOKEN}`;
      try {
        await seedFailedJob();
        const { result, threw, throwMessage } = await runSweep(webhookUrl);

        const errors = result?.errors ?? [];
        const resultWebhook = result?.webhookUrl ?? '';
        const combined = [throwMessage ?? '', resultWebhook, ...errors].join('\n');

        writeEvidence('ac2-sweep-surfaces.json', {
          threw,
          throwMessage,
          errors,
          resultWebhookUrl: resultWebhook,
          alerted: result?.alerted,
        });

        expect(threw, 'sweep must fail-closed when delivery fails').toBe(true);
        expect(errors.length, 'errors[] must record the failed delivery').toBeGreaterThanOrEqual(1);
        expect(resultWebhook, 'result.webhookUrl must be populated (host-only)').toMatch(
          /https?:\/\/127\.0\.0\.1/
        );
        assertNoSecretLeak(combined, 'sweep error surfaces');
        for (const e of errors) {
          assertNoSecretLeak(e, 'errors[] entry');
          expect(e, 'errors[] entry must not retain path after host').not.toMatch(
            /url=https?:\/\/[^/\s]+\/\S+/
          );
        }
        assertNoSecretLeak(resultWebhook, 'result.webhookUrl');
        expect(resultWebhook, 'result.webhookUrl must not include path').not.toMatch(
          /https?:\/\/[^/\s]+\/\S+/
        );
      } finally {
        await sink.close();
      }
    },
    60_000
  );

  itLive(
    'AC-4: remote http rejected with host-only error; loopback http allowed',
    async () => {
      const { postBackupAlert, assertAlertWebhookUrlAllowed, redactWebhookUrlForLog } =
        await import('../../src/backup/alerting.ts');

      // Helper exports required for F-11 / F-12.
      expect(typeof redactWebhookUrlForLog).toBe('function');
      expect(typeof assertAlertWebhookUrlAllowed).toBe('function');

      // (a) https remote shape is allowed by scheme gate (no fetch required for allow check).
      expect(() =>
        assertAlertWebhookUrlAllowed(`https://hooks.example.invalid/alert/${SECRET_TOKEN}`)
      ).not.toThrow();

      // (b) remote http rejected; secret path must not leak.
      const remoteHttp = `http://evil.example/hooks/${REMOTE_HTTP_SECRET}`;
      let remoteErr: unknown;
      try {
        assertAlertWebhookUrlAllowed(remoteHttp);
        expect.fail('remote http must be rejected');
      } catch (err) {
        remoteErr = err;
      }
      const remoteMsg = remoteErr instanceof Error ? remoteErr.message : String(remoteErr);
      writeEvidence('ac4-remote-http-reject.json', { message: remoteMsg, remoteHttp });
      assertNoSecretLeak(remoteMsg, 'remote http reject Error.message');
      expect(remoteMsg).toMatch(/url=https?:\/\/evil\.example|evil\.example/i);

      // Also reject via postBackupAlert (before fetch).
      try {
        await postBackupAlert(samplePayload(), remoteHttp);
        expect.fail('postBackupAlert must reject remote http before fetch');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assertNoSecretLeak(msg, 'postBackupAlert remote http Error.message');
      }

      // (c)(d) loopback http allowed
      const loop = await startStatusWebhookServer(200);
      try {
        assertAlertWebhookUrlAllowed(`${loop.baseUrl}/hook`);
        assertAlertWebhookUrlAllowed(`http://localhost:${new URL(loop.baseUrl).port}/hook`);
        const ok = await postBackupAlert(samplePayload(), `${loop.baseUrl}/hook`);
        expect(ok.ok).toBe(true);
      } finally {
        await loop.close();
      }

      // redact helper: path/query/hash stripped
      const redacted = redactWebhookUrlForLog(
        `https://hooks.slack.com/services/T00000000/B00000000/${SECRET_TOKEN}?x=1#frag`
      );
      expect(redacted).toBe('https://hooks.slack.com');
      assertNoSecretLeak(redacted, 'redactWebhookUrlForLog output');

      writeEvidence('ac4-scheme-gate.json', {
        redacted,
        remoteMsg,
      });
    },
    30_000
  );

  itLive(
    'AC-5: successful delivery POSTs to full path (credentials still work for fetch)',
    async () => {
      const sink = await startStatusWebhookServer(200);
      const path = `/services/T00000000/B00000000/${SECRET_TOKEN}`;
      const webhookUrl = `${sink.baseUrl}${path}`;
      try {
        const { postBackupAlert } = await import('../../src/backup/alerting.ts');
        const result = await postBackupAlert(samplePayload(), webhookUrl);

        writeEvidence('ac5-happy-full-path.json', {
          result,
          capturedUrls: sink.posts.map((p) => p.url),
          method: sink.posts[0]?.method,
        });

        expect(result.ok).toBe(true);
        expect(result.status).toBe(200);
        expect(sink.posts.length).toBeGreaterThanOrEqual(1);
        expect(sink.posts[0]?.method).toBe('POST');
        // Receiver must see the full secret path — redaction is emission-only.
        expect(sink.posts[0]?.url).toBe(path);
      } finally {
        await sink.close();
      }
    },
    15_000
  );

  itLive('source: no raw url= + curly-url interpolation; redact helpers present', () => {
    const src = readFileSync(ALERTING_SRC, 'utf8');
    // Forbidden pattern is template literal: url=${url} (path token leak surface).
    const rawUrlInterp = /url=\$\{url\}/;
    expect(src, 'raw webhook URL must not be interpolated into error strings').not.toMatch(
      rawUrlInterp
    );
    expect(src).toMatch(/redactWebhookUrlForLog/);
    expect(src).toMatch(/assertAlertWebhookUrlAllowed/);
    writeEvidence('source-redaction-wiring.txt', {
      hasRedactHelper: /redactWebhookUrlForLog/.test(src),
      hasAssertHelper: /assertAlertWebhookUrlAllowed/.test(src),
      rawUrlInterpolation: rawUrlInterp.test(src),
    });
  });
});
