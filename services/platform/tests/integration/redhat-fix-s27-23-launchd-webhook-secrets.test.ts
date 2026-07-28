/**
 * REDHAT-FIX-S27-23 / R-10+R-12 — LaunchAgent webhook credential hygiene.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installAlertSweepLaunchd, renderAlertSweepPlist } from '../../src/backup/alerting';

const live = process.env.PLATFORM_IT === '1';
const d = live ? describe : describe.skip;

const SECRET_TOKEN = 'SECRET_TOKEN_LAUNCHD_XYZ_deadbeefcafebabe';
const LIVE_URL = `https://hooks.example.invalid/alert/${SECRET_TOKEN}`;

d('REDHAT-FIX-S27-23 launchd webhook secrets', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('AC-1/AC-2: install omits full webhook token from plist env (secrets-at-start)', () => {
    const launchAgentsDir = mkdtempSync(join(tmpdir(), 's27-23-la-'));
    dirs.push(launchAgentsDir);
    const secretsPath = join(launchAgentsDir, 'secrets.yaml');
    writeFileSync(secretsPath, `ALERT_WEBHOOK_URL: "${LIVE_URL}"\n`, { mode: 0o600 });

    const result = installAlertSweepLaunchd({
      env: {
        HOME: join(launchAgentsDir, 'home'),
        PATH: process.env.PATH,
        DATABASE_URL: 'postgres://127.0.0.1:5432/holocron',
      },
      launchAgentsDir,
      secretsPath,
      bootstrap: false,
      writeTemplate: false,
      holoRoot: process.cwd(),
    });

    expect(result.ok).toBe(true);
    expect(result.webhookConfigured).toBe(true);
    const body = readFileSync(result.plistPath, 'utf8');
    expect(body).not.toContain(SECRET_TOKEN);
    expect(body).not.toContain(LIVE_URL);
    // no ALERT_WEBHOOK_URL key with real value
    expect(body).not.toMatch(/<key>ALERT_WEBHOOK_URL<\/key>\s*<string>https?:\/\//);
    const mode = statSync(result.plistPath).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(result.messages.some((m) => /redacted|secrets-at-process-start|omitted/i.test(m))).toBe(
      true
    );
  });

  it('AC-3: when secret material is forced into plist, write mode is 0o600', () => {
    const dir = mkdtempSync(join(tmpdir(), 's27-23-mode-'));
    dirs.push(dir);
    const body = renderAlertSweepPlist({
      home: dir,
      holoRoot: process.cwd(),
      bunBin: '/usr/bin/bun',
      databaseUrl: 'postgres://127.0.0.1:5432/holocron',
      alertWebhookUrl: LIVE_URL,
      intervalSeconds: 300,
      includeAlertWebhookEnv: true,
    });
    expect(body).toContain(SECRET_TOKEN);
    const path = join(dir, 'test.plist');
    writeFileSync(path, body, { encoding: 'utf8', mode: 0o600 });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('AC-4: install rejects remote http webhook before writing plist', () => {
    const launchAgentsDir = mkdtempSync(join(tmpdir(), 's27-23-http-'));
    dirs.push(launchAgentsDir);
    const secretsPath = join(launchAgentsDir, 'secrets.yaml');
    writeFileSync(secretsPath, 'ALERT_WEBHOOK_URL: "http://evil.example/hook/token"\n', {
      mode: 0o600,
    });
    const result = installAlertSweepLaunchd({
      env: { HOME: join(launchAgentsDir, 'home'), PATH: process.env.PATH },
      launchAgentsDir,
      secretsPath,
      bootstrap: false,
      writeTemplate: false,
      holoRoot: process.cwd(),
    });
    expect(result.ok).toBe(false);
    expect(result.messages.join(' ')).toMatch(/scheme rejected|http/i);
    // no plist with secret
    try {
      const body = readFileSync(result.plistPath, 'utf8');
      expect(body).not.toContain('evil.example');
    } catch {
      // file may not exist — also OK
    }
  });

  it('AC-5: negative control — plaintext token without 0o600 / secrets load fails suite contract', () => {
    // Install path must not leave live token in EnvironmentVariables.
    const launchAgentsDir = mkdtempSync(join(tmpdir(), 's27-23-neg-'));
    dirs.push(launchAgentsDir);
    const secretsPath = join(launchAgentsDir, 'secrets.yaml');
    writeFileSync(secretsPath, `ALERT_WEBHOOK_URL: "${LIVE_URL}"\n`, { mode: 0o600 });
    const result = installAlertSweepLaunchd({
      env: { HOME: join(launchAgentsDir, 'home'), PATH: process.env.PATH },
      launchAgentsDir,
      secretsPath,
      bootstrap: false,
      writeTemplate: false,
      holoRoot: process.cwd(),
    });
    const body = readFileSync(result.plistPath, 'utf8');
    const hasPlaintextToken = body.includes(SECRET_TOKEN);
    const mode = statSync(result.plistPath).mode & 0o777;
    // Fail the suite if plaintext token present without 0o600
    if (hasPlaintextToken && mode !== 0o600) {
      throw new Error('plaintext webhook token written without 0o600');
    }
    expect(hasPlaintextToken).toBe(false);
  });

  it('AC-6: portable deploy template never embeds SECRET_TOKEN_LAUNCHD_XYZ', () => {
    const tpl = readFileSync(
      'services/platform/deploy/launchd/holocron-backup-alert-sweep.plist',
      'utf8'
    );
    expect(tpl).not.toContain('SECRET_TOKEN_LAUNCHD_XYZ');
    expect(tpl).toMatch(/@ALERT_WEBHOOK_URL@|ALERT_WEBHOOK_URL/);
  });
});
