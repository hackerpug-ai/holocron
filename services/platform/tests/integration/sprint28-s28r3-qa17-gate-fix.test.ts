/**
 * GATE-FIX-S28R3-QA17 — Credential path + oracle closure.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  baseHarnessEnv,
  type HarnessPaths,
  makeHarness,
} from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_PROV = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_PROVIDER = resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py');
const PROD_LIVE = resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA17');

let H: HarnessPaths;

beforeAll(() => {
  H = makeHarness(REPO_ROOT, EVIDENCE);
});

function writeEv(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE, name),
    typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`
  );
}

describe('GATE-FIX-S28R3-QA17 production source free of credential PATH seams', () => {
  it('production fire-drill refuses ambient BUN_BIN and FAKE_VOLUMES', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).toMatch(/refuses ambient BUN_BIN/);
    expect(src).not.toMatch(/BUN_BIN="\$\{BUN_BIN:-bun\}"/);
    expect(src).not.toMatch(/fake-volumes-unit-test/);
    expect(src).toMatch(/refuses HOLO_FIRE_DRILL_FAKE_VOLUMES/);
    // No bare openssl for credential fingerprints
    expect(src).not.toMatch(/openssl dgst/);
  });

  it('production consumers do not pass mock-provider knobs', () => {
    for (const f of [PROD_FIRE, PROD_PROV]) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/HOLO_R2_PROVIDER_MOCK_MODE="\$\{HOLO_R2_PROVIDER_MOCK_MODE/);
    }
  });

  it('r2-ro-live hashes via python provider not openssl', () => {
    const src = readFileSync(PROD_LIVE, 'utf8');
    expect(src).toMatch(/r2_ro_fp16_fields/);
    expect(src).not.toMatch(/openssl dgst/);
  });

  it('production refuse BUN_BIN when set', () => {
    const run = spawnSync('bash', [PROD_FIRE, '--host', 'x', '--resolve-only'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        PATH: '/usr/bin:/bin',
        BUN_BIN: '/tmp/evil-bun',
        HOME: process.env.HOME,
      },
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/BUN_BIN|ambient/i);
  });

  it('production refuse HOLO_CLI via historical name still fixed', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).toMatch(/HOLO_CLI="\$ROOT\/services\/platform\/src\/cli\/holo\.ts"/);
  });
});

describe('GATE-FIX-S28R3-QA17 SigV4 path encoding', () => {
  it('provider encodes reserved characters in object path', () => {
    const run = spawnSync(
      '/usr/bin/python3',
      [
        '-c',
        `
import importlib.util
spec=importlib.util.spec_from_file_location('p', ${JSON.stringify(PROD_PROVIDER)})
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
path=m._encode_s3_path('holocron-backup', 'pgbackrest/a b/#%x/ü.bin')
assert '%20' in path or '%23' in path
assert path.startswith('/holocron-backup/')
assert '/pgbackrest/' in path or 'pgbackrest' in path
print(path)
`,
      ],
      { encoding: 'utf8' }
    );
    writeEv('sigv4-encode.txt', `${run.stdout}${run.stderr}`);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/%23|%20/);
  });

  it('provider rejects hostile PYTHONPATH', () => {
    const run = spawnSync('/usr/bin/python3', [PROD_PROVIDER, 'fp16', 'a'], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: '/tmp/evil-site-packages' },
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/hostile Python|PYTHONPATH/i);
  });
});

describe('GATE-FIX-S28R3-QA17 harness still works after production seam strip', () => {
  it('harness prove succeeds with mock provider', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseHarnessEnv(REPO_ROOT, {
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: 'AKIA_QA17',
        R2_SECRET_ACCESS_KEY: 'sk_w',
        R2_SESSION_TOKEN: 'st',
        R2_RESTORE_ACCESS_KEY_ID: 'AKIA_QA17',
        R2_RESTORE_SECRET_ACCESS_KEY: 'sk_r',
        R2_RESTORE_SESSION_TOKEN: 'st',
        HOLO_R2_PROVIDER_MOCK_MODE: 'default',
      }),
    });
    writeEv('harness-prove.json', {
      status: run.status,
      out: `${run.stdout}${run.stderr}`.slice(0, 2000),
    });
    expect(run.status).toBe(0);
    const m = `${run.stdout}${run.stderr}`.match(/wrote RO proof attestation:\s+(\S+)/);
    expect(m?.[1] && existsSync(m[1])).toBeTruthy();
    const proof = JSON.parse(readFileSync(m![1]!, 'utf8')) as Record<string, unknown>;
    expect(proof.scope_probes_bound).toBe(true);
    expect(proof.scope_probes_versioned_config).toBe('scripts/lib/r2-scope-probes.json');
  });
});

describe('GATE-FIX-S28R3-QA17 production refuses HOLO_CLI override env when present', () => {
  it('source pins fixed CLI path', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).not.toMatch(/HOLO_CLI="\$\{HOLO_CLI:-/);
  });
});
