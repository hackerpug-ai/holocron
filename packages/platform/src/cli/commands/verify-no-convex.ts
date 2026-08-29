/**
 * D08-01 / CAP-CUT-01 — composite Convex decommission oracle.
 *
 * This command deliberately runs every subgate. A static residue failure must
 * not hide a broken iOS build or a broken built MCP distribution.
 */
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { resolveRepoRoot } from '../../config/secrets.ts';

export const NO_CONVEX_SOURCE_ROOTS = [
  'app',
  'components',
  'hooks',
  'screens',
  'lib',
  'holocron-mcp/src',
] as const;

export const NO_CONVEX_PACKAGE_MANIFESTS = [
  'package.json',
  'packages/platform/package.json',
  'holocron-mcp/package.json',
] as const;

export const NO_CONVEX_LEGACY_PATHS = ['convex', 'python', 'cli', 'ratatui-playground'] as const;

const BUILD_TIMEOUT_MS = 900_000;
const MCP_BUILD_TIMEOUT_MS = 180_000;
const MCP_RESPONSE_TIMEOUT_MS = 30_000;
const MCP_SHUTDOWN_TIMEOUT_MS = 2_000;
const MCP_PROBE_ENV = {
  PLATFORM_URL: 'http://127.0.0.1:4111',
  HOLO_KEY_MCP: 'd08-local-probe',
} as const;

export type ConvexSourceHit = {
  file: string;
  line: number;
  text: string;
};

export type ManifestFinding = {
  manifest: string;
  key: string;
};

export type SourceRootScan = {
  root: string;
  scanned_file_count: number;
  hit_count: number;
  error?: string;
};

export type SourceSubgate = {
  ok: boolean;
  scanned_root_count: number;
  scanned_file_count: number;
  roots: string[];
  root_scans: SourceRootScan[];
  hit_count: number;
  hits: ConvexSourceHit[];
  errors: string[];
};

export type ManifestSubgate = {
  ok: boolean;
  package_manifest_count: number;
  manifests: string[];
  forbidden_dependency_count: number;
  findings: ManifestFinding[];
  errors: string[];
};

export type LegacyPathSubgate = {
  ok: boolean;
  expected_count: number;
  present_count: number;
  present_paths: string[];
};

export type AppBuildSubgate = {
  ok: boolean;
  command: string;
  build_exit_code: number | null;
  holocron_app_artifact_count: number;
  artifacts: string[];
  holocron_app_info_plist: string | null;
  error?: string;
};

export type McpRuntimeSubgate = {
  ok: boolean;
  build_command: string;
  start_command: string;
  build_exit_code: number | null;
  server_name: string | null;
  tool_count: number | null;
  error?: string;
};

export type VerifyNoConvexReport = {
  ok: boolean;
  source_hit_count: number;
  forbidden_dependency_count: number;
  legacy_path_present_count: number;
  scanned_root_count: number;
  package_manifest_count: number;
  source: SourceSubgate;
  manifests: ManifestSubgate;
  paths: LegacyPathSubgate;
  app_build: AppBuildSubgate;
  mcp_runtime: McpRuntimeSubgate;
};

type McpMessage = {
  result?: {
    serverInfo?: { name?: string };
    tools?: Array<{ name?: string }>;
  };
  error?: unknown;
};

type JsonObject = Record<string, unknown>;

function parseRgHits(stdout: string, repoRoot: string): ConvexSourceHit[] {
  const hits: ConvexSourceHit[] = [];
  for (const raw of stdout.split(/\r?\n/u)) {
    if (!raw) continue;
    const match = raw.match(/^(.*):(\d+):(.*)$/u);
    if (!match) {
      hits.push({ file: raw, line: 0, text: raw });
      continue;
    }
    hits.push({
      file: relative(repoRoot, match[1] ?? raw),
      line: Number(match[2]),
      text: match[3] ?? '',
    });
  }
  return hits;
}

function scanRootFiles(repoRoot: string, root: string): SourceRootScan {
  const absoluteRoot = resolve(repoRoot, root);
  if (!existsSync(absoluteRoot)) {
    return { root, scanned_file_count: 0, hit_count: 0, error: 'root is missing' };
  }

  try {
    if (!statSync(absoluteRoot).isDirectory()) {
      return { root, scanned_file_count: 0, hit_count: 0, error: 'root is not a directory' };
    }
  } catch (error) {
    return {
      root,
      scanned_file_count: 0,
      hit_count: 0,
      error: `root cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const result = spawnSync(
    'rg',
    ['--files', '--color', 'never', '--glob', '!**/node_modules/**', '--glob', '!**/dist/**', root],
    { cwd: repoRoot, encoding: 'utf8' }
  );

  if (result.error || result.status === 2) {
    return {
      root,
      scanned_file_count: 0,
      hit_count: 0,
      error: `file inventory failed: ${(result.error?.message ?? result.stderr ?? 'unknown rg error').trim()}`,
    };
  }

  const scannedFileCount = (result.stdout ?? '').split(/\r?\n/u).filter(Boolean).length;
  return {
    root,
    scanned_file_count: scannedFileCount,
    hit_count: 0,
    ...(scannedFileCount === 0 ? { error: 'root contains no files to scan' } : {}),
  };
}

function scanSource(repoRoot: string): SourceSubgate {
  const roots = [...NO_CONVEX_SOURCE_ROOTS];
  const rootScans = roots.map((root) => scanRootFiles(repoRoot, root));
  const hits: ConvexSourceHit[] = [];
  const errors = rootScans
    .filter((scan) => scan.error)
    .map((scan) => `${scan.root}: ${scan.error}`);

  for (const rootScan of rootScans) {
    if (rootScan.error) continue;
    const result = spawnSync(
      'rg',
      [
        '--ignore-case',
        '--line-number',
        '--no-heading',
        '--color',
        'never',
        '--glob',
        '!**/node_modules/**',
        '--glob',
        '!**/dist/**',
        'convex',
        rootScan.root,
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    );

    if (result.error || result.status === 2) {
      errors.push(
        `${rootScan.root}: rg failed: ${(result.error?.message ?? result.stderr ?? result.stdout ?? 'unknown rg error').trim()}`
      );
      continue;
    }
    if (result.status === 0) {
      const rootHits = parseRgHits(result.stdout ?? '', repoRoot);
      rootScan.hit_count = rootHits.length;
      hits.push(...rootHits);
    }
  }

  return {
    ok: errors.length === 0 && hits.length === 0,
    scanned_root_count: roots.length,
    scanned_file_count: rootScans.reduce((total, scan) => total + scan.scanned_file_count, 0),
    roots,
    root_scans: rootScans,
    hit_count: hits.length,
    hits,
    errors,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function manifestFindings(manifestPath: string, manifest: JsonObject): ManifestFinding[] {
  const findings: ManifestFinding[] = [];
  const sections = [
    'scripts',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'bundledDependencies',
    'overrides',
    'resolutions',
  ] as const;

  for (const section of sections) {
    const entries = manifest[section];
    if (!isJsonObject(entries)) continue;
    for (const [key, value] of Object.entries(entries)) {
      // A verifier script key can name the check itself. Ignore that harmless
      // key reference, but always inspect the script command for runtime
      // Convex usage. Dependency-style sections retain key and value checks
      // because package identifiers are themselves residue.
      const serialized =
        section === 'scripts' ? JSON.stringify(value) : `${key} ${JSON.stringify(value)}`;
      const hasConvexReference =
        section === 'scripts'
          ? /(?<!no[-:])\bconvex\b/iu.test(serialized)
          : /convex/iu.test(serialized);
      if (!hasConvexReference) continue;
      findings.push({ manifest: manifestPath, key: `${section}.${key}` });
    }
  }

  return findings;
}

function scanManifests(repoRoot: string): ManifestSubgate {
  const manifests = [...NO_CONVEX_PACKAGE_MANIFESTS];
  const findings: ManifestFinding[] = [];
  const errors: string[] = [];

  for (const manifest of manifests) {
    const path = resolve(repoRoot, manifest);
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!isJsonObject(parsed)) {
        errors.push(`${manifest}: manifest must contain a JSON object`);
        continue;
      }
      findings.push(...manifestFindings(manifest, parsed));
    } catch (error) {
      errors.push(`${manifest}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    ok: errors.length === 0 && findings.length === 0,
    package_manifest_count: manifests.length,
    manifests,
    forbidden_dependency_count: findings.length,
    findings,
    errors,
  };
}

function scanLegacyPaths(repoRoot: string): LegacyPathSubgate {
  const presentPaths = NO_CONVEX_LEGACY_PATHS.filter((path) => existsSync(resolve(repoRoot, path)));
  return {
    ok: presentPaths.length === 0,
    expected_count: NO_CONVEX_LEGACY_PATHS.length,
    present_count: presentPaths.length,
    present_paths: [...presentPaths],
  };
}

/**
 * Extract the app bundle that Expo says it installed. This intentionally does
 * not search DerivedData: a previous build's artifact cannot satisfy AC-3.
 */
export function parseExpoAppArtifactPath(stdout: string): string | null {
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const match = line.match(/^(?:›\s*)?Installing\b.*?(\/.*?\/holocron\.app)(?:\s+on\b|\s*$)/u);
    if (!match?.[1]) continue;

    const appPath = resolve(match[1]);
    if (appPath.includes('/DerivedData/') && appPath.endsWith('/holocron.app')) {
      return appPath;
    }
  }
  return null;
}

function runAppBuild(repoRoot: string): AppBuildSubgate {
  const command = 'pnpm build:ios -- --no-bundler';
  const result = spawnSync('pnpm', ['build:ios', '--', '--no-bundler'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: BUILD_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  const buildExitCode = result.status;
  const appArtifactPath = parseExpoAppArtifactPath(result.stdout ?? '');
  const infoPlistPath = appArtifactPath ? join(appArtifactPath, 'Info.plist') : null;
  const infoPlistExists = infoPlistPath !== null && existsSync(infoPlistPath);
  const artifacts = infoPlistPath ? [infoPlistPath] : [];
  const error =
    result.error?.message ??
    (buildExitCode !== 0
      ? (result.stderr || result.stdout || 'iOS build failed').trim().slice(-2_000)
      : !appArtifactPath
        ? 'Expo stdout did not report an installed Xcode DerivedData holocron.app path'
        : !infoPlistExists
          ? `Expo-reported app Info.plist is missing: ${infoPlistPath}`
          : undefined);

  return {
    ok: buildExitCode === 0 && infoPlistExists,
    command,
    build_exit_code: buildExitCode,
    holocron_app_artifact_count: infoPlistExists ? 1 : 0,
    artifacts,
    holocron_app_info_plist: infoPlistPath,
    ...(error ? { error } : {}),
  };
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => {
    const timer = setTimeout(resolveExit, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

async function stopMcpChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;

  if (child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  } else {
    child.kill('SIGTERM');
  }
  await waitForExit(child, MCP_SHUTDOWN_TIMEOUT_MS);

  if (child.exitCode === null) {
    if (child.pid && process.platform !== 'win32') {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    } else {
      child.kill('SIGKILL');
    }
    await waitForExit(child, MCP_SHUTDOWN_TIMEOUT_MS);
  }
}

async function runMcpRpc(
  child: ChildProcessWithoutNullStreams,
  payload: Record<string, unknown>,
  buffer: { value: string },
  stderr: { value: string }
): Promise<McpMessage | null> {
  if (String(payload.method ?? '').startsWith('notifications/')) {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return null;
  }

  return new Promise((resolveMessage, reject) => {
    const timeout = setTimeout(() => {
      child.stdout.off('data', onData);
      reject(
        new Error(
          `MCP ${String(payload.method)} timed out${stderr.value ? `: ${stderr.value.slice(-1_000)}` : ''}`
        )
      );
    }, MCP_RESPONSE_TIMEOUT_MS);

    const consume = (): void => {
      const newline = buffer.value.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.value.slice(0, newline).trim();
      buffer.value = buffer.value.slice(newline + 1);
      if (!line) {
        consume();
        return;
      }
      if (!line.startsWith('{')) {
        consume();
        return;
      }
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      try {
        resolveMessage(JSON.parse(line) as McpMessage);
      } catch (error) {
        reject(error);
      }
    };

    const onData = (chunk: Buffer): void => {
      buffer.value += chunk.toString('utf8');
      consume();
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr.value += chunk.toString('utf8');
    });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    consume();
  });
}

async function runMcpProbe(repoRoot: string): Promise<McpRuntimeSubgate> {
  const buildCommand = 'pnpm --dir holocron-mcp build';
  const startCommand = 'pnpm --dir holocron-mcp start';
  const build = spawnSync('pnpm', ['--dir', 'holocron-mcp', 'build'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: MCP_BUILD_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });

  if (build.status !== 0) {
    return {
      ok: false,
      build_command: buildCommand,
      start_command: startCommand,
      build_exit_code: build.status,
      server_name: null,
      tool_count: null,
      error: build.error?.message ?? (build.stderr || build.stdout || 'MCP build failed').trim(),
    };
  }

  const child = spawn('pnpm', ['--dir', 'holocron-mcp', 'start'], {
    cwd: repoRoot,
    env: { ...process.env, ...MCP_PROBE_ENV, LOG_LEVEL: 'error' },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const buffer = { value: '' };
  const stderr = { value: '' };
  child.stderr.on('data', (chunk: Buffer) => {
    stderr.value += chunk.toString('utf8');
  });

  let serverName: string | null = null;
  let toolCount: number | null = null;
  let error: string | undefined;
  try {
    const initialized = await runMcpRpc(
      child,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'd08-01-oracle', version: '1' },
        },
      },
      buffer,
      stderr
    );
    if (initialized?.error) throw new Error('MCP initialize returned a JSON-RPC error');
    serverName = initialized?.result?.serverInfo?.name ?? null;

    await runMcpRpc(child, { jsonrpc: '2.0', method: 'notifications/initialized' }, buffer, stderr);
    const listed = await runMcpRpc(
      child,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      buffer,
      stderr
    );
    if (listed?.error) throw new Error('MCP tools/list returned a JSON-RPC error');
    toolCount = listed?.result?.tools?.length ?? null;
  } catch (probeError) {
    error = probeError instanceof Error ? probeError.message : String(probeError);
  } finally {
    await stopMcpChild(child);
  }

  return {
    ok: build.status === 0 && error === undefined && serverName === 'holocron' && toolCount === 49,
    build_command: buildCommand,
    start_command: startCommand,
    build_exit_code: build.status,
    server_name: serverName,
    tool_count: toolCount,
    ...(error ? { error } : {}),
  };
}

export async function verifyNoConvex(options?: {
  repoRoot?: string;
}): Promise<VerifyNoConvexReport> {
  const repoRoot = options?.repoRoot ?? resolveRepoRoot();
  const repository = scanNoConvexRepository(repoRoot);
  const { source, manifests, paths } = repository;
  const appBuild = runAppBuild(repoRoot);
  const mcpRuntime = await runMcpProbe(repoRoot);

  return {
    ok: source.ok && manifests.ok && paths.ok && appBuild.ok && mcpRuntime.ok,
    source_hit_count: source.hit_count,
    forbidden_dependency_count: manifests.forbidden_dependency_count,
    legacy_path_present_count: paths.present_count,
    scanned_root_count: source.scanned_root_count,
    package_manifest_count: manifests.package_manifest_count,
    source,
    manifests,
    paths,
    app_build: appBuild,
    mcp_runtime: mcpRuntime,
  };
}

export type NoConvexRepositoryScan = {
  source: SourceSubgate;
  manifests: ManifestSubgate;
  paths: LegacyPathSubgate;
};

export function scanNoConvexRepository(repoRoot = resolveRepoRoot()): NoConvexRepositoryScan {
  return {
    source: scanSource(repoRoot),
    manifests: scanManifests(repoRoot),
    paths: scanLegacyPaths(repoRoot),
  };
}

export function formatVerifyNoConvexText(report: VerifyNoConvexReport): string {
  const lines = [
    'holo verify:no-convex — composite Convex decommission oracle',
    `  status: ${report.ok ? 'OK' : 'FAIL'}`,
    `  source_hit_count: ${report.source_hit_count} across ${report.scanned_root_count} roots`,
    `  forbidden_dependency_count: ${report.forbidden_dependency_count} across ${report.package_manifest_count} manifests`,
    `  legacy_path_present_count: ${report.legacy_path_present_count}`,
    `  app_build: exit=${String(report.app_build.build_exit_code)} artifacts=${report.app_build.holocron_app_artifact_count}`,
    `  mcp_runtime: build_exit=${String(report.mcp_runtime.build_exit_code)} server=${String(report.mcp_runtime.server_name)} tools=${String(report.mcp_runtime.tool_count)}`,
  ];

  for (const hit of report.source.hits) {
    lines.push(`  source: ${hit.file}:${hit.line}: ${hit.text.trim()}`);
  }
  for (const finding of report.manifests.findings) {
    lines.push(`  manifest: ${finding.manifest}:${finding.key}`);
  }
  for (const path of report.paths.present_paths) {
    lines.push(`  legacy_path: ${path}`);
  }
  return lines.join('\n');
}
