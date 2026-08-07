/**
 * D07-02 / UC-SYNC-04 — pin Convex-pointing fallback app build + boot verification.
 *
 * pin-fallback-build:
 *   - Inspects a historical git SHA for convex/react + ConvexReactClient source env
 *   - Accepts only builds that REACH Convex (EXPO_PUBLIC_CONVEX_URL), not Hono
 *   - Negative control: fe78fe5a (platform-pointing / no Convex URL client) →
 *     PIN_DOES_NOT_REACH_CONVEX
 *   - Isolates worktree under .tmp/D07-02/ — never overwrites the live tree
 *
 * verify-fallback-boot:
 *   - Requires pinned manifest with reaches_convex:true
 *   - Real Maestro cold-boot session log OR fail-closed BOOT_UNVERIFIED
 *   - HOLO_DISABLE_SIMULATOR=1 always fails closed (never skip-and-pass)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_NO_CONVEX_CLIENT_ROOTS,
  verifyNoConvexClient,
} from '../cli/commands/verify-no-convex-client.ts';
import { resolveRepoRoot } from '../config/secrets.ts';

/** Last revision where app/_layout.tsx builds ConvexReactClient from EXPO_PUBLIC_CONVEX_URL. */
export const PINNED_FALLBACK_COMMIT_SHA = '25414ad1b34720c11de12323cc6609309c1023cb';
/** Platform-pointing decoy — imports convex/react but does not reach Convex cloud. */
export const PLATFORM_POINTING_DECOY_COMMIT_SHA = 'fe78fe5a6620a2e0bc7324064e13e53664eca2c1';

export const PIN_DOES_NOT_REACH_CONVEX = 'PIN_DOES_NOT_REACH_CONVEX';
export const PIN_COMMIT_MISSING = 'PIN_COMMIT_MISSING';
export const BOOT_UNVERIFIED = 'BOOT_UNVERIFIED';
export const PIN_MANIFEST_MISSING = 'PIN_MANIFEST_MISSING';

export const CONVEX_CLIENT_SOURCE_CONVEX_URL = 'EXPO_PUBLIC_CONVEX_URL';
export const CONVEX_CLIENT_SOURCE_PLATFORM_URL = 'EXPO_PUBLIC_PLATFORM_URL';

export type PinnedFallbackManifest = {
  ok: boolean;
  commit_sha: string;
  short_sha: string;
  build_digest_sha256: string;
  convex_react_present_at_commit: boolean;
  convex_react_present_at_head: boolean;
  convex_client_source_env: string;
  reaches_convex: boolean;
  worktree_path: string | null;
  layout_path_at_commit: string;
  pnpm_lock_sha256: string | null;
  head_sha: string;
  metro_required: false;
  dev_client: false;
  pinned_at_ms: number;
  manifest_path: string;
  error?: { code: string; message: string };
};

export type FallbackBootReport = {
  ok: boolean;
  commit_sha: string;
  build_digest_sha256: string;
  simulator_udid: string | null;
  boot_evidence: {
    artifact_type: 'maestro_session_log' | null;
    session_log_path: string | null;
  };
  metro_required: false;
  dev_client: false;
  at_ms: number;
  report_path: string | null;
  error?: { code: string; message: string };
};

export type PinFallbackBuildOptions = {
  commit?: string;
  cwd?: string;
  outputPath?: string;
  worktreePath?: string;
  /** When true, skip git worktree add (still compute digest from git show). */
  skipWorktree?: boolean;
};

export type VerifyFallbackBootOptions = {
  cwd?: string;
  manifestPath?: string;
  outputPath?: string | null;
  env?: NodeJS.ProcessEnv;
  /** Force fail-closed path (tests). */
  disableSimulator?: boolean;
};

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function defaultPinnedManifestPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/pinned-fallback-build-manifest.json');
}

export function defaultPinnedWorktreePath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/pinned-fallback-worktree');
}

export function defaultFallbackBootReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/fallback-boot-report.json');
}

export function defaultMaestroSessionLogPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/maestro-fallback-boot-session.log');
}

function git(
  args: string[],
  cwd: string
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function resolveCommitSha(commit: string, cwd: string): string | null {
  const r = git(['rev-parse', '--verify', `${commit}^{commit}`], cwd);
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

export function readBlobAtCommit(commit: string, path: string, cwd: string): string | null {
  const r = git(['show', `${commit}:${path}`], cwd);
  if (r.status !== 0) return null;
  return r.stdout;
}

/**
 * Grep convex/react imports at a historical commit under app/components/hooks/screens.
 */
export function convexReactPresentAtCommit(commit: string, cwd: string): boolean {
  const roots = [...DEFAULT_NO_CONVEX_CLIENT_ROOTS];
  const r = git(
    [
      'grep',
      '-n',
      '-E',
      String.raw`from ['"]convex/react['"]|require\(['"]convex/react['"]\)`,
      commit,
      '--',
      ...roots,
    ],
    cwd
  );
  // git grep: 0 = hits, 1 = no hits, other = error
  return r.status === 0 && r.stdout.trim().length > 0;
}

/**
 * Discriminate whether app/_layout.tsx at commit actually points ConvexReactClient
 * at the Convex cloud deployment (EXPO_PUBLIC_CONVEX_URL) vs Hono (PLATFORM_URL).
 *
 * Import-only checks are insufficient — fe78fe5a / 9b8d1596 still import convex/react
 * (or residual hooks) while the client talks to Hono.
 */
export function detectConvexClientSource(layoutSource: string): {
  convex_client_source_env: string;
  has_convex_react_import: boolean;
  has_convex_react_client: boolean;
  reaches_convex: boolean;
} {
  const has_convex_react_import =
    /from\s+['"]convex\/react['"]/.test(layoutSource) ||
    /require\(\s*['"]convex\/react['"]\s*\)/.test(layoutSource);

  const has_convex_react_client = /new\s+ConvexReactClient\s*\(/.test(layoutSource);

  // Prefer explicit env literals in ConvexReactClient construction / nearby assignment.
  const clientCtorMatch = layoutSource.match(/new\s+ConvexReactClient\s*\(\s*([^\n;]+)/);
  const ctorExpr = clientCtorMatch?.[1] ?? '';

  // Direct env in ctor: new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL ...)
  if (
    /EXPO_PUBLIC_CONVEX_URL/.test(ctorExpr) ||
    (/convexUrl/.test(ctorExpr) &&
      /EXPO_PUBLIC_CONVEX_URL/.test(layoutSource) &&
      /const\s+convexUrl\s*=\s*process\.env\.EXPO_PUBLIC_CONVEX_URL/.test(layoutSource))
  ) {
    return {
      convex_client_source_env: CONVEX_CLIENT_SOURCE_CONVEX_URL,
      has_convex_react_import,
      has_convex_react_client,
      reaches_convex: true,
    };
  }

  if (
    /EXPO_PUBLIC_PLATFORM_URL/.test(ctorExpr) ||
    (/platformUrl/.test(ctorExpr) &&
      /EXPO_PUBLIC_PLATFORM_URL/.test(layoutSource) &&
      /process\.env\.EXPO_PUBLIC_PLATFORM_URL/.test(layoutSource))
  ) {
    return {
      convex_client_source_env: CONVEX_CLIENT_SOURCE_PLATFORM_URL,
      has_convex_react_import,
      has_convex_react_client,
      reaches_convex: false,
    };
  }

  // No ConvexReactClient at all — detect residual platform wiring for negative control.
  if (/process\.env\.EXPO_PUBLIC_PLATFORM_URL/.test(layoutSource)) {
    return {
      convex_client_source_env: CONVEX_CLIENT_SOURCE_PLATFORM_URL,
      has_convex_react_import,
      has_convex_react_client,
      reaches_convex: false,
    };
  }

  if (/process\.env\.EXPO_PUBLIC_CONVEX_URL/.test(layoutSource) && has_convex_react_client) {
    return {
      convex_client_source_env: CONVEX_CLIENT_SOURCE_CONVEX_URL,
      has_convex_react_import,
      has_convex_react_client,
      reaches_convex: true,
    };
  }

  return {
    convex_client_source_env: '',
    has_convex_react_import,
    has_convex_react_client,
    reaches_convex: false,
  };
}

function headSha(cwd: string): string {
  const r = git(['rev-parse', 'HEAD'], cwd);
  return r.status === 0 ? r.stdout.trim() : '';
}

function ensureWorktree(
  commit: string,
  worktreePath: string,
  cwd: string
): {
  ok: boolean;
  error?: string;
} {
  mkdirSync(dirname(worktreePath), { recursive: true });
  if (existsSync(worktreePath)) {
    // Remove existing worktree registration + directory so we can re-add cleanly.
    git(['worktree', 'remove', '--force', worktreePath], cwd);
    rmSync(worktreePath, { recursive: true, force: true });
  }
  const add = git(['worktree', 'add', '--detach', worktreePath, commit], cwd);
  if (add.status !== 0) {
    return {
      ok: false,
      error: add.stderr.trim() || add.stdout.trim() || 'git worktree add failed',
    };
  }
  return { ok: true };
}

function computeBuildDigest(options: { commit: string; layoutSource: string; cwd: string }): {
  digest: string;
  pnpm_lock_sha256: string | null;
} {
  const lock = readBlobAtCommit(options.commit, 'pnpm-lock.yaml', options.cwd);
  const pkg = readBlobAtCommit(options.commit, 'package.json', options.cwd) ?? '';
  const parts = [
    `commit:${options.commit}`,
    `layout:${sha256Hex(options.layoutSource)}`,
    `package.json:${sha256Hex(pkg)}`,
    `pnpm-lock.yaml:${lock ? sha256Hex(lock) : 'absent'}`,
  ];
  return {
    digest: sha256Hex(parts.join('\n')),
    pnpm_lock_sha256: lock ? sha256Hex(lock) : null,
  };
}

/**
 * Pin a Convex-pointing fallback app build identity for the soak window.
 * Fail-closed when the candidate does not actually reach Convex cloud.
 */
export function runPinFallbackBuild(options: PinFallbackBuildOptions = {}): PinnedFallbackManifest {
  const cwd = options.cwd ?? resolveRepoRoot();
  const commitArg = options.commit?.trim() || PINNED_FALLBACK_COMMIT_SHA;
  const manifestPath = options.outputPath ?? defaultPinnedManifestPath(cwd);
  const worktreePath = options.worktreePath ?? defaultPinnedWorktreePath(cwd);
  const head = headSha(cwd);

  const fullSha = resolveCommitSha(commitArg, cwd);
  if (!fullSha) {
    const manifest: PinnedFallbackManifest = {
      ok: false,
      commit_sha: commitArg,
      short_sha: commitArg.slice(0, 8),
      build_digest_sha256: '',
      convex_react_present_at_commit: false,
      convex_react_present_at_head: false,
      convex_client_source_env: '',
      reaches_convex: false,
      worktree_path: null,
      layout_path_at_commit: 'app/_layout.tsx',
      pnpm_lock_sha256: null,
      head_sha: head,
      metro_required: false,
      dev_client: false,
      pinned_at_ms: Date.now(),
      manifest_path: manifestPath,
      error: {
        code: PIN_COMMIT_MISSING,
        message: `commit not found: ${commitArg}`,
      },
    };
    ensureParent(manifestPath);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }

  const layoutSource = readBlobAtCommit(fullSha, 'app/_layout.tsx', cwd) ?? '';
  const source = detectConvexClientSource(layoutSource);
  const convex_react_present_at_commit =
    convexReactPresentAtCommit(fullSha, cwd) || source.has_convex_react_import;

  const headReport = verifyNoConvexClient({ repoRoot: cwd });
  const convex_react_present_at_head = !headReport.ok && headReport.hit_count > 0;

  const { digest, pnpm_lock_sha256 } = computeBuildDigest({
    commit: fullSha,
    layoutSource,
    cwd,
  });

  const reaches_convex =
    source.reaches_convex === true &&
    source.convex_client_source_env === CONVEX_CLIENT_SOURCE_CONVEX_URL &&
    source.has_convex_react_client === true;

  // Positive source env must always be recorded (even on refusal).
  let convex_client_source_env = source.convex_client_source_env;
  if (!convex_client_source_env && !reaches_convex) {
    // Last-ditch: if PLATFORM_URL appears anywhere in layout, record it.
    if (/EXPO_PUBLIC_PLATFORM_URL/.test(layoutSource)) {
      convex_client_source_env = CONVEX_CLIENT_SOURCE_PLATFORM_URL;
    }
  }

  if (!reaches_convex) {
    const manifest: PinnedFallbackManifest = {
      ok: false,
      commit_sha: fullSha,
      short_sha: fullSha.slice(0, 8),
      build_digest_sha256: digest,
      convex_react_present_at_commit,
      convex_react_present_at_head,
      convex_client_source_env: convex_client_source_env || CONVEX_CLIENT_SOURCE_PLATFORM_URL,
      reaches_convex: false,
      worktree_path: null,
      layout_path_at_commit: 'app/_layout.tsx',
      pnpm_lock_sha256,
      head_sha: head,
      metro_required: false,
      dev_client: false,
      pinned_at_ms: Date.now(),
      manifest_path: manifestPath,
      error: {
        code: PIN_DOES_NOT_REACH_CONVEX,
        message:
          `commit ${fullSha.slice(0, 12)} does not construct ConvexReactClient from ` +
          `${CONVEX_CLIENT_SOURCE_CONVEX_URL} (source_env=${convex_client_source_env || 'unset'}; ` +
          `convex_react_present=${convex_react_present_at_commit})`,
      },
    };
    ensureParent(manifestPath);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }

  let worktree: string | null = null;
  if (!options.skipWorktree) {
    const wt = ensureWorktree(fullSha, worktreePath, cwd);
    if (wt.ok) {
      worktree = worktreePath;
    }
    // Worktree failure is non-fatal for pin identity (digest is content-addressed from git),
    // but we still prefer a real worktree when available.
  }

  const manifest: PinnedFallbackManifest = {
    ok: true,
    commit_sha: fullSha,
    short_sha: fullSha.slice(0, 8),
    build_digest_sha256: digest,
    convex_react_present_at_commit: true,
    convex_react_present_at_head,
    convex_client_source_env: CONVEX_CLIENT_SOURCE_CONVEX_URL,
    reaches_convex: true,
    worktree_path: worktree,
    layout_path_at_commit: 'app/_layout.tsx',
    pnpm_lock_sha256,
    head_sha: head,
    metro_required: false,
    dev_client: false,
    pinned_at_ms: Date.now(),
    manifest_path: manifestPath,
  };

  ensureParent(manifestPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function simulatorDisabled(env: NodeJS.ProcessEnv, explicit?: boolean): boolean {
  if (explicit === true) return true;
  const v = env.HOLO_DISABLE_SIMULATOR?.trim();
  return v === '1' || v === 'true' || v === 'yes';
}

function resolveSimulatorUdid(env: NodeJS.ProcessEnv): string | null {
  if (simulatorDisabled(env)) return null;
  const fromEnv =
    env.MAESTRO_SIMULATOR_UDID?.trim() ||
    env.IOS_SIMULATOR_UDID?.trim() ||
    env.SIMULATOR_UDID?.trim() ||
    '';
  if (fromEnv && /^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/.test(fromEnv)) {
    return fromEnv;
  }
  // Try xcrun simctl — only accept booted devices.
  const r = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (r.status !== 0) return null;
  try {
    const parsed = JSON.parse(r.stdout || '{}') as {
      devices?: Record<string, Array<{ udid?: string; state?: string }>>;
    };
    for (const list of Object.values(parsed.devices ?? {})) {
      for (const d of list) {
        if (
          d.state === 'Booted' &&
          typeof d.udid === 'string' &&
          /^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/.test(d.udid)
        ) {
          return d.udid;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Verify boot of the pinned fallback build.
 * Fail-closed with BOOT_UNVERIFIED when no simulator/device or no Maestro session log.
 * NEVER reports ok:true without a real maestro_session_log artifact.
 */
export function runVerifyFallbackBoot(options: VerifyFallbackBootOptions = {}): FallbackBootReport {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? resolveRepoRoot();
  const manifestPath = options.manifestPath ?? defaultPinnedManifestPath(cwd);
  const reportPath =
    options.outputPath === null ? null : (options.outputPath ?? defaultFallbackBootReportPath(cwd));
  const sessionLogPath = defaultMaestroSessionLogPath(cwd);

  const fail = (
    code: string,
    message: string,
    partial?: Partial<FallbackBootReport>
  ): FallbackBootReport => {
    const report: FallbackBootReport = {
      ok: false,
      commit_sha: partial?.commit_sha ?? '',
      build_digest_sha256: partial?.build_digest_sha256 ?? '',
      simulator_udid: partial?.simulator_udid ?? null,
      boot_evidence: partial?.boot_evidence ?? {
        artifact_type: null,
        session_log_path: null,
      },
      metro_required: false,
      dev_client: false,
      at_ms: Date.now(),
      report_path: reportPath,
      error: { code, message },
    };
    if (reportPath) {
      ensureParent(reportPath);
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    return report;
  };

  if (!existsSync(manifestPath)) {
    return fail(PIN_MANIFEST_MISSING, `pinned manifest missing at ${manifestPath}`);
  }

  let manifest: PinnedFallbackManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PinnedFallbackManifest;
  } catch (err) {
    return fail(
      PIN_MANIFEST_MISSING,
      `pinned manifest unparseable: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!manifest.reaches_convex || !manifest.ok) {
    return fail(
      PIN_DOES_NOT_REACH_CONVEX,
      'pinned manifest does not reach Convex — refuse boot verification',
      {
        commit_sha: manifest.commit_sha,
        build_digest_sha256: manifest.build_digest_sha256,
      }
    );
  }

  if (simulatorDisabled(env, options.disableSimulator)) {
    return fail(
      BOOT_UNVERIFIED,
      'HOLO_DISABLE_SIMULATOR=1 — no simulator/device available; fail closed',
      {
        commit_sha: manifest.commit_sha,
        build_digest_sha256: manifest.build_digest_sha256,
        simulator_udid: null,
        boot_evidence: { artifact_type: null, session_log_path: null },
      }
    );
  }

  const udid = resolveSimulatorUdid(env);
  if (!udid) {
    return fail(
      BOOT_UNVERIFIED,
      'no booted simulator/device resolvable (set MAESTRO_SIMULATOR_UDID or boot a simulator)',
      {
        commit_sha: manifest.commit_sha,
        build_digest_sha256: manifest.build_digest_sha256,
        simulator_udid: null,
        boot_evidence: { artifact_type: null, session_log_path: null },
      }
    );
  }

  // Require a Release-configuration standalone artifact under .tmp/D07-02.
  // A Metro/dev-client boot of HEAD would not prove the pinned SHA (fakeable).
  const artifactCandidates = [
    resolve(cwd, '.tmp/D07-02/pinned-fallback.app'),
    resolve(cwd, '.tmp/D07-02/build/Build/Products/Release-iphonesimulator/Holocron.app'),
    resolve(cwd, '.tmp/D07-02/pinned-fallback.ipa'),
  ];
  const appArtifact = artifactCandidates.find((p) => existsSync(p));
  if (!appArtifact) {
    return fail(
      BOOT_UNVERIFIED,
      'no pinned Release app artifact under .tmp/D07-02 (build 25414ad1 with expo prebuild + run:ios --configuration Release first)',
      {
        commit_sha: manifest.commit_sha,
        build_digest_sha256: manifest.build_digest_sha256,
        simulator_udid: udid,
        boot_evidence: { artifact_type: null, session_log_path: null },
      }
    );
  }

  // Attempt real Maestro cold-boot against the gate flow.
  // A missing maestro binary or failed run fails closed — never invents a session log.
  const flowCandidates = [
    resolve(cwd, '.e2e/maestro/gate/step-1-cold-boot.yaml'),
    resolve(cwd, '.maestro/cutover/fallback-convex-boot.yml'),
  ];
  const flow = flowCandidates.find((p) => existsSync(p));
  if (!flow) {
    return fail(
      BOOT_UNVERIFIED,
      'no Maestro cold-boot flow found (.e2e/maestro/gate/step-1-cold-boot.yaml)',
      {
        commit_sha: manifest.commit_sha,
        build_digest_sha256: manifest.build_digest_sha256,
        simulator_udid: udid,
        boot_evidence: { artifact_type: null, session_log_path: null },
      }
    );
  }

  const maestroWhich = spawnSync('which', ['maestro'], { encoding: 'utf8' });
  if (maestroWhich.status !== 0 || !(maestroWhich.stdout ?? '').trim()) {
    return fail(BOOT_UNVERIFIED, 'maestro binary not found on PATH', {
      commit_sha: manifest.commit_sha,
      build_digest_sha256: manifest.build_digest_sha256,
      simulator_udid: udid,
      boot_evidence: { artifact_type: null, session_log_path: null },
    });
  }

  const maestro = spawnSync('maestro', ['--udid', udid, 'test', flow], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...env,
      MAESTRO_SIMULATOR_UDID: udid,
    },
  });

  const logBody = [
    `# D07-02 fallback boot Maestro session`,
    `commit_sha=${manifest.commit_sha}`,
    `build_digest_sha256=${manifest.build_digest_sha256}`,
    `simulator_udid=${udid}`,
    `flow=${flow}`,
    `status=${String(maestro.status)}`,
    `at_ms=${Date.now()}`,
    '--- stdout ---',
    maestro.stdout ?? '',
    '--- stderr ---',
    maestro.stderr ?? '',
    maestro.error ? `--- spawn_error ---\n${maestro.error.message}` : '',
  ].join('\n');

  ensureParent(sessionLogPath);
  writeFileSync(sessionLogPath, `${logBody}\n`, 'utf8');

  if (maestro.status !== 0 || maestro.error) {
    return fail(
      BOOT_UNVERIFIED,
      `Maestro cold-boot failed status=${String(maestro.status)}: ${
        maestro.stderr?.trim() || maestro.error?.message || 'non-zero exit'
      }`,
      {
        commit_sha: manifest.commit_sha,
        build_digest_sha256: manifest.build_digest_sha256,
        simulator_udid: udid,
        boot_evidence: {
          artifact_type: 'maestro_session_log',
          session_log_path: sessionLogPath,
        },
      }
    );
  }

  const report: FallbackBootReport = {
    ok: true,
    commit_sha: manifest.commit_sha,
    build_digest_sha256: manifest.build_digest_sha256,
    simulator_udid: udid,
    boot_evidence: {
      artifact_type: 'maestro_session_log',
      session_log_path: sessionLogPath,
    },
    metro_required: false,
    dev_client: false,
    at_ms: Date.now(),
    report_path: reportPath,
  };
  if (reportPath) {
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}

export function formatPinFallbackBuildText(m: PinnedFallbackManifest): string {
  return [
    'holo cutover:pin-fallback-build — UC-SYNC-04 Convex-pointing fallback pin',
    `  ok:                           ${m.ok}`,
    `  commit_sha:                   ${m.commit_sha}`,
    `  build_digest_sha256:          ${m.build_digest_sha256}`,
    `  convex_react_present_at_commit: ${m.convex_react_present_at_commit}`,
    `  convex_react_present_at_head:   ${m.convex_react_present_at_head}`,
    `  convex_client_source_env:     ${m.convex_client_source_env}`,
    `  reaches_convex:               ${m.reaches_convex}`,
    `  worktree:                     ${m.worktree_path ?? '(none)'}`,
    m.error ? `  error.code:                   ${m.error.code}` : '',
    m.error ? `  error.message:                ${m.error.message}` : '',
    m.ok ? '  status: OK' : '  status: FAIL',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatVerifyFallbackBootText(r: FallbackBootReport): string {
  return [
    'holo cutover:verify-fallback-boot — UC-SYNC-04 pinned build boot proof',
    `  ok:                    ${r.ok}`,
    `  commit_sha:            ${r.commit_sha}`,
    `  build_digest_sha256:   ${r.build_digest_sha256}`,
    `  simulator_udid:        ${r.simulator_udid ?? '(none)'}`,
    `  boot_evidence.type:    ${r.boot_evidence.artifact_type ?? '(none)'}`,
    `  boot_evidence.path:    ${r.boot_evidence.session_log_path ?? '(none)'}`,
    r.error ? `  error.code:            ${r.error.code}` : '',
    r.error ? `  error.message:         ${r.error.message}` : '',
    r.ok ? '  status: OK' : '  status: FAIL',
  ]
    .filter(Boolean)
    .join('\n');
}
