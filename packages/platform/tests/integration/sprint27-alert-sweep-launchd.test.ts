/**
 * REDHAT-FIX-S27-10 / F-10 — Install and verify launchd alert-sweep schedule.
 *
 * AC-1: --install-schedule loads holocron-backup-alert-sweep (real launchctl)
 * AC-2: installed plist resolves ALERT_WEBHOOK_URL at process start without persisting it
 * AC-3: gate-plan enforces install-schedule + launchctl proof
 * AC-4: missing ALERT_WEBHOOK_URL fails closed (ok=false)
 *
 * Real boundaries:
 * - PLATFORM_IT=1 for live launchctl bootstrap (itLive)
 * - no mock launchctl; portable template never commits live tokens
 *
 * Run:
 *   PLATFORM_IT=1 ALERT_WEBHOOK_URL=http://127.0.0.1:9/hook \
 *     pnpm vitest run packages/platform/tests/integration/sprint27-alert-sweep-launchd.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS,
  ALERT_SWEEP_LAUNCHD_LABEL,
  formatAlertLaunchdInstallText,
  installAlertSweepLaunchd,
  renderAlertSweepPlist,
} from '../../src/backup/alerting.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json'
);
const PORTABLE_PLIST = resolve(
  REPO_ROOT,
  'packages/platform/deploy/launchd/holocron-backup-alert-sweep.plist'
);
const HOLO_CLI = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S27-10');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';

const tempDirs: string[] = [];

afterAll(() => {
  for (const d of tempDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

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

describe('REDHAT-FIX-S27-10 launchd alert-sweep schedule', () => {
  it('AC-3: gate-plan includes install-schedule + holocron-backup-alert-sweep verify', () => {
    const raw = readFileSync(GATE_PLAN, 'utf8');
    const plan = JSON.parse(raw) as {
      planned_steps: number;
      steps: Array<{ n: number; text?: string; literal_cmd?: string; assertion?: unknown }>;
    };
    expect(raw).toMatch(/install-schedule/);
    expect(raw).toMatch(/holocron-backup-alert-sweep/);
    expect(raw).toMatch(/launchctl print/);

    const installStep = plan.steps.find(
      (s) => typeof s.literal_cmd === 'string' && s.literal_cmd.includes('install-schedule')
    );
    expect(installStep, 'gate-plan must have a step that runs --install-schedule').toBeTruthy();
    expect(installStep?.literal_cmd).toMatch(/launchctl print/);
    expect(installStep?.literal_cmd).toMatch(/ALERT_WEBHOOK_URL/);
    expect(installStep?.literal_cmd).toMatch(/holocron-backup-alert-sweep/);
    writeEvidence('gate-plan-install-step.json', installStep);
  });

  it('portable deploy template keeps @ALERT_WEBHOOK_URL@ placeholder (no live secret)', () => {
    expect(existsSync(PORTABLE_PLIST)).toBe(true);
    const text = readFileSync(PORTABLE_PLIST, 'utf8');
    expect(text).toMatch(/ALERT_WEBHOOK_URL/);
    expect(text).toMatch(/@ALERT_WEBHOOK_URL@/);
    expect(text).toMatch(/backup:alert-sweep/);
    expect(text).toMatch(/<integer>300<\/integer>/);
    // No https token-shaped secrets committed
    expect(text).not.toMatch(/hooks\.slack\.com\/services\//);
    expect(text).not.toMatch(/https:\/\/[^\s@"]+\/services\//);
  });

  it('renderAlertSweepPlist omits ALERT_WEBHOOK_URL by default + interval ≤300', () => {
    const webhook = 'https://hooks.example.invalid/services/T00/B00/SECRET_TOKEN_XYZ';
    const body = renderAlertSweepPlist({
      home: '/Users/test',
      holoRoot: '/Users/test/Projects/holocron',
      bunBin: '/Users/test/.bun/bin/bun',
      databaseUrl: 'postgres://127.0.0.1:5432/holocron',
      alertWebhookUrl: webhook,
      intervalSeconds: 300,
    });
    expect(body).not.toMatch(/<key>ALERT_WEBHOOK_URL<\/key>/);
    expect(body).not.toContain(webhook);
    expect(body).toMatch(/backup:alert-sweep/);
    expect(body).toMatch(/<integer>300<\/integer>/);
    expect(body).toMatch(new RegExp(`<string>${ALERT_SWEEP_LAUNCHD_LABEL}</string>`));
  });

  it('AC-4: missing ALERT_WEBHOOK_URL fails closed (ok=false, not bootstrapped)', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 's27-10-no-webhook-'));
    tempDirs.push(dir);
    const emptySecrets = resolve(dir, 'empty-secrets.yaml');
    writeFileSync(emptySecrets, '{}\n', 'utf8');
    const env = { ...process.env };
    delete env.ALERT_WEBHOOK_URL;
    // Prevent accidental pick-up of operator secrets during fail-closed proof
    const result = installAlertSweepLaunchd({
      env,
      secretsPath: emptySecrets,
      launchAgentsDir: resolve(dir, 'LaunchAgents'),
      holoRoot: REPO_ROOT,
      bootstrap: false,
      writeTemplate: false,
    });
    writeEvidence('fail-closed-no-webhook.json', result);
    expect(result.ok).toBe(false);
    expect(result.bootstrapped).toBe(false);
    expect(result.loaded).toBe(false);
    expect(result.webhookConfigured).toBe(false);
    expect(result.messages.join(' ')).toMatch(/ALERT_WEBHOOK_URL required/i);
    const text = formatAlertLaunchdInstallText(result);
    expect(text).toMatch(/overall:\s+FAILED/);
    expect(text).not.toMatch(/overall:\s+OK/);
    expect(existsSync(result.plistPath)).toBe(false);
  });

  it('install without bootstrap writes a secure plist and resolves webhook at process start', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 's27-10-plist-'));
    tempDirs.push(dir);
    const webhook = 'http://127.0.0.1:9876/s27-10-hook?token=SUPER_SECRET_TOKEN';
    const env = {
      ...process.env,
      ALERT_WEBHOOK_URL: webhook,
      DATABASE_URL: 'postgres://127.0.0.1:5432/holocron',
      HOME: dir,
    };
    const launchAgentsDir = resolve(dir, 'Library/LaunchAgents');
    const result = installAlertSweepLaunchd({
      env,
      launchAgentsDir,
      holoRoot: REPO_ROOT,
      bootstrap: false,
      writeTemplate: false,
      intervalSeconds: ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS,
    });
    writeEvidence('install-no-bootstrap.json', {
      ...result,
      // never persist raw webhook in evidence
      note: 'webhook redacted from evidence dump',
    });
    expect(result.ok).toBe(true);
    expect(result.webhookConfigured).toBe(true);
    expect(result.bootstrapped).toBe(false);
    expect(result.intervalSeconds).toBeLessThanOrEqual(300);
    expect(existsSync(result.plistPath)).toBe(true);

    const plist = readFileSync(result.plistPath, 'utf8');
    expect(plist).not.toMatch(/<key>ALERT_WEBHOOK_URL<\/key>/);
    expect(plist).not.toContain(webhook);
    expect(plist).toMatch(/DATABASE_URL/);
    expect(plist).toMatch(/backup:alert-sweep/);
    expect(plist).toMatch(/--json/);
    expect(plist).toMatch(/<integer>300<\/integer>/);
    expect(statSync(result.plistPath).mode & 0o777).toBe(0o600);
    expect(result.messages.join(' ')).toMatch(/secrets-at-process-start|omitted/i);

    // stdout formatter must not embed the secret token
    const text = formatAlertLaunchdInstallText(result);
    expect(text).not.toContain('SUPER_SECRET_TOKEN');
    expect(text).toMatch(/webhook:\s+configured/);
    expect(JSON.stringify(result)).not.toContain('SUPER_SECRET_TOKEN');

    if (process.platform === 'darwin') {
      const lint = spawnSync('/usr/bin/plutil', ['-lint', result.plistPath], { encoding: 'utf8' });
      expect(lint.status, lint.stderr || lint.stdout).toBe(0);
    }
  });

  itLive(
    'AC-1/AC-2: CLI --install-schedule loads job without exposing ALERT_WEBHOOK_URL (real launchctl)',
    () => {
      ensureEvidenceDir();
      const webhook =
        process.env.ALERT_WEBHOOK_URL?.trim() ||
        'http://127.0.0.1:9/redhat-fix-s27-10-standing-hook';
      const res = spawnSync(
        BUN_BIN,
        [HOLO_CLI, 'backup:alert-sweep', '--install-schedule', '--json'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
          env: {
            ...process.env,
            ALERT_WEBHOOK_URL: webhook,
          },
        }
      );
      writeEvidence('install-schedule-cli.json', res.stdout || '');
      if (res.stderr) writeEvidence('install-schedule-cli.stderr', res.stderr);

      expect(res.status, `install-schedule exit: ${res.stderr || res.stdout}`).toBe(0);
      const body = JSON.parse(res.stdout) as {
        ok: boolean;
        bootstrapped: boolean;
        loaded: boolean;
        webhookConfigured: boolean;
        intervalSeconds: number;
        label: string;
        plistPath: string;
      };
      expect(body.ok).toBe(true);
      expect(body.bootstrapped || body.loaded).toBe(true);
      expect(body.webhookConfigured).toBe(true);
      expect(body.intervalSeconds).toBeLessThanOrEqual(300);
      expect(body.label).toBe(ALERT_SWEEP_LAUNCHD_LABEL);
      expect(JSON.stringify(body)).not.toContain(webhook);

      const uid = process.getuid?.() ?? 501;
      const print = spawnSync('launchctl', ['print', `gui/${uid}/${ALERT_SWEEP_LAUNCHD_LABEL}`], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      writeEvidence('launchctl-print.txt', print.stdout || print.stderr || '');
      expect(print.status, print.stderr || print.stdout).toBe(0);
      expect(print.stdout).toMatch(/holocron-backup-alert-sweep/);
      expect(print.stdout.toLowerCase()).not.toMatch(/could not find service/);

      const home = process.env.HOME ?? '';
      const plistPath = resolve(home, 'Library/LaunchAgents', `${ALERT_SWEEP_LAUNCHD_LABEL}.plist`);
      expect(existsSync(plistPath)).toBe(true);
      const lint = spawnSync('/usr/bin/plutil', ['-lint', plistPath], { encoding: 'utf8' });
      expect(lint.status).toBe(0);
      const dump = spawnSync('/usr/bin/plutil', ['-p', plistPath], { encoding: 'utf8' });
      writeEvidence('plist-dump.txt', dump.stdout || '');
      expect(dump.stdout).not.toMatch(/ALERT_WEBHOOK_URL/);
      expect(dump.stdout).not.toContain(webhook);
      expect(dump.stdout).toMatch(/backup:alert-sweep/);
      expect(statSync(plistPath).mode & 0o777).toBe(0o600);
    }
  );
});
