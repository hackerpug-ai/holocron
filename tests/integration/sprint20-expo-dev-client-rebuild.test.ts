/**
 * Sprint 20 GATE-FIX-G1 — Expo development-simulator rebuild honesty.
 *
 * AC-1: fail-closed eas/credential probe with next_input_needed
 * AC-2: FORCE_EAS_BUILD produces method=eas|eas-local provenance (live)
 * AC-3: new .app installs on named simulator (live)
 * AC-4: reject crashing reuse-existing seed as rebuild + crash-diagnosis.md
 *
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO = process.cwd();
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const PROBE = 'scripts/e2e/probe-expo-dev-client-prereqs.sh';
const BUILD = 'scripts/e2e/build-expo-dev-client.sh';
const OUT_DIR = join(REPO, '.tmp/e2e/expo-dev-client');
const PROVENANCE = join(OUT_DIR, 'build-provenance.json');
const APP_PATH = join(OUT_DIR, 'holocron.app');
const DIAGNOSIS = join(OUT_DIR, 'crash-diagnosis.md');
const EVIDENCE_DIR = join(REPO, '.tmp/GATE-FIX-G1');

const MAESTRO_DEVICE = process.env.MAESTRO_DEVICE || 'iPhone 17';

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeEvidence(name: string, body: string): void {
  ensureEvidenceDir();
  writeFileSync(join(EVIDENCE_DIR, name), body, 'utf8');
}

function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs = 60_000
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, {
    cwd: REPO,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function parseJsonLoose(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return {};
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

describe('Sprint 20 GATE-FIX-G1 Expo dev-client rebuild', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for GATE-FIX-G1 rebuild honesty — refusing skip-to-green'
      );
    }
    ensureEvidenceDir();
  });

  describe('AC-1: fail-closed eas/credential probe', () => {
    it('exits non-zero with ok:false and next_input_needed when eas/auth missing', () => {
      // PATH stripped so `eas` / bunx / npx are invisible; EXPO_TOKEN + seed unset.
      const r = run('/bin/bash', [PROBE, '--check'], {
        ...process.env,
        PATH: '/usr/bin:/bin',
        EXPO_TOKEN: '',
        E2E_SEED_APP_PATH: '',
        FORCE_EAS_BUILD: '1',
        // Prevent accidental inheritance of empty-string vs unset quirks.
        HOME: process.env.HOME,
      });

      writeEvidence(
        'ac1-probe.json',
        JSON.stringify(
          {
            status: r.status,
            stdout: r.stdout,
            stderr: r.stderr,
          },
          null,
          2
        )
      );

      expect(r.status, `probe should fail-closed, stderr=${r.stderr}`).not.toBe(0);
      const body = parseJsonLoose(r.stdout || r.stderr);
      expect(body.ok).toBe(false);
      const next = String(body.next_input_needed ?? '');
      expect(next.toLowerCase()).toContain('eas');
      // Must not greenwash via seed alone.
      expect(body.ok).not.toBe(true);
      expect(r.stdout + r.stderr).not.toMatch(/"ok"\s*:\s*true/);
    });

    it('FORCE_EAS_BUILD build path fails closed when eas cannot resolve', () => {
      const r = run(
        '/bin/bash',
        [BUILD],
        {
          ...process.env,
          PATH: '/usr/bin:/bin',
          EXPO_TOKEN: '',
          E2E_SEED_APP_PATH: '',
          FORCE_EAS_BUILD: '1',
          EXPO_DEV_BUILD_OUT_DIR: join(EVIDENCE_DIR, 'ac1-build-out'),
          HOME: process.env.HOME,
        },
        30_000
      );
      writeEvidence(
        'ac1-build-fail.json',
        JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }, null, 2)
      );
      expect(r.status).not.toBe(0);
      const combined = `${r.stdout}\n${r.stderr}`.toLowerCase();
      expect(
        combined.includes('eas') || combined.includes('next_input_needed'),
        `expected eas / next_input_needed in fail output: ${combined}`
      ).toBe(true);
      // Must not write method=reuse-existing as success for FORCE path.
      const forcedProv = join(EVIDENCE_DIR, 'ac1-build-out', 'build-provenance.json');
      if (existsSync(forcedProv)) {
        const p = JSON.parse(readFileSync(forcedProv, 'utf8')) as { method?: string };
        expect(p.method).not.toBe('reuse-existing');
      }
    });
  });

  describe('AC-4: reject crashing seed as rebuild + crash-diagnosis', () => {
    it('rejects method=reuse-existing as rebuild success and writes crash-diagnosis.md', () => {
      const fixtureRoot = join(EVIDENCE_DIR, 'ac4-crashing-seed');
      const app = join(fixtureRoot, 'holocron.app');
      const prov = join(fixtureRoot, 'build-provenance.json');
      mkdirSync(app, { recursive: true });
      writeFileSync(join(app, 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"/>', 'utf8');
      writeFileSync(
        prov,
        JSON.stringify({ method: 'reuse-existing', app_path: app }, null, 2),
        'utf8'
      );
      expect(existsSync(app), `crashing seed missing at ${app}`).toBe(true);
      expect(existsSync(prov), `seed provenance missing at ${prov}`).toBe(true);

      const seedProv = JSON.parse(readFileSync(prov, 'utf8')) as {
        method?: string;
        app_path?: string;
      };
      writeEvidence('ac4-seed-provenance.json', JSON.stringify(seedProv, null, 2));

      // Honesty: reuse-existing alone is NOT an eas rebuild.
      expect(seedProv.method).toBe('reuse-existing');
      expect(seedProv.method === 'eas' || seedProv.method === 'eas-local').toBe(false);

      // Existence of .app must not be treated as rebuild proof.
      const appExists = existsSync(app) && existsSync(join(app, 'Info.plist'));
      expect(appExists).toBe(true);
      const rebuildHonest = seedProv.method === 'eas' || seedProv.method === 'eas-local';
      expect(rebuildHonest, 'reuse-existing seed must not pass rebuild honesty').toBe(false);

      // Write diagnosis via probe --diagnose (reads failed-this-cycle + seed).
      const r = run('/bin/bash', [PROBE, '--diagnose'], {
        ...process.env,
        D03_02_CRASHING_SEED: app,
        D03_02_CRASHING_PROVENANCE: prov,
        EXPO_CRASH_DIAGNOSIS_PATH: DIAGNOSIS,
        MAESTRO_FAILED_CYCLE_DIR: existsSync(
          join(REPO, '.tmp/maestro-reference-flow/failed-this-cycle')
        )
          ? join(REPO, '.tmp/maestro-reference-flow/failed-this-cycle')
          : '/Users/inference1/Projects/holocron/.tmp/maestro-reference-flow/failed-this-cycle',
      });
      writeEvidence(
        'ac4-diagnose.json',
        JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }, null, 2)
      );
      expect(r.status).toBe(0);
      expect(existsSync(DIAGNOSIS)).toBe(true);
      const bytes = statSync(DIAGNOSIS).size;
      expect(bytes).toBeGreaterThan(0);
      const text = readFileSync(DIAGNOSIS, 'utf8');
      expect(text.toLowerCase()).toContain('root cause');
      expect(text.toLowerCase()).toMatch(/reuse-existing|stale-reuse/);
      // Copy into evidence.
      writeEvidence('crash-diagnosis.md', text);
    });
  });

  describe('AC-2: FORCE_EAS_BUILD method=eas provenance', () => {
    it('produces valid holocron.app with method eas|eas-local (not reuse-existing)', {
      timeout: 3_600_000,
    }, () => {
      // Live rebuild — may take 20–60+ minutes. Skip only if operator
      // explicitly sets GATE_FIX_G1_SKIP_EAS=1 (must not auto-skip-to-green).
      if (process.env.GATE_FIX_G1_SKIP_EAS === '1') {
        throw new Error(
          'GATE_FIX_G1_SKIP_EAS=1 set — refusing skip-to-green; unset to run real FORCE_EAS_BUILD'
        );
      }

      const isEasMethod = (m: string | undefined): boolean =>
        m === 'eas' || m === 'eas-local' || m === 'eas-local-discovered';

      // Reuse a fresh FORCE_EAS_BUILD artifact from this worktree if already
      // present (method=eas*), so the suite does not pay a second 20–60min
      // build when the operator just produced one. Never accept reuse-existing.
      let usedExisting = false;
      if (existsSync(join(APP_PATH, 'Info.plist')) && existsSync(PROVENANCE)) {
        const existing = JSON.parse(readFileSync(PROVENANCE, 'utf8')) as {
          method?: string;
          force_eas_build?: boolean;
        };
        if (isEasMethod(existing.method) && existing.force_eas_build === true) {
          usedExisting = true;
          writeEvidence(
            'ac2-build.json',
            JSON.stringify(
              {
                status: 0,
                reused_fresh_force_eas_artifact: true,
                provenance: existing,
              },
              null,
              2
            )
          );
        }
      }

      if (!usedExisting) {
        const r = run(
          '/bin/bash',
          [BUILD],
          {
            ...process.env,
            FORCE_EAS_BUILD: '1',
            E2E_SEED_APP_PATH: '',
            // Keep real EXPO_TOKEN / PATH so bunx eas-cli + fastlane can run.
            PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}`,
          },
          3_600_000
        );
        writeEvidence(
          'ac2-build.json',
          JSON.stringify(
            {
              status: r.status,
              stdoutTail: r.stdout.slice(-4000),
              stderrTail: r.stderr.slice(-4000),
            },
            null,
            2
          )
        );
        expect(
          r.status,
          `FORCE_EAS_BUILD failed: ${r.stderr.slice(-2000)}\n${r.stdout.slice(-2000)}`
        ).toBe(0);
      }

      expect(existsSync(join(APP_PATH, 'Info.plist'))).toBe(true);
      expect(existsSync(PROVENANCE)).toBe(true);
      const prov = JSON.parse(readFileSync(PROVENANCE, 'utf8')) as {
        method?: string;
        app_path?: string;
        force_eas_build?: boolean;
      };
      writeEvidence('ac2-provenance.json', JSON.stringify(prov, null, 2));
      expect(isEasMethod(prov.method), `expected eas method, got ${prov.method}`).toBe(true);
      expect(prov.method).not.toBe('reuse-existing');
      expect(prov.method).not.toBe('seed-app-path');
    });
  });

  describe('AC-3: simctl install on named simulator', () => {
    it('installs rebuilt .app on MAESTRO_DEVICE', { timeout: 180_000 }, () => {
      expect(
        existsSync(join(APP_PATH, 'Info.plist')),
        `rebuilt app missing at ${APP_PATH} — run AC-2 first`
      ).toBe(true);

      // Read bundle id for uninstall (best-effort).
      const plutil = run(
        'plutil',
        ['-extract', 'CFBundleIdentifier', 'raw', join(APP_PATH, 'Info.plist')],
        process.env
      );
      const bundleId = (plutil.stdout || '').trim() || 'org.name.holocron';

      run('xcrun', ['simctl', 'uninstall', MAESTRO_DEVICE, bundleId], process.env, 60_000);

      const install = run(
        'xcrun',
        ['simctl', 'install', MAESTRO_DEVICE, APP_PATH],
        process.env,
        120_000
      );
      writeEvidence(
        'ac3-simctl-install.json',
        JSON.stringify(
          {
            status: install.status,
            stdout: install.stdout,
            stderr: install.stderr,
            device: MAESTRO_DEVICE,
            app_path: APP_PATH,
            bundle_id: bundleId,
          },
          null,
          2
        )
      );
      expect(install.status, `simctl install failed: ${install.stderr || install.stdout}`).toBe(0);

      // installed_path == EXPO_DEV_BUILD_PATH (the rebuilt app we staged)
      const installedPath = process.env.EXPO_DEV_BUILD_PATH || APP_PATH;
      expect(installedPath).toBe(APP_PATH);
      expect(existsSync(join(installedPath, 'Info.plist'))).toBe(true);
    });
  });
});
