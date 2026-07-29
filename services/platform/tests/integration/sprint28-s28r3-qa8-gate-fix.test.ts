/**
 * GATE-FIX-S28R3-QA8 — Cloudflare temporary credential identity tuple.
 *
 * Real CF R2 temp sessions may reuse the parent Access Key ID while returning a
 * distinct secret + mandatory session token. Identity equality must use the full
 * effective credential tuple, not Access Key ID alone. Live Put/Delete denial
 * remains the permission oracle.
 *
 * Run:
 *   pnpm exec vitest run services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROVE_R2 = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const VERIFY = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const FIX_BIN = resolve(REPO_ROOT, 'services/platform/tests/integration/fixtures/bin');
const TRUSTED_AWS = resolve(FIX_BIN, 'aws');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA8');

// Synthetic non-placeholder shapes (never real secrets).
const WRITER_AK = 'qa8cfwriterakid0123456789abcdef';
const WRITER_SK = 'qa8cfwritersecret0123456789abcdefghijkl';
const RESTORE_SK_DISTINCT = 'qa8cftempsessionsecret0123456789abcdef';
const RESTORE_ST = 'qa8cftempsessiontoken0123456789abcdef';
const OTHER_AK = 'qa8cfdistinctrestoreakid0123456789ab';

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // PATH aws/curl mocks for fixed live prover (GATE-FIX-S28R3-QA11).
    HOLO_TRUSTED_AWS_BIN: TRUSTED_AWS,
    // PATH only for curl mock (mint); aws comes from HOLO_TRUSTED_AWS_BIN only.
    PATH: `${FIX_BIN}:${process.env.PATH ?? ''}`,
    // Isolate from personal secrets / .env bleed for unit identity checks.
    HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-qa8-no-secrets',
    HOLO_SECRETS_PATH: '/nonexistent-s28r3-qa8-no-secrets',
    CLOUDFLARE_API_TOKEN: '',
    R2_PARENT_ACCESS_KEY_ID: '',
    R2_PARENT_SECRET_ACCESS_KEY: '',
    // Non-placeholder endpoint (example-accountid is rejected by is_placeholder).
    R2_ENDPOINT: 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com',
    R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    R2_BUCKET_NAME: 'holocron-backup',
    R2_PGBACKREST_PREFIX: 'pgbackrest',
    HOLO_AWS_MOCK_MODE: 'default',
    ...extra,
  };
}

describe('GATE-FIX-S28R3-QA8 always-on source contract', () => {
  it('scripts exist and bash -n clean', () => {
    for (const p of [PROVE_R2, PROVISION, VERIFY, RUNNER]) {
      expect(existsSync(p), `missing ${p}`).toBe(true);
      const syn = spawnSync('bash', ['-n', p], { encoding: 'utf8' });
      expect(syn.status, `${p}: ${syn.stderr}`).toBe(0);
    }
  });

  it('source: identity is tuple-based (session token + secret), not AK-only refuse', () => {
    for (const [label, path] of [
      ['prove-r2-readonly', PROVE_R2],
      ['provision', PROVISION],
      ['verify-restore-creds', VERIFY],
      ['run-fire-drill', RUNNER],
    ] as const) {
      const src = readFileSync(path, 'utf8');
      // Must reason about session token when same parent AK is allowed.
      expect(src, label).toMatch(/R2_RESTORE_SESSION_TOKEN|SESSION_TOKEN|session.?token/i);
      // Must not have only-AK equality as the sole success-path refuse without session escape.
      expect(src, label).toMatch(
        /GATE-FIX-S28R3-QA8|credential.?tuple|session token|distinct secret/i
      );
    }
    writeEvidence('source-contract.json', { ok: true });
  });
});

describe('GATE-FIX-S28R3-QA8 provision identity (REQUIRE_LIVE_R2_RO)', () => {
  it('RED→GREEN: same AK + distinct secret + session token is accepted (shape)', () => {
    const host = `s28r3-qa8-cf-${Date.now().toString(36)}`;
    const staging = resolve(EVIDENCE_DIR, 'provision-cf-shape');
    // GATE-FIX-S28R3-QA11: fixed scripts/prove-r2-readonly.sh + PATH aws mock (no prover override).
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        ALLOW_PLACEHOLDER_R2_RO: '0',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK, // same parent AK (CF temp shape)
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK_DISTINCT,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        STAGING_ROOT: staging,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('provision-cf-same-ak-ok.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(run.status, combined.slice(0, 2000)).toBe(0);
    expect(combined).not.toMatch(/refuses restore keys equal to ambient RW R2_ACCESS_KEY_ID/);
    // Env file must carry session token (length only assertion — not print value).
    const envFile = resolve(staging, host, 'restore-target.env');
    expect(existsSync(envFile)).toBe(true);
    const envBody = readFileSync(envFile, 'utf8');
    // Session token must be propagated into the restore-target env (chmod 600);
    // stdout/stderr must never print secret/session values.
    expect(envBody).toMatch(/R2_SESSION_TOKEN=/);
    expect(envBody).toContain('R2_SESSION_TOKEN=');
    expect(combined).not.toContain(RESTORE_SK_DISTINCT);
    expect(combined).not.toContain(WRITER_SK);
    expect(combined).not.toContain(RESTORE_ST);
  });

  it('same AK + same secret refused', () => {
    const host = `s28r3-qa8-same-sk-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'provision-same-sk'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('provision-same-sk-refuse.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO|equal.*secret|writer-equivalent|tuple/i);
  });

  it('same AK + missing session token refused', () => {
    const host = `s28r3-qa8-no-st-${Date.now().toString(36)}`;
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK_DISTINCT,
        R2_RESTORE_SESSION_TOKEN: '',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'provision-no-st'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('provision-no-session-refuse.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/session.?token|DEPENDENCY-S28-R2-RO|tuple|Cloudflare|temporary/i);
  });

  it('distinct AK still accepted without session token', () => {
    const host = `s28r3-qa8-distinct-${Date.now().toString(36)}`;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: OTHER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK_DISTINCT,
        R2_RESTORE_SESSION_TOKEN: '',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'provision-distinct-ak'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('provision-distinct-ak-ok.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
  });
});

describe('GATE-FIX-S28R3-QA8 prove-r2-readonly identity preflight', () => {
  it('same AK + same secret fails closed before claiming PASS (no live RO)', () => {
    // Load backup identity via env so BACKUP_R2_* capture path engages.
    // prove loads secrets into BACKUP_*; ambient R2_ACCESS_* also becomes backup when no restore override.
    const run = spawnSync('bash', [PROVE_R2], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        // Writer in "backup" slot via secrets file simulation: set both ambient and restore equal.
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('prove-same-sk-refuse.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).not.toMatch(/RESULT:\s*PASS/);
    expect(combined).toMatch(
      /writer-equivalent|equal.*secret|backup RW|tuple|DEPENDENCY-S28-R2-RO|impossible|refused/i
    );
  });

  it('same AK + distinct secret + empty session fails closed (CF temp incomplete)', () => {
    const run = spawnSync('bash', [PROVE_R2], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK_DISTINCT,
        R2_RESTORE_SESSION_TOKEN: '',
        R2_SESSION_TOKEN: '',
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('prove-no-session-refuse.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).not.toMatch(/RESULT:\s*PASS/);
    expect(combined).toMatch(/session.?token|tuple|Cloudflare|temporary|incomplete/i);
  });

  it('same AK + distinct secret + session reaches live probe (not AK-only refuse)', () => {
    const run = spawnSync('bash', [PROVE_R2], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: baseEnv({
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: WRITER_AK,
        R2_SECRET_ACCESS_KEY: WRITER_SK,
        R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK_DISTINCT,
        R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('prove-cf-shape-reaches-probe.json', {
      status: run.status,
      combined: combined.slice(0, 5000),
    });
    // PATH aws mock → live List/Put/Delete oracle succeeds without AK-only refuse.
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).toMatch(/RESULT:\s*PASS/);
    expect(combined).not.toMatch(/impossible for true RO/);
    expect(combined).not.toMatch(/refuses restore keys equal to ambient RW R2_ACCESS_KEY_ID/);
    expect(combined).toMatch(/List allowed|class=access_denied|drill-neg/i);
    // Never leak secrets.
    expect(combined).not.toContain(RESTORE_SK_DISTINCT);
    expect(combined).not.toContain(WRITER_SK);
    expect(combined).not.toContain(RESTORE_ST);
  });
});

describe('GATE-FIX-S28R3-QA8 fire-drill + verify source/identity', () => {
  it('run-fire-drill source uses tuple compare (not bare AK equality only)', () => {
    const src = readFileSync(RUNNER, 'utf8');
    // Old sole AK refuse message may remain as a branch of tuple fail, but must
    // also gate on session token / secret for same-AK CF shape.
    expect(src).toMatch(/RESTORE_ST|SESSION_TOKEN/);
    expect(src).toMatch(/same parent AK|credential tuple|GATE-FIX-S28R3-QA8|session token/i);
  });

  it('verify-restore-creds source accepts CF same-AK when secret+session distinct', () => {
    const src = readFileSync(VERIFY, 'utf8');
    expect(src).toMatch(/GATE-FIX-S28R3-QA8|credential tuple|session token/i);
    expect(src).toMatch(/R2_RESTORE_SESSION_TOKEN/);
  });
});
