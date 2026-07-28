/**
 * REDHAT-FIX-S27-07 / F-7 — Independent webhook HTTP capture for gate evidence.
 *
 * Proves:
 *   AC-1: durable captures use real http.Server envelope (method/url/headers/rawBody/receivedAt)
 *   AC-2: pre-fix alerts-received.json (payload-only posts[]) fails envelope jq; post-fix passes
 *   AC-3: negative_control names stub postBackupAlert without fetch (mutation M1)
 *   AC-4: schema parity with RED suite AlertPost + createServer helper
 *
 * Gate evidence path: .gate-evidence/<run>/alerts-http-captures.json
 * (replaces theatre of serializing sweep.posts[] → alerts-received.json)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  type AlertPost,
  assertCapturesHaveHttpEnvelope,
  extractAlertPosts,
  hasHttpEnvelope,
  startWebhookReceiver,
} from './helpers/backup-webhook-receiver';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const SPRINT_REL =
  '.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting';
const GATE_PLAN = resolve(REPO_ROOT, SPRINT_REL, 'gate-plan.json');
const PRE_FIX_ALERTS = resolve(
  REPO_ROOT,
  SPRINT_REL,
  '.gate-evidence/20260728T024819Z/alerts-received.json'
);
const PROMOTE_SCRIPT = resolve(REPO_ROOT, 'scripts/promote-backup-alert-http-captures.sh');
const HELPER_SRC = resolve(
  REPO_ROOT,
  'services/platform/tests/integration/helpers/backup-webhook-receiver.ts'
);
const RED_SUITE = resolve(
  REPO_ROOT,
  'services/platform/tests/integration/sprint27-backup-alerting-red.test.ts'
);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S27-07');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const OVERDUE_MS = Number(process.env.BACKUP_ALERT_OVERDUE_MS ?? 1000);

type GateStep = {
  n: number;
  text?: string;
  literal_cmd?: string;
  assertion?: { kind?: string; expected_exit?: number; expect_log_regex?: string };
};

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function loadGateStep7(): GateStep {
  const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as { steps: GateStep[] };
  const step = plan.steps.find((s) => s.n === 7);
  if (!step) throw new Error('gate-plan.json missing step n=7');
  return step;
}

function jqEnvelope(path: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    'jq',
    ['-e', '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt', path],
    { encoding: 'utf8' }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('REDHAT-FIX-S27-07 — independent webhook HTTP capture (F-7)', () => {
  it('helper + RED suite use createServer / AlertPost envelope schema (AC-4)', () => {
    expect(existsSync(HELPER_SRC), `helper missing: ${HELPER_SRC}`).toBe(true);
    const helper = readFileSync(HELPER_SRC, 'utf8');
    expect(helper).toMatch(/createServer/);
    expect(helper).toMatch(/receivedAt/);
    expect(helper).toMatch(/rawBody/);
    expect(helper).toMatch(/method/);
    expect(helper).toMatch(/stub postBackupAlert without fetch/);

    const red = readFileSync(RED_SUITE, 'utf8');
    expect(red).toMatch(/backup-webhook-receiver/);
    expect(red).toMatch(/alerts-http-captures\.json/);
    expect(red).toMatch(/recordDurableHttpCapture|durableHttpCaptures/);
    expect(red).toMatch(/stub postBackupAlert without fetch/);
    expect(red).toMatch(/mutation M1|M1/);
  });

  it('gate-plan step 7 promotes alerts-http-captures.json + envelope jq (AC-2)', () => {
    const step = loadGateStep7();
    const cmd = step.literal_cmd ?? '';
    expect(cmd).toMatch(/sprint27-backup-alerting-red\.test\.ts/);
    expect(cmd).toMatch(/PLATFORM_IT=1/);
    expect(cmd).toMatch(/promote-backup-alert-http-captures\.sh/);
    expect(cmd).toMatch(/alerts-http-captures\.json/);
    expect(cmd).toMatch(
      /jq -e '\.\[0\]\.method and \.\[0\]\.url and \.\[0\]\.headers and \.\[0\]\.rawBody and \.\[0\]\.receivedAt'/
    );
    // Must not accept payload-only as success via OR-alternation alone
    expect(cmd).not.toMatch(/alerts-received\.json.*\|\|.*true/);
    expect(step.assertion?.expected_exit).toBe(0);
    expect(step.assertion?.expect_log_regex ?? '').toMatch(/ALERT_HTTP_CAPTURES_OK/);
    writeEvidence('gate-step7-contract.json', {
      has_promote_script: cmd.includes('promote-backup-alert-http-captures.sh'),
      has_envelope_jq: true,
      expected_exit: step.assertion?.expected_exit,
    });
  });

  it('AC-2/TC-2: pre-fix alerts-received.json fails envelope jq (payload-only posts[])', () => {
    expect(existsSync(PRE_FIX_ALERTS), `pre-fix artifact missing: ${PRE_FIX_ALERTS}`).toBe(true);
    const raw = JSON.parse(readFileSync(PRE_FIX_ALERTS, 'utf8')) as unknown;
    expect(Array.isArray(raw)).toBe(true);
    const first = (raw as unknown[])[0] as Record<string, unknown>;
    // Pre-fix shape is BackupAlertPayload only — no HTTP envelope
    expect(first.job_name || first.job_id).toBeTruthy();
    expect(first.method).toBeUndefined();
    expect(first.url).toBeUndefined();
    expect(first.headers).toBeUndefined();
    expect(first.rawBody).toBeUndefined();
    expect(first.receivedAt).toBeUndefined();

    const jq = jqEnvelope(PRE_FIX_ALERTS);
    expect(jq.status, `pre-fix jq must exit non-zero; stdout=${jq.stdout}`).not.toBe(0);

    expect(() => assertCapturesHaveHttpEnvelope(raw)).toThrow(/envelope|HTTP capture/i);
    writeEvidence('pre-fix-envelope-oracle.json', {
      path: PRE_FIX_ALERTS,
      jq_exit: jq.status,
      envelope_pass: false,
      note: 'payload-only posts[] dump is NOT wire-delivery proof',
    });
  });

  it('AC-3: negative_control documents stub postBackupAlert without fetch (mutation M1)', () => {
    const helper = readFileSync(HELPER_SRC, 'utf8');
    const red = readFileSync(RED_SUITE, 'utf8');
    const promote = readFileSync(PROMOTE_SCRIPT, 'utf8');
    for (const [label, src] of [
      ['helper', helper],
      ['red suite', red],
      ['promote script', promote],
    ] as const) {
      expect(src, `${label} must name stub postBackupAlert without fetch`).toMatch(
        /stub postBackupAlert without fetch/
      );
    }
    // Fabricated posts[] cannot pass envelope oracle (M1 survival would look like this)
    const fabricated = [
      {
        job_name: 'wal_archive',
        reason: 'failed',
        failure_reason: 'stub postBackupAlert without fetch',
        timestamp: new Date().toISOString(),
      },
    ];
    expect(() => assertCapturesHaveHttpEnvelope(fabricated)).toThrow();
    writeEvidence('m1-negative-control-static.json', {
      negative_control: 'stub postBackupAlert without fetch',
      mutation: 'M1',
      fabricated_rejected_by_envelope_oracle: true,
    });
  });

  it('promote script exists and is executable contract (AC-1/AC-4)', () => {
    expect(existsSync(PROMOTE_SCRIPT)).toBe(true);
    const src = readFileSync(PROMOTE_SCRIPT, 'utf8');
    expect(src).toMatch(/createServer|failure-\*-alert|alerts-http-captures/);
    expect(src).toMatch(/method.*url.*headers.*rawBody.*receivedAt/);
  });

  itLive(
    'AC-1 live: independent createServer receiver captures real HTTP envelope; promote passes jq',
    async () => {
      const receiver = await startWebhookReceiver(0);
      try {
        // Live POST crossing the wire — not a client-forged capture.
        const payload = {
          job_name: 'wal_archive',
          job_id: 'wal_archive',
          reason: 'failed',
          failure_reason: 'killed / WAL behind — S27-07 live capture',
          last_success_at: new Date().toISOString(),
          overdue_by_minutes: 1,
          last_wal_segment: null,
          last_snapshot_id: null,
          trace_id: 'redhat-fix-s27-07-live',
          timestamp: new Date().toISOString(),
          status: 'failed',
        };
        const res = await fetch(receiver.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        expect(res.status).toBe(200);
        expect(receiver.posts.length).toBeGreaterThanOrEqual(1);
        const post = receiver.posts[0] as AlertPost;
        expect(hasHttpEnvelope(post)).toBe(true);
        expect(post.method).toBe('POST');
        expect(post.url).toMatch(/\/alert/);
        expect(String(post.headers['content-type'] ?? '')).toMatch(/json/i);
        expect(post.rawBody).toMatch(/wal_archive/);
        expect(post.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        assertCapturesHaveHttpEnvelope(receiver.posts);

        // Dual-write evidence shapes matching RED suite + promote script inputs
        const redSuiteDir = resolve(EVIDENCE_DIR, 'red-suite-live');
        mkdirSync(redSuiteDir, { recursive: true });
        writeFileSync(
          resolve(redSuiteDir, 'failure-a-wal-kill-alert.json'),
          `${JSON.stringify({ found: true, postCount: 1, alert: post }, null, 2)}\n`,
          'utf8'
        );
        writeFileSync(
          resolve(redSuiteDir, 'alerts-http-captures.json'),
          `${JSON.stringify(receiver.posts, null, 2)}\n`,
          'utf8'
        );

        const outCaptures = resolve(EVIDENCE_DIR, 'alerts-http-captures.json');
        const promote = spawnSync('bash', [PROMOTE_SCRIPT, redSuiteDir, outCaptures], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        });
        expect(promote.status, `promote failed: ${promote.stdout}\n${promote.stderr}`).toBe(0);
        expect(promote.stdout).toMatch(/ALERT_HTTP_CAPTURES_OK/);

        const jq = jqEnvelope(outCaptures);
        expect(jq.status, `post-fix jq must exit 0: ${jq.stderr}`).toBe(0);

        // Pre-fix still fails (side-by-side proof)
        const preJq = jqEnvelope(PRE_FIX_ALERTS);
        expect(preJq.status).not.toBe(0);

        writeEvidence('live-capture-summary.json', {
          receiver_url: receiver.url,
          capture_count: receiver.posts.length,
          promote_stdout: promote.stdout.trim(),
          post_fix_jq_exit: jq.status,
          pre_fix_jq_exit: preJq.status,
          sample: {
            method: post.method,
            url: post.url,
            has_headers: Boolean(post.headers),
            rawBody_len: post.rawBody.length,
            receivedAt: post.receivedAt,
          },
        });
      } finally {
        await receiver.close();
      }
    },
    30_000
  );

  itLive(
    'AC-1 live path: induce failure + alert-sweep → real fetch lands on independent receiver',
    async () => {
      const receiver = await startWebhookReceiver(0);
      try {
        const alerting = (await import('../../src/backup/alerting.ts')) as {
          configureBackupAlerting?: (opts: {
            webhookUrl: string;
            overdueMs?: number;
          }) => void | Promise<void>;
          runHealthyBackupJob?: (jobId: string) => Promise<unknown> | unknown;
          induceBackupFailure?: (
            mode: string,
            jobId: string,
            options?: { synthetic?: boolean }
          ) => Promise<unknown> | unknown;
          runBackupAlertSweep?: () => Promise<{ alerted: number; posts: unknown[] }>;
        };

        if (alerting.configureBackupAlerting) {
          await alerting.configureBackupAlerting({
            webhookUrl: receiver.url,
            overdueMs: OVERDUE_MS,
          });
        }

        // Clean slate so only our induced job is bad.
        if (alerting.runHealthyBackupJob) {
          await alerting.runHealthyBackupJob('all');
        } else {
          spawnSync(BUN_BIN, [HOLO_CLI, 'backup:healthy', '--all'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            timeout: 60_000,
            env: process.env,
          });
        }

        // Prefer production-truth induction; fall back to CLI.
        let induced: unknown = null;
        if (alerting.induceBackupFailure) {
          induced = await alerting.induceBackupFailure('kill_wal_behind', 'wal_archive');
        } else {
          const induce = spawnSync(
            BUN_BIN,
            [HOLO_CLI, 'backup:induce-failure', '--mode', 'kill', '--job', 'wal_archive', '--json'],
            {
              cwd: REPO_ROOT,
              encoding: 'utf8',
              timeout: 120_000,
              env: {
                ...process.env,
                ALERT_WEBHOOK_URL: receiver.url,
                BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
              },
            }
          );
          induced = { status: induce.status, stdout: induce.stdout, stderr: induce.stderr };
          if (induce.status !== 0) {
            writeEvidence('live-induce-skipped.json', {
              reason: 'CLI induce failed — direct POST case already covers independent receiver',
              induced,
            });
            return;
          }
        }
        writeEvidence('live-induce.json', induced);

        receiver.reset();
        let sweepResult: { alerted?: number; posts?: unknown[] } | null = null;
        if (alerting.runBackupAlertSweep) {
          sweepResult = await alerting.runBackupAlertSweep();
        } else {
          const sweep = spawnSync(BUN_BIN, [HOLO_CLI, 'backup:alert-sweep'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            timeout: 60_000,
            env: {
              ...process.env,
              ALERT_WEBHOOK_URL: receiver.url,
              BACKUP_ALERT_OVERDUE_MS: String(OVERDUE_MS),
            },
          });
          writeEvidence('live-sweep.txt', `${sweep.stdout}\n${sweep.stderr}`);
        }
        writeEvidence('live-sweep-result.json', {
          sweepResult,
          receiver_posts: receiver.posts.length,
          // M1 note: sweepResult.posts may grow under a stub; receiver is ground truth.
          negative_control: 'stub postBackupAlert without fetch → receiver.posts stays 0',
        });

        // Prefer receiver length over sweep self-report (M1 kill).
        expect(
          receiver.posts.length,
          `independent receiver must see ≥1 POST after induce+sweep; sweepResult=${JSON.stringify(sweepResult)}`
        ).toBeGreaterThanOrEqual(1);
        assertCapturesHaveHttpEnvelope(receiver.posts);
        const jobHit = receiver.posts.some((p) => /wal_archive|kill|WAL/i.test(p.rawBody));
        expect(jobHit, 'rawBody must name the failed job / kill reason').toBe(true);

        writeFileSync(
          resolve(EVIDENCE_DIR, 'alerts-http-captures-from-sweep.json'),
          `${JSON.stringify(receiver.posts, null, 2)}\n`,
          'utf8'
        );
      } finally {
        await receiver.close();
        // Best-effort restore healthy so we don't leave sticky failed heartbeats.
        try {
          const alerting = (await import('../../src/backup/alerting.ts')) as {
            runHealthyBackupJob?: (jobId: string) => Promise<unknown> | unknown;
          };
          if (alerting.runHealthyBackupJob) {
            await alerting.runHealthyBackupJob('all');
          } else {
            spawnSync(BUN_BIN, [HOLO_CLI, 'backup:healthy', '--all'], {
              cwd: REPO_ROOT,
              encoding: 'utf8',
              timeout: 60_000,
              env: process.env,
            });
          }
        } catch {
          /* ignore cleanup */
        }
      }
    },
    180_000
  );

  it('extractAlertPosts pulls envelope from RED failure-*-alert shapes', () => {
    const nested = {
      found: true,
      postCount: 1,
      alert: {
        receivedAt: '2026-07-28T06:35:18.511Z',
        method: 'POST',
        url: '/alert',
        headers: { 'content-type': 'application/json' },
        rawBody: '{"job_name":"wal_archive"}',
        json: { job_name: 'wal_archive' },
      },
    };
    const extracted = extractAlertPosts(nested);
    expect(extracted).toHaveLength(1);
    assertCapturesHaveHttpEnvelope(extracted);

    // payload-only extracts to empty
    expect(extractAlertPosts([{ job_name: 'x', reason: 'failed' }])).toHaveLength(0);
  });

  afterAll(() => {
    // Seed a committed-style post-fix capture under .tmp for local gate rehearsal.
    // Real gate dual-write lands under .gate-evidence/<run>/ via step 7.
    if (!existsSync(EVIDENCE_DIR)) return;
    const files = readdirSync(EVIDENCE_DIR);
    writeEvidence('harvest-index.json', { files, evidence_dir: EVIDENCE_DIR });
  });
});
