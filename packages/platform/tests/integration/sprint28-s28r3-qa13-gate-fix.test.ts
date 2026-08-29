/**
 * GATE-FIX-S28R3-QA13 — Production provider pins + prefix scope + clean suite.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  baseHarnessEnv,
  type HarnessPaths,
  makeHarness,
} from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const FIX_AWS = resolve(REPO_ROOT, 'packages/platform/tests/integration/fixtures/bin/aws');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA13');

const WRITER_AK = 'qa13cfwriterakid0123456789abcdef';
const WRITER_SK = 'qa13cfwritersecret0123456789abcdefghijkl';
const RESTORE_SK = 'qa13cftempsessionsecret0123456789abcdef';
const RESTORE_ST = 'qa13cftempsessiontoken0123456789abcdef';
const CANARY_AWS = 'CANARY_AWS_OUTPUT_MUST_NOT_APPEAR_QA13';
const CANARY_MINT_AK = 'CANARY_MINT_ACCESS_KEY_ID_QA13';
const CANARY_MINT_SK = 'CANARY_MINT_SECRET_ACCESS_KEY_QA13';

let H: HarnessPaths;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseHarnessEnv(REPO_ROOT, {
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: WRITER_AK,
    R2_SECRET_ACCESS_KEY: WRITER_SK,
    R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
    R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
    R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
    ...extra,
  });
}

beforeAll(() => {
  H = makeHarness(REPO_ROOT, EVIDENCE_DIR);
});

describe('GATE-FIX-S28R3-QA13 CRITICAL-1 no production provider override', () => {
  it('production refuses HOLO_TRUSTED_AWS_BIN fixture', () => {
    const host = `s28r3-qa13-ovr-${Date.now().toString(36)}`;
    const run = spawnSync(
      'bash',
      [PROD_PROVISION, '--host', host, '--dry-run', '--skip-isolation'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: env({
          HOLO_TRUSTED_AWS_BIN: FIX_AWS,
          STAGING_ROOT: resolve(EVIDENCE_DIR, 'prod-ovr'),
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c1-prod-refuse-fixture.json', {
      status: run.status,
      combined: combined.slice(0, 2500),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/refuses HOLO_TRUSTED|provider\/test overrides|HOLO_TRUSTED_/i);
  });

  it('forged PATH aws never runs under production or harness (marker clean)', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evilDir = resolve(EVIDENCE_DIR, 'evil-bin');
    mkdirSync(evilDir, { recursive: true });
    const marker = resolve(EVIDENCE_DIR, 'evil-ran');
    const evil = resolve(evilDir, 'aws');
    writeFileSync(
      evil,
      `#!/usr/bin/env bash\nprintf ran >${JSON.stringify(marker)}\necho EVIL >&2\nexit 0\n`
    );
    chmodSync(evil, 0o755);
    const host = `s28r3-qa13-path-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [H.provision, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: env({
        PATH: `${evilDir}:${process.env.PATH ?? ''}`,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'path-ok'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c1-path-forge.json', { status: run.status, combined: combined.slice(0, 2500) });
    expect(run.status, combined.slice(0, 1200)).toBe(0);
    expect(combined).not.toMatch(/EVIL/);
    expect(existsSync(marker) && readFileSync(marker, 'utf8').includes('ran')).toBe(false);
  });
});

describe('GATE-FIX-S28R3-QA13 CRITICAL-2 curl pin for mint', () => {
  it('production source refuses bare curl and pins trusted curl resolver', () => {
    const src = readFileSync(PROD_PROVE, 'utf8');
    expect(src).toMatch(/R2_RO_CURL_BIN|r2_ro_init_trusted_helpers|\/usr\/bin\/curl/);
    expect(src).toMatch(/R2_RO_ENV_BIN|\/usr\/bin\/env/);
    // bare `curl ` invoke should not appear without path variable
    expect(src).not.toMatch(/(?<![\w/])curl -sS/);
    expect(src).toMatch(/R2_RO_CURL_BIN|r2_ro_init_trusted_helpers|HOLO_TRUSTED_/);
  });

  it('mint with HOLO_TRUSTED_CURL_BIN is refused by production', () => {
    const run = spawnSync('bash', [PROD_PROVE, '--try-mint'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: env({
        R2_RESTORE_ACCESS_KEY_ID: 'ro-test',
        R2_RESTORE_SECRET_ACCESS_KEY: 'ro-test',
        CLOUDFLARE_API_TOKEN: 'unit-token',
        R2_PARENT_ACCESS_KEY_ID: 'parent-ak',
        R2_PARENT_SECRET_ACCESS_KEY: 'parent-sk',
        HOLO_TRUSTED_CURL_BIN: resolve(
          REPO_ROOT,
          'packages/platform/tests/integration/fixtures/bin/curl'
        ),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c2-curl-override.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(combined).toMatch(/refuses HOLO_TRUSTED|HOLO_TRUSTED_|trusted helper/i);
  });
});

describe('GATE-FIX-S28R3-QA13 HIGH-1 account-bound endpoint + out-of-prefix denial', () => {
  it('endpoint mismatch vs R2_ACCOUNT_ID fails closed', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({
        R2_ENDPOINT: 'https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.r2.cloudflarestorage.com',
        R2_ACCOUNT_ID: ACCOUNT_ID,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-endpoint-mismatch.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/R2_ENDPOINT must equal|account/i);
  });

  it('non-pgbackrest prefix fails closed', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({
        R2_PGBACKREST_PREFIX: 'other-prefix',
        R2_RESTORE_OBJECT_PREFIX: 'other-prefix',
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-bad-prefix.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/pgbackrest|prefix/i);
  });

  it('broader out-of-prefix head success fails closed at harness prove', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({ HOLO_AWS_MOCK_MODE: 'broader_read', HOLO_R2_PROVIDER_MOCK_MODE: 'broader_read' }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-broader-read.json', {
      status: run.status,
      combined: combined.slice(0, 2500),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/broader_read_scope|out-of-prefix/i);
  });
});

describe('GATE-FIX-S28R3-QA13 HIGH-2 clean frozen drizzle resolution', () => {
  it('root install can resolve drizzle-orm/postgres-js', () => {
    const req = createRequire(resolve(REPO_ROOT, 'package.json'));
    const resolved = req.resolve('drizzle-orm/postgres-js');
    writeEvidence('h2-drizzle-resolve.json', { resolved });
    expect(resolved).toMatch(/drizzle-orm/);
    expect(existsSync(resolve(REPO_ROOT, 'node_modules/drizzle-orm'))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, 'node_modules/postgres'))).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['drizzle-orm']).toBeTruthy();
    expect(pkg.dependencies.postgres).toBeTruthy();
  });
});

describe('GATE-FIX-S28R3-QA13 MEDIUM-1 proof FD no-follow consumption', () => {
  it('lib validate uses dir FD + O_NOFOLLOW + fstat', () => {
    const lib = readFileSync(resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh'), 'utf8');
    expect(lib).toMatch(/dir_fd|O_DIRECTORY/);
    expect(lib).toMatch(/O_NOFOLLOW/);
    expect(lib).toMatch(/fstat/);
    expect(lib).not.toMatch(/with open\(path, "r"/);
  });
});

describe('GATE-FIX-S28R3-QA13 MEDIUM-2 two-consumer mutations + canaries', () => {
  const mutations = [
    'stale',
    'future',
    'wrong-tuple',
    'malformed',
    'wrong-producer',
    'wrong-context',
  ] as const;

  for (const mut of mutations) {
    it(`provision refuses mutate=${mut}`, () => {
      const host = `s28r3-qa13-p-${mut}-${Date.now().toString(36)}`;
      const run = spawnSync(
        'bash',
        [H.provision, '--host', host, '--dry-run', '--skip-isolation'],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 60_000,
          env: env({
            HOLO_QA_PROOF_MUTATE: mut,
            STAGING_ROOT: resolve(EVIDENCE_DIR, `p-${mut}`),
          }),
        }
      );
      expect(run.status, `${mut}: ${(run.stderr || run.stdout || '').slice(0, 600)}`).not.toBe(0);
    });

    it(`fire-drill refuses mutate=${mut}`, () => {
      const run = spawnSync(
        'bash',
        [H.runner, '--host', `s28r3-qa13-f-${mut}`, '--target-timestamp', '2026-07-28T12:00:00Z'],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 60_000,
          env: env({
            HOLO_QA_PROOF_MUTATE: mut,
            HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          }),
        }
      );
      expect(run.status, `${mut}-fd: ${(run.stderr || run.stdout || '').slice(0, 600)}`).not.toBe(
        0
      );
    });
  }

  // GATE-FIX-S28R3-QA21: intentionally multi-process (prove success + prove error + fire-drill
  // with recorder). Explicit timeout justified — default 5s flakes on cold worktrees (observed 5.2s).
  it('aws canaries absent on success/error; recorder+parity clean', () => {
    // success
    const ok = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({
        HOLO_AWS_MOCK_MODE: 'canary_success',
        HOLO_R2_PROVIDER_MOCK_MODE: 'canary_success',
        HOLO_AWS_MOCK_CANARY: CANARY_AWS,
      }),
    });
    const okC = `${ok.stdout ?? ''}\n${ok.stderr ?? ''}`;
    expect(ok.status, okC.slice(0, 800)).toBe(0);
    expect(okC).not.toContain(CANARY_AWS);

    const err = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({
        HOLO_AWS_MOCK_MODE: 'canary_error',
        HOLO_R2_PROVIDER_MOCK_MODE: 'canary_error',
        HOLO_AWS_MOCK_CANARY: CANARY_AWS,
      }),
    });
    const errC = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    expect(err.status).not.toBe(0);
    expect(errC).not.toContain(CANARY_AWS);

    // fire-drill recorder + parity + proof canary free
    const recorder = resolve(EVIDENCE_DIR, 'rec.sh');
    const recorderOut = resolve(EVIDENCE_DIR, 'rec-out.json');
    const report = resolve(EVIDENCE_DIR, 'parity.json');
    writeFileSync(
      recorder,
      `#!/usr/bin/env bash
set -euo pipefail
report=""
while [[ $# -gt 0 ]]; do case "$1" in --report) report="$2"; shift 2;; *) shift;; esac; done
python3 - <<'PY'
import json, os
open(${JSON.stringify(recorderOut)},"w").write(json.dumps({
  "ok": True,
  "session_len": len(os.environ.get("R2_RESTORE_SESSION_TOKEN") or ""),
})+"\\n")
print("recorder:ok")
PY
if [[ -n "$report" ]]; then
  cat >"$report" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa13","baseline_key":"recovery-baselines/qa13.json","ok":true}
JSON
fi
exit 0
`
    );
    chmodSync(recorder, 0o755);
    const fd = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        's28r3-qa13-rec',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        report,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: env({
          HOLO_R2_PROVIDER_MOCK_MODE: 'fire_drill_scope',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recorder,
          HOLO_AWS_MOCK_CANARY: CANARY_AWS,
        }),
      }
    );
    const fdC = `${fd.stdout ?? ''}\n${fd.stderr ?? ''}`;
    writeEvidence('m2-recorder.json', { status: fd.status, combined: fdC.slice(0, 3000) });
    expect(fd.status, fdC.slice(0, 1200)).toBe(0);
    expect(fdC).toMatch(/recorder:ok/);
    expect(fdC).not.toContain(CANARY_AWS);
    expect(fdC).not.toContain(RESTORE_SK);
    expect(fdC).not.toContain(RESTORE_ST);
    expect(existsSync(recorderOut)).toBe(true);
    expect(existsSync(report)).toBe(true);
    const recBody = readFileSync(recorderOut, 'utf8');
    const repBody = readFileSync(report, 'utf8');
    expect(recBody).not.toContain(CANARY_AWS);
    expect(repBody).not.toContain(CANARY_AWS);
    expect(repBody).not.toContain(RESTORE_ST);
  }, 120_000);

  it('mint success/error canaries absent from logs (harness curl)', () => {
    const run = spawnSync('bash', [H.prove, '--try-mint'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({
        R2_RESTORE_ACCESS_KEY_ID: 'ro-test',
        R2_RESTORE_SECRET_ACCESS_KEY: 'ro-test',
        CLOUDFLARE_API_TOKEN: 'unit-token',
        R2_PARENT_ACCESS_KEY_ID: 'parent-ak-not-logged',
        R2_PARENT_SECRET_ACCESS_KEY: 'parent-sk-not-logged',
        HOLO_CURL_MOCK_MODE: 'api_error_string',
        HOLO_CURL_CANARY_SK: CANARY_MINT_SK,
        HOLO_CURL_CANARY_AK: CANARY_MINT_AK,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m2-mint-error.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(combined).not.toContain(CANARY_MINT_SK);
    expect(combined).not.toContain(CANARY_MINT_AK);

    const ok = spawnSync('bash', [H.prove, '--try-mint'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({
        R2_RESTORE_ACCESS_KEY_ID: 'ro-test',
        R2_RESTORE_SECRET_ACCESS_KEY: 'ro-test',
        CLOUDFLARE_API_TOKEN: 'unit-token',
        R2_PARENT_ACCESS_KEY_ID: 'parent-ak-not-logged',
        R2_PARENT_SECRET_ACCESS_KEY: 'parent-sk-not-logged',
        HOLO_CURL_MOCK_MODE: 'success',
        HOLO_CURL_CANARY_SK: CANARY_MINT_SK,
        HOLO_CURL_CANARY_AK: CANARY_MINT_AK,
        // after mint, live probe uses harness aws mock
        HOLO_AWS_MOCK_MODE: 'default',
        HOLO_R2_PROVIDER_MOCK_MODE: 'default',
      }),
    });
    const okC = `${ok.stdout ?? ''}\n${ok.stderr ?? ''}`;
    writeEvidence('m2-mint-success.json', { status: ok.status, combined: okC.slice(0, 3000) });
    expect(okC).not.toContain(CANARY_MINT_SK);
    expect(okC).not.toContain(CANARY_MINT_AK);
  });
});

describe('GATE-FIX-S28R3-QA13 source contracts', () => {
  it('production lib has no fixture allowlist and requires account-derived endpoint', () => {
    const lib = readFileSync(resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh'), 'utf8');
    expect(lib).toMatch(/refuses HOLO_TRUSTED|HOLO_TRUSTED_/);
    expect(lib).toMatch(/r2_ro_derive_endpoint/);
    expect(lib).toMatch(/pgbackrest/);
    expect(lib).toMatch(/holocron-backup/);
    expect(lib).toMatch(/r2_ro_derive_endpoint|R2_RO_PYTHON_BIN/);
  });
});
