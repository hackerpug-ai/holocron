/**
 * REDHAT-FIX-S28R2-H3 — Distinct read-only restore credentials on provision.
 *
 * Live provision must require R2_RESTORE_* (no silent ambient RW fallback).
 * Placeholders only with ALLOW_PLACEHOLDER_R2_RO=1 or --dry-run.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint28-fresh-target-creds.test.ts
 *   pnpm vitest run packages/platform/tests/integration/sprint28-fresh-target-creds.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R2/H3');
const STAGING = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R2/H3/staging');

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function runProvision(
  args: string[],
  env: NodeJS.ProcessEnv
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const result = spawnSync('bash', [PROVISION, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      STAGING_ROOT: STAGING,
      // Never inherit ambient restore confusion in the child.
      MINI_HOST: '203.0.113.1',
    },
    timeout: 60_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    combined: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
}

describe('REDHAT-FIX-S28R2 H3 distinct RO restore credentials (always)', () => {
  it('provision script exists and parses', () => {
    expect(existsSync(PROVISION)).toBe(true);
    const syntax = spawnSync('bash', ['-n', PROVISION], { encoding: 'utf8' });
    expect(syntax.status, syntax.stderr).toBe(0);
  });

  it('H3 source: no silent ambient R2_ACCESS_KEY_ID fallback as default restore identity', () => {
    const src = readFileSync(PROVISION, 'utf8');
    // Old pattern: R2_RESTORE_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}
    expect(src).not.toMatch(
      /R2_ACCESS_KEY_ID="\$\{R2_RESTORE_ACCESS_KEY_ID:-\$\{R2_ACCESS_KEY_ID:-\}\}"/
    );
    expect(src).not.toMatch(
      /R2_SECRET_ACCESS_KEY="\$\{R2_RESTORE_SECRET_ACCESS_KEY:-\$\{R2_SECRET_ACCESS_KEY:-\}\}"/
    );
    // Must gate placeholders / live start.
    expect(src).toMatch(/ALLOW_PLACEHOLDER_R2_RO|R2_RESTORE_ACCESS_KEY_ID/);
    expect(src).toMatch(/REQUIRE_LIVE_R2_RO/);
  });

  it('H3 AC-1: live path without R2_RESTORE_* exits non-zero (no silent RW fallback)', () => {
    const host = `s28r2-h3-no-restore-${Date.now()}`;
    const run = runProvision(['--host', host, '--skip-isolation'], {
      // Ambient RW present — must NOT be substituted as object-read-only.
      R2_ACCESS_KEY_ID: 'ambient-rw-access-key-must-not-be-used',
      R2_SECRET_ACCESS_KEY: 'ambient-rw-secret-must-not-be-used',
      R2_RESTORE_ACCESS_KEY_ID: '',
      R2_RESTORE_SECRET_ACCESS_KEY: '',
      ALLOW_PLACEHOLDER_R2_RO: '0',
      // Force non-dry live path; docker may fail later — credential gate must fail first.
      // Use a marker env the script honors for "credential-only check" if present, else full live.
    });
    writeEvidence('ac1-missing-restore-keys.json', run);
    // Live path: either refuse missing R2_RESTORE_* or refuse docker; must not write ambient RW as RO.
    // Preferred: non-zero before writing ambient keys into restore-target.env.
    const envFile = resolve(STAGING, host, 'restore-target.env');
    if (existsSync(envFile)) {
      const body = readFileSync(envFile, 'utf8');
      expect(body).not.toContain('ambient-rw-access-key-must-not-be-used');
      expect(body).not.toContain('ambient-rw-secret-must-not-be-used');
    }
    expect(run.status, run.combined.slice(0, 1500)).not.toBe(0);
    expect(run.combined).toMatch(
      /R2_RESTORE_|restore.*(key|credential)|PLACEHOLDER|refuse|required/i
    );
  });

  it('H3 AC-2: dry-run may write placeholders without ambient RW substitution', () => {
    const host = `s28r2-h3-dry-${Date.now()}`;
    const run = runProvision(['--host', host, '--dry-run', '--skip-isolation'], {
      R2_ACCESS_KEY_ID: 'ambient-rw-access-key-must-not-be-used',
      R2_SECRET_ACCESS_KEY: 'ambient-rw-secret-must-not-be-used',
      R2_RESTORE_ACCESS_KEY_ID: '',
      R2_RESTORE_SECRET_ACCESS_KEY: '',
    });
    writeEvidence('ac2-dry-run-placeholders.json', run);
    expect(run.status, run.combined.slice(0, 1500)).toBe(0);
    const envFile = resolve(STAGING, host, 'restore-target.env');
    expect(existsSync(envFile)).toBe(true);
    const body = readFileSync(envFile, 'utf8');
    expect(body).not.toContain('ambient-rw-access-key-must-not-be-used');
    expect(body).toMatch(/placeholder|R2_ACCESS_KEY_ID=/i);
  });

  it('H3 AC-2b: distinct R2_RESTORE_* written when provided (dry-run)', () => {
    const host = `s28r2-h3-distinct-${Date.now()}`;
    const run = runProvision(['--host', host, '--dry-run', '--skip-isolation'], {
      R2_ACCESS_KEY_ID: 'ambient-rw-access-key-must-not-be-used',
      R2_SECRET_ACCESS_KEY: 'ambient-rw-secret-must-not-be-used',
      R2_RESTORE_ACCESS_KEY_ID: 'restore-ro-access-key-distinct',
      R2_RESTORE_SECRET_ACCESS_KEY: 'restore-ro-secret-distinct',
    });
    writeEvidence('ac2b-distinct-restore-keys.json', run);
    expect(run.status, run.combined.slice(0, 1500)).toBe(0);
    const envFile = resolve(STAGING, host, 'restore-target.env');
    const body = readFileSync(envFile, 'utf8');
    expect(body).toContain('restore-ro-access-key-distinct');
    expect(body).toContain('restore-ro-secret-distinct');
    expect(body).not.toContain('ambient-rw-access-key-must-not-be-used');
  });

  it('H3 AC-3: REQUIRE_LIVE_R2_RO=1 fails when restore keys equal ambient RW', () => {
    const host = `s28r2-h3-equal-rw-${Date.now()}`;
    const same = 'same-key-for-rw-and-restore-not-ok';
    const run = runProvision(['--host', host, '--dry-run', '--skip-isolation'], {
      R2_ACCESS_KEY_ID: same,
      R2_SECRET_ACCESS_KEY: `${same}-secret`,
      R2_RESTORE_ACCESS_KEY_ID: same,
      R2_RESTORE_SECRET_ACCESS_KEY: `${same}-secret`,
      REQUIRE_LIVE_R2_RO: '1',
    });
    writeEvidence('ac3-equal-rw-refuse.json', run);
    expect(run.status, run.combined.slice(0, 1500)).not.toBe(0);
    expect(run.combined).toMatch(/distinct|equal|same|RW|refuse|REQUIRE_LIVE/i);
  });

  it('H3: ALLOW_PLACEHOLDER_R2_RO=1 allows live-shape provision without R2_RESTORE_*', () => {
    const host = `s28r2-h3-allow-ph-${Date.now()}`;
    // dry-run avoids docker dependency; still exercises credential resolution path with flag.
    const run = runProvision(['--host', host, '--dry-run', '--skip-isolation'], {
      R2_RESTORE_ACCESS_KEY_ID: '',
      R2_RESTORE_SECRET_ACCESS_KEY: '',
      ALLOW_PLACEHOLDER_R2_RO: '1',
    });
    writeEvidence('allow-placeholder.json', run);
    expect(run.status, run.combined.slice(0, 1500)).toBe(0);
  });
});
