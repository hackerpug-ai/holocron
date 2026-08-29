/**
 * GATE-FIX-S28R3-QA10 — Unforgeable live proof + mutation-resistant oracles.
 *
 * Covers Terra red-hat-20260729T153429Z:
 *   C1 mutation resistance · H1 no caller proof authority · M1 restore-token precedence
 *   L1 mint error redaction · sacrificial-key denylist process checks
 *
 * Run:
 *   pnpm exec vitest run packages/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
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
  H = makeHarness(REPO_ROOT, resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA10'));
});
const PROVE_R2 = () => H.prove;
const PROVISION = () => H.provision;
const VERIFY = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const RUNNER = () => H.runner;
const FIX_BIN = resolve(REPO_ROOT, 'packages/platform/tests/integration/fixtures/bin');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA10');

const WRITER_AK = 'qa10cfwriterakid0123456789abcdef';
const WRITER_SK = 'qa10cfwritersecret0123456789abcdefghijkl';
const RESTORE_SK = 'qa10cftempsessionsecret0123456789abcdef';
const RESTORE_ST = 'qa10cftempsessiontoken0123456789abcdef';
const WRITER_ST = 'qa10writerGENERICSessionTokenSHOULDNOTUSE';
const CANARY_AK = 'CANARY_ACCESS_KEY_ID_MUST_NOT_APPEAR';
const CANARY_SK = 'CANARY_SECRET_ACCESS_KEY_MUST_NOT_APPEAR';

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // PATH only for curl mock (mint); aws comes from HOLO_TRUSTED_AWS_BIN only.
    PATH: `${FIX_BIN}:${process.env.PATH ?? ''}`,
    HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-qa10-no-secrets',
    HOLO_SECRETS_PATH: '/nonexistent-s28r3-qa10-no-secrets',
    CLOUDFLARE_API_TOKEN: '',
    R2_PARENT_ACCESS_KEY_ID: '',
    R2_PARENT_SECRET_ACCESS_KEY: '',
    R2_ENDPOINT: ENDPOINT,
    R2_ACCOUNT_ID: ACCOUNT_ID,
    R2_BUCKET_NAME: 'holocron-backup',
    R2_PGBACKREST_PREFIX: 'pgbackrest',
    R2_RESTORE_OBJECT_PREFIX: 'pgbackrest',
    R2_SCOPE_PROBE_IN_KEY: 'pgbackrest/qa-fixture-object.bin',
    R2_SCOPE_PROBE_OUT_KEY: 'scope-control/out-of-prefix-object.bin',
    HOLO_AWS_MOCK_MODE: 'default',
    HOLO_R2_PROVIDER_MOCK_MODE: 'fire_drill_scope',
    ...extra,
  };
}

describe('GATE-FIX-S28R3-QA10 H1 unforgeable live proof', () => {
  it('caller-forged HOLO_R2_RO_PROOF_PATH is never authoritative (fixed prover + PATH aws mock)', () => {
    const host = `s28r3-qa10-h1-${Date.now().toString(36)}`;
    const proof = resolve(EVIDENCE_DIR, 'forged.json');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      proof,
      JSON.stringify({
        schema: 'holo.r2-ro-proof.v1',
        ok: true,
        tuple_fp16: 'deadbeefdeadbeef',
        list_allowed: true,
        put_denied: true,
        delete_denied: true,
        proved_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      })
    );
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
        HOLO_R2_RO_PROOF_PATH: proof,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'h1-forge'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-forge-overwrite.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).toMatch(/fixed scripts\/prove-r2-readonly\.sh|fresh live RO proof/i);
    // Caller path is ignored — still forged; authority is trusted .tmp/r2-ro-proofs only.
    expect(readFileSync(proof, 'utf8')).toBe(forgedBefore);
    expect(JSON.parse(forgedBefore).tuple_fp16).toBe('deadbeefdeadbeef');
  });

  it('unknown writer secret still fails with exact residual message', () => {
    const host = `s28r3-qa10-h1-ws-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION(), '--host', host, '--dry-run', '--skip-isolation'], {
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
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'h1-ws'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-unknown-writer-secret.json', {
      status: run.status,
      combined: combined.slice(0, 2000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(
      /same parent Access Key ID without authoritative writer secret|cannot establish distinct restore secret/
    );
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
  });
});

describe('GATE-FIX-S28R3-QA10 M1 restore-token precedence', () => {
  it('gate steps 2 and 3 preserve complete env restore tuples atomically', () => {
    const gatePlan = JSON.parse(
      readFileSync(
        resolve(
          REPO_ROOT,
          '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
        ),
        'utf8'
      )
    ) as { steps: Array<{ n: number; literal_cmd: string }> };
    for (const n of [2, 3]) {
      const command = gatePlan.steps.find((step) => step.n === n)?.literal_cmd ?? '';
      expect(command).toContain('RESTORE_ENV_TUPLE=0');
      expect(command).toContain('refusing secrets-file field mixing');
      expect(command).toMatch(/"\$RESTORE_ENV_TUPLE" -eq 0/);
      expect(command).toContain('source scripts/mint-r2-prefix-restore-env.sh');
    }
    const mintSource = readFileSync(
      resolve(REPO_ROOT, 'scripts/mint-r2-prefix-restore-env.sh'),
      'utf8'
    );
    const runnerSource = readFileSync(
      resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh'),
      'utf8'
    );
    expect(mintSource).toContain('R2_FIRE_DRILL_DATA_ACCESS_KEY_ID');
    expect(runnerSource).toContain('verified-read-only-data-tuple');
    expect(runnerSource).not.toContain('CHILD_DATA_AK="$WRITER_AK"');
  });

  it('does not graft a secrets-file session token onto a complete env keypair', () => {
    const secrets = resolve(EVIDENCE_DIR, 'token-source-atomic.yaml');
    const envRestoreAk = 'qa34-env-restore-ak-0123456789abcdef';
    const envRestoreSk = 'qa34-env-restore-sk-0123456789abcdef';
    const staleFileToken = 'qa34-stale-file-session-token-must-not-be-used';
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      secrets,
      [
        `R2_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_SECRET_ACCESS_KEY: ${WRITER_SK}`,
        'R2_RESTORE_ACCESS_KEY_ID: qa34-file-restore-ak-different',
        'R2_RESTORE_SECRET_ACCESS_KEY: qa34-file-restore-sk-different',
        `R2_RESTORE_SESSION_TOKEN: ${staleFileToken}`,
        '',
      ].join('\n')
    );

    const run = spawnSync('bash', [PROVE_R2()], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        HOLOCRON_SECRETS_PATH: secrets,
        HOLO_SECRETS_PATH: secrets,
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: envRestoreAk,
        R2_RESTORE_SECRET_ACCESS_KEY: envRestoreSk,
        R2_RESTORE_SESSION_TOKEN: '',
        REQUIRE_LIVE_R2_RO: '1',
        HOLO_R2_PROVIDER_MOCK_MODE: 'reject_session',
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-source-atomic-prove.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status, combined.slice(0, 2000)).toBe(0);
    expect(combined).toMatch(/RESULT:\s*PASS/);
    expect(combined).not.toContain(staleFileToken);
  });

  it('keeps the fire-drill child sessionless when the complete env keypair is sessionless', () => {
    const secrets = resolve(EVIDENCE_DIR, 'runner-token-source-atomic.yaml');
    const recorder = resolve(EVIDENCE_DIR, 'source-atomic-recorder.sh');
    const recorderOut = resolve(EVIDENCE_DIR, 'source-atomic-recorder.json');
    const report = resolve(EVIDENCE_DIR, 'source-atomic-parity.json');
    const staleFileToken = 'qa34-runner-stale-file-session-token';
    writeFileSync(
      secrets,
      [
        `R2_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_SECRET_ACCESS_KEY: ${WRITER_SK}`,
        'R2_RESTORE_ACCESS_KEY_ID: qa34-file-restore-ak-different',
        'R2_RESTORE_SECRET_ACCESS_KEY: qa34-file-restore-sk-different',
        `R2_RESTORE_SESSION_TOKEN: ${staleFileToken}`,
        '',
      ].join('\n')
    );
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
open(${JSON.stringify(recorderOut)}, "w").write(json.dumps({"restore_session_present": bool(os.environ.get("R2_RESTORE_SESSION_TOKEN"))}) + "\\n")
PY
cat >"$report" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa34","baseline_key":"recovery-baselines/qa34.json","ok":true}
JSON
echo recorder:ok
`
    );
    spawnSync('chmod', ['+x', recorder]);

    const run = spawnSync(
      'bash',
      [
        RUNNER(),
        '--host',
        's28r3-qa34-source-atomic',
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
          HOLOCRON_SECRETS_PATH: secrets,
          HOLO_SECRETS_PATH: secrets,
          R2_ACCESS_KEY_ID: WRITER_AK,
          R2_SECRET_ACCESS_KEY: WRITER_SK,
          R2_RESTORE_ACCESS_KEY_ID: 'qa34-env-restore-ak-0123456789abcdef',
          R2_RESTORE_SECRET_ACCESS_KEY: 'qa34-env-restore-sk-0123456789abcdef',
          R2_RESTORE_SESSION_TOKEN: '',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recorder,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    expect(combined).toMatch(/recorder:ok/);
    expect(JSON.parse(readFileSync(recorderOut, 'utf8'))).toEqual({
      restore_session_present: false,
    });
    expect(combined).not.toContain(staleFileToken);
  });

  it('env R2_RESTORE_SESSION_TOKEN wins over file writer R2_SESSION_TOKEN and file restore token', () => {
    const secrets = resolve(EVIDENCE_DIR, 'token-precedence.yaml');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      secrets,
      [
        `R2_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_SECRET_ACCESS_KEY: ${WRITER_SK}`,
        `R2_SESSION_TOKEN: ${WRITER_ST}`,
        `R2_RESTORE_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_RESTORE_SECRET_ACCESS_KEY: ${RESTORE_SK}`,
        `R2_RESTORE_SESSION_TOKEN: file-restore-token-SHOULD-LOSE-TO-ENV`,
        'R2_BUCKET_NAME: holocron-backup',
        '',
      ].join('\n')
    );
    const recorder = resolve(EVIDENCE_DIR, 'prec-recorder.sh');
    const recorderOut = resolve(EVIDENCE_DIR, 'prec-recorder-out.json');
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
gst = os.environ.get("R2_SESSION_TOKEN") or ""
payload = {
  "restore_session_len": len(st),
  "generic_session_present": bool(gst),
  "restore_matches_env": st == ${JSON.stringify(RESTORE_ST)},
  "restore_matches_writer": st == ${JSON.stringify(WRITER_ST)},
  "restore_matches_file": st == "file-restore-token-SHOULD-LOSE-TO-ENV",
}
open(out, "w").write(json.dumps(payload, indent=2) + "\\n")
print("recorder:ok")
PY
if [[ -n "$report" ]]; then
  cat >"$report" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa10","baseline_key":"recovery-baselines/qa10.json","ok":true}
JSON
fi
exit 0
`
    );
    spawnSync('chmod', ['+x', recorder]);
    const report = resolve(EVIDENCE_DIR, 'prec-parity.json');
    const run = spawnSync(
      'bash',
      [
        RUNNER(),
        '--host',
        's28r3-qa10-tok',
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
          HOLOCRON_SECRETS_PATH: secrets,
          HOLO_SECRETS_PATH: secrets,
          R2_ACCESS_KEY_ID: WRITER_AK,
          R2_SECRET_ACCESS_KEY: WRITER_SK,
          R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
          R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
          R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
          R2_SESSION_TOKEN: WRITER_ST,
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recorder,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-token-precedence.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(combined).toMatch(/recorder:ok/);
    expect(existsSync(recorderOut)).toBe(true);
    const rec = JSON.parse(readFileSync(recorderOut, 'utf8')) as {
      restore_matches_env: boolean;
      restore_matches_writer: boolean;
      restore_matches_file: boolean;
      generic_session_present: boolean;
    };
    expect(rec.restore_matches_env).toBe(true);
    expect(rec.restore_matches_writer).toBe(false);
    expect(rec.restore_matches_file).toBe(false);
    expect(combined).not.toContain(WRITER_ST);
    expect(combined).not.toContain(RESTORE_ST);
  });

  it('file restore token used when env R2_RESTORE_SESSION_TOKEN unset (not writer R2_SESSION_TOKEN)', () => {
    const secrets = resolve(EVIDENCE_DIR, 'token-file-only.yaml');
    const fileTok = 'qa10FILEONLYRestoreSessionTokenValue';
    writeFileSync(
      secrets,
      [
        `R2_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_SECRET_ACCESS_KEY: ${WRITER_SK}`,
        `R2_SESSION_TOKEN: ${WRITER_ST}`,
        `R2_RESTORE_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_RESTORE_SECRET_ACCESS_KEY: ${RESTORE_SK}`,
        `R2_RESTORE_SESSION_TOKEN: ${fileTok}`,
        '',
      ].join('\n')
    );
    const recorder = resolve(EVIDENCE_DIR, 'file-tok-recorder.sh');
    const recorderOut = resolve(EVIDENCE_DIR, 'file-tok-out.json');
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
payload = {"len": len(st), "is_file": st == ${JSON.stringify(fileTok)}, "is_writer": st == ${JSON.stringify(WRITER_ST)}}
open(out, "w").write(json.dumps(payload) + "\\n")
print("recorder:ok")
PY
if [[ -n "$report" ]]; then
  cat >"$report" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa10f","baseline_key":"recovery-baselines/qa10f.json","ok":true}
JSON
fi
exit 0
`
    );
    spawnSync('chmod', ['+x', recorder]);
    const report = resolve(EVIDENCE_DIR, 'file-tok-parity.json');
    const run = spawnSync(
      'bash',
      [
        RUNNER(),
        '--host',
        's28r3-qa10-ftok',
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
          HOLOCRON_SECRETS_PATH: secrets,
          HOLO_SECRETS_PATH: secrets,
          // no R2_RESTORE_SESSION_TOKEN in env
          R2_RESTORE_SESSION_TOKEN: '',
          R2_SESSION_TOKEN: WRITER_ST,
          R2_ACCESS_KEY_ID: '',
          R2_SECRET_ACCESS_KEY: '',
          R2_RESTORE_ACCESS_KEY_ID: '',
          R2_RESTORE_SECRET_ACCESS_KEY: '',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recorder,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-file-restore-token.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(combined).toMatch(/recorder:ok/);
    const rec = JSON.parse(readFileSync(recorderOut, 'utf8')) as {
      is_file: boolean;
      is_writer: boolean;
    };
    expect(rec.is_file).toBe(true);
    expect(rec.is_writer).toBe(false);
    expect(combined).not.toContain(fileTok);
    expect(combined).not.toContain(WRITER_ST);
  });
});

describe('GATE-FIX-S28R3-QA10 sacrificial denylist process oracle', () => {
  it('make-sacrificial-key is drill-neg and existing is denylisted', () => {
    const sk = spawnSync('bash', [PROVE_R2(), '--make-sacrificial-key'], {
      cwd: H.root,
      encoding: 'utf8',
    });
    expect(sk.status).toBe(0);
    const key = (sk.stdout ?? '').trim();
    expect(key).toMatch(/^drill-neg\/[0-9a-f-]+-redhat-fix-h4\.txt$/);
    const ok = spawnSync('bash', [PROVE_R2(), '--assert-safe-key', key], {
      cwd: H.root,
      encoding: 'utf8',
    });
    expect(ok.status).toBe(0);
    const bad = spawnSync('bash', [PROVE_R2(), '--assert-denylisted', 'existing'], {
      cwd: H.root,
      encoding: 'utf8',
    });
    expect(bad.status).toBe(0);
    const unsafe = spawnSync('bash', [PROVE_R2(), '--assert-safe-key', 'existing'], {
      cwd: H.root,
      encoding: 'utf8',
    });
    expect(unsafe.status).not.toBe(0);
  });
});

describe('GATE-FIX-S28R3-QA10 L1 mint error redaction', () => {
  it('mint parser never prints raw body or credential canaries', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh'), 'utf8');
    expect(src).toMatch(/"prefixes": \["pgbackrest\/"\]/);
    expect(src).toMatch(/class=invalid_json|class=\{err_class\}|HTTP\/class only/);
    expect(src).not.toMatch(/errors=\{errs\}/);
    expect(src).not.toMatch(/raw\[:200\]/);
    expect(src).not.toMatch(/access key id prefix/);
  });
});

describe('GATE-FIX-S28R3-QA10 C1 mutation-sensitive oracles', () => {
  it('verify env restore token is not overwritten by file (env-over-file)', () => {
    const secrets = resolve(EVIDENCE_DIR, 'verify-env-over-file.yaml');
    const envTok = 'qa10ENVRestoreTokenOnly';
    const fileTok = 'qa10FILERestoreTokenShouldLose';
    writeFileSync(
      secrets,
      [
        `R2_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_SECRET_ACCESS_KEY: ${WRITER_SK}`,
        `R2_RESTORE_ACCESS_KEY_ID: ${WRITER_AK}`,
        `R2_RESTORE_SECRET_ACCESS_KEY: ${RESTORE_SK}`,
        `R2_RESTORE_SESSION_TOKEN: ${fileTok}`,
        '',
      ].join('\n')
    );
    const run = spawnSync('bash', [VERIFY], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        HOLOCRON_SECRETS_PATH: secrets,
        HOLO_SECRETS_PATH: secrets,
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: envTok,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c1-env-over-file.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(combined).not.toMatch(/without session token/);
    expect(combined).toMatch(/session token present|same parent AK/i);
    // Neither token value may appear in output.
    expect(combined).not.toContain(envTok);
    expect(combined).not.toContain(fileTok);
  });

  it('canaries never appear in provision/fire-drill stdout for valid path', () => {
    const host = `s28r3-qa10-canary-${Date.now().toString(36)}`;
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
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'canary'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    expect(run.status).toBe(0);
    expect(combined).not.toContain(CANARY_AK);
    expect(combined).not.toContain(CANARY_SK);
    expect(combined).not.toContain(RESTORE_SK);
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(WRITER_SK);
  });
});
