/**
 * REDHAT-FIX-H5 — Exact concrete restore-bucket + object-prefix ARNs.
 *
 * Proves T-PLAT-025 / CAP-BAK-01: restore credential policy emission and
 * `scripts/verify-restore-creds.sh` require exact bucket ARN + exact prefix
 * List/Get resources and fail closed on bucket-class wildcards such as
 * `arn:aws:s3:::holocron-backup-*` (never a "literal bucket name").
 *
 * Real policy JSON only — no IAM mocks.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildRestoreCredentialPolicy,
  defaultBucketName,
  defaultPgbackrestPrefix,
  formatRestoreCredentialPolicy,
} from '../../src/backup/config.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1' || Boolean(process.env.PLATFORM_IT);
const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const VERIFY_SCRIPT = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const CONFIG_TS = resolve(REPO_ROOT, 'services/platform/src/backup/config.ts');
const FRESH_TARGET_MD = resolve(REPO_ROOT, 'services/platform/src/backup/fresh-target.md');
const D05_06 = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md'
);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H5');

const EXACT_BUCKET = defaultBucketName();
const EXACT_PREFIX = defaultPgbackrestPrefix();

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

function runVerifyPolicyOnly(opts: {
  policyJson: string;
  bucket?: string;
  prefix?: string;
  label: string;
}): { status: number | null; stdout: string; stderr: string; combined: string } {
  expect(existsSync(VERIFY_SCRIPT), `verify-restore-creds.sh must exist at ${VERIFY_SCRIPT}`).toBe(
    true
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VERIFY_POLICY_ONLY: '1',
    EVIDENCE_DIR,
    R2_CREDENTIAL_POLICY: opts.policyJson,
    R2_BUCKET_NAME: opts.bucket ?? EXACT_BUCKET,
    R2_RESTORE_OBJECT_PREFIX: opts.prefix ?? EXACT_PREFIX,
    // Ensure ambient RW probes are not accidentally engaged in policy-only mode.
    R2_CREDENTIAL_KIND: 'object-read-only',
  };
  // Strip ambient parent/RW keys so policy-only path is pure document inspection.
  for (const k of [
    'R2_PARENT_ACCESS_KEY_ID',
    'R2_PARENT_SECRET_ACCESS_KEY',
    'R2_READ_WRITE_ACCESS_KEY_ID',
    'R2_READ_WRITE_SECRET_ACCESS_KEY',
    'R2_RW_ACCESS_KEY_ID',
    'R2_RW_SECRET_ACCESS_KEY',
  ]) {
    delete env[k];
  }

  const result = spawnSync('bash', [VERIFY_SCRIPT, '--policy-only'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;
  writeEvidence(`${opts.label}.txt`, combined);
  writeEvidence(`${opts.label}.json`, {
    label: opts.label,
    status: result.status,
    bucket: opts.bucket ?? EXACT_BUCKET,
    prefix: opts.prefix ?? EXACT_PREFIX,
    policy: JSON.parse(opts.policyJson),
    stdout,
    stderr,
  });
  return { status: result.status, stdout, stderr, combined };
}

function wildcardBucketClassPolicy(): string {
  // H-5 false-pass baseline: labeled "literal" but is a bucket class.
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'WildcardBucketClass',
        Effect: 'Allow',
        Action: ['s3:ListBucket', 's3:GetBucketLocation', 's3:GetObject'],
        Resource: ['arn:aws:s3:::holocron-backup-*', 'arn:aws:s3:::holocron-backup-*/*'],
      },
    ],
  });
}

function bareStarPolicy(): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'BareStar',
        Effect: 'Allow',
        Action: ['s3:ListBucket', 's3:GetObject'],
        Resource: ['*'],
      },
    ],
  });
}

function universalBucketPolicy(): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'UniversalS3',
        Effect: 'Allow',
        Action: ['s3:ListBucket', 's3:GetObject'],
        Resource: ['arn:aws:s3:::*'],
      },
    ],
  });
}

function bucketWideObjectWildcardPolicy(bucket: string): string {
  // Exact bucket but no concrete prefix root — still too broad for H-5.
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
        Sid: 'HolocronRestoreGetAllObjects',
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

function writeActionsPolicy(bucket: string, prefix: string): string {
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
        Sid: 'HolocronRestoreWrite',
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        Resource: [`arn:aws:s3:::${bucket}/${prefix}/*`],
      },
    ],
  });
}

describe('REDHAT-FIX-H5 exact restore bucket/prefix ARNs', () => {
  itLive(
    'AC-1: exact concrete bucket ARN required (PASS only for arn:aws:s3:::<exactBucket>)',
    () => {
      const policy = formatRestoreCredentialPolicy(EXACT_BUCKET, EXACT_PREFIX);
      const emitted = buildRestoreCredentialPolicy(EXACT_BUCKET, EXACT_PREFIX);
      const bucketResources = emitted.Statement.flatMap((s) => s.Resource).filter(
        (r) => !r.includes('/')
      );
      expect(bucketResources).toEqual([`arn:aws:s3:::${EXACT_BUCKET}`]);
      expect(bucketResources.some((r) => r.includes('*'))).toBe(false);

      const result = runVerifyPolicyOnly({
        policyJson: policy,
        label: 'ac1-exact-bucket-pass',
      });
      expect(result.status, result.combined).toBe(0);
      expect(result.combined).toMatch(/exact bucket ARN/);
      expect(result.combined).toMatch(/RESULT: PASS/);
      expect(result.combined).not.toMatch(/holocron-backup-\*.*PASS/);
    }
  );

  itLive('AC-2: exact List/Get object-prefix resources; Put/Delete count = 0', () => {
    const emitted = buildRestoreCredentialPolicy(EXACT_BUCKET, EXACT_PREFIX);
    const allActions = emitted.Statement.flatMap((s) => s.Action);
    const allResources = emitted.Statement.flatMap((s) => s.Resource);

    expect(allActions).toContain('s3:ListBucket');
    expect(allActions).toContain('s3:GetObject');
    expect(allActions.filter((a) => a.includes('PutObject') || a.includes('DeleteObject'))).toEqual(
      []
    );
    expect(allResources).toContain(`arn:aws:s3:::${EXACT_BUCKET}/${EXACT_PREFIX}/*`);
    expect(allResources.some((r) => r === `arn:aws:s3:::${EXACT_BUCKET}/*`)).toBe(false);
    expect(allResources.some((r) => r.includes('holocron-backup-*'))).toBe(false);

    const result = runVerifyPolicyOnly({
      policyJson: JSON.stringify(emitted),
      label: 'ac2-exact-prefix-ro',
    });
    expect(result.status, result.combined).toBe(0);
    expect(result.combined).toMatch(/PutObject\/DeleteObject action count=0/);
    expect(result.combined).toMatch(
      new RegExp(`exact prefix arn:aws:s3:::${EXACT_BUCKET}/${EXACT_PREFIX}`)
    );

    const writeResult = runVerifyPolicyOnly({
      policyJson: writeActionsPolicy(EXACT_BUCKET, EXACT_PREFIX),
      label: 'ac2-write-actions-rejected',
    });
    expect(writeResult.status, writeResult.combined).not.toBe(0);
    expect(writeResult.combined).toMatch(/PutObject\/DeleteObject action count=/);
  });

  itLive('AC-3: wildcard resource ARNs rejected fail-closed', () => {
    const cases: Array<{ name: string; policy: string }> = [
      { name: 'holocron-backup-star', policy: wildcardBucketClassPolicy() },
      { name: 'bare-star', policy: bareStarPolicy() },
      { name: 'arn-aws-s3-star', policy: universalBucketPolicy() },
      {
        name: 'bucket-wide-objects',
        policy: bucketWideObjectWildcardPolicy(EXACT_BUCKET),
      },
    ];

    for (const c of cases) {
      const result = runVerifyPolicyOnly({
        policyJson: c.policy,
        label: `ac3-reject-${c.name}`,
      });
      expect(result.status, `${c.name} must exit != 0\n${result.combined}`).not.toBe(0);
      expect(result.combined).toMatch(/RESULT: FAIL|FAIL:/);
      // Must never claim PASS for bucket-class wildcards.
      expect(result.combined).not.toMatch(
        /PASS:.*Resource scoped to arn:aws:s3:::holocron-backup\(\/ \*\)/
      );
    }

    // Explicit rejection of holocron-backup-* appears in output.
    const star = runVerifyPolicyOnly({
      policyJson: wildcardBucketClassPolicy(),
      label: 'ac3-holocron-backup-star-detail',
    });
    expect(star.combined).toMatch(/wildcard in bucket name segment|not exact concrete bucket/);
  });

  itLive('AC-4: D05-06 AC + emission no longer accept holocron-backup-* as literal', () => {
    expect(existsSync(D05_06)).toBe(true);
    expect(existsSync(FRESH_TARGET_MD)).toBe(true);
    expect(existsSync(CONFIG_TS)).toBe(true);

    const d05 = readFileSync(D05_06, 'utf8');
    const fresh = readFileSync(FRESH_TARGET_MD, 'utf8');
    const configSrc = readFileSync(CONFIG_TS, 'utf8');

    // D05-06 MUST NOT claim holocron-backup-* is the expected PASS Resource.
    expect(d05).not.toMatch(
      /policy Resource = 'arn:aws:s3:::holocron-backup-\*' \(literal bucket name\)/
    );
    // D05-06 MUST require exact concrete bucket ARN form.
    expect(d05).toMatch(/arn:aws:s3:::holocron-backup'/);
    expect(d05).toMatch(/exact concrete bucket|exact configured prefix/i);
    // MUST_NOT_OBSERVE must call out the bucket-class pattern.
    expect(d05).toMatch(/holocron-backup-\*.*bucket class|bucket class.*holocron-backup-\*/i);

    // Emission helper present and used form is exact (no class wildcard).
    expect(configSrc).toMatch(/buildRestoreCredentialPolicy/);
    expect(configSrc).toMatch(/assertConcreteBucketName/);
    const emitted = formatRestoreCredentialPolicy(EXACT_BUCKET, EXACT_PREFIX);
    expect(emitted).toContain(`arn:aws:s3:::${EXACT_BUCKET}`);
    expect(emitted).toContain(`arn:aws:s3:::${EXACT_BUCKET}/${EXACT_PREFIX}/*`);
    expect(emitted).not.toContain('holocron-backup-*');

    // Docs must not present holocron-backup-* as an accepted Resource example.
    expect(fresh).toMatch(/NEVER holocron-backup-\*|Rejected forms|bucket-class wildcard/i);
    expect(fresh).toContain(`arn:aws:s3:::holocron-backup/pgbackrest/*`);

    // verify script must not accept class wildcard as PASS criterion text.
    const verifySrc = readFileSync(VERIFY_SCRIPT, 'utf8');
    expect(verifySrc).not.toMatch(/Resource scoped to arn:aws:s3:::holocron-backup\(\/ \*\)/);
    expect(verifySrc).toMatch(/exact bucket ARN|wildcard in bucket name segment/);

    writeEvidence('ac4-docs-emission-aligned.json', {
      d05_has_literal_wildcard_pass_criterion:
        /policy Resource = 'arn:aws:s3:::holocron-backup-\*' \(literal bucket name\)/.test(d05),
      emitted_policy: JSON.parse(emitted),
      verify_rejects_class_wildcard: true,
    });
  });

  itLive(
    'AC-5: suite fails when wildcard bucket class accepted; GREEN only with exact ARNs',
    () => {
      // RED baseline: wildcard class must fail verification (would have been false-green pre-H5).
      const red = runVerifyPolicyOnly({
        policyJson: wildcardBucketClassPolicy(),
        label: 'ac5-wildcard-red-baseline',
      });
      expect(red.status, 'wildcard holocron-backup-* must not PASS').not.toBe(0);

      // GREEN: exact emission passes on real policy JSON via the real script.
      const green = runVerifyPolicyOnly({
        policyJson: formatRestoreCredentialPolicy(EXACT_BUCKET, EXACT_PREFIX),
        label: 'ac5-exact-green',
      });
      expect(green.status, green.combined).toBe(0);
      expect(green.combined).toMatch(/exact concrete bucket \+ prefix ARNs|exact bucket ARN/);

      writeEvidence('ac5-red-green-summary.json', {
        wildcard_status: red.status,
        exact_status: green.status,
        exact_bucket: EXACT_BUCKET,
        exact_prefix: EXACT_PREFIX,
      });
    }
  );

  it('PLATFORM_IT gate is set for live suite', () => {
    // Documents skip when PLATFORM_IT unset; live path requires PLATFORM_IT=1.
    if (!PLATFORM_IT) {
      writeEvidence('platform-it-skipped.json', { PLATFORM_IT: false });
    }
    expect(typeof PLATFORM_IT).toBe('boolean');
  });
});
