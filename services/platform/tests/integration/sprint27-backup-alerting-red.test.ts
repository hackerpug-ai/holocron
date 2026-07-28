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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  type AlertPost,
  assertCapturesHaveHttpEnvelope,
  hasHttpEnvelope,
  startWebhookReceiver,
  type WebhookReceiver,
} from './helpers/backup-webhook-receiver';

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

/**
 * Durable independent HTTP captures (REDHAT-FIX-S27-07).
 * Accumulates across cases — never reset with receiver.reset() — so gate dual-write
 * can promote a top-level AlertPost[] that cannot be satisfied by serializing sweep.posts[].
 */
const durableHttpCaptures: AlertPost[] = [];

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

/** Dual-write durable HTTP envelope captures for gate promotion (F-7). */
function recordDurableHttpCapture(alert: AlertPost): void {
  expect(hasHttpEnvelope(alert), 'durable capture must include HTTP envelope fields').toBe(true);
  durableHttpCaptures.push(alert);
  writeEvidence('alerts-http-captures.json', durableHttpCaptures);
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
  // REDHAT-FIX-S27-19: RED suite isolation/silence needs unscoped healthy --all when DB has
  // non-allowlist canaries. Production CLI default remains scoped without this env.
  if (args.includes('backup:healthy') && args.includes('--all')) {
    merged.BACKUP_HEALTHY_ALL_BREAK_GLASS = merged.BACKUP_HEALTHY_ALL_BREAK_GLASS ?? '1';
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
        // Silence proof requires a clean slate. REDHAT-FIX-S27-19: default --all is scoped;
        // break-glass enables unscoped refresh so leftover canaries cannot poison silence.
        await alerting.runHealthyBackupJob('all', {
          env: { ...process.env, BACKUP_HEALTHY_ALL_BREAK_GLASS: '1' },
        });
        // Defense-in-depth: remove known S27-19 canary if another suite left it failed.
        try {
          const { createSql } = await import('../../src/db/client');
          const sql = createSql();
          try {
            await sql`DELETE FROM backup_heartbeat WHERE job_name = ${'prod-canary-overdue'} OR job_name LIKE ${'s27-19-%'}`;
          } finally {
            await sql.end({ timeout: 5 });
          }
        } catch {
          /* best-effort */
        }
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
      // F-7: independent HTTP envelope (method/url/headers/rawBody/receivedAt) — not posts[] dump
      expect(got.method).toMatch(/^(POST|PUT)$/);
      expect(got.url).toMatch(/\/alert/);
      expect(got.headers).toBeTruthy();
      expect(got.rawBody.length).toBeGreaterThan(0);
      expect(got.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      recordDurableHttpCapture(got);
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
      expect(got.method).toMatch(/^(POST|PUT)$/);
      expect(got.url).toMatch(/\/alert/);
      expect(got.rawBody.length).toBeGreaterThan(0);
      recordDurableHttpCapture(got);
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
      expect(got.method).toMatch(/^(POST|PUT)$/);
      expect(got.url).toMatch(/\/alert/);
      expect(got.rawBody.length).toBeGreaterThan(0);
      recordDurableHttpCapture(got);
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
      // F-7: durable captures must pass envelope oracle (not payload-only alerts-received.json).
      if (durableHttpCaptures.length > 0) {
        assertCapturesHaveHttpEnvelope(durableHttpCaptures);
        writeEvidence('alerts-http-captures.json', durableHttpCaptures);
      }
      writeEvidence('AC-1-oracle-contract.json', {
        must_observe: [
          'real webhook receiver createServer on /alert',
          'healthy backup run: zero alert POSTs (silence)',
          'failure kill/WAL-behind → POST with killed|WAL behind',
          'failure credential expiry → POST with credential|expired',
          'failure config-removed → POST with overdue|config missing',
          'payload fields: job_id, failure_reason, timestamp',
          'HTTP envelope: method+url+headers+rawBody+receivedAt on durable captures',
        ],
        must_not_observe: [
          'any alert POST during healthy run',
          'fake (non-http.Server) alert sink',
          'alert path hardcoded exit 0 with no real POST',
          'silent failure on modes a/b/c',
          'gate pass with payload-only posts[] dump (alerts-received.json theatre)',
          'stub postBackupAlert without fetch still producing captures (mutation M1)',
        ],
        negative_control:
          'stub postBackupAlert without fetch → receiver.posts.length === 0 while sweep may still report alerted>0; oracle prefers receiver HTTP captures over sweep.posts[]',
        mutation_m1:
          'If postBackupAlert returns {ok:true,status:200,body:ok} without fetch, durableHttpCaptures stays empty and gate envelope jq fails',
        alert_window_ms: ALERT_WINDOW_MS,
        overdue_ms: OVERDUE_MS,
        webhook_url: receiver.url,
        durable_http_capture_count: durableHttpCaptures.length,
      });
    }
  );

  itLive(
    'F-7 / M1 negative control: oracle prefers independent receiver over sweep.posts[] (stub postBackupAlert without fetch)',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      // Documented mutation M1: if postBackupAlert is stubbed to return ok without fetch,
      // client-side posts[] can still grow while the independent http.Server sees zero POSTs.
      // This suite MUST treat receiver.posts as ground truth — never serialize sweep.posts
      // alone into gate evidence as "HTTP proof".
      receiver.reset();
      const before = receiver.posts.length;
      expect(before, 'receiver must start empty after reset').toBe(0);

      // Simulate the self-reported posts[] theatre that pre-fix alerts-received.json used:
      // a client-side payload array with BackupAlertPayload fields only (no HTTP envelope).
      const fabricatedPostsOnly = [
        {
          job_name: 'wal_archive',
          job_id: 'wal_archive',
          reason: 'failed',
          failure_reason: 'killed / WAL behind — fabricated without fetch',
          last_success_at: new Date().toISOString(),
          overdue_by_minutes: 1,
          last_wal_segment: null,
          last_snapshot_id: null,
          trace_id: 'm1-stub-without-fetch',
          timestamp: new Date().toISOString(),
          status: 'failed',
        },
      ];
      writeEvidence('m1-fabricated-posts-only.json', fabricatedPostsOnly);
      // Envelope oracle MUST reject payload-only dumps (pre-fix alerts-received.json shape).
      expect(() => assertCapturesHaveHttpEnvelope(fabricatedPostsOnly)).toThrow(
        /envelope|HTTP capture/i
      );
      // Independent receiver still empty — proves captures were not forged server-side.
      expect(
        receiver.posts.length,
        'negative_control: stub postBackupAlert without fetch yields zero receiver captures'
      ).toBe(0);
      writeEvidence('m1-negative-control.json', {
        negative_control: 'stub postBackupAlert without fetch',
        mutation: 'M1',
        fabricated_posts_count: fabricatedPostsOnly.length,
        receiver_posts_length: receiver.posts.length,
        envelope_oracle_rejects_payload_only: true,
        note: 'Gate must fail when only fabricated posts[] exist; durable alerts-http-captures.json requires server-side envelope',
      });
    }
  );

  // ---------------------------------------------------------------------------
  // REDHAT-FIX-S27-04 — isolation: reset between modes + negative-control silence
  // ---------------------------------------------------------------------------

  itLive(
    'isolation: backup:healthy --all clears sticky induce → alerted:0 (AC-1)',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      const alerting = await loadBackupAlerting();
      if (alerting.configureBackupAlerting) {
        await alerting.configureBackupAlerting({
          webhookUrl: receiver.url,
          overdueMs: OVERDUE_MS,
        });
      }

      // Seed sticky durable induce state (synthetic poison is enough to prove reset
      // empties disk store + heartbeats; production-truth induction is owned by S27-01).
      const induce = runHolo(
        [
          'backup:induce-failure',
          '--mode',
          'kill',
          '--job',
          'wal_archive',
          '--synthetic',
          '--json',
        ],
        {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        }
      );
      writeEvidence('s27-04-sticky-induce.json', induce);
      expect(induce.status, `seed induce must exit 0: ${induce.combined}`).toBe(0);

      // Reset via CLI-visible backup:healthy --all (not test-only Map clear).
      const healthy = runHolo(['backup:healthy', '--all', '--json'], {
        ALERT_WEBHOOK_URL: receiver.url,
        BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
      });
      writeEvidence('s27-04-healthy-all.json', healthy);
      expect(healthy.status, `backup:healthy --all must exit 0: ${healthy.combined}`).toBe(0);

      // Induced store must be empty / missing after reset.
      const inducedPath = resolve(REPO_ROOT, '.tmp/backup-alert-induced.json');
      let inducedEmpty = !existsSync(inducedPath);
      if (!inducedEmpty) {
        try {
          const raw = JSON.parse(readFileSync(inducedPath, 'utf8')) as unknown;
          inducedEmpty =
            raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0;
        } catch {
          inducedEmpty = false;
        }
      }
      writeEvidence('s27-04-induced-store-after-reset.json', {
        path: inducedPath,
        empty: inducedEmpty,
      });
      expect(inducedEmpty, 'induced store must be empty after backup:healthy --all').toBe(true);

      receiver.reset();
      const sweep = runHolo(['backup:alert-sweep'], {
        ALERT_WEBHOOK_URL: receiver.url,
        BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
      });
      writeEvidence('s27-04-sweep-after-reset.txt', sweep.combined);
      expect(sweep.status, `alert-sweep after reset must exit 0: ${sweep.combined}`).toBe(0);
      expect(sweep.stdout, 'must_observe alerted: 0 after healthy reset').toMatch(/alerted:\s+0/);
      expect(
        receiver.posts.length,
        'must_not_observe: webhook posts after reset without new induce'
      ).toBe(0);
    },
    ALERT_WINDOW_MS + 60_000
  );

  itLive(
    'isolation: without reset, kill then credential contaminates (AC-5 negative control)',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      const alerting = await loadBackupAlerting();
      if (alerting.configureBackupAlerting) {
        await alerting.configureBackupAlerting({
          webhookUrl: receiver.url,
          overdueMs: OVERDUE_MS,
        });
      }

      // Clean start then deliberately skip reset between modes.
      if (alerting.runHealthyBackupJob) {
        await alerting.runHealthyBackupJob('all');
      } else {
        runHolo(['backup:healthy', '--all']);
      }

      // Mode 1: kill wal_archive (prefer module path; CLI as fallback).
      if (alerting.induceBackupFailure) {
        await alerting.induceBackupFailure('kill_wal_behind', 'wal_archive', {
          synthetic: true,
        });
      } else {
        runHolo(
          [
            'backup:induce-failure',
            '--mode',
            'kill',
            '--job',
            'wal_archive',
            '--synthetic',
            '--json',
          ],
          { BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS) }
        );
      }

      // Mode 2 WITHOUT reset: credential base_backup — sticky kill residue must remain.
      if (alerting.induceBackupFailure) {
        await alerting.induceBackupFailure('credential_expired', 'base_backup', {
          synthetic: true,
        });
      } else {
        runHolo(
          [
            'backup:induce-failure',
            '--mode',
            'credential-expired',
            '--job',
            'base_backup',
            '--synthetic',
            '--json',
          ],
          { BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS) }
        );
      }

      receiver.reset();
      if (alerting.runBackupAlertSweep) {
        await alerting.runBackupAlertSweep();
      } else {
        runHolo(['backup:alert-sweep'], {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        });
      }

      const jobs = new Set(
        receiver.posts.map((p) => jobIdOf(p)).filter((j): j is string => Boolean(j))
      );
      writeEvidence('s27-04-contamination-without-reset.json', {
        postCount: receiver.posts.length,
        jobs: [...jobs],
        posts: receiver.posts.map((p) => ({
          job: jobIdOf(p),
          reason: failureReasonOf(p),
        })),
        contamination_signature: 'posts for both wal_archive (kill) and base_backup (credential)',
      });

      // Contamination: sticky kill residue still posts alongside credential.
      expect(
        jobs.has('wal_archive'),
        'without reset, prior kill job wal_archive must still post (contamination signature)'
      ).toBe(true);
      expect(
        jobs.has('base_backup'),
        'without reset, credential job base_backup must also post'
      ).toBe(true);
      expect(
        receiver.posts.length,
        'contamination: alerted count must be >1 when reset is skipped between modes'
      ).toBeGreaterThan(1);
    },
    ALERT_WINDOW_MS + 60_000
  );

  itLive(
    'isolation: with reset between modes, only the induced job posts (AC-3/AC-4/AC-5)',
    async () => {
      if (!receiver) throw new Error('receiver not started');
      const alerting = await loadBackupAlerting();
      if (alerting.configureBackupAlerting) {
        await alerting.configureBackupAlerting({
          webhookUrl: receiver.url,
          overdueMs: OVERDUE_MS,
        });
      }

      const modeRuns: Array<{
        mode: string;
        job: string;
        keyword: RegExp;
        posts: Array<{ job: string | null; reason: string }>;
      }> = [];

      const sequence: Array<{
        mode: 'kill_wal_behind' | 'credential_expired' | 'config_removed';
        job: string;
        keyword: RegExp;
        cliMode: string;
      }> = [
        {
          mode: 'kill_wal_behind',
          job: 'wal_archive',
          keyword: /kill|killed|wal/i,
          cliMode: 'kill',
        },
        {
          mode: 'credential_expired',
          job: 'base_backup',
          keyword: /credential|expir|auth/i,
          cliMode: 'credential-expired',
        },
        {
          mode: 'config_removed',
          job: 'restic_blob_mirror',
          keyword: /config|overdue|removed/i,
          cliMode: 'config-removed',
        },
      ];

      for (const step of sequence) {
        // Explicit CLI reset between every mode (gate honesty).
        const reset = runHolo(['backup:healthy', '--all'], {
          ALERT_WEBHOOK_URL: receiver.url,
          BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
        });
        expect(reset.status, `reset before ${step.mode} must exit 0: ${reset.combined}`).toBe(0);

        // Negative-control: keep a healthy job that must never post.
        if (alerting.runHealthyBackupJob) {
          await alerting.runHealthyBackupJob('all-clear');
        }

        if (alerting.induceBackupFailure) {
          await alerting.induceBackupFailure(step.mode, step.job, { synthetic: true });
        } else {
          runHolo(
            [
              'backup:induce-failure',
              '--mode',
              step.cliMode,
              '--job',
              step.job,
              '--synthetic',
              '--json',
            ],
            { BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS) }
          );
        }

        receiver.reset();
        if (alerting.runBackupAlertSweep) {
          await alerting.runBackupAlertSweep();
        } else {
          runHolo(['backup:alert-sweep'], {
            ALERT_WEBHOOK_URL: receiver.url,
            BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
          });
        }

        const posts = receiver.posts.map((p) => ({
          job: jobIdOf(p),
          reason: failureReasonOf(p),
        }));
        modeRuns.push({ mode: step.mode, job: step.job, keyword: step.keyword, posts });

        const jobs = new Set(posts.map((p) => p.job).filter((j): j is string => Boolean(j)));
        expect(
          jobs.has(step.job),
          `must_observe post for induced job ${step.job} (mode=${step.mode}); jobs=${[...jobs]}`
        ).toBe(true);
        expect(
          jobs.has('all-clear'),
          'must_not_observe: negative-control all-clear must stay silent'
        ).toBe(false);
        // Only the intentionally induced job should post on a clean slate.
        expect(
          [...jobs].filter((j) => j !== step.job),
          `must_not_observe posts for non-induced jobs after reset+${step.mode}; jobs=${[...jobs]}`
        ).toEqual([]);
        const reasonHit = posts.some((p) => p.job === step.job && step.keyword.test(p.reason));
        expect(
          reasonHit,
          `post[${step.job}] failure_reason must match mode keywords ${step.keyword}`
        ).toBe(true);
      }

      // Three mode post sets must not be byte-identical (mode-specific isolation).
      const serialized = modeRuns.map((r) => JSON.stringify(r.posts));
      writeEvidence('s27-04-mode-isolation-sequence.json', {
        modeRuns: modeRuns.map((r) => ({
          mode: r.mode,
          job: r.job,
          posts: r.posts,
        })),
        serialized_equal_12: serialized[0] === serialized[1],
        serialized_equal_23: serialized[1] === serialized[2],
        serialized_equal_13: serialized[0] === serialized[2],
      });
      expect(
        serialized[0] === serialized[1] &&
          serialized[1] === serialized[2] &&
          serialized[0] === serialized[2],
        'must_not_observe: byte-identical step logs across kill/credential/config'
      ).toBe(false);
    },
    ALERT_WINDOW_MS + 120_000
  );

  // ---------------------------------------------------------------------------
  // REDHAT-FIX-S27-08 / F-8 — production 15-minute SLA (DEFAULT_OVERDUE_MS)
  // Never prove SLA under BACKUP_ALERT_OVERDUE_MS=500/1000 toy thresholds.
  // ---------------------------------------------------------------------------

  itLive(
    'SLA / 15 min / fifteen: production DEFAULT_OVERDUE_MS with BACKUP_ALERT_OVERDUE_MS unset',
    async () => {
      if (!receiver) throw new Error('receiver not started');

      // Import production constant so the oracle cannot drift from code.
      const alerting = await import('../../src/backup/alerting.ts');
      const { DEFAULT_OVERDUE_MS, ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS } = alerting;
      expect(DEFAULT_OVERDUE_MS, 'DEFAULT_OVERDUE_MS must be 15 minutes').toBe(15 * 60 * 1000);
      expect(
        ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS,
        'alert-sweep cadence must be ≤5 min (300s)'
      ).toBeLessThanOrEqual(300);

      // Force production default on this path even if the suite parent set a CI toy threshold.
      const savedOverdueEnv = process.env.BACKUP_ALERT_OVERDUE_MS;
      delete process.env.BACKUP_ALERT_OVERDUE_MS;

      const slaEvidenceDir = resolve(REPO_ROOT, '.tmp/redhat-fix-s27-08');
      mkdirSync(slaEvidenceDir, { recursive: true });
      const writeSla = (name: string, body: unknown): string => {
        const path = resolve(slaEvidenceDir, name);
        const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
        writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
        return path;
      };

      // CLI env: BACKUP_ALERT_OVERDUE_MS deliberately undefined (deleted) — proves AC-1 without gaming.
      const slaEnv: Record<string, string | undefined> = {
        ALERT_WEBHOOK_URL: receiver.url,
        BACKUP_ALERT_OVERDUE_MS: undefined,
      };

      try {
        // Isolation (S27-04): clean slate so SLA seed is not contaminated.
        if (alerting.runHealthyBackupJob) {
          await alerting.runHealthyBackupJob('all');
        } else {
          const reset = runHolo(['backup:healthy', '--all', '--json'], slaEnv);
          expect(reset.status, `SLA reset must exit 0: ${reset.combined}`).toBe(0);
        }
        writeSla('sla-healthy-reset.json', { ok: true, scope: 'all' });

        // AC-1 PRIMARY: CLI subprocess with env unset must report overdueMs == DEFAULT_OVERDUE_MS.
        // Healthy slate → no webhook POST required (avoids spawnSync/receiver deadlock).
        const cliDefault = runHolo(['backup:alert-sweep', '--json'], slaEnv);
        writeSla('alert-sweep-default-overdue.json', cliDefault);
        expect(
          cliDefault.status,
          `CLI default-threshold sweep must exit 0: ${cliDefault.combined}`
        ).toBe(0);
        let cliJson: Record<string, unknown> = {};
        try {
          cliJson = JSON.parse(cliDefault.stdout) as Record<string, unknown>;
        } catch {
          throw new Error(`CLI sweep stdout not JSON: ${cliDefault.stdout}`);
        }
        const cliOverdueMs = Number(cliJson.overdueMs ?? cliJson.overdue_ms);
        writeSla('sla-overdue-ms-oracle.json', {
          overdueMs: cliOverdueMs,
          DEFAULT_OVERDUE_MS,
          env_BACKUP_ALERT_OVERDUE_MS: process.env.BACKUP_ALERT_OVERDUE_MS ?? null,
          path: 'cli_subprocess_env_unset',
          note: 'AC-1: production default with BACKUP_ALERT_OVERDUE_MS unset (no toy 500/1000)',
        });
        expect(
          cliOverdueMs,
          `must_observe overdueMs >= 900000 (got ${cliOverdueMs}); must_not_observe toy 500/1000`
        ).toBeGreaterThanOrEqual(DEFAULT_OVERDUE_MS);
        expect(cliOverdueMs, 'overdueMs must equal DEFAULT_OVERDUE_MS under unset env').toBe(
          DEFAULT_OVERDUE_MS
        );

        // Wire webhook for in-process sweep. configure may set env when overdueMs is passed —
        // immediately delete so the process remains "env unset" while runtime holds DEFAULT.
        if (alerting.configureBackupAlerting) {
          await alerting.configureBackupAlerting({
            webhookUrl: receiver.url,
            overdueMs: DEFAULT_OVERDUE_MS,
          });
        }
        delete process.env.BACKUP_ALERT_OVERDUE_MS;

        // Seed last_success_at older than 15 minutes under DEFAULT_OVERDUE_MS (not 500ms).
        // production_truth config_removed: real FS fault + pure overdue (status=success, age>15m).
        // In-process (not spawnSync): spawnSync deadlocks the in-process http.Server receiver.
        const induceAtMs = Date.now();
        const induceFn = alerting.induceBackupFailure;
        expect(typeof induceFn, 'induceBackupFailure required for SLA seed').toBe('function');
        if (typeof induceFn !== 'function') {
          throw new Error('induceBackupFailure required for SLA seed');
        }
        const induced = await induceFn('config_removed', 'restic_blob_mirror', {
          overdueMs: DEFAULT_OVERDUE_MS,
        });
        writeSla('sla-induce-stale-beyond-15m.json', induced);
        const inducedRec = asRecord(induced);
        const indPath = asRecord(inducedRec.induction);
        expect(
          indPath.path === 'production_truth' || indPath.config_removed === true,
          `SLA seed must be production-truth (got ${JSON.stringify(indPath)})`
        ).toBe(true);
        const hb = asRecord(inducedRec.heartbeat);
        const lastSuccess = stringField(hb, ['last_success_at', 'lastSuccessAt']);
        expect(lastSuccess, 'SLA seed must write last_success_at').toBeTruthy();
        const lastSuccessMs = Date.parse(String(lastSuccess));
        expect(Number.isFinite(lastSuccessMs), 'last_success_at must parse').toBe(true);
        const seedAgeMs = induceAtMs - lastSuccessMs;
        expect(
          seedAgeMs,
          `SLA seed age must exceed 15 min (got ${seedAgeMs}ms); must_not_observe 30s/500ms toys`
        ).toBeGreaterThan(15 * 60 * 1000);

        // Sweep under production default threshold (env still unset after delete above).
        receiver.reset();
        const sweepFn = alerting.runBackupAlertSweep;
        expect(typeof sweepFn, 'runBackupAlertSweep required for SLA HTTP path').toBe('function');
        if (typeof sweepFn !== 'function') {
          throw new Error('runBackupAlertSweep required for SLA HTTP path');
        }
        // Pass overdueMs=DEFAULT so prior suite toy runtimeConfig cannot leak;
        // CLI path above already proved env-unset resolveOverdueMs → 900000.
        const sweepResult = await sweepFn({
          webhookUrl: receiver.url,
          overdueMs: DEFAULT_OVERDUE_MS,
        });
        writeSla('sla-alert-sweep.json', sweepResult);

        const overdueMs = Number(
          asRecord(sweepResult).overdueMs ?? asRecord(sweepResult).overdue_ms
        );
        const alerted = Number(asRecord(sweepResult).alerted ?? 0);
        expect(overdueMs, `in-process sweep overdueMs must be DEFAULT (got ${overdueMs})`).toBe(
          DEFAULT_OVERDUE_MS
        );
        expect(
          alerted,
          'must_observe alerted>=1 for stale-beyond-15m under default threshold'
        ).toBeGreaterThanOrEqual(1);

        const posts = Array.isArray(asRecord(sweepResult).posts)
          ? (asRecord(sweepResult).posts as unknown[])
          : [];
        const postsRec = posts.map((p) => asRecord(p));
        const jobPost =
          postsRec.find(
            (p) => stringField(p, ['job_name', 'job_id', 'jobName']) === 'restic_blob_mirror'
          ) ?? postsRec[0];
        expect(jobPost, 'must_observe post for induced restic_blob_mirror').toBeTruthy();
        const overdueByMin = Number(jobPost?.overdue_by_minutes ?? jobPost?.overdueByMinutes ?? 0);
        writeSla('sla-alert-artifact.json', {
          alerted,
          posts,
          overdue_by_minutes: overdueByMin,
          seed_age_ms: seedAgeMs,
        });
        expect(
          overdueByMin,
          `must_observe overdue_by_minutes >= 15 (got ${overdueByMin})`
        ).toBeGreaterThanOrEqual(15);
        const reason = String(
          jobPost?.reason ?? jobPost?.failure_reason ?? jobPost?.failureReason ?? ''
        ).toLowerCase();
        expect(reason, 'reason must be overdue|failed under SLA seed').toMatch(
          /overdue|failed|config/
        );

        // AC-3: real independent HTTP capture within 15-minute window (not posts[] self-report).
        const alert = await waitForAlertPost(
          receiver,
          (p) => {
            const job = jobIdOf(p);
            return job === 'restic_blob_mirror' || /overdue|config/i.test(failureReasonOf(p));
          },
          Math.min(ALERT_WINDOW_MS, 30_000)
        );
        const got = requireAlert(
          alert,
          'SLA must deliver real webhook POST within window under DEFAULT_OVERDUE_MS'
        );
        const receivedAtMs = Date.parse(got.receivedAt);
        const elapsedMs = receivedAtMs - induceAtMs;
        writeSla('sla-http-capture.json', {
          method: got.method,
          url: got.url,
          headers: got.headers,
          rawBody: got.rawBody,
          receivedAt: got.receivedAt,
          json: got.json,
          induceAtMs,
          elapsed_ms: elapsedMs,
          sla_window_ms: DEFAULT_OVERDUE_MS,
          note: 'AC-3: independent receiver envelope; elapsed_ms is detect→POST latency not toy-threshold gaming',
        });
        // Also dual-write durable suite captures for promote (S27-07).
        recordDurableHttpCapture(got);

        expect(got.method).toMatch(/^(POST|PUT)$/);
        expect(got.url).toMatch(/\/alert/);
        expect(got.headers).toBeTruthy();
        expect(got.rawBody.length).toBeGreaterThan(0);
        expect(got.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(
          elapsedMs,
          `must_observe elapsed_ms <= 900000 (15 min SLA window); got ${elapsedMs}`
        ).toBeLessThanOrEqual(DEFAULT_OVERDUE_MS);
        expect(elapsedMs, 'elapsed must be non-negative').toBeGreaterThanOrEqual(0);
        expect(jobIdOf(got) ?? '', 'payload job must match induced SLA job').toMatch(
          /restic_blob_mirror/
        );

        writeSla('sla-summary.json', {
          ac1_overdueMs: cliOverdueMs,
          ac2_overdue_by_minutes: overdueByMin,
          ac3_elapsed_ms: elapsedMs,
          ac3_method: got.method,
          DEFAULT_OVERDUE_MS,
          ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS,
          BACKUP_ALERT_OVERDUE_MS_during_sla: process.env.BACKUP_ALERT_OVERDUE_MS ?? null,
          must_not_observe: 'SLA proven only under overdue_ms:500/1000',
        });
        writeEvidence('s27-08-sla-production-default.json', {
          overdueMs: cliOverdueMs,
          overdue_by_minutes: overdueByMin,
          elapsed_ms: elapsedMs,
          method: got.method,
          DEFAULT_OVERDUE_MS,
        });
      } finally {
        if (savedOverdueEnv !== undefined) {
          process.env.BACKUP_ALERT_OVERDUE_MS = savedOverdueEnv;
        } else {
          delete process.env.BACKUP_ALERT_OVERDUE_MS;
        }
        // Leave heartbeats clean for any following cases.
        try {
          if (alerting.runHealthyBackupJob) {
            await alerting.runHealthyBackupJob('all');
          } else {
            runHolo(['backup:healthy', '--all'], {
              ALERT_WEBHOOK_URL: receiver.url,
              BACKUP_ALERT_OVERDUE_MS: savedOverdueEnv,
            });
          }
        } catch {
          /* best-effort cleanup */
        }
      }
    },
    Math.min(ALERT_WINDOW_MS, 30_000) + 90_000
  );
});
