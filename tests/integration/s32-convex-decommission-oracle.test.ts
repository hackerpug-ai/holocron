/**
 * D08-01 — RED oracle for the Convex decommission boundary.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     tests/integration/s32-convex-decommission-oracle.test.ts
 *
 * Every case drives a real repository command or a real child-process boundary.
 * The repository assertions intentionally expect the current residue so this
 * suite proves that the verifier is honest while D08-02 performs cleanup.
 */
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { describe, expect, it } from 'vitest';
import {
  NO_CONVEX_PACKAGE_MANIFESTS,
  NO_CONVEX_SOURCE_ROOTS,
  scanNoConvexRepository,
} from '../../services/platform/src/cli/commands/verify-no-convex.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const HOLO_BIN = join(REPO_ROOT, 'bin/holo');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

type OracleReport = {
  ok?: boolean;
  source_hit_count?: number;
  forbidden_dependency_count?: number;
  legacy_path_present_count?: number;
  scanned_root_count?: number;
  package_manifest_count?: number;
  source?: { hit_count?: number };
  manifests?: { forbidden_dependency_count?: number };
  paths?: { present_count?: number };
};

type RpcMessage = {
  result?: {
    serverInfo?: { name?: string };
    tools?: Array<{ name?: string }>;
  };
  error?: unknown;
};

function makeRepositoryScanFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'd08-01-repository-scan-'));
  for (const sourceRoot of NO_CONVEX_SOURCE_ROOTS) {
    const directory = join(root, sourceRoot);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'clean.ts'), 'export const clean = true;\n', 'utf8');
  }
  for (const manifest of NO_CONVEX_PACKAGE_MANIFESTS) {
    const path = join(root, manifest);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, '{}\n', 'utf8');
  }
  return root;
}

function run(command: string, args: string[], timeoutMs: number): CommandResult {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: timeoutMs,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function parseJson<T>(stdout: string): T {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error(`expected JSON object on stdout, got:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1)) as T;
}

function findAppArtifacts(root: string): string[] {
  if (!existsSync(root)) return [];

  const artifacts: string[] = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        visit(path);
      } else if (name === 'Info.plist' && path.includes('/holocron.app/')) {
        artifacts.push(path);
      }
    }
  };

  visit(root);
  return artifacts;
}

function nextJsonMessage(
  reader: Interface,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<RpcMessage> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => {
      reader.off('line', onLine);
      reject(new Error(`timed out waiting for MCP response; stderr=${child.stderr.read() ?? ''}`));
    }, timeoutMs);

    const onLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) return;
      try {
        clearTimeout(timer);
        reader.off('line', onLine);
        resolveMessage(JSON.parse(trimmed) as RpcMessage);
      } catch (error) {
        clearTimeout(timer);
        reader.off('line', onLine);
        reject(error);
      }
    };

    reader.on('line', onLine);
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;

  child.kill('SIGTERM');
  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolveStop();
    }, 2_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveStop();
    });
  });
}

describe('D08-01 Convex decommission acceptance oracle', () => {
  itLive(
    'AC-1: composite oracle reports named current residue and fails closed',
    () => {
      const result = run(HOLO_BIN, ['verify:no-convex', '--json'], 900_000);
      const report = parseJson<OracleReport>(result.stdout);

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stdout).not.toMatch(/unknown command/i);
      expect(report.ok).toBe(false);
      expect(report.source_hit_count ?? report.source?.hit_count).toBe(64);
      expect(
        report.forbidden_dependency_count ?? report.manifests?.forbidden_dependency_count
      ).toBe(8);
      expect(report.legacy_path_present_count ?? report.paths?.present_count).toBe(4);
      expect(result.stdout).not.toMatch(/"ok"\s*:\s*true[\s\S]*0 findings/i);
    },
    900_000
  );

  itLive(
    'AC-2: repository subgate covers the complete non-degenerate cleanup boundary',
    () => {
      const result = run(HOLO_BIN, ['verify:no-convex', '--json'], 900_000);
      const report = parseJson<OracleReport>(result.stdout);

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(report.scanned_root_count).toBe(6);
      expect(report.package_manifest_count).toBe(3);
      expect(report.source_hit_count ?? report.source?.hit_count).toBe(64);
      expect(
        report.forbidden_dependency_count ?? report.manifests?.forbidden_dependency_count
      ).toBe(8);
      expect(result.stdout).not.toMatch(/"scanned_root_count"\s*:\s*0/);
      expect(report.ok).toBe(false);
    },
    900_000
  );

  itLive(
    'AC-2 negative control: empty and missing source roots cannot pass',
    () => {
      const fixture = makeRepositoryScanFixture();
      try {
        rmSync(join(fixture, 'components'), { recursive: true, force: true });
        const missingRoot = scanNoConvexRepository(fixture);
        expect(missingRoot.source.ok).toBe(false);
        expect(missingRoot.source.scanned_root_count).toBe(6);
        expect(missingRoot.source.scanned_file_count).toBe(5);
        expect(missingRoot.source.errors).toContain('components: root is missing');

        mkdirSync(join(fixture, 'components'), { recursive: true });
        const emptyRoot = scanNoConvexRepository(fixture);
        expect(emptyRoot.source.ok).toBe(false);
        expect(emptyRoot.source.scanned_file_count).toBe(5);
        expect(emptyRoot.source.errors).toContain('components: root contains no files to scan');
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
    30_000
  );

  itLive(
    'AC-3: real iOS build produces a holocron.app artifact',
    () => {
      const result = run('pnpm', ['build:ios'], 900_000);
      const artifacts = findAppArtifacts(join(REPO_ROOT, 'ios/build'));

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toContain('holocron.app/Info.plist');
    },
    900_000
  );

  itLive(
    'AC-4: built MCP stdio distribution initializes and lists exactly 44 tools',
    async () => {
      const build = run('pnpm', ['--dir', 'holocron-mcp', 'build'], 180_000);
      expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
      expect(existsSync(join(REPO_ROOT, 'holocron-mcp/dist/mastra/stdio.js'))).toBe(true);

      const child = spawn('pnpm', ['--dir', 'holocron-mcp', 'start'], {
        cwd: REPO_ROOT,
        env: { ...process.env, LOG_LEVEL: 'error' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const reader = createInterface({ input: child.stdout });

      try {
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-11-25',
              capabilities: {},
              clientInfo: { name: 'd08-01-oracle', version: '1' },
            },
          })}\n`
        );
        const initialized = await nextJsonMessage(reader, child, 30_000);
        expect(initialized.error).toBeUndefined();
        expect(initialized.result?.serverInfo?.name).toBe('holocron');

        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
        );
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`
        );
        const listed = await nextJsonMessage(reader, child, 30_000);
        expect(listed.error).toBeUndefined();
        expect(listed.result?.tools).toHaveLength(44);
      } finally {
        reader.close();
        await stopChild(child);
      }
    },
    240_000
  );
});
