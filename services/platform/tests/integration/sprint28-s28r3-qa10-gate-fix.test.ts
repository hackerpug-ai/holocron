/**
 * GATE-FIX-S28R3-QA10 — Unforgeable live proof + mutation-resistant oracles.
 *
 * Covers Terra red-hat-20260729T153429Z:
 *   C1 mutation resistance · H1 no caller proof authority · M1 restore-token precedence
 *   L1 mint error redaction · sacrificial-key denylist process checks
 *
 * Run:
 *   pnpm exec vitest run services/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROVE_R2 = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const VERIFY = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROVE_STUB = resolve(
  REPO_ROOT,
  'services/platform/tests/integration/fixtures/qa10-prove-stub.sh'
);
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

function tupleFp16(ak: string, sk: string, st: string): string {
  return createHash('sha256').update(`${ak}\0${sk}\0${st}`, 'utf8').digest('hex').slice(0, 16);
}

function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-qa10-no-secrets',
    HOLO_SECRETS_PATH: '/nonexistent-s28r3-qa10-no-secrets',
    CLOUDFLARE_API_TOKEN: '',
    R2_PARENT_ACCESS_KEY_ID: '',
    R2_PARENT_SECRET_ACCESS_KEY: '',
    R2_ENDPOINT: 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com',
    R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    R2_BUCKET_NAME: 'holocron-backup',
    ...extra,
  };
}

describe('GATE-FIX-S28R3-QA10 H1 unforgeable live proof', () => {
  it('caller-forged HOLO_R2_RO_PROOF_PATH is overwritten by fresh prove (cannot skip)', () => {
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
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        HOLO_PROVE_R2_READONLY: PROVE_STUB,
        HOLO_R2_RO_PROOF_PATH: proof,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'h1-forge'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-forge-overwrite.json', { status: run.status, combined: combined.slice(0, 3000) });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).toMatch(/fresh live RO proof|caller proof never authoritative/i);
    const att = JSON.parse(readFileSync(proof, 'utf8')) as { tuple_fp16: string; producer?: string };
    expect(att.tuple_fp16).toBe(tupleFp16(WRITER_AK, RESTORE_SK, RESTORE_ST));
    expect(att.tuple_fp16).not.toBe('deadbeefdeadbeef');
  });

  it('unknown writer secret still fails with exact residual message', () => {
    const host = `s28r3-qa10-h1-ws-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: '',
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        HOLO_PROVE_R2_READONLY: PROVE_STUB,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'h1-ws'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-unknown-writer-secret.json', { status: run.status, combined: combined.slice(0, 2000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(
      /same parent Access Key ID without authoritative writer secret|cannot establish distinct restore secret/
    );
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
  });
});

describe('GATE-FIX-S28R3-QA10 M1 restore-token precedence', () => {
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
`
    );
    spawnSync('chmod', ['+x', recorder]);
    const run = spawnSync(
      'bash',
      [RUNNER, '--host', 's28r3-qa10-tok', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: REPO_ROOT,
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
          HOLO_PROVE_R2_READONLY: PROVE_STUB,
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recorder,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-token-precedence.json', { status: run.status, combined: combined.slice(0, 3000) });
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
python3 - <<'PY'
import json, os
out = ${JSON.stringify(recorderOut)}
st = os.environ.get("R2_RESTORE_SESSION_TOKEN") or ""
payload = {"len": len(st), "is_file": st == ${JSON.stringify(fileTok)}, "is_writer": st == ${JSON.stringify(WRITER_ST)}}
open(out, "w").write(json.dumps(payload) + "\\n")
print("recorder:ok")
PY
`
    );
    spawnSync('chmod', ['+x', recorder]);
    const run = spawnSync(
      'bash',
      [RUNNER, '--host', 's28r3-qa10-ftok', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: REPO_ROOT,
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
          HOLO_PROVE_R2_READONLY: PROVE_STUB,
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recorder,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-file-restore-token.json', { status: run.status, combined: combined.slice(0, 3000) });
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
    const sk = spawnSync('bash', [PROVE_R2, '--make-sacrificial-key'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(sk.status).toBe(0);
    const key = (sk.stdout ?? '').trim();
    expect(key).toMatch(/^drill-neg\/[0-9a-f-]+-redhat-fix-h4\.txt$/);
    const ok = spawnSync('bash', [PROVE_R2, '--assert-safe-key', key], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(ok.status).toBe(0);
    const bad = spawnSync('bash', [PROVE_R2, '--assert-denylisted', 'existing'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(bad.status).toBe(0);
    const unsafe = spawnSync('bash', [PROVE_R2, '--assert-safe-key', 'existing'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(unsafe.status).not.toBe(0);
  });
});

describe('GATE-FIX-S28R3-QA10 L1 mint error redaction', () => {
  it('mint parser never prints raw body or credential canaries', () => {
    const src = readFileSync(PROVE_R2, 'utf8');
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
      cwd: REPO_ROOT,
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
    writeEvidence('c1-env-over-file.json', { status: run.status, combined: combined.slice(0, 4000) });
    expect(combined).not.toMatch(/without session token/);
    expect(combined).toMatch(/session token present|same parent AK/i);
    // Neither token value may appear in output.
    expect(combined).not.toContain(envTok);
    expect(combined).not.toContain(fileTok);
  });

  it('canaries never appear in provision/fire-drill stdout for valid path', () => {
    const host = `s28r3-qa10-canary-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        HOLO_PROVE_R2_READONLY: PROVE_STUB,
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
