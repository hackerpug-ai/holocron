/**
 * GATE-FIX-S28R3-QA9 — Fail-closed temporary tuple + proof binding.
 *
 * Behavioral tests for Terra findings on 123bd09f:
 *   H1 unknown writer secret · H2 secrets-file session token · M1 proof bind
 *   M2 verifier/fire-drill process tests · L1 no AK prefix log
 *
 * Run:
 *   pnpm exec vitest run services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  H = makeHarness(REPO_ROOT, resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA9'));
});
const PROVE_R2 = () => H.prove;
const PROVISION = () => H.provision;
const VERIFY = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const RUNNER = () => H.runner;
const FIX_BIN = resolve(REPO_ROOT, 'services/platform/tests/integration/fixtures/bin');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA9');

const WRITER_AK = 'qa9cfwriterakid0123456789abcdef';
const WRITER_SK = 'qa9cfwritersecret0123456789abcdefghijkl';
const RESTORE_SK = 'qa9cftempsessionsecret0123456789abcdef';
const RESTORE_ST = 'qa9cftempsessiontoken0123456789abcdef';

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function tupleFp16(ak: string, sk: string, st: string): string {
  return createHash('sha256').update(`${ak}\0${sk}\0${st}`, 'utf8').digest('hex').slice(0, 16);
}

function writeProof(path: string, ak: string, sk: string, st: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schema: 'holo.r2-ro-proof.v1',
        ok: true,
        tuple_fp16: tupleFp16(ak, sk, st),
        list_allowed: true,
        put_denied: true,
        delete_denied: true,
        proved_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        note: 'synthetic non-secret attestation for unit tests',
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // PATH only for curl mock (mint); aws comes from HOLO_TRUSTED_AWS_BIN only.
    PATH: `${FIX_BIN}:${process.env.PATH ?? ''}`,
    HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-qa9-no-secrets',
    HOLO_SECRETS_PATH: '/nonexistent-s28r3-qa9-no-secrets',
    CLOUDFLARE_API_TOKEN: '',
    R2_PARENT_ACCESS_KEY_ID: '',
    R2_PARENT_SECRET_ACCESS_KEY: '',
    R2_ENDPOINT: ENDPOINT,
    R2_ACCOUNT_ID: ACCOUNT_ID,
    R2_BUCKET_NAME: 'holocron-backup',
    R2_PGBACKREST_PREFIX: 'pgbackrest',
    R2_SCOPE_PROBE_IN_KEY: 'pgbackrest/qa-fixture-object.bin',
    R2_SCOPE_PROBE_OUT_KEY: 'scope-control/out-of-prefix-object.bin',
    HOLO_AWS_MOCK_MODE: 'default',
    HOLO_R2_PROVIDER_MOCK_MODE: 'default',
    ...extra,
  };
}

describe('GATE-FIX-S28R3-QA9 H1 fail-closed without writer secret', () => {
  it('provision: same parent AK + session without writer secret is refused', () => {
    const host = `s28r3-qa9-h1-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        // no R2_SECRET_ACCESS_KEY — unknown writer secret
        R2_SECRET_ACCESS_KEY: '',
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'h1-provision'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-provision-no-writer-secret.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(
      /same parent Access Key ID without authoritative writer secret|cannot establish distinct restore secret/
    );
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
  });

  it('prove-r2-readonly: same parent AK without writer secret refused', () => {
    const run = spawnSync('bash', [PROVE_R2()], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: '',
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        // Non-placeholder endpoint so identity gate runs before live probe.
        R2_ENDPOINT: ENDPOINT,
        R2_ACCOUNT_ID: ACCOUNT_ID,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-prove-no-writer-secret.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/writer secret|cannot establish distinct|GATE-FIX-S28R3-QA9|tuple/i);
  });

  it('fire-drill: same parent AK without writer secret refused before docker', () => {
    const run = spawnSync(
      'bash',
      [RUNNER(), '--host', 's28r3-qa9-h1-fd', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 30_000,
        env: baseEnv({
          R2_ACCESS_KEY_ID: WRITER_AK,
          R2_SECRET_ACCESS_KEY: '',
          R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
          R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
          R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-firedrill-no-writer-secret.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/writer secret|cannot establish distinct|GATE-FIX-S28R3-QA9/i);
    // Must not only fail on docker after accepting shape.
    expect(combined).not.toMatch(/volume unresolvable.*accepted Cloudflare/i);
  });
});

describe('GATE-FIX-S28R3-QA9 H2 session token from secrets file', () => {
  it('verify-restore-creds loads R2_RESTORE_SESSION_TOKEN from secrets and accepts CF shape', () => {
    const secrets = resolve(EVIDENCE_DIR, 'secrets-with-session.yaml');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      secrets,
      [
        `R2_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_SECRET_ACCESS_KEY: ${WRITER_SK}`,
        `R2_RESTORE_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_RESTORE_SECRET_ACCESS_KEY: ${RESTORE_SK}`,
        `R2_RESTORE_SESSION_TOKEN: ${RESTORE_ST}`,
        'R2_BUCKET_NAME: holocron-backup',
        'R2_ENDPOINT: https://example-accountid.r2.cloudflarestorage.com',
        '',
      ].join('\n'),
      'utf8'
    );
    const run = spawnSync('bash', [VERIFY], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        HOLOCRON_SECRETS_PATH: secrets,
        HOLO_SECRETS_PATH: secrets,
        // Force file path — clear env restore keys
        R2_RESTORE_ACCESS_KEY_ID: '',
        R2_RESTORE_SECRET_ACCESS_KEY: '',
        R2_RESTORE_SESSION_TOKEN: '',
        R2_ACCESS_KEY_ID: '',
        R2_SECRET_ACCESS_KEY: '',
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h2-verify-secrets-session.json', {
      status: run.status,
      combined: combined.slice(0, 5000),
    });
    // Must not claim incomplete session after secrets load.
    expect(combined).not.toMatch(/without session token/);
    expect(combined).toMatch(
      /session token present|Cloudflare temporary|GATE-FIX-S28R3-QA8\/QA9|same parent AK/i
    );
    // Never print token value.
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(RESTORE_SK);
    expect(combined).not.toContain(WRITER_SK);
  });
});

describe('GATE-FIX-S28R3-QA9 M1 proof binding (QA10: fresh live only)', () => {
  it('provision REQUIRE_LIVE ignores caller-forged proof and succeeds via fixed prover + PATH aws mock', () => {
    const host = `s28r3-qa9-m1-ok-${Date.now().toString(36)}`;
    const proof = resolve(EVIDENCE_DIR, 'ok-proof.json');
    writeProof(proof, 'forged-ak', 'forged-sk', 'forged-st');
    const forgedBefore = readFileSync(proof, 'utf8');
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        // Caller path is never authoritative (QA11).
        HOLO_R2_RO_PROOF_PATH: proof,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'm1-ok-proof'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-fresh-prove-ok.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).toMatch(
      /fixed scripts\/prove-r2-readonly\.sh|fresh live RO proof|RO proof fresh-bound ok/i
    );
    // Forged caller file remains forged — authority is trusted dir only.
    expect(readFileSync(proof, 'utf8')).toBe(forgedBefore);
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(RESTORE_SK);
  });

  it('provision REQUIRE_LIVE fails when live prove fails (forged path cannot skip)', () => {
    const host = `s28r3-qa9-m1-fail-${Date.now().toString(36)}`;
    const proof = resolve(EVIDENCE_DIR, 'fail-proof.json');
    writeProof(proof, WRITER_AK, RESTORE_SK, RESTORE_ST);
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        HOLO_R2_RO_PROOF_PATH: proof,
        HOLO_AWS_MOCK_MODE: 'list_fail',
        HOLO_R2_PROVIDER_MOCK_MODE: 'list_fail',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'm1-fail-proof'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-prove-required.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    // GATE-FIX-S28R3-QA24: current fail-closed diagnostic after isolated prove non-zero
    // (bash 3.2 set -e return fix restores this path; also accept residual class).
    expect(combined).toMatch(
      /fresh live RO proof failed|prove_nonzero|prefix_list_denied|list_denied|DEPENDENCY-S28-R2-RO|RESULT: FAIL/i
    );
  });
});

describe('GATE-FIX-S28R3-QA9 M2 behavioral fire-drill + verifier', () => {
  it('fire-drill maps session token into child (recorder must execute)', () => {
    const report = resolve(EVIDENCE_DIR, 'fd-parity.json');
    const recorder = resolve(EVIDENCE_DIR, 'fd-recorder.sh');
    const recorderOut = resolve(EVIDENCE_DIR, 'fd-recorder-out.json');
    writeFileSync(
      recorder,
      `#!/usr/bin/env bash
set -euo pipefail
report=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) report="$2"; shift 2 ;;
    *) shift ;;
  esac
done
python3 - <<'PY'
import json, os
out = ${JSON.stringify(recorderOut)}
st = os.environ.get("R2_RESTORE_SESSION_TOKEN") or ""
payload = {
  "has_session_token": bool(st),
  "session_token_length": len(st),
  "has_restore_ak": bool(os.environ.get("R2_RESTORE_ACCESS_KEY_ID")),
  "access_equals_restore": os.environ.get("R2_ACCESS_KEY_ID") == os.environ.get("R2_RESTORE_ACCESS_KEY_ID"),
}
open(out, "w").write(json.dumps(payload, indent=2) + "\\n")
print("recorder:ok")
PY
if [[ -n "$report" ]]; then
  cat >"$report" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa9","baseline_key":"recovery-baselines/qa9.json","ok":true}
JSON
fi
exit 0
`,
      'utf8'
    );
    spawnSync('chmod', ['+x', recorder], { encoding: 'utf8' });

    const run = spawnSync(
      'bash',
      [
        RUNNER(),
        '--host',
        's28r3-qa9-fd-token',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        report,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 60_000,
        env: baseEnv({
          R2_ACCESS_KEY_ID: WRITER_AK,
          R2_SECRET_ACCESS_KEY: WRITER_SK,
          R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
          R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
          R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recorder,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m2-firedrill-token.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(combined).toMatch(/recorder:ok/);
    expect(existsSync(recorderOut)).toBe(true);
    const rec = JSON.parse(readFileSync(recorderOut, 'utf8')) as {
      has_session_token: boolean;
      session_token_length: number;
    };
    expect(rec.has_session_token).toBe(true);
    expect(rec.session_token_length).toBe(RESTORE_ST.length);
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(RESTORE_SK);
  });

  it('fire-drill refuses equal secret', () => {
    const run = spawnSync(
      'bash',
      [RUNNER(), '--host', 's28r3-qa9-fd-eq', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 20_000,
        env: baseEnv({
          R2_ACCESS_KEY_ID: WRITER_AK,
          R2_SECRET_ACCESS_KEY: WRITER_SK,
          R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
          R2_RESTORE_SECRET_ACCESS_KEY: WRITER_SK,
          R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m2-firedrill-equal-secret.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/writer-equivalent|equals writer secret/i);
  });
});

describe('GATE-FIX-S28R3-QA9 L1 mint does not log AK prefix', () => {
  it('prove-r2-readonly mint success message has no access-key prefix pattern', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh'), 'utf8');
    expect(src).not.toMatch(/access key id prefix \$\{MINT_AK:0:6\}/);
    expect(src).toMatch(/values not logged|permission kind=object-read-only/);
  });
});
