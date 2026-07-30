/**
 * GATE-FIX-S28R3-QA16 — Versioned scope-probe binding (non-overridable in production).
 *
 * RED evidence: without versioned artifact / with env override / with path override,
 * production prove fails closed. GREEN: versioned keys bind from scripts/lib only.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  baseHarnessEnv,
  type HarnessPaths,
  makeHarness,
  SCOPE_IN,
  SCOPE_OUT,
} from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_PROBES = resolve(REPO_ROOT, 'scripts/lib/r2-scope-probes.json');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA16');

const TRUSTED = JSON.parse(readFileSync(PROD_PROBES, 'utf8')) as {
  schema: string;
  bucket: string;
  prefix: string;
  in_key: string;
  out_key: string;
  object_created: boolean;
};

let H: HarnessPaths;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function prodEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const derivedEp = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return {
    PATH: '/usr/bin:/bin',
    HOME: process.env.HOME,
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCOUNT_ID: ACCOUNT_ID,
    R2_ENDPOINT: derivedEp,
    R2_ACCESS_KEY_ID: 'AKIA_QA16_TEST',
    R2_SECRET_ACCESS_KEY: 'secret_qa16',
    R2_SESSION_TOKEN: 'tok_qa16',
    R2_RESTORE_ACCESS_KEY_ID: 'AKIA_QA16_TEST',
    R2_RESTORE_SECRET_ACCESS_KEY: 'secret2_qa16',
    R2_RESTORE_SESSION_TOKEN: 'tok_qa16',
    R2_BUCKET_NAME: 'holocron-backup',
    R2_PGBACKREST_PREFIX: 'pgbackrest',
    R2_CREDENTIAL_KIND: 'object-read-only',
    ...extra,
  };
}

function harnessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseHarnessEnv(REPO_ROOT, {
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: 'AKIA_QA16_H',
    R2_SECRET_ACCESS_KEY: 'sk_writer',
    R2_SESSION_TOKEN: 'st',
    R2_RESTORE_ACCESS_KEY_ID: 'AKIA_QA16_H',
    R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore',
    R2_RESTORE_SESSION_TOKEN: 'st',
    HOLO_R2_PROVIDER_MOCK_MODE: 'default',
    HOLO_AWS_MOCK_MODE: 'default',
    ...extra,
  });
}

beforeAll(() => {
  H = makeHarness(REPO_ROOT, EVIDENCE_DIR);
});

describe('GATE-FIX-S28R3-QA16 versioned scope-probe artifact', () => {
  it('versioned probes JSON is non-secret and prefix-valid', () => {
    expect(TRUSTED.schema).toBe('holo.r2-scope-probes.v1');
    expect(TRUSTED.bucket).toBe('holocron-backup');
    expect(TRUSTED.prefix).toBe('pgbackrest');
    expect(TRUSTED.object_created).toBe(false);
    expect(TRUSTED.in_key.startsWith('pgbackrest/')).toBe(true);
    expect(TRUSTED.out_key.startsWith('pgbackrest')).toBe(false);
    const raw = readFileSync(PROD_PROBES, 'utf8').toLowerCase();
    expect(raw).not.toMatch(/aws_secret|session_token|password|bearer /);
    // No credential field names
    const keys = Object.keys(TRUSTED);
    for (const k of keys) {
      expect(k.toLowerCase()).not.toMatch(/secret|password|token|credential|access_key/);
    }
  });

  it('production refuses env override of versioned in_key (RED→GREEN kill)', () => {
    const run = spawnSync('bash', [PROD_PROVE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: prodEnv({
        R2_SCOPE_PROBE_IN_KEY: 'pgbackrest/attacker-replaced-key.bin',
        R2_SCOPE_PROBE_OUT_KEY: TRUSTED.out_key,
      }),
    });
    writeEvidence('red-env-override-in.json', {
      status: run.status,
      combined: `${run.stdout}${run.stderr}`.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(
      /refuses env override.*IN_KEY|versioned R2_SCOPE_PROBE_IN_KEY/i
    );
  });

  it('production refuses env override of versioned out_key', () => {
    const run = spawnSync('bash', [PROD_PROVE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: prodEnv({
        R2_SCOPE_PROBE_IN_KEY: TRUSTED.in_key,
        R2_SCOPE_PROBE_OUT_KEY: 'attacker/out-of-prefix.bin',
      }),
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(
      /refuses env override.*OUT_KEY|versioned R2_SCOPE_PROBE_OUT_KEY/i
    );
  });

  it('production refuses path override env HOLO_SCOPE_PROBES_JSON', () => {
    const run = spawnSync('bash', [PROD_PROVE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: prodEnv({
        HOLO_SCOPE_PROBES_JSON: '/tmp/evil-scope-probes.json',
      }),
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/path override|versioned binding/i);
  });

  it('production refuses R2_RO_SCOPE_PROBES_JSON_OVERRIDE', () => {
    const run = spawnSync('bash', [PROD_PROVE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: prodEnv({
        R2_RO_SCOPE_PROBES_JSON_OVERRIDE: '/tmp/evil.json',
      }),
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/path override|versioned binding/i);
  });

  it('production binds versioned keys when env probe keys are unset', () => {
    // Context establishment happens before live R2 calls; override failure is at bind time.
    // With unset keys + valid shape, we should get past bind into provider (then fail on fake creds).
    const run = spawnSync('bash', [PROD_PROVE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: prodEnv({
        R2_SCOPE_PROBE_IN_KEY: '',
        R2_SCOPE_PROBE_OUT_KEY: '',
      }),
    });
    const combined = `${run.stdout}${run.stderr}`;
    writeEvidence('bind-without-env-keys.json', {
      status: run.status,
      combined: combined.slice(0, 2500),
    });
    // Must not fail on missing scope probes — versioned artifact supplies them.
    expect(combined).not.toMatch(
      /missing versioned scope probe|missing known-existing scope probe/i
    );
    expect(combined).not.toMatch(/refuses env override/i);
    // Fake credentials fail later at provider; still proves bind accepted versioned keys.
    expect(run.status).not.toBe(0);
  });

  it('malformed versioned artifact fails closed (isolated tree — never mutates tracked probes)', () => {
    // GATE-FIX-S28R3-QA22: hermetic — do NOT temporarily replace tracked
    // scripts/lib/r2-scope-probes.json (races with parallel harness makers).
    // Use an isolated script tree with a bad probes schema instead.
    const original = readFileSync(PROD_PROBES);
    const tree = mkdtempSync(join(tmpdir(), 'qa16-malformed-'));
    try {
      mkdirSync(join(tree, 'scripts', 'lib'), { recursive: true });
      copyFileSync(PROD_PROVE, join(tree, 'scripts', 'prove-r2-readonly.sh'));
      copyFileSync(
        resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh'),
        join(tree, 'scripts', 'lib', 'r2-ro-live.sh')
      );
      copyFileSync(
        resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py'),
        join(tree, 'scripts', 'lib', 'r2_s3_provider.py')
      );
      writeFileSync(
        join(tree, 'scripts', 'lib', 'r2-scope-probes.json'),
        '{ "schema": "bad" }\n',
        'utf8'
      );
      const run = spawnSync('bash', [join(tree, 'scripts', 'prove-r2-readonly.sh')], {
        cwd: tree,
        encoding: 'utf8',
        timeout: 20_000,
        env: prodEnv({}),
      });
      expect(run.status).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toMatch(/schema|malformed|GATE-FIX-S28R3-QA16/i);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      // Tracked probes must remain byte-identical; no .qa16bak residue.
      expect(Buffer.compare(readFileSync(PROD_PROBES), original)).toBe(0);
      expect(existsSync(`${PROD_PROBES}.qa16bak`)).toBe(false);
    }
  });

  it('harness still allows fixture keys under mock mode only', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: harnessEnv({}),
    });
    expect(run.status).toBe(0);
    const m = `${run.stdout}${run.stderr}`.match(/wrote RO proof attestation:\s+(\S+)/);
    expect(m?.[1]).toBeTruthy();
    const proof = JSON.parse(readFileSync(m![1]!, 'utf8')) as Record<string, unknown>;
    expect(proof.scope_probe_in_key).toBe(SCOPE_IN);
    expect(proof.scope_probe_out_key).toBe(SCOPE_OUT);
    // Evidence/logs must not contain live credential canaries from prodEnv-like secrets
    const combined = `${run.stdout}${run.stderr}`;
    expect(combined).not.toMatch(/secret_qa16|AKIA_QA16_TEST|bearer /i);
    // Must not dump object body canaries
    expect(combined).not.toMatch(/SACRIFICIAL_DRILL_NEG|object body/i);
  });

  it('versioned probes file exists at fixed path and is not a symlink', () => {
    expect(existsSync(PROD_PROBES)).toBe(true);
    expect(lstatSync(PROD_PROBES).isSymbolicLink()).toBe(false);
  });
});
