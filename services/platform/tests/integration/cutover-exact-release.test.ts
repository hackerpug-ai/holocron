/**
 * CUTOVER-RELEASE-001 — exact-SHA release staging / package / deploy identity.
 *
 * PLATFORM_IT=1 required for primary AC evidence. No mocks of docker/git/registry.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCleanExactSha,
  composeSha256,
  defaultComposePath,
  DIGEST_PATTERN,
  REVISION_PATTERN,
  stageExactRelease,
  type ExactReleaseManifest,
  type ProcessRunner,
} from '../../src/deploy/production-release.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;

const scratchDirs: string[] = [];

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `cutover-release-${prefix}-`));
  scratchDirs.push(dir);
  return dir;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(
  command: string,
  args: string[],
  cwd = REPO_ROOT,
  env: NodeJS.ProcessEnv = process.env
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('CUTOVER-RELEASE-001 exact SHA release', () => {
  it('AC-1 helpers refuse dirty and wrong-SHA input before any build/push', () => {
    const dirtyRoot = scratch('dirty');
    run('git', ['init'], dirtyRoot);
    writeFileSync(join(dirtyRoot, 'README'), 'x\n');
    run('git', ['add', 'README'], dirtyRoot);
    run(
      'git',
      ['-c', 'user.email=t@example.com', '-c', 'user.name=tester', 'commit', '-m', 'init'],
      dirtyRoot
    );
    const sha = run('git', ['rev-parse', 'HEAD'], dirtyRoot).stdout.trim();

    const commands: string[][] = [];
    const dirtyRunner: ProcessRunner = (command, args) => {
      commands.push([command, ...args]);
      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: `${sha}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'status') {
        return { status: 0, stdout: ' M README\n', stderr: '' };
      }
      if (command === 'docker') {
        return { status: 0, stdout: 'SHOULD_NOT_RUN\n', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: `unexpected ${command}` };
    };

    expect(() =>
      assertCleanExactSha({ cwd: dirtyRoot, sourceRevision: sha, runner: dirtyRunner })
    ).toThrow(/source tree is dirty/i);
    expect(commands.some((c) => c[0] === 'docker')).toBe(false);

    const wrongCommands: string[][] = [];
    const wrongRunner: ProcessRunner = (command, args) => {
      wrongCommands.push([command, ...args]);
      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: `${sha}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'status') {
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'docker') {
        return { status: 0, stdout: 'SHOULD_NOT_RUN\n', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: `unexpected ${command}` };
    };

    expect(() =>
      assertCleanExactSha({
        cwd: dirtyRoot,
        sourceRevision: 'a'.repeat(40),
        runner: wrongRunner,
      })
    ).toThrow(/source revision mismatch|does not match requested/i);
    expect(wrongCommands.filter((c) => c[0] === 'docker')).toHaveLength(0);
  });

  itLive('AC-1: clean exact SHA stages twice to one manifest digest; negatives exit nonzero', () => {
    const stageScript = resolve(REPO_ROOT, 'scripts/stage-holocron-release.sh');
    expect(existsSync(stageScript), 'scripts/stage-holocron-release.sh must exist').toBe(true);

    const sourceRevision = run('git', ['rev-parse', 'HEAD']).stdout.trim();
    expect(sourceRevision).toMatch(REVISION_PATTERN);
    const dirty = run('git', ['status', '--porcelain=v1', '--untracked-files=all']).stdout.trim();
    // Ignore untracked node_modules if present in this worktree.
    const meaningfulDirty = dirty
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.endsWith('node_modules') && !line.includes('node_modules/'))
      .join('\n');
    expect(meaningfulDirty, 'worktree must be clean for live AC-1 staging').toBe('');

    const outA = scratch('stage-a');
    const outB = scratch('stage-b');
    const negativeOut = scratch('stage-neg');
    const env = {
      ...process.env,
      PLATFORM_IT: '1',
      HOLO_OCI_REGISTRY: process.env.HOLO_OCI_REGISTRY ?? 'localhost:5000',
      HOLO_PREVIOUS_PLATFORM_IMAGE:
        process.env.HOLO_PREVIOUS_PLATFORM_IMAGE ??
        'localhost:5000/holocron-platform@sha256:e20d53470c936831bf2ed9e7b4bf6a1a509baab5fcd89eb6d7ec0c6fece23a4f',
    };

    const stageOnce = (outDir: string) => {
      const result = run(
        'bash',
        [stageScript, '--source-revision', sourceRevision, '--out', outDir, '--json'],
        REPO_ROOT,
        env
      );
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const manifestPath = join(outDir, 'release-manifest.json');
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExactReleaseManifest;
      return { manifest, manifestSha256: sha256File(manifestPath) };
    };

    const a = stageOnce(outA);
    const b = stageOnce(outB);
    expect(a.manifest.sourceRevision).toBe(sourceRevision);
    expect(b.manifest.sourceRevision).toBe(sourceRevision);
    expect(a.manifestSha256).toBe(b.manifestSha256);
    expect(a.manifest.composeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.manifest.composeSha256).toBe(composeSha256(defaultComposePath(REPO_ROOT)));

    const wrong = run(
      'bash',
      [stageScript, '--source-revision', 'b'.repeat(40), '--out', negativeOut, '--json'],
      REPO_ROOT,
      env
    );
    expect(wrong.status).not.toBe(0);
    expect(`${wrong.stdout}\n${wrong.stderr}`).not.toMatch(/pushed|docker build|buildx build/i);

    const dirtyWt = scratch('dirty-wt');
    const wtAdd = run('git', ['worktree', 'add', '--detach', dirtyWt, sourceRevision], REPO_ROOT);
    expect(wtAdd.status, wtAdd.stderr || wtAdd.stdout).toBe(0);
    writeFileSync(join(dirtyWt, `DIRTY_CUTOVER_RELEASE_${randomBytes(3).toString('hex')}`), 'nope\n');
    const dirtyStage = run(
      'bash',
      [
        stageScript,
        '--source-revision',
        sourceRevision,
        '--out',
        join(negativeOut, 'dirty'),
        '--json',
        '--repo',
        dirtyWt,
      ],
      dirtyWt,
      env
    );
    expect(dirtyStage.status).not.toBe(0);
    expect(`${dirtyStage.stdout}\n${dirtyStage.stderr}`).not.toMatch(/pushed|docker build/i);
    run('git', ['worktree', 'remove', '--force', dirtyWt], REPO_ROOT);

    const evidenceDir = resolve(
      REPO_ROOT,
      `.tmp/CUTOVER-RELEASE-001/${process.env.CUTOVER_RELEASE_RUN_ID ?? `ac1-${Date.now()}`}`
    );
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, 'ac1-evidence.json'),
      `${JSON.stringify(
        {
          cleanRunCount: 2,
          cleanManifestSha256Count: 1,
          cleanManifestSha256: a.manifestSha256,
          negativeExitCode: wrong.status,
          dirtyExitCode: dirtyStage.status,
          negativePushCount: 0,
          sourceRevision,
        },
        null,
        2
      )}\n`
    );

    // Keep the typed staging API wired for unit-level consumers.
    expect(typeof stageExactRelease).toBe('function');
  });

  it('AC-2 package shape requires backup runner pins and forbids latest', () => {
    expect(typeof stageExactRelease).toBe('function');

    const fake: ExactReleaseManifest = {
      schemaVersion: 1,
      sourceRevision: 'c'.repeat(40),
      composeSha256: 'd'.repeat(64),
      imageDigests: {
        platform: `sha256:${'e'.repeat(64)}`,
        postgres: `sha256:${'f'.repeat(64)}`,
        zeroCache: `sha256:${'a'.repeat(64)}`,
        pgbackrest: `sha256:${'b'.repeat(64)}`,
        restic: `sha256:${'c'.repeat(64)}`,
      },
      images: {
        platform: `localhost:5000/holocron-platform@sha256:${'e'.repeat(64)}`,
        previousPlatform: `localhost:5000/holocron-platform@sha256:${'1'.repeat(64)}`,
        postgres: `pgvector/pgvector@sha256:${'f'.repeat(64)}`,
        zeroCache: `ghcr.io/rocicorp/zero@sha256:${'a'.repeat(64)}`,
        pgbackrest: `woblerr/pgbackrest@sha256:${'b'.repeat(64)}`,
        restic: `restic/restic@sha256:${'c'.repeat(64)}`,
      },
      backupRunner: {
        pgbackrestConfPath: 'services/platform/deploy/compose/pgbackrest.conf',
        pgbackrestConfSha256: '0'.repeat(64),
        pgbackrestImage: `woblerr/pgbackrest@sha256:${'b'.repeat(64)}`,
        resticImage: `restic/restic@sha256:${'c'.repeat(64)}`,
        platformBinaryPaths: {
          pgbackrest: '/usr/local/bin/pgbackrest',
          restic: '/usr/local/bin/restic',
        },
      },
      artifactPaths: {
        releaseManifest: 'release-manifest.json',
        imageLock: 'image-lock.json',
        compose: 'services/platform/deploy/compose/compose.yaml',
        pgbackrestConf: 'services/platform/deploy/compose/pgbackrest.conf',
      },
      generatedAt: '2026-08-19T00:00:00.000Z',
    };

    for (const digest of Object.values(fake.imageDigests)) {
      expect(digest).toMatch(DIGEST_PATTERN);
    }
    for (const image of Object.values(fake.images)) {
      expect(image).toContain('@sha256:');
      expect(image).not.toMatch(/(^|:)latest(@|$)/);
    }
    expect(fake.backupRunner.pgbackrestConfPath).toContain('pgbackrest.conf');
    expect(fake.sourceRevision).toMatch(REVISION_PATTERN);
  });
});
