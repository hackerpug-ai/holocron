/**
 * Sprint 27 / D04-01 — RED integration oracle for CAP-BAK-01 backup failure alerting.
 *
 * Two-sided contract (T-PLAT-024 / UC-PLAT-06 AC-4):
 *   (1) induced backup-job failure MUST produce a real alert POST within the 15 min window
 *   (2) a healthy backup run MUST stay silent (ZERO alert POSTs) — anti-fake-healthy
 *
 * Three PRD silent-failure modes that must NEVER go silently healthy:
 *   (a) WAL archiving falls behind / job killed mid-archive
 *   (b) bucket credential expires / rotates invalid
 *   (c) backup config removed entirely → overdue alert still fires
 *
 * Real boundaries only:
 * - PLATFORM_IT=1 required (itLive skips otherwise)
 * - real local http.Server webhook receiver (never a fake sink)
 * - observes real alert artifacts (POST body) at the sink
 * - exercises the backup alerting surface that D04-05 lands
 *   (`services/platform/src/backup/alerting.ts` + `holo verify:backup` / alert sweep)
 *
 * GREENFIELD RED: no backup module / alerting exists yet → this suite FAILS.
 * D04-05 satisfies this suite by implementing real webhook delivery + overdue detection.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
 *
 * Optional (GREEN after D04-05 — short windows for CI):
 *   BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BACKUP_ALERTING_MODULE = resolve(REPO_ROOT, 'services/platform/src/backup/alerting.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/D04-01');

/** Production SLA: alert within 15 minutes. Tests may shorten via env for CI. */
const ALERT_WINDOW_MS = Number(process.env.BACKUP_ALERT_TEST_WINDOW_MS ?? 15 * 60 * 1000);
/** Overdue threshold the implementation must honor (D04-05). Default 15 min. */
const OVERDUE_MS = Number(process.env.BACKUP_ALERT_OVERDUE_MS ?? 15 * 60 * 1000);
/** Prefer contract port 9999; fall back to ephemeral if bound. */
const PREFERRED_WEBHOOK_PORT = Number(process.env.BACKUP_ALERT_TEST_PORT ?? 9999);

type AlertPost = {
  receivedAt: string;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  json: Record<string, unknown> | null;
};

type WebhookReceiver = {
  /** e.g. http://127.0.0.1:9999/alert */
  url: string;
  port: number;
  posts: AlertPost[];
  /** must_not_observe baseline — call before healthy / before each failure case */
  reset: () => void;
  close: () => Promise<void>;
};

type BackupAlertingModule = {
  /** Wire ALERT_WEBHOOK_URL / overdue threshold for the in-process sweep. */
  configureBackupAlerting?: (opts: {
    webhookUrl: string;
    overdueMs?: number;
  }) => void | Promise<void>;
  /** Run one alert sweep against backup_heartbeat (real DB query). */
  runBackupAlertSweep?: () =>
    | Promise<{ alerted: number } | undefined>
    | { alerted: number }
    | undefined;
  /**
   * Optional test harness helpers (D04-05 may export these or equivalent CLI).
   * When absent, the suite falls back to holo CLI + heartbeat SQL/CLI surface.
   */
  runHealthyBackupJob?: (
    jobId: string
  ) => Promise<{ status: string } | undefined> | { status: string };
  induceBackupFailure?: (
    mode: 'kill_wal_behind' | 'credential_expired' | 'config_removed',
    jobId: string,
    options?: { overdueMs?: number; synthetic?: boolean }
  ) =>
    | Promise<{
        job_name?: string;
        mode?: string;
        heartbeat?: { status?: string | null };
        induction?: {
          path?: string;
          real_process_killed?: boolean;
          pid_killed?: number | null;
          production_catch?: boolean;
          real_auth_fault?: boolean;
          config_removed?: boolean;
          config_exists_after?: boolean;
          config_path?: string | null;
          heartbeat_via_production_writer?: boolean;
          exit_code?: number | null;
        };
      }>
    | undefined
    | {
        job_name?: string;
        mode?: string;
        heartbeat?: { status?: string | null };
        induction?: Record<string, unknown>;
      };
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  }
  return null;
}

/**
 * Real local webhook sink — http.Server / createServer, live TCP delivery path.
 * Path /alert matches the CAP-BAK-01 contract receiver.
 */
async function startWebhookReceiver(preferredPort: number): Promise<WebhookReceiver> {
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
        // Readiness / contract probe: GET /alert → 200
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
    // Ephemeral fallback when 9999 is taken
    port = await listen(0);
  }

  const url = `http://127.0.0.1:${port}/alert`;
  // Prove the real sink answers before any backup/alert path touches it.
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

async function loadBackupAlerting(): Promise<BackupAlertingModule> {
  // GREENFIELD: this module does not exist until D04-05. Dynamic import fails → RED.
  expect(
    existsSync(BACKUP_ALERTING_MODULE),
    `backup alerting module missing (RED until D04-05): ${BACKUP_ALERTING_MODULE}`
  ).toBe(true);
  const mod = (await import('../../src/backup/alerting.ts')) as BackupAlertingModule;
  return mod;
}

function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: merged,
    timeout: 60_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

/**
 * Wait until the real sink receives a matching alert POST, or the window elapses.
 * Production bound is 15 minutes; CI may shorten BACKUP_ALERT_TEST_WINDOW_MS.
 */
async function waitForAlertPost(
  receiver: WebhookReceiver,
  match: (post: AlertPost) => boolean,
  windowMs: number
): Promise<AlertPost | null> {
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const hit = receiver.posts.find(match);
    if (hit) return hit;
    await sleep(Math.min(200, Math.max(50, windowMs / 50)));
  }
  return receiver.posts.find(match) ?? null;
}

function failureReasonOf(post: AlertPost): string {
  const body = post.json ?? {};
  return (
    stringField(body, [
      'failure_reason',
      'failureReason',
      'reason',
      'message',
      'detail',
      'error',
    ]) ??
    post.rawBody ??
    ''
  );
}

function jobIdOf(post: AlertPost): string | null {
  const body = post.json ?? {};
  return stringField(body, ['job_id', 'jobId', 'job_name', 'jobName', 'name']);
}

function hasStructuredAlertFields(post: AlertPost): boolean {
  const body = post.json ?? {};
  const job = jobIdOf(post);
  const reason = failureReasonOf(post);
  const ts = stringField(body, ['timestamp', 'ts', 'last_success_at', 'lastSuccessAt', 'at']);
  return Boolean(job && reason && ts);
}

function requireAlert(alert: AlertPost | null, message: string): AlertPost {
  expect(alert, message).toBeTruthy();
  if (!alert) throw new Error(message);
  return alert;
}

describe.sequential('Sprint 27 D04-01 RED — backup failure alerting two-sided oracle', () => {
  let receiver: WebhookReceiver | undefined;

  beforeAll(async () => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for live backup-alerting integration').toBe(true);
    receiver = await startWebhookReceiver(PREFERRED_WEBHOOK_PORT);
    writeEvidence('webhook-receiver.json', {
      url: receiver.url,
      port: receiver.port,
      note: 'real http.Server createServer sink — live TCP listener',
    });
  }, 30_000);

  afterAll(async () => {
    if (receiver) await receiver.close();
  });

  beforeEach(() => {
    receiver?.reset();
  });

  itLive('webhook receiver is a real http.Server sink on /alert (HTTP 200)', async () => {
    if (!receiver) throw new Error('receiver not started');
    const res = await fetch(receiver.url);
    expect(res.status).toBe(200);
    // must_not_observe: fake sink — we only count POSTs this process accepted.
    expect(receiver.posts, 'must_not_observe: no posts before any backup action').toHaveLength(0);
  });

  itLive(
    'healthy backup run stays silent — zero alert POSTs (must_not_observe / silence proof)',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      const alerting = await loadBackupAlerting();

      if (alerting.configureBackupAlerting) {
        await alerting.configureBackupAlerting({
          webhookUrl: receiver.url,
          overdueMs: OVERDUE_MS,
        });
      }

      const jobId = 'wal_archive-healthy';
      if (alerting.runHealthyBackupJob) {
        // Silence proof requires a clean slate: scoped 'all' refreshes every heartbeat
        // (not an unscoped weapon — explicit jobId='all'), then seeds the healthy job.
        await alerting.runHealthyBackupJob('all');
        const result = await alerting.runHealthyBackupJob(jobId);
        if (result && typeof result === 'object' && 'status' in result) {
          expect(String(result.status).toLowerCase()).toMatch(/success|ok|healthy/);
        }
      } else {
        // CLI surface D04-05 adds: verify:backup / backup:status after a healthy run
        const verify = runHolo(['verify:backup'], {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        });
        writeEvidence('healthy-verify-backup.json', verify);
        expect(
          verify.status,
          `holo verify:backup must exit 0 on healthy heartbeats; got ${verify.status}: ${verify.combined}`
        ).toBe(0);
      }

      if (alerting.runBackupAlertSweep) {
        await alerting.runBackupAlertSweep();
      } else {
        runHolo(['backup:alert-sweep'], {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        });
      }

      // Silence window — sample the sink; production SLA pairs with 15 min, CI may shorten.
      const silenceSampleMs = Math.min(
        ALERT_WINDOW_MS,
        Number(process.env.BACKUP_ALERT_SILENCE_SAMPLE_MS ?? 1_000)
      );
      await sleep(silenceSampleMs);

      writeEvidence('healthy-silence-posts.json', {
        postCount: receiver.posts.length,
        posts: receiver.posts,
        must_not_observe: 'any alert POST during a healthy backup run',
      });

      expect(
        receiver.posts.length,
        `silence proof failed: healthy run emitted ${receiver.posts.length} alert POST(s) — must be zero`
      ).toBe(0);
    },
    ALERT_WINDOW_MS + 60_000
  );

  itLive(
    'failure (a): kill / WAL-behind MUST alert within 15 min at the real sink',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      const alerting = await loadBackupAlerting();

      if (alerting.configureBackupAlerting) {
        await alerting.configureBackupAlerting({
          webhookUrl: receiver.url,
          overdueMs: OVERDUE_MS,
        });
      }

      const jobId = 'wal_archive';
      // Induce REAL kill / WAL-behind failure (production-truth — not DEAD sentinel poison).
      let killInduction: Record<string, unknown> | null = null;
      if (alerting.induceBackupFailure) {
        const induced = await alerting.induceBackupFailure('kill_wal_behind', jobId);
        if (induced && typeof induced === 'object') {
          killInduction = induced as Record<string, unknown>;
          writeEvidence('failure-a-induce.json', induced);
          const ind = asRecord(induced.induction);
          expect(
            ind.path === 'production_truth' ||
              ind.real_process_killed === true ||
              ind.production_catch === true ||
              ind.heartbeat_via_production_writer === true,
            `kill induction must be production-truth (got ${JSON.stringify(ind)})`
          ).toBe(true);
          expect(
            String(asRecord(induced.heartbeat).status ?? '').toLowerCase(),
            'heartbeat status must be failed via production path'
          ).toBe('failed');
        }
      } else {
        const induce = runHolo(
          ['backup:induce-failure', '--mode', 'kill', '--job', jobId, '--json'],
          {
            ALERT_WEBHOOK_URL: receiver.url,
            BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
          }
        );
        writeEvidence('failure-a-induce.json', induce);
        expect(induce.status, `must induce kill/WAL-behind failure; cli=${induce.combined}`).toBe(
          0
        );
        try {
          killInduction = JSON.parse(induce.stdout) as Record<string, unknown>;
        } catch {
          killInduction = null;
        }
      }
      writeEvidence('failure-a-induction-truth.json', {
        must_not_observe: 'DEAD sentinel as sole proof',
        induction: killInduction,
      });

      if (alerting.runBackupAlertSweep) {
        await alerting.runBackupAlertSweep();
      } else {
        runHolo(['backup:alert-sweep'], {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        });
      }

      const alert = await waitForAlertPost(
        receiver,
        (p) => {
          const reason = failureReasonOf(p).toLowerCase();
          return /kill|killed|wal\s*behind|wal-behind|archive/.test(reason);
        },
        ALERT_WINDOW_MS
      );

      writeEvidence('failure-a-wal-kill-alert.json', {
        found: Boolean(alert),
        postCount: receiver.posts.length,
        alert,
      });

      const got = requireAlert(
        alert,
        'failure (a) kill/WAL-behind must produce a webhook POST within the 15 min window'
      );
      expect(
        hasStructuredAlertFields(got),
        'alert payload needs job_id + failure_reason + timestamp'
      ).toBe(true);
      expect(failureReasonOf(got).toLowerCase()).toMatch(/kill|killed|wal/);
    },
    ALERT_WINDOW_MS + 60_000
  );

  itLive(
    'failure (b): credential expiry MUST alert within 15 min at the real sink',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      const alerting = await loadBackupAlerting();

      if (alerting.configureBackupAlerting) {
        await alerting.configureBackupAlerting({
          webhookUrl: receiver.url,
          overdueMs: OVERDUE_MS,
        });
      }

      const jobId = 'base_backup';
      if (alerting.induceBackupFailure) {
        const induced = await alerting.induceBackupFailure('credential_expired', jobId);
        if (induced && typeof induced === 'object') {
          writeEvidence('failure-b-induce.json', induced);
          const ind = asRecord(induced.induction);
          expect(
            ind.path === 'production_truth' ||
              ind.real_auth_fault === true ||
              ind.production_catch === true,
            `credential induction must be production-truth (got ${JSON.stringify(ind)})`
          ).toBe(true);
          expect(
            String(asRecord(induced.heartbeat).status ?? '').toLowerCase(),
            'heartbeat status must be failed via production catch'
          ).toBe('failed');
        }
      } else {
        const induce = runHolo(
          ['backup:induce-failure', '--mode', 'credential-expired', '--job', jobId, '--json'],
          {
            ALERT_WEBHOOK_URL: receiver.url,
            BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
          }
        );
        writeEvidence('failure-b-induce.json', induce);
        expect(induce.status, `must induce credential expiry failure; cli=${induce.combined}`).toBe(
          0
        );
      }

      if (alerting.runBackupAlertSweep) {
        await alerting.runBackupAlertSweep();
      } else {
        runHolo(['backup:alert-sweep'], {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        });
      }

      const alert = await waitForAlertPost(
        receiver,
        (p) => {
          const reason = failureReasonOf(p).toLowerCase();
          return /credential|expir|expired|auth|forbidden|access.?denied/.test(reason);
        },
        ALERT_WINDOW_MS
      );

      writeEvidence('failure-b-credential-alert.json', {
        found: Boolean(alert),
        postCount: receiver.posts.length,
        alert,
      });

      const got = requireAlert(
        alert,
        'failure (b) credential expiry must produce a webhook POST within the 15 min window'
      );
      expect(
        hasStructuredAlertFields(got),
        'alert payload needs job_id + failure_reason + timestamp'
      ).toBe(true);
      expect(failureReasonOf(got).toLowerCase()).toMatch(/credential|expir/);
    },
    ALERT_WINDOW_MS + 60_000
  );

  itLive(
    'failure (c): config-removed / overdue MUST alert (never silent-healthy)',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      const alerting = await loadBackupAlerting();

      if (alerting.configureBackupAlerting) {
        await alerting.configureBackupAlerting({
          webhookUrl: receiver.url,
          overdueMs: OVERDUE_MS,
        });
      }

      const jobId = 'restic_blob_mirror';
      if (alerting.induceBackupFailure) {
        const induced = await alerting.induceBackupFailure('config_removed', jobId);
        if (induced && typeof induced === 'object') {
          writeEvidence('failure-c-induce.json', induced);
          const ind = asRecord(induced.induction);
          expect(
            ind.path === 'production_truth' || ind.config_removed === true,
            `config_removed induction must be production-truth (got ${JSON.stringify(ind)})`
          ).toBe(true);
          expect(
            ind.config_exists_after === false || ind.config_removed === true,
            'real config path must be missing after induction'
          ).toBe(true);
        }
      } else {
        const induce = runHolo(
          ['backup:induce-failure', '--mode', 'config-removed', '--job', jobId, '--json'],
          {
            ALERT_WEBHOOK_URL: receiver.url,
            BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
          }
        );
        writeEvidence('failure-c-induce.json', induce);
        expect(
          induce.status,
          `must induce config-removed / overdue failure; cli=${induce.combined}`
        ).toBe(0);
      }

      if (alerting.runBackupAlertSweep) {
        await alerting.runBackupAlertSweep();
      } else {
        runHolo(['backup:alert-sweep'], {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        });
      }

      const alert = await waitForAlertPost(
        receiver,
        (p) => {
          const reason = failureReasonOf(p).toLowerCase();
          return /overdue|config\s*missing|config.?removed|missing config|no config/.test(reason);
        },
        ALERT_WINDOW_MS
      );

      writeEvidence('failure-c-config-overdue-alert.json', {
        found: Boolean(alert),
        postCount: receiver.posts.length,
        alert,
      });

      const got = requireAlert(
        alert,
        'failure (c) config-removed must produce an overdue/config-missing webhook POST'
      );
      expect(
        hasStructuredAlertFields(got),
        'alert payload needs job_id + failure_reason + timestamp'
      ).toBe(true);
      expect(failureReasonOf(got).toLowerCase()).toMatch(/overdue|config/);
    },
    ALERT_WINDOW_MS + 60_000
  );

  itLive(
    'two-sided oracle summary: failure alerts + healthy silence (anti-fake-healthy)',
    async () => {
      if (!receiver) throw new Error('receiver not started');

      // Re-assert module surface that D04-05 must provide.
      expect(
        existsSync(BACKUP_ALERTING_MODULE),
        `RED: ${BACKUP_ALERTING_MODULE} must exist after D04-05`
      ).toBe(true);

      const alerting = await loadBackupAlerting();
      expect(
        typeof alerting.runBackupAlertSweep === 'function' ||
          typeof alerting.configureBackupAlerting === 'function',
        'alerting module must export runBackupAlertSweep and/or configureBackupAlerting'
      ).toBe(true);

      // Final must_not_observe checklist artifact for harvest.
      writeEvidence('AC-1-oracle-contract.json', {
        must_observe: [
          'real webhook receiver createServer on /alert',
          'healthy backup run: zero alert POSTs (silence)',
          'failure kill/WAL-behind → POST with killed|WAL behind',
          'failure credential expiry → POST with credential|expired',
          'failure config-removed → POST with overdue|config missing',
          'payload fields: job_id, failure_reason, timestamp',
        ],
        must_not_observe: [
          'any alert POST during healthy run',
          'fake (non-http.Server) alert sink',
          'alert path hardcoded exit 0 with no real POST',
          'silent failure on modes a/b/c',
        ],
        alert_window_ms: ALERT_WINDOW_MS,
        overdue_ms: OVERDUE_MS,
        webhook_url: receiver.url,
      });
    }
  );
});
