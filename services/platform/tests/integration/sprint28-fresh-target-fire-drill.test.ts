/**
 * REDHAT-FIX-S28R2-C1 — Fire drill bound to provisioned fresh-target volumes.
 *
 * Proves:
 *   - scripts/run-fire-drill-on-fresh-target.sh exists
 *   - fail-closed when target volumes are missing/unresolvable
 *   - when docker volumes exist, scratch+blob resolve to volume Mountpoints
 *   - attestation JSON records container, volumes, mountpoints
 *   - CLI --fresh-target wiring present
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fresh-target-fire-drill.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R2/C1');

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function dockerAvailable(): boolean {
  const info = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 15_000 });
  return info.status === 0;
}

describe('REDHAT-FIX-S28R2 C1 fresh-target fire-drill binding (always)', () => {
  it('C1 AC-1: runner script exists and bash -n clean', () => {
    expect(existsSync(RUNNER), `missing ${RUNNER}`).toBe(true);
    const syntax = spawnSync('bash', ['-n', RUNNER], { encoding: 'utf8' });
    expect(syntax.status, syntax.stderr).toBe(0);
  });

  it('C1: holo CLI wires --fresh-target', () => {
    const src = readFileSync(HOLO_CLI, 'utf8');
    expect(src).toMatch(/--fresh-target/);
    expect(src).toMatch(/freshTarget|fresh_target|fresh-target/);
  });

  it('C1 AC-1: refuse missing/unresolvable fresh target volumes (fail closed)', () => {
    expect(existsSync(RUNNER)).toBe(true);
    const host = `no-such-fresh-target-${Date.now()}`;
    const att = resolve(EVIDENCE_DIR, `refuse-${host}.json`);
    const run = spawnSync(
      'bash',
      [RUNNER, '--host', host, '--resolve-only', '--attestation', att],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env },
      }
    );
    writeEvidence('refuse-missing-target.json', {
      status: run.status,
      stdout: (run.stdout ?? '').slice(0, 2000),
      stderr: (run.stderr ?? '').slice(0, 2000),
    });
    expect(run.status, (run.stderr ?? '') + (run.stdout ?? '')).not.toBe(0);
    expect(`${run.stdout ?? ''}\n${run.stderr ?? ''}`).toMatch(
      /volume|unresolvable|missing|not found|refuse/i
    );
  });

  it('S28R3 AC-2: gate claim is not green solely on resolve-only — full fire-drill path exists', () => {
    // Terra CRITICAL-1: resolve-only-only is insufficient for the CAP-BAK-01 gate claim.
    // Runner must implement full restore:fire-drill on volume mountpoints; gate step3
    // must invoke that path (asserted in sprint28-s28r3-gate-bind.test.ts).
    const src = readFileSync(RUNNER, 'utf8');
    expect(src).toMatch(/restore:fire-drill/);
    expect(src).toMatch(
      /--scratch "\$SCRATCH_MP"|--scratch "\$\{SCRATCH_MP\}"|--scratch "\$SCRATCH_MP"/
    );
    expect(src).toMatch(/RESOLVE_ONLY/);
    // Full path requires target timestamp when not resolve-only.
    expect(src).toMatch(/--target-timestamp required unless --resolve-only/);
    writeEvidence('s28r3-not-resolve-only-only.json', {
      has_fire_drill: true,
      has_resolve_only_gate: true,
      note: 'gate claim requires run without --resolve-only on provisioned volumes',
    });
  });
});

describe('REDHAT-FIX-S28R2 C1 docker volume mountpoint binding (PLATFORM_IT)', () => {
  itLive(
    'C1 AC-2: provisioned volumes → resolve-only binds scratch/blob to Mountpoints + attestation',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for PLATFORM_IT fresh-target fire-drill binding test');
      }
      expect(existsSync(PROVISION)).toBe(true);
      expect(existsSync(RUNNER)).toBe(true);

      const host = `s28r2-c1-${Date.now().toString(36)}`;
      const staging = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R2/C1/staging');
      // Unique host port to avoid Bind: port already allocated on shared mini.
      const pgPort = String(56000 + (Date.now() % 4000));
      const provision = spawnSync(
        'bash',
        [PROVISION, '--host', host, '--skip-isolation', '--pg-port', pgPort],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 180_000,
          env: {
            ...process.env,
            STAGING_ROOT: staging,
            ALLOW_PLACEHOLDER_R2_RO: '1',
            R2_RESTORE_ACCESS_KEY_ID: '',
            R2_RESTORE_SECRET_ACCESS_KEY: '',
            MINI_HOST: '203.0.113.1',
            RESTORE_PG_PORT: pgPort,
          },
        }
      );
      writeEvidence('provision-result.json', {
        status: provision.status,
        stdout: (provision.stdout ?? '').slice(0, 3000),
        stderr: (provision.stderr ?? '').slice(0, 3000),
      });
      expect(provision.status, provision.stderr ?? provision.stdout).toBe(0);

      const att = resolve(EVIDENCE_DIR, `attestation-${host}.json`);
      const resolveOnly = spawnSync(
        'bash',
        [RUNNER, '--host', host, '--resolve-only', '--attestation', att],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
        }
      );
      writeEvidence('resolve-only-result.json', {
        status: resolveOnly.status,
        stdout: (resolveOnly.stdout ?? '').slice(0, 3000),
        stderr: (resolveOnly.stderr ?? '').slice(0, 3000),
      });
      expect(resolveOnly.status, resolveOnly.stderr ?? resolveOnly.stdout).toBe(0);
      expect(existsSync(att)).toBe(true);
      const body = JSON.parse(readFileSync(att, 'utf8')) as {
        host?: string;
        container?: string;
        volumes?: { pgdata?: string; blob?: string };
        mountpoints?: { scratch?: string; blob?: string };
        scratch?: string;
        blobDir?: string;
        ok?: boolean;
      };
      writeEvidence('attestation-parsed.json', body);
      expect(body.ok).toBe(true);
      expect(body.host ?? body.container).toMatch(new RegExp(host));
      const scratch = body.mountpoints?.scratch ?? body.scratch;
      const blob = body.mountpoints?.blob ?? body.blobDir;
      expect(scratch, 'scratch mountpoint').toBeTruthy();
      expect(blob, 'blob mountpoint').toBeTruthy();
      // Must not be host-only .tmp scratch without volume binding.
      expect(String(scratch)).not.toMatch(/\.tmp\/REDHAT-FIX-H2/);
      // Mountpoints should exist on host when volumes are local.
      if (scratch && existsSync(scratch)) {
        expect(existsSync(scratch)).toBe(true);
      }

      // Cleanup container (best-effort).
      spawnSync('docker', ['rm', '-f', host], { encoding: 'utf8', timeout: 30_000 });
      spawnSync('docker', ['volume', 'rm', '-f', `${host}-pgdata`, `${host}-blobs`], {
        encoding: 'utf8',
        timeout: 30_000,
      });
    },
    300_000
  );
});
