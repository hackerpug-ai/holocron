/**
 * D07-02 — pin Convex-pointing fallback build + fail-closed boot proof (UC-SYNC-04 AC-3/AC-4).
 *
 * AC-3: pin 25414ad1 (reaches Convex) succeeds; pin fe78fe5a refuses PIN_DOES_NOT_REACH_CONVEX.
 * AC-4: verify-fallback-boot fails closed with BOOT_UNVERIFIED when no simulator.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-pinned-fallback-build.test.ts
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOOT_UNVERIFIED,
  detectConvexClientSource,
  PIN_DOES_NOT_REACH_CONVEX,
  PINNED_FALLBACK_COMMIT_SHA,
  PLATFORM_POINTING_DECOY_COMMIT_SHA,
  runPinFallbackBuild,
  runVerifyFallbackBoot,
} from '../../src/cutover/pinned-fallback-build.ts';
import { holo, PLATFORM_IT, REPO_ROOT, writeEvidence } from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-pinned-fallback-build requires PLATFORM_IT=1');
}

const EVIDENCE = resolve(REPO_ROOT, '.tmp/D07-02');
const MANIFEST = resolve(EVIDENCE, 'pinned-fallback-build-manifest.json');
const BOOT_REPORT = resolve(EVIDENCE, 'fallback-boot-report.json');

describe('D07-02: cutover:pin-fallback-build + verify-fallback-boot', () => {
  it('AC-3 Case 0: pin 25414ad1 records reaches_convex + EXPO_PUBLIC_CONVEX_URL', () => {
    mkdirSync(EVIDENCE, { recursive: true });
    const manifest = runPinFallbackBuild({
      commit: PINNED_FALLBACK_COMMIT_SHA,
      cwd: REPO_ROOT,
      outputPath: MANIFEST,
      // Worktree is fine — isolated under .tmp/D07-02
    });

    writeEvidence('ac3-pin-25414ad1.json', manifest, EVIDENCE);

    expect(manifest.commit_sha).toBe(PINNED_FALLBACK_COMMIT_SHA);
    expect(manifest.convex_react_present_at_commit).toBe(true);
    expect(manifest.convex_client_source_env).toBe('EXPO_PUBLIC_CONVEX_URL');
    expect(manifest.reaches_convex).toBe(true);
    expect(manifest.ok).toBe(true);
    expect(manifest.convex_react_present_at_head).toBe(false);
    expect(manifest.build_digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.build_digest_sha256).not.toBe('');
    expect(manifest.commit_sha).not.toBe(manifest.head_sha);
    expect(manifest.convex_client_source_env).not.toBe('EXPO_PUBLIC_PLATFORM_URL');
    expect(existsSync(MANIFEST)).toBe(true);
  }, 120_000);

  it('AC-3 Case 1: pin fe78fe5a refuses with PIN_DOES_NOT_REACH_CONVEX', () => {
    const manifest = runPinFallbackBuild({
      commit: PLATFORM_POINTING_DECOY_COMMIT_SHA,
      cwd: REPO_ROOT,
      outputPath: resolve(EVIDENCE, 'pinned-fallback-decoy-manifest.json'),
      skipWorktree: true,
    });

    writeEvidence('ac3-pin-fe78fe5a.json', manifest, EVIDENCE);

    expect(manifest.convex_react_present_at_commit).toBe(true);
    expect(manifest.convex_client_source_env).toBe('EXPO_PUBLIC_PLATFORM_URL');
    expect(manifest.reaches_convex).toBe(false);
    expect(manifest.ok).toBe(false);
    expect(manifest.error?.code).toBe(PIN_DOES_NOT_REACH_CONVEX);
    expect(manifest.convex_client_source_env).not.toBe('');
  }, 60_000);

  it('AC-3 discriminator: 25414ad1 source vs 9b8d1596/platform source', () => {
    // Spot-check the pure detector against known layout snippets.
    const convexLayout = `
import { ConvexProvider, ConvexReactClient } from 'convex/react';
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = new ConvexReactClient(convexUrl ?? 'https://placeholder.convex.cloud');
`;
    const platformLayout = `
import { ConvexProvider, ConvexReactClient } from 'convex/react';
const platformUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
const convex = new ConvexReactClient(platformUrl ?? 'http://127.0.0.1:4111');
`;
    const a = detectConvexClientSource(convexLayout);
    const b = detectConvexClientSource(platformLayout);
    expect(a.reaches_convex).toBe(true);
    expect(a.convex_client_source_env).toBe('EXPO_PUBLIC_CONVEX_URL');
    expect(b.reaches_convex).toBe(false);
    expect(b.convex_client_source_env).toBe('EXPO_PUBLIC_PLATFORM_URL');
  });

  it('TC-7: verify:no-convex-client at HEAD is clean', () => {
    const r = holo(['verify:no-convex-client', '--json']);
    const parsed = JSON.parse(r.stdout || '{}') as { ok?: boolean; hit_count?: number };
    writeEvidence('tc7-no-convex-client.json', parsed, EVIDENCE);
    expect(parsed.ok).toBe(true);
    expect(parsed.hit_count ?? 0).toBe(0);
  });

  it('AC-4 Case 1: verify-fallback-boot fails closed BOOT_UNVERIFIED without simulator', () => {
    // Ensure a valid pin manifest exists first.
    runPinFallbackBuild({
      commit: PINNED_FALLBACK_COMMIT_SHA,
      cwd: REPO_ROOT,
      outputPath: MANIFEST,
      skipWorktree: true,
    });

    const boot = runVerifyFallbackBoot({
      cwd: REPO_ROOT,
      manifestPath: MANIFEST,
      outputPath: BOOT_REPORT,
      disableSimulator: true,
      env: { ...process.env, HOLO_DISABLE_SIMULATOR: '1' },
    });

    writeEvidence('ac4-boot-unverified.json', boot, EVIDENCE);

    expect(boot.ok).toBe(false);
    expect(boot.error?.code).toBe(BOOT_UNVERIFIED);
    expect(boot.error?.code).not.toBe('');
    expect(boot.simulator_udid).toBeNull();
    expect(boot.boot_evidence.session_log_path).toBeNull();
  });

  it('CLI: pin-fallback-build + verify-fallback-boot are registered', () => {
    const pin = holo([
      'cutover:pin-fallback-build',
      '--commit',
      PINNED_FALLBACK_COMMIT_SHA,
      '--json',
      '--output',
      resolve(EVIDENCE, 'cli-pin-manifest.json'),
    ]);
    writeEvidence(
      'cli-pin-stdout.txt',
      { status: pin.status, stdout: pin.stdout, stderr: pin.stderr },
      EVIDENCE
    );
    expect(pin.stderr + pin.stdout).not.toMatch(/unknown command/i);
    const pinJson = JSON.parse(pin.stdout || '{}') as {
      ok?: boolean;
      reaches_convex?: boolean;
      commit_sha?: string;
    };
    expect(pinJson.commit_sha).toBe(PINNED_FALLBACK_COMMIT_SHA);
    expect(pinJson.reaches_convex).toBe(true);
    expect(pinJson.ok).toBe(true);

    const decoy = holo([
      'cutover:pin-fallback-build',
      '--commit',
      PLATFORM_POINTING_DECOY_COMMIT_SHA,
      '--json',
      '--output',
      resolve(EVIDENCE, 'cli-decoy-manifest.json'),
    ]);
    const decoyJson = JSON.parse(decoy.stdout || '{}') as {
      ok?: boolean;
      error?: { code?: string };
      reaches_convex?: boolean;
    };
    writeEvidence('cli-decoy.json', decoyJson, EVIDENCE);
    expect(decoyJson.ok).toBe(false);
    expect(decoyJson.reaches_convex).toBe(false);
    expect(decoyJson.error?.code).toBe(PIN_DOES_NOT_REACH_CONVEX);
    expect(decoy.status).not.toBe(0);

    const boot = holo(
      [
        'cutover:verify-fallback-boot',
        '--json',
        '--output',
        resolve(EVIDENCE, 'cli-boot-report.json'),
      ],
      { ...process.env, HOLO_DISABLE_SIMULATOR: '1' }
    );
    const bootJson = JSON.parse(boot.stdout || '{}') as {
      ok?: boolean;
      error?: { code?: string };
    };
    writeEvidence('cli-boot.json', bootJson, EVIDENCE);
    expect(bootJson.ok).toBe(false);
    expect(bootJson.error?.code).toBe(BOOT_UNVERIFIED);
    expect(boot.status).not.toBe(0);
  }, 180_000);

  it('manifest file on disk matches library output', () => {
    runPinFallbackBuild({
      commit: PINNED_FALLBACK_COMMIT_SHA,
      cwd: REPO_ROOT,
      outputPath: MANIFEST,
      skipWorktree: true,
    });
    const onDisk = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      commit_sha: string;
      build_digest_sha256: string;
    };
    expect(onDisk.commit_sha).toBe(PINNED_FALLBACK_COMMIT_SHA);
    expect(onDisk.build_digest_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
