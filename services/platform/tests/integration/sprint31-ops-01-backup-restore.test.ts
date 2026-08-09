/**
 * S31-OPS-01 — Restore backup execution (agent-safe half).
 *
 * AC-1 agent half: operatorRotationChecklistDocumented — runbook exists with
 *   OPERATOR rotation steps (human rotates/revokes R2 keys; agents never call Cloudflare API).
 * AC-2: backupPlistsHaveRealProgramArguments — base/wal/restic-mirror/alert-sweep plists
 *   invoke holo backup:* and are NOT sole /usr/bin/true (documents current correct plists).
 * AC-3: pgbackrestConfValidates — production path helper + nonprod example conf shape
 *   (never writes production conf).
 * AC-5: alertSweepPlistCarriesWebhook — ALERT_WEBHOOK_URL placeholder on alert-sweep plist;
 *   missing webhook fail-closed surface for alert path.
 *
 * Operator-only (NOT automated here):
 *   AC-1 live rotate/revoke + backup:status after rotation
 *   AC-4 restic mirror live heartbeat on mini
 *
 * Run:
 *   PLATFORM_IT=1 pnpm test:integration -- \
 *     services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertAlertWebhookUrlAllowed, resolveAlertWebhookUrl } from '../../src/backup/alerting.ts';
import {
  isProductionPgbackrestConfPath,
  PRODUCTION_PGBACKREST_CONF_SUFFIX,
  productionPgbackrestConfPath,
} from '../../src/backup/harness-isolation.ts';
import { PLATFORM_IT, REPO_ROOT } from './mission-red.helpers.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/s31-ops-01');

const RUNBOOK_PATH = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/runbooks/ops-01-r2-credential-rotation.md'
);

const LAUNCHD_DIR = resolve(REPO_ROOT, 'services/platform/deploy/launchd');

const BACKUP_PLISTS = {
  base: resolve(LAUNCHD_DIR, 'holocron-base-backup.plist'),
  wal: resolve(LAUNCHD_DIR, 'holocron-wal-archive.plist'),
  mirror: resolve(LAUNCHD_DIR, 'holocron-restic-blob-mirror.plist'),
  alertSweep: resolve(LAUNCHD_DIR, 'holocron-backup-alert-sweep.plist'),
} as const;

const EXAMPLE_CONF = resolve(REPO_ROOT, 'services/platform/deploy/nonprod/pgbackrest.conf.example');

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/** Extract ordered ProgramArguments strings from a launchd plist XML. */
function parsePlistProgramArguments(xml: string): string[] {
  const argsBlock = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/i);
  if (!argsBlock) return [];
  const args: string[] = [];
  const re = /<string>([\s\S]*?)<\/string>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argsBlock[1] ?? '')) !== null) {
    args.push(m[1] ?? '');
  }
  return args;
}

/** EnvironmentVariables dict key → string value from launchd plist XML. */
function parsePlistEnvVar(xml: string, key: string): string | null {
  const envBlock = xml.match(/<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/i);
  if (!envBlock) return null;
  const re = new RegExp(
    `<key>${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/key>\\s*<string>([\\s\\S]*?)<\\/string>`,
    'i'
  );
  const m = re.exec(envBlock[1] ?? '');
  return m?.[1] ?? null;
}

/**
 * Lightweight pgBackRest conf shape check (example / fixture only).
 * Does not invoke pgbackrest or write production conf.
 */
function validatePgbackrestConfShape(contents: string): {
  ok: boolean;
  stanza: string | null;
  repoPath: string | null;
  repoType: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  const repoType = contents.match(/^\s*repo1-type\s*=\s*(\S+)/m)?.[1] ?? null;
  const repoPath = contents.match(/^\s*repo1-path\s*=\s*(\S+)/m)?.[1] ?? null;
  // Stanza section: [name] that is not [global]
  const stanzaMatch = contents.match(/^\s*\[([^\]]+)\]\s*$/m);
  let stanza: string | null = null;
  const sectionRe = /^\s*\[([^\]]+)\]\s*$/gm;
  let sm: RegExpExecArray | null;
  while ((sm = sectionRe.exec(contents)) !== null) {
    const name = sm[1]?.trim() ?? '';
    if (name && name !== 'global') {
      stanza = name;
      break;
    }
  }
  if (!stanza && stanzaMatch) stanza = stanzaMatch[1] ?? null;

  if (!repoType) errors.push('missing repo1-type');
  if (repoType && repoType !== 's3') errors.push(`expected repo1-type=s3, got ${repoType}`);
  if (!repoPath) errors.push('missing repo1-path');
  if (!stanza) errors.push('missing non-global stanza section');
  // Example/harness paths use a concrete prefix under the bucket (leading slash ok)
  if (repoPath && !repoPath.startsWith('/')) {
    errors.push(`repo1-path should be absolute-under-bucket (leading /); got ${repoPath}`);
  }

  return {
    ok: errors.length === 0,
    stanza,
    repoPath,
    repoType,
    errors,
  };
}

beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

describe('S31-OPS-01 backup restore (PLATFORM_IT agent-safe)', () => {
  itLive('operatorRotationChecklistDocumented (AC-1 agent half)', () => {
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required').toBe(true);
    expect(existsSync(RUNBOOK_PATH), `missing runbook ${RUNBOOK_PATH}`).toBe(true);

    const body = readFileSync(RUNBOOK_PATH, 'utf8');

    writeEvidence('ac1-operator-rotation-checklist.json', {
      path: RUNBOOK_PATH,
      bytes: body.length,
      prose: 'Operator R2 rotation checklist present; agent does not rotate keys',
    });

    // Operator-facing rotation steps (human Cloudflare console — never agent API)
    expect(body).toMatch(/OPERATOR/i);
    expect(body).toMatch(/rotat/i);
    expect(body).toMatch(/revok/i);
    expect(body).toMatch(/R2/);
    expect(body).toMatch(/backup:base/);
    expect(body).toMatch(/backup:status/);
    expect(body).toMatch(/old key/i);
    // Hard agent boundary
    expect(body).toMatch(/MUST NOT|never|NEVER/i);
    expect(body).toMatch(/Cloudflare/i);
    expect(body).not.toMatch(/agent.*(rotate|revoke).*api/i);
    // Secrets stay out of git
    expect(body).toMatch(/never commit|not git|MUST NOT[\s\S]*commit/i);
  });

  itLive('backupPlistsHaveRealProgramArguments (AC-2)', () => {
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required').toBe(true);

    const expectedVerb: Record<keyof typeof BACKUP_PLISTS, RegExp> = {
      base: /backup:base/,
      wal: /backup:wal/,
      mirror: /backup:mirror/,
      alertSweep: /backup:alert-sweep/,
    };

    const summary: Array<{
      label: string;
      path: string;
      programArguments: string[];
      joined: string;
    }> = [];

    for (const [label, path] of Object.entries(BACKUP_PLISTS) as Array<
      [keyof typeof BACKUP_PLISTS, string]
    >) {
      expect(existsSync(path), `missing plist ${path}`).toBe(true);
      const xml = readFileSync(path, 'utf8');
      const args = parsePlistProgramArguments(xml);
      const joined = args.join(' ');

      summary.push({ label, path, programArguments: args, joined });

      expect(args.length, `${label}: ProgramArguments must not be empty`).toBeGreaterThan(0);
      // NEVER sole program /usr/bin/true
      expect(args, `${label}: must not be sole /usr/bin/true`).not.toEqual(['/usr/bin/true']);
      expect(
        args.some((a) => a === '/usr/bin/true' && args.length === 1),
        `${label}: sole /usr/bin/true forbidden`
      ).toBe(false);

      // holo present (cli path or bare holo)
      expect(joined, `${label}: ProgramArguments must contain holo`).toMatch(/holo(\.ts)?/);
      // backup verb
      expect(joined, `${label}: must invoke expected backup command`).toMatch(expectedVerb[label]);
    }

    writeEvidence('ac2-plist-program-arguments.json', {
      plists: summary,
      note: 'Repo LaunchAgent plists already carry real holo backup:* ProgramArguments (not stubs)',
    });

    expect(summary).toHaveLength(4);
  });

  itLive('pgbackrestConfValidates (AC-3)', () => {
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required').toBe(true);

    // Production path helper — do not write this path
    const prodPath = productionPgbackrestConfPath(REPO_ROOT);
    expect(prodPath).toContain(PRODUCTION_PGBACKREST_CONF_SUFFIX);
    expect(isProductionPgbackrestConfPath(prodPath, REPO_ROOT)).toBe(true);
    expect(prodPath.includes('/.tmp/')).toBe(false);

    // Nonprod example conf shape (disposable / committed placeholders only)
    expect(existsSync(EXAMPLE_CONF), `missing example conf ${EXAMPLE_CONF}`).toBe(true);
    const exampleBody = readFileSync(EXAMPLE_CONF, 'utf8');
    const shape = validatePgbackrestConfShape(exampleBody);

    writeEvidence('ac3-pgbackrest-conf-validate.json', {
      productionPathHelper: prodPath,
      productionSuffix: PRODUCTION_PGBACKREST_CONF_SUFFIX,
      exampleConf: EXAMPLE_CONF,
      shape,
      wroteProductionConf: false,
      prose:
        'Validated production path helper + nonprod example conf; never wrote production pgbackrest.conf',
    });

    expect(shape.ok, shape.errors.join('; ')).toBe(true);
    expect(shape.stanza).toBeTruthy();
    expect(shape.repoType).toBe('s3');
    expect(shape.repoPath).toMatch(/^\//);
    // Example documents harness isolation intent
    expect(exampleBody).toMatch(/NEVER|harness|HOLO_HARNESS|S31-OPS-03/i);
  });

  itLive('alertSweepPlistCarriesWebhook (AC-5)', () => {
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required').toBe(true);

    const path = BACKUP_PLISTS.alertSweep;
    expect(existsSync(path)).toBe(true);
    const xml = readFileSync(path, 'utf8');
    const args = parsePlistProgramArguments(xml);
    const webhookValue = parsePlistEnvVar(xml, 'ALERT_WEBHOOK_URL');

    writeEvidence('ac5-alert-sweep-webhook.json', {
      path,
      programArguments: args,
      alertWebhookUrl: webhookValue,
      prose: 'ALERT_WEBHOOK_URL key present as install-time placeholder; live URL never committed',
    });

    // Real command (same AC-2 bar for this unit)
    expect(args.join(' ')).toMatch(/backup:alert-sweep/);
    expect(args).not.toEqual(['/usr/bin/true']);

    // Webhook env key present with non-empty placeholder token
    expect(webhookValue, 'ALERT_WEBHOOK_URL env key missing on alert-sweep plist').toBeTruthy();
    expect(webhookValue!.length).toBeGreaterThan(0);
    // Deploy template keeps placeholder — not a live hook URL in git
    expect(webhookValue).toMatch(/@ALERT_WEBHOOK_URL@|https:\/\/hooks\.example/i);
    expect(xml).toMatch(/ALERT_WEBHOOK_URL/);
    // Must not embed a production-looking secret path token in the committed template
    expect(webhookValue).not.toMatch(/hooks\.slack\.com\/services\//i);

    // Fail-closed surface when webhook missing (library path — no live POST)
    expect(() => assertAlertWebhookUrlAllowed('')).toThrow(/ALERT_WEBHOOK_URL is not configured/);
    // resolve with empty env yields empty string (callers fail closed when jobs need alert)
    const resolved = resolveAlertWebhookUrl({
      env: { ...process.env, ALERT_WEBHOOK_URL: '' },
      secretsPath: resolve(REPO_ROOT, '.tmp/s31-ops-01/no-such-secrets.yaml'),
    });
    // Empty is allowed as "unconfigured"; sweep throws when bad jobs exist
    expect(typeof resolved).toBe('string');
  });


  it('documents deferred-revocation exception without claiming old-key AC passed', () => {
    const body = readFileSync(RUNBOOK_PATH, 'utf8');
    expect(body).toMatch(/TEMPORARY EXCEPTION/i);
    expect(body).toMatch(/deferred.?revocation|retain the old R2/i);
    expect(body).toMatch(/DO NOT REVOKE|Do not revoke/i);
    expect(body).toMatch(/NOT_PASSED|must not be marked passed/i);
    // Must NOT claim old-key negative control is complete under exception
    expect(body).not.toMatch(/old key negative control:\s*PASS/i);
    const path = writeEvidence('ac1-deferred-revocation-exception.json', {
      ac: 'AC-1',
      exception: 'operator_approved_temporary_retain_old_r2_key',
      revoke_old_key: 'DEFERRED',
      old_key_negative_control: 'NOT_PASSED',
      new_key_local_validation: 'CONTINUE',
      runbook: RUNBOOK_PATH,
    });
    expect(existsSync(path)).toBe(true);
  });

});
