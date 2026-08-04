/**
 * REDHAT-FIX-S27-15 / F-17 — Continue alerting remaining failed jobs after one webhook failure.
 *
 * AC-1: job_a 500 does not abort the loop; job_b still POSTs; errors records job_a
 * AC-2: fail-closed after loop when any errors (throw or non-empty errors)
 * AC-3: two bad jobs + 200 webhook → alerted=2, errors=0
 * AC-4: healthy silence → zero POSTs
 *
 * Real boundaries only:
 * - PLATFORM_IT=1 required (itLive skips otherwise)
 * - real Postgres heartbeats + real local http.Server (never mock postBackupAlert/fetch)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const ALERTING_SRC = resolve(REPO_ROOT, 'services/platform/src/backup/alerting.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/redhat-fix-s27-15');

const JOB_A = 's27-15-job-a';
const JOB_B = 's27-15-job-b';
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

/**
 * Selective webhook: 500 when body.job_name === failJobName, else 200.
 * Always-200 when failJobName is null.
 */
async function startSelectiveWebhookServer(failJobName: string | null): Promise<{
  url: string;
  posts: CapturedPost[];
  close: () => Promise<void>;
  reset: () => void;
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

      const jobName =
        json && typeof json.job_name === 'string'
          ? json.job_name
          : json && typeof json.job_id === 'string'
            ? json.job_id
            : '';

      const fail = failJobName !== null && jobName === failJobName;
      const statusWritten = fail ? 500 : 200;
      posts.push({
        method: req.method ?? '',
        url: req.url ?? '',
        rawBody,
        json,
        statusWritten,
      });

      if (fail) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(`induced failure for ${jobName}`);
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, job: jobName }));
    });
  });

  const port = await new Promise<number>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('selective webhook has no TCP address'));
        return;
      }
      resolveListen(addr.port);
    });
  });

  return {
    url: `http://127.0.0.1:${port}/alert`,
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

async function seedTwoFailedJobs(): Promise<void> {
  const { upsertBackupHeartbeat, ensureBackupHeartbeatTable } = await import(
    '../../src/backup/heartbeat.ts'
  );
  const { createSql } = await import('../../src/db/client.ts');
  const sql = createSql();
  try {
    await ensureBackupHeartbeatTable(sql);
    // Silence unrelated jobs so only our pair is bad for this sweep.
    await sql`
      UPDATE backup_heartbeat
      SET status = 'success', last_success_at = now(), updated_at = now()
    `;
    await upsertBackupHeartbeat(
      {
        jobName: JOB_A,
        status: 'failed',
        lastSuccessAt: new Date(Date.now() - 60 * 60 * 1000),
        traceId: 's27-15-job-a',
      },
      sql
    );
    await upsertBackupHeartbeat(
      {
        jobName: JOB_B,
        status: 'failed',
        lastSuccessAt: new Date(Date.now() - 60 * 60 * 1000),
        traceId: 's27-15-job-b',
      },
      sql
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedAllHealthy(): Promise<void> {
  const { runHealthyBackupJob } = await import('../../src/backup/alerting.ts');
  const { ensureBackupHeartbeatTable } = await import('../../src/backup/heartbeat.ts');
  const { createSql } = await import('../../src/db/client.ts');
  const sql = createSql();
  try {
    await ensureBackupHeartbeatTable(sql);
    await sql`
      UPDATE backup_heartbeat
      SET status = 'success', last_success_at = now(), updated_at = now()
    `;
    await runHealthyBackupJob('s27-15-healthy');
    await sql`
      UPDATE backup_heartbeat
      SET status = 'success', last_success_at = now(), updated_at = now()
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Run sweep; on partial-failure throw, recover attached result when present.
 */
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

function jobNamesFromPosts(posts: CapturedPost[]): string[] {
  return posts
    .map((p) => {
      const j = p.json;
      if (!j) return null;
      if (typeof j.job_name === 'string') return j.job_name;
      if (typeof j.job_id === 'string') return j.job_id;
      return null;
    })
    .filter((x): x is string => Boolean(x));
}

describe.sequential('REDHAT-FIX-S27-15 — continue alert sweep after single webhook failure (F-17)', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for live backup-alerting continue IT').toBe(true);
    expect(existsSync(ALERTING_SRC), `alerting module missing: ${ALERTING_SRC}`).toBe(true);
  });

  beforeEach(async () => {
    // Isolation: mark everything healthy before each case seeds its own state.
    await seedAllHealthy();
  });

  afterAll(async () => {
    // Best-effort restore healthy so other suites are not left with induced failed rows.
    try {
      await seedAllHealthy();
    } catch {
      /* ignore cleanup errors */
    }
  });

  itLive(
    'continue: job_b POSTs when job_a webhook returns 500 in the same sweep',
    async () => {
      const sink = await startSelectiveWebhookServer(JOB_A);
      try {
        await seedTwoFailedJobs();
        const { result, threw, throwMessage } = await runSweep(sink.url);

        const capturedJobs = jobNamesFromPosts(sink.posts);
        const postsFromResult = result?.posts.map((p) => p.job_name) ?? [];
        const errors = result?.errors ?? [];

        writeEvidence('continue-partial-webhook.json', {
          threw,
          throwMessage,
          result,
          capturedJobs,
          httpPosts: sink.posts,
          must_observe: ['posts includes job_b', 'errors mentions job_a', 'alerted >= 1'],
        });

        // HTTP capture is the ground truth (never mock postBackupAlert).
        expect(
          capturedJobs,
          'must_not_observe: loop aborted before job_b — job_b must be POSTed'
        ).toContain(JOB_B);
        expect(
          sink.posts.filter((p) => jobNamesFromPosts([p]).includes(JOB_B)).length,
          'HTTP capture count for job_b >= 1'
        ).toBeGreaterThanOrEqual(1);

        // posts[] retains successful deliveries after a prior failure
        expect(
          postsFromResult,
          'result.posts must include job_b after job_a webhook failure'
        ).toContain(JOB_B);

        // errors[] records the failed job
        expect(errors.length, 'errors.length >= 1 after job_a 500').toBeGreaterThanOrEqual(1);
        expect(
          errors.some((e) => e.includes(JOB_A)),
          `errors must mention ${JOB_A}; got ${JSON.stringify(errors)}`
        ).toBe(true);

        expect(result?.alerted ?? 0, 'alerted >= 1 (job_b succeeded)').toBeGreaterThanOrEqual(1);

        // must_not_observe: silent full success claiming both jobs alerted when job_a failed
        expect(result?.alerted === 2 && errors.length === 0).toBe(false);
      } finally {
        await sink.close();
      }
    },
    60_000
  );

  itLive(
    'fail-closed: sweep surfaces failure after the loop when errors.length > 0',
    async () => {
      const sink = await startSelectiveWebhookServer(JOB_A);
      try {
        await seedTwoFailedJobs();
        const { result, threw, throwMessage } = await runSweep(sink.url);

        writeEvidence('fail-closed-after-loop.json', {
          threw,
          throwMessage,
          errors: result?.errors ?? [],
          alerted: result?.alerted,
          posts: result?.posts,
        });

        const errors = result?.errors ?? [];
        expect(errors.length, 'errors.length > 0 after partial webhook failure').toBeGreaterThan(0);

        // Throw after loop OR explicit failed status for callers (errors non-empty).
        const failClosed = threw || errors.length > 0;
        expect(failClosed, 'must surface failure (throw after loop or non-empty errors)').toBe(
          true
        );

        // Prefer post-loop throw so callers that only catch cannot treat partial as success.
        // If implementation returns with errors instead of throwing, errors.length>0 still counts.
        expect(
          threw || (result !== null && result.errors.length > 0),
          `must_not_observe: clean success with empty errors; threw=${threw} errors=${JSON.stringify(errors)} msg=${throwMessage}`
        ).toBe(true);
      } finally {
        await sink.close();
      }
    },
    60_000
  );

  itLive(
    'all-success: two bad jobs with 200 webhook yield alerted 2 and errors 0',
    async () => {
      const sink = await startSelectiveWebhookServer(null);
      try {
        await seedTwoFailedJobs();
        const { result, threw, throwMessage } = await runSweep(sink.url);

        writeEvidence('all-success-two-jobs.json', {
          threw,
          throwMessage,
          result,
          captured: jobNamesFromPosts(sink.posts),
          httpCount: sink.posts.length,
        });

        expect(threw, `all-success path must not throw; msg=${throwMessage}`).toBe(false);
        expect(result, 'result must be returned on full success').toBeTruthy();
        expect(result?.errors ?? ['x']).toHaveLength(0);
        expect(result?.alerted).toBe(2);
        expect(result?.posts).toHaveLength(2);
        expect(result?.posts.map((p) => p.job_name).sort()).toEqual([JOB_A, JOB_B].sort());
        expect(sink.posts.length, 'receiver captures === 2').toBe(2);
        expect(jobNamesFromPosts(sink.posts).sort()).toEqual([JOB_A, JOB_B].sort());
      } finally {
        await sink.close();
      }
    },
    60_000
  );

  itLive(
    'silence: healthy heartbeats produce zero webhook posts',
    async () => {
      const sink = await startSelectiveWebhookServer(null);
      try {
        await seedAllHealthy();
        const { result, threw, throwMessage } = await runSweep(sink.url);

        writeEvidence('healthy-silence.json', {
          threw,
          throwMessage,
          result,
          httpCount: sink.posts.length,
        });

        expect(threw, `silence path must not throw; msg=${throwMessage}`).toBe(false);
        expect(result?.alerted).toBe(0);
        expect(result?.posts).toHaveLength(0);
        expect(result?.errors ?? ['x']).toHaveLength(0);
        expect(sink.posts.length, 'must_not_observe: any webhook POST on healthy').toBe(0);
      } finally {
        await sink.close();
      }
    },
    60_000
  );
});
