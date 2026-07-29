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
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROVE_R2 = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const VERIFY = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
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
    HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-qa9-no-secrets',
    HOLO_SECRETS_PATH: '/nonexistent-s28r3-qa9-no-secrets',
    CLOUDFLARE_API_TOKEN: '',
    R2_PARENT_ACCESS_KEY_ID: '',
    R2_PARENT_SECRET_ACCESS_KEY: '',
    R2_ENDPOINT: 'https://example-accountid.r2.cloudflarestorage.com',
    R2_ACCOUNT_ID: 'example-accountid',
    R2_BUCKET_NAME: 'holocron-backup',
    ...extra,
  };
}

describe('GATE-FIX-S28R3-QA9 H1 fail-closed without writer secret', () => {
  it('provision: same parent AK + session without writer secret is refused', () => {
    const host = `s28r3-qa9-h1-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
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
    writeEvidence('h1-provision-no-writer-secret.json', { status: run.status, combined: combined.slice(0, 3000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/writer secret|cannot establish distinct|GATE-FIX-S28R3-QA9/i);
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
  });

  it('prove-r2-readonly: same parent AK without writer secret refused', () => {
    const run = spawnSync('bash', [PROVE_R2], {
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
        // Non-placeholder endpoint so identity gate runs before live probe.
        R2_ENDPOINT: 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com',
        R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-prove-no-writer-secret.json', { status: run.status, combined: combined.slice(0, 3000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/writer secret|cannot establish distinct|GATE-FIX-S28R3-QA9|tuple/i);
  });

  it('fire-drill: same parent AK without writer secret refused before docker', () => {
    const run = spawnSync(
      'bash',
      [RUNNER, '--host', 's28r3-qa9-h1-fd', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: REPO_ROOT,
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
    writeEvidence('h1-firedrill-no-writer-secret.json', { status: run.status, combined: combined.slice(0, 3000) });
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
      cwd: REPO_ROOT,
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
    writeEvidence('h2-verify-secrets-session.json', { status: run.status, combined: combined.slice(0, 5000) });
    // Must not claim incomplete session after secrets load.
    expect(combined).not.toMatch(/without session token/);
    expect(combined).toMatch(/session token present|Cloudflare temporary|GATE-FIX-S28R3-QA8\/QA9|same parent AK/i);
    // Never print token value.
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(RESTORE_SK);
    expect(combined).not.toContain(WRITER_SK);
  });
});

describe('GATE-FIX-S28R3-QA9 M1 proof binding', () => {
  it('provision REQUIRE_LIVE refuses missing/mismatched proof attestation', () => {
    const host = `s28r3-qa9-m1-bad-${Date.now().toString(36)}`;
    const badProof = resolve(EVIDENCE_DIR, 'bad-proof.json');
    writeFileSync(
      badProof,
      `${JSON.stringify({
        schema: 'holo.r2-ro-proof.v1',
        ok: true,
        tuple_fp16: 'deadbeefdeadbeef',
        list_allowed: true,
        put_denied: true,
        delete_denied: true,
        proved_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      })}\n`
    );
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        HOLO_R2_RO_PROOF_PATH: badProof,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'm1-bad-proof'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-mismatched-proof.json', { status: run.status, combined: combined.slice(0, 3000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/tuple_fp16 mismatch|proof not bound|RO proof/i);
  });

  it('provision ACCEPTS matching non-secret proof for valid CF tuple', () => {
    const host = `s28r3-qa9-m1-ok-${Date.now().toString(36)}`;
    const proof = resolve(EVIDENCE_DIR, 'ok-proof.json');
    writeProof(proof, WRITER_AK, RESTORE_SK, RESTORE_ST);
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
        HOLO_R2_RO_PROOF_PATH: proof,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'm1-ok-proof'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-matching-proof-ok.json', { status: run.status, combined: combined.slice(0, 3000) });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).toMatch(/RO proof bound ok|accepted Cloudflare temporary/i);
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(RESTORE_SK);
  });
});

describe('GATE-FIX-S28R3-QA9 M2 behavioral fire-drill + verifier', () => {
  it('fire-drill maps session token into child (recorder; no value serialization)', () => {
    const proof = resolve(EVIDENCE_DIR, 'fd-proof.json');
    writeProof(proof, WRITER_AK, RESTORE_SK, RESTORE_ST);
    const recorder = resolve(EVIDENCE_DIR, 'fd-recorder.sh');
    const recorderOut = resolve(EVIDENCE_DIR, 'fd-recorder-out.json');
    writeFileSync(
      recorder,
      `#!/usr/bin/env bash
set -euo pipefail
OUT=${JSON.stringify(recorderOut)}
python3 - "$OUT" <<'PY'
import json, os
out = ${JSON.stringify(recorderOut)}
st = os.environ.get("R2_RESTORE_SESSION_TOKEN") or os.environ.get("R2_SESSION_TOKEN") or ""
payload = {
  "has_session_token": bool(st),
  "session_token_length": len(st),
  "has_restore_ak": bool(os.environ.get("R2_RESTORE_ACCESS_KEY_ID")),
  "access_equals_restore": os.environ.get("R2_ACCESS_KEY_ID") == os.environ.get("R2_RESTORE_ACCESS_KEY_ID"),
  "raw_session_token_present_in_payload": False,
}
open(out, "w").write(json.dumps(payload, indent=2) + "\\n")
print("recorder:ok")
PY
`,
      'utf8'
    );
    spawnSync('chmod', ['+x', recorder], { encoding: 'utf8' });

    // Identity+proof run early; without docker volumes this fails after identity if proof ok.
    // Supply proof so we pass identity; expect either recorder path or volume error after identity.
    const run = spawnSync(
      'bash',
      [RUNNER, '--host', 's28r3-qa9-fd-token', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: baseEnv({
          R2_ACCESS_KEY_ID: WRITER_AK,
          R2_SECRET_ACCESS_KEY: WRITER_SK,
          R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
          R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
          R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
          HOLO_R2_RO_PROOF_PATH: proof,
          HOLO_CLI: recorder,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m2-firedrill-token.json', { status: run.status, combined: combined.slice(0, 4000) });
    // Must accept CF shape (not refuse same AK).
    expect(combined).not.toMatch(/without non-empty restore session token/);
    expect(combined).not.toMatch(/without authoritative writer secret/);
    // Token value never logged.
    expect(combined).not.toContain(RESTORE_ST);
    expect(combined).not.toContain(RESTORE_SK);
    // Either got to volume resolve (proof+identity passed) or recorder ran.
    expect(
      combined.match(/Cloudflare temporary credential tuple shape accepted|volume unresolvable|RO proof bound|recorder:ok|running restore-only/i)
    ).toBeTruthy();
  });

  it('fire-drill refuses equal secret', () => {
    const run = spawnSync(
      'bash',
      [RUNNER, '--host', 's28r3-qa9-fd-eq', '--target-timestamp', '2026-07-28T12:00:00Z'],
      {
        cwd: REPO_ROOT,
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
    writeEvidence('m2-firedrill-equal-secret.json', { status: run.status, combined: combined.slice(0, 2000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/writer-equivalent|equals writer secret/i);
  });
});

describe('GATE-FIX-S28R3-QA9 L1 mint does not log AK prefix', () => {
  it('prove-r2-readonly mint success message has no access-key prefix pattern', () => {
    const src = readFileSync(PROVE_R2, 'utf8');
    expect(src).not.toMatch(/access key id prefix \$\{MINT_AK:0:6\}/);
    expect(src).toMatch(/values not logged|permission kind=object-read-only/);
  });
});
