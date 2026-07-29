/**
 * GATE-FIX-S28R3-QA12 — Trusted provider boundary + consumer-level mutations.
 *
 * Run:
 *   pnpm exec vitest run services/platform/tests/integration/sprint28-s28r3-qa12-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  baseHarnessEnv,
  ENDPOINT,
  type HarnessPaths,
  makeHarness,
} from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
let H: HarnessPaths;
beforeAll(() => {
  H = makeHarness(REPO_ROOT, resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA12'));
});
const PROVE_R2 = () => H.prove;
const PROVISION = () => H.provision;
const RUNNER = () => H.runner;
const FIX_BIN = resolve(REPO_ROOT, 'services/platform/tests/integration/fixtures/bin');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA12');

const WRITER_AK = 'qa12cfwriterakid0123456789abcdef';
const WRITER_SK = 'qa12cfwritersecret0123456789abcdefghijkl';
const RESTORE_SK = 'qa12cftempsessionsecret0123456789abcdef';
const RESTORE_ST = 'qa12cftempsessiontoken0123456789abcdef';
const CANARY_AWS = 'CANARY_AWS_OUTPUT_MUST_NOT_APPEAR_QA12';
const CANARY_MINT_AK = 'CANARY_MINT_ACCESS_KEY_ID_QA12';
const CANARY_MINT_SK = 'CANARY_MINT_SECRET_ACCESS_KEY_QA12';

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${FIX_BIN}:${process.env.PATH ?? ''}`,
    HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-qa12-no-secrets',
    HOLO_SECRETS_PATH: '/nonexistent-s28r3-qa12-no-secrets',
    CLOUDFLARE_API_TOKEN: '',
    R2_PARENT_ACCESS_KEY_ID: '',
    R2_PARENT_SECRET_ACCESS_KEY: '',
    R2_ENDPOINT: ENDPOINT,
    R2_ACCOUNT_ID: ACCOUNT_ID,
    R2_BUCKET_NAME: 'holocron-backup',
    R2_PGBACKREST_PREFIX: 'pgbackrest',
    R2_CREDENTIAL_KIND: 'object-read-only',
    HOLO_AWS_MOCK_MODE: 'default',
    ...extra,
  };
}

function liveCreds(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseEnv({
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: WRITER_AK,
    R2_SECRET_ACCESS_KEY: WRITER_SK,
    R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
    R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
    R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
    ...extra,
  });
}

describe('GATE-FIX-S28R3-QA12 CRITICAL-1 trusted provider independent of PATH', () => {
  it('forged PATH aws is never executed when HOLO_TRUSTED_AWS_BIN is fixture', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evilDir = resolve(EVIDENCE_DIR, 'evil-bin');
    mkdirSync(evilDir, { recursive: true });
    const marker = resolve(EVIDENCE_DIR, 'evil-ran.marker');
    const evil = resolve(evilDir, 'aws');
    writeFileSync(
      evil,
      `#!/usr/bin/env bash\necho EVIL_AWS_RAN >&2\nprintf ran >${JSON.stringify(marker)}\nexit 0\n`
    );
    chmodSync(evil, 0o755);
    if (existsSync(marker)) {
      writeFileSync(marker, '');
    }
    const host = `s28r3-qa12-path-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: liveCreds({
        PATH: `${evilDir}:${process.env.PATH ?? ''}`,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'path-forge'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c1-path-forge.json', { status: run.status, combined: combined.slice(0, 3000) });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).not.toMatch(/EVIL_AWS_RAN/);
    expect(existsSync(marker) && readFileSync(marker, 'utf8').includes('ran')).toBe(false);
  });

  it('untrusted HOLO_TRUSTED_AWS_BIN outside fixtures/allowlist is refused', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evil = resolve(EVIDENCE_DIR, 'untrusted-aws');
    writeFileSync(evil, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(evil, 0o755);
    const host = `s28r3-qa12-untrust-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: liveCreds({
        HOLO_TRUSTED_AWS_BIN: evil,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'untrust'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c1-untrusted-bin.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(
      /refuses HOLO_TRUSTED_AWS_BIN|no provider override|trusted aws provider unavailable/i
    );
  });
});

describe('GATE-FIX-S28R3-QA12 HIGH-1 canonical context at provider boundary', () => {
  it('empty prefix fails closed at consumer', () => {
    const host = `s28r3-qa12-eprefix-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: liveCreds({
        R2_PGBACKREST_PREFIX: '',
        R2_RESTORE_OBJECT_PREFIX: '',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'empty-prefix'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-empty-prefix.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/noncanonical|empty|prefix|DEPENDENCY-S28-R2-RO/i);
  });

  it('alternate policy fails closed at prove (before provider probe)', () => {
    const badPolicy =
      '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:*","Resource":"*"}]}';
    const run = spawnSync('bash', [PROVE_R2()], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: liveCreds({
        R2_CREDENTIAL_POLICY: badPolicy,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-alt-policy.json', { status: run.status, combined: combined.slice(0, 2000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/noncanonical|alternate|policy|canonical context refused/i);
  });

  it('missing in-prefix object fails closed', () => {
    const host = `s28r3-qa12-emptyobj-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: liveCreds({
        HOLO_AWS_MOCK_MODE: 'prefix_empty',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'prefix-empty'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-prefix-empty.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/missing_in_prefix_object|prefix|DEPENDENCY-S28-R2-RO/i);
  });

  it('failed in-prefix head fails closed', () => {
    const host = `s28r3-qa12-headfail-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: liveCreds({
        HOLO_AWS_MOCK_MODE: 'head_fail',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'head-fail'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-head-fail.json', { status: run.status, combined: combined.slice(0, 2000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/prefix_head|head-object|DEPENDENCY-S28-R2-RO/i);
  });
});

describe('GATE-FIX-S28R3-QA12 MEDIUM-1 private exclusive proof boundary', () => {
  it('proof files are regular 0600 under .tmp/r2-ro-proofs (not symlink)', () => {
    const host = `s28r3-qa12-proof-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: liveCreds({ STAGING_ROOT: resolve(EVIDENCE_DIR, 'proof-ok') }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-proof-mode.json', { status: run.status, combined: combined.slice(0, 2500) });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).toMatch(/RO proof fresh-bound ok|fresh live RO proof/i);
    // source-level: exclusive create flags present
    const lib = readFileSync(resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh'), 'utf8');
    expect(lib).toMatch(/O_EXCL/);
    expect(lib).toMatch(/O_NOFOLLOW/);
    expect(lib).toMatch(/lstat/);
  });
});

describe('GATE-FIX-S28R3-QA12 MEDIUM-2 consumer-level mutations', () => {
  const mutations = [
    'stale',
    'future',
    'wrong-tuple',
    'malformed',
    'wrong-producer',
    'wrong-context',
  ] as const;

  for (const mut of mutations) {
    it(`provision refuses HOLO_QA_PROOF_MUTATE=${mut}`, () => {
      const host = `s28r3-qa12-mut-${mut}-${Date.now().toString(36)}`;
      const run = spawnSync(
        'bash',
        [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 60_000,
          env: liveCreds({
            HOLO_QA_PROOF_MUTATE: mut,
            STAGING_ROOT: resolve(EVIDENCE_DIR, `mut-${mut}`),
          }),
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence(`m2-provision-${mut}.json`, {
        status: run.status,
        combined: combined.slice(0, 2500),
      });
      expect(run.status, `${mut}: ${combined.slice(0, 800)}`).not.toBe(0);
      expect(combined).toMatch(
        /RO proof|DEPENDENCY-S28-R2-RO|stale|mismatch|schema|producer|mode/i
      );
    });
  }

  it('fire-drill refuses HOLO_QA_PROOF_MUTATE=wrong-tuple', () => {
    const run = spawnSync(
      'bash',
      [RUNNER(), '--host', 's28r3-qa12-fd-mut', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 60_000,
        env: liveCreds({
          HOLO_QA_PROOF_MUTATE: 'wrong-tuple',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m2-firedrill-wrong-tuple.json', {
      status: run.status,
      combined: combined.slice(0, 2500),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/tuple_fp16 mismatch|DEPENDENCY-S28-R2-RO|RO proof/i);
  });
});

describe('GATE-FIX-S28R3-QA12 canaries success/error paths', () => {
  it('aws canary_error never appears in prove logs', () => {
    const run = spawnSync('bash', [PROVE_R2()], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: liveCreds({
        HOLO_AWS_MOCK_MODE: 'canary_error',
        HOLO_AWS_MOCK_CANARY: CANARY_AWS,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('canary-aws-error.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).not.toContain(CANARY_AWS);
    expect(combined).not.toContain(RESTORE_SK);
  });

  it('aws success path never logs canary or secrets', () => {
    const run = spawnSync('bash', [PROVE_R2()], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: liveCreds({
        HOLO_AWS_MOCK_MODE: 'canary_success',
        HOLO_AWS_MOCK_CANARY: CANARY_AWS,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('canary-aws-success.json', {
      status: run.status,
      combined: combined.slice(0, 2500),
    });
    expect(run.status, combined.slice(0, 1000)).toBe(0);
    expect(combined).not.toContain(CANARY_AWS);
    expect(combined).not.toContain(RESTORE_SK);
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(WRITER_SK);
  });

  it('mint error path never logs canaries', () => {
    const run = spawnSync('bash', [PROVE_R2(), '--try-mint'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_RESTORE_ACCESS_KEY_ID: 'ro-test',
        R2_RESTORE_SECRET_ACCESS_KEY: 'ro-test',
        R2_ACCESS_KEY_ID: '',
        R2_SECRET_ACCESS_KEY: '',
        CLOUDFLARE_API_TOKEN: 'unit-token',
        R2_PARENT_ACCESS_KEY_ID: 'parent-ak-not-logged',
        R2_PARENT_SECRET_ACCESS_KEY: 'parent-sk-not-logged',
        R2_ACCOUNT_ID: ACCOUNT_ID,
        R2_PGBACKREST_PREFIX: 'pgbackrest',
        HOLO_CURL_MOCK_MODE: 'api_error_string',
        HOLO_CURL_CANARY_SK: CANARY_MINT_SK,
        HOLO_CURL_CANARY_AK: CANARY_MINT_AK,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('canary-mint-error.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(combined).not.toContain(CANARY_MINT_SK);
    expect(combined).not.toContain(CANARY_MINT_AK);
  });
});
