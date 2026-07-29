/**
 * REDHAT-FIX-H4 — Sacrificial credential delete negative control (no live key delete).
 *
 * Closes red-hat H-4: restore RO credential proof MUST NOT target live recovery
 * objects (bucket-root "existing", backup/, archive/, pgbackrest/, restic/).
 * Delete denial is proven only against drill-neg/<uuid> sacrificial keys and/or
 * non-mutating policy inspection (DeleteObject action count = 0).
 *
 * AC-1: delete negative control targets only drill-neg sacrificial keys
 * AC-2: denylist refuses live recovery keys before any delete API call
 * AC-3: non-mutating policy path shows Put/Delete absent for restore RO
 * AC-4: docs/scripts no longer instruct destructive existing-key rm
 * AC-5: suite fails closed if live-key destructive control remains
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const live = process.env.PLATFORM_IT === '1';
const d = live ? describe : describe.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H4');
const PROVE_RO = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const VERIFY_CREDS = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const PROVE_ISOLATION = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const FRESH_TARGET_MD = resolve(REPO_ROOT, 'services/platform/src/backup/fresh-target.md');
const D05_03 = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md'
);
const BACKUP_CONFIG = resolve(REPO_ROOT, 'services/platform/src/backup/config.ts');

/** Pre-fix destructive instruction pattern (H-4 finding). */
const DESTRUCTIVE_EXISTING_RE = /s3 rm \$R2_BUCKET\/existing|aws s3 rm .*existing/;

const LIVE_RECOVERY_KEYS = [
  'existing',
  'backup/main/latest',
  'archive/main/000000010000000000000001',
  'pgbackrest/backup/main/backup.info',
  'restic/snapshots/abc',
  's3://holocron-backup/existing',
] as const;

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

function bash(
  args: string[],
  env?: NodeJS.ProcessEnv
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const result = spawnSync('bash', args, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}${stderr}`,
  };
}

function read(path: string): string {
  expect(existsSync(path), `missing required file: ${path}`).toBe(true);
  return readFileSync(path, 'utf8');
}

/** Count Allow-statement PutObject/DeleteObject actions in an IAM-style policy JSON string. */
function countPutDeleteActions(policyJson: string): number {
  let data: unknown = policyJson;
  for (let i = 0; i < 3; i++) {
    if (typeof data === 'string') {
      data = JSON.parse(data);
      continue;
    }
    break;
  }
  if (!data || typeof data !== 'object') return -1;
  const statements = (data as { Statement?: unknown }).Statement;
  if (!Array.isArray(statements)) return -1;
  let count = 0;
  for (const st of statements) {
    if (!st || typeof st !== 'object') continue;
    const effect = (st as { Effect?: string }).Effect;
    if (effect !== 'Allow') continue;
    let actions = (st as { Action?: string | string[] }).Action ?? [];
    if (typeof actions === 'string') actions = [actions];
    for (const a of actions) {
      if (
        a.includes('PutObject') ||
        a.includes('DeleteObject') ||
        a === 's3:Put' ||
        a === 's3:Delete' ||
        a === 's3:*' ||
        a === '*'
      ) {
        count += 1;
      }
    }
  }
  return count;
}

/** Canonical restore RO policy shape from fresh-target.md / provision script. */
function restoreReadOnlyPolicy(bucket = 'holocron-backup'): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'HolocronRestoreList',
        Effect: 'Allow',
        Action: ['s3:ListBucket', 's3:GetBucketLocation'],
        Resource: [`arn:aws:s3:::${bucket}`],
      },
      {
        Sid: 'HolocronRestoreGet',
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

d('REDHAT-FIX-H4 sacrificial credential negative control', () => {
  it('AC-1: delete negative control targets only drill-neg/<uuid> sacrificial keys', () => {
    const proveSrc = read(PROVE_RO);
    // Live probe must generate and use sacrificial drill-neg keys.
    expect(proveSrc).toMatch(/make_sacrificial_drill_neg_key|drill-neg\//);
    expect(proveSrc).toMatch(/assert_safe_destructive_probe_key/);
    expect(proveSrc).toMatch(/SACRIFICIAL_DRILL_NEG_H4|redhat-fix-h4/);

    // Script must not hardcode a live recovery delete target.
    expect(proveSrc).not.toMatch(/delete-object[^\n]*existing/);
    expect(proveSrc).not.toMatch(/s3 rm[^\n]*\/existing\b/);
    // Pre-H4 probe path replaced.
    expect(proveSrc).not.toMatch(/d05-03-ro-probe\/delete-should-deny/);

    const sac = bash([PROVE_RO, '--make-sacrificial-key']);
    expect(sac.status, sac.combined).toBe(0);
    const sacKey = sac.stdout.trim();
    expect(sacKey).toMatch(/^drill-neg\/[0-9a-f-]+-redhat-fix-h4\.txt$/i);

    const safe = bash([PROVE_RO, '--assert-safe-key', sacKey]);
    expect(safe.status, safe.combined).toBe(0);
    expect(safe.combined).toMatch(/sacrificial drill-neg key allowed/i);

    // Live recovery key must not be accepted as delete target.
    const unsafe = bash([PROVE_RO, '--assert-safe-key', 'existing']);
    expect(unsafe.status, unsafe.combined).not.toBe(0);
    expect(unsafe.combined).toMatch(/refusing|denylist|live recovery/i);

    writeEvidence('ac1-sacrificial-key.txt', {
      sacrificialKey: sacKey,
      safeStatus: safe.status,
      unsafeExistingStatus: unsafe.status,
      unsafeCombined: unsafe.combined,
    });
  });

  it('AC-2: denylist refuses live recovery keys before any delete API call', () => {
    const proveSrc = read(PROVE_RO);
    expect(proveSrc).toMatch(/matches_live_recovery_key/);
    expect(proveSrc).toMatch(/assert_safe_destructive_probe_key/);
    // Denylist covers the H-4 contract prefixes.
    for (const token of [
      'backup',
      'archive',
      'pgbackrest',
      'restic',
      'existing',
      'HOLO_BACKUP_PREFIX',
    ]) {
      expect(proveSrc, `denylist source should mention ${token}`).toMatch(new RegExp(token));
    }

    const results: Array<{ key: string; status: number | null; combined: string }> = [];
    for (const key of LIVE_RECOVERY_KEYS) {
      const r = bash([PROVE_RO, '--assert-denylisted', key]);
      results.push({ key, status: r.status, combined: r.combined });
      expect(r.status, `expected denylist hit for ${key}: ${r.combined}`).toBe(0);
      // Refuse-before-API: --assert-denylisted is pure local classification (no aws in output).
      expect(r.combined).not.toMatch(/aws s3api delete-object|Running|Completed/i);
    }

    // Safe key is NOT denylisted.
    const sac = bash([PROVE_RO, '--make-sacrificial-key']).stdout.trim();
    const notDenied = bash([PROVE_RO, '--assert-denylisted', sac]);
    expect(notDenied.status, notDenied.combined).not.toBe(0);

    // assert-safe-key must refuse every denylisted key (no API call path).
    for (const key of LIVE_RECOVERY_KEYS) {
      const r = bash([PROVE_RO, '--assert-safe-key', key]);
      expect(r.status, `assert-safe-key must refuse ${key}`).not.toBe(0);
      expect(r.combined).toMatch(/refusing|denylist|non-sacrificial/i);
    }

    writeEvidence('ac2-denylist.txt', { results, sacrificialNotDenied: sac });
  });

  it('AC-3: non-mutating policy inspection proves DeleteObject absent for restore RO', () => {
    const verifySrc = read(VERIFY_CREDS);
    expect(verifySrc).toMatch(/PUT_DELETE_COUNT|put_del|DeleteObject/);
    expect(verifySrc).toMatch(/RO_SHAPE|ListBucket/);
    expect(verifySrc).toMatch(/REDHAT-FIX-H4|drill-neg/);

    // Real restore RO policy document (same shape as provision-fresh-restore-target / fresh-target.md).
    const roPolicy = restoreReadOnlyPolicy('holocron-backup');
    const putDel = countPutDeleteActions(roPolicy);
    expect(putDel, 'restore RO policy must have PutObject/DeleteObject count = 0').toBe(0);

    // Backup RW policy from config.ts must contrast (still has Put/Delete) — negative control.
    const configSrc = read(BACKUP_CONFIG);
    expect(configSrc).toMatch(/s3:PutObject/);
    expect(configSrc).toMatch(/s3:DeleteObject/);
    // buildBackupCredentialPolicy allows writes — must not be used as restore token policy.
    expect(configSrc).toMatch(/buildBackupCredentialPolicy/);

    const freshMd = read(FRESH_TARGET_MD);
    // Documented restore policy is List/Get only.
    expect(freshMd).toMatch(/s3:GetObject/);
    expect(freshMd).toMatch(/s3:ListBucket/);
    // In the restore policy example block, Put/Delete must not appear as allowed actions.
    const policyBlock = freshMd.match(/### IAM-style policy[\s\S]*?```json\n([\s\S]*?)```/);
    expect(policyBlock, 'fresh-target.md must include restore RO policy JSON').toBeTruthy();
    const policyJson = policyBlock?.[1] ?? '';
    expect(countPutDeleteActions(policyJson)).toBe(0);

    writeEvidence('ac3-policy-inspect.txt', {
      restorePutDeleteCount: putDel,
      policyJson: roPolicy,
      note: 'Non-mutating proof: DeleteObject action count = 0 for restore RO policy',
    });
  });

  it('AC-4: D05-03 and scripts remove destructive existing-key control', () => {
    const targets = [D05_03, PROVE_ISOLATION, VERIFY_CREDS, PROVE_RO, FRESH_TARGET_MD];
    const hits: Array<{ path: string; lines: string[] }> = [];
    for (const path of targets) {
      const body = read(path);
      const lines = body.split('\n').filter((line) => DESTRUCTIVE_EXISTING_RE.test(line));
      if (lines.length > 0) {
        hits.push({ path, lines });
      }
    }
    writeEvidence('ac4-no-existing-key-rm.txt', {
      hits,
      pattern: String(DESTRUCTIVE_EXISTING_RE),
      checked: targets,
    });
    expect(
      hits,
      `REDHAT-FIX-H4: destructive existing-key rm must not remain; hits=${JSON.stringify(hits)}`
    ).toEqual([]);

    // Positive: sacrificial path is documented.
    const d05 = read(D05_03);
    expect(d05).toMatch(/drill-neg/);
    expect(d05).toMatch(/sacrificial|REDHAT-FIX-H4|denylist/i);

    const proveIso = read(PROVE_ISOLATION);
    expect(proveIso).toMatch(/drill-neg|REDHAT-FIX-H4/);

    const verify = read(VERIFY_CREDS);
    expect(verify).toMatch(/--assert-denylisted|--assert-safe-key|drill-neg/);
  });

  it('AC-5: suite fails closed if live-key destructive control is present', () => {
    // Red-first contract: if prove-r2-readonly still pointed deletes at "existing", fail.
    const proveSrc = read(PROVE_RO);
    const liveKeyDelete =
      /aws s3api delete-object[\s\S]{0,200}--key ["']?existing["']?/.test(proveSrc) ||
      /aws s3 rm[^\n]*\/existing\b/.test(proveSrc) ||
      DESTRUCTIVE_EXISTING_RE.test(proveSrc);

    expect(
      liveKeyDelete,
      'prove-r2-readonly must not contain live-key destructive delete control'
    ).toBe(false);

    // Simulated pre-fix baseline would have been D05-03 AC-2 with existing-key rm.
    const d05 = read(D05_03);
    expect(DESTRUCTIVE_EXISTING_RE.test(d05)).toBe(false);
    // Redesign markers must be present (GREEN only with sacrificial proof).
    expect(d05 + proveSrc).toMatch(/drill-neg/);
    expect(proveSrc).toMatch(/is_sacrificial_drill_neg_key|make_sacrificial_drill_neg_key/);

    // End-to-end denylist self-check used by verify-restore-creds (H4 block).
    expect(existsSync(VERIFY_CREDS)).toBe(true);
    const verifySrc = read(VERIFY_CREDS);
    expect(verifySrc).toMatch(/H4_DENYLIST_OK|REDHAT-FIX-H4 denylist/);

    writeEvidence('ac5-fail-closed.txt', {
      liveKeyDelete,
      hasDrillNeg: /drill-neg/.test(proveSrc),
      hasDenylist: /matches_live_recovery_key/.test(proveSrc),
      verdict: 'GREEN: sacrificial redesign present; live-key destructive control absent',
    });
  });
});
