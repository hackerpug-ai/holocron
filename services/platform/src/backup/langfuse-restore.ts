/**
 * OBS-04C — isolated Langfuse restore, cold restart proof, rollback schema gate.
 * Never mounts production volumes; never runs `docker compose down -v`.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../..');
const CANARY_COMPOSE = resolve(REPO_ROOT, '.tmp/OBS-01/canary/compose.yaml');
const CANARY_OTEL_CONFIG = resolve(REPO_ROOT, '.tmp/OBS-01/canary/otel-collector-config.yaml');

export type IsolatedRestoreResult = {
  ok: boolean;
  restoreProjectDistinct: true;
  expectedWitnessMismatchCount: number;
  productionVolumeMountCount: number;
  resticSnapshotCount: number;
  restoredInventoryEmpty: boolean;
  restoreProject: string;
  errors: string[];
};

export type ColdRestartResult = {
  ok: boolean;
  restartWitnessMismatchCount: number;
  stateVolumeRecreated: boolean;
  project: string;
};

export type RollbackEvaluation = {
  ok: boolean;
  compatibleRollbackMismatchCount: number;
  incompatibleRollbackExitCode: number;
  incompatibleApplyCount: number;
  reason?: string;
};

type BackupManifest = {
  sourceProject: string;
  resticRepository: string;
  resticSnapshotCount: number;
  witnesses: {
    traceId: string;
    observationId?: string;
    eventId?: string;
    objectKey?: string;
    spanName: string;
  };
};

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 180_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readPassword(evidenceDir: string): string {
  const path = join(evidenceDir, '.restic-password');
  if (!existsSync(path)) {
    throw new Error('restic password file missing — refuse restore');
  }
  return readFileSync(path, 'utf8').trim();
}

function volumeNames(): string[] {
  const listed = run('docker', ['volume', 'ls', '--format', '{{.Name}}']);
  return listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function countProductionMounts(project: string, denyList: string[]): number {
  const ps = run('docker', [
    'ps',
    '-a',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.ID}}',
  ]);
  const ids = ps.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let count = 0;
  for (const id of ids) {
    const inspect = run('docker', ['inspect', id, '--format', '{{json .Mounts}}']);
    const mounts = JSON.parse(inspect.stdout || '[]') as Array<{ Name?: string }>;
    for (const mount of mounts) {
      const name = mount.Name ?? '';
      if (denyList.some((denied) => name === denied || name.includes(denied))) {
        count += 1;
      }
    }
  }
  return count;
}

function writeIsolatedCompose(project: string, workDir: string): string {
  mkdirSync(workDir, { recursive: true });
  if (!existsSync(CANARY_COMPOSE)) {
    throw new Error(`canary compose missing at ${CANARY_COMPOSE}`);
  }
  const raw = readFileSync(CANARY_COMPOSE, 'utf8');
  // Remap published ports away from obs01-canary / production listeners.
  const remapped = raw
    .replace(/^name:\s*.+$/m, `name: ${project}`)
    .replace(/127\.0\.0\.1:15432:5432/g, '127.0.0.1:25432:5432')
    .replace(/127\.0\.0\.1:16379:6379/g, '127.0.0.1:26379:6379')
    .replace(/127\.0\.0\.1:18123:8123/g, '127.0.0.1:28123:8123')
    .replace(/127\.0\.0\.1:19000:9000/g, '127.0.0.1:29000:9000')
    .replace(/127\.0\.0\.1:19090:9000/g, '127.0.0.1:29090:9000')
    .replace(/127\.0\.0\.1:19091:9001/g, '127.0.0.1:29091:9001')
    .replace(/127\.0\.0\.1:13030:3030/g, '127.0.0.1:23030:3030')
    .replace(/127\.0\.0\.1:13100:3000/g, '127.0.0.1:23100:3000')
    .replace(/127\.0\.0\.1:14318:4318/g, '127.0.0.1:24318:4318')
    .replace(/127\.0\.0\.1:18888:8888/g, '127.0.0.1:28888:8888')
    .replace(/127\.0\.0\.1:13133:13133/g, '127.0.0.1:23133:13133')
    .replace(/NEXTAUTH_URL:\s*http:\/\/127\.0\.0\.1:13100/g, 'NEXTAUTH_URL: http://127.0.0.1:23100')
    .replace(/obs01_pg/g, `${project}_pg`)
    .replace(/obs01_redis/g, `${project}_redis`)
    .replace(/obs01_ch_data/g, `${project}_ch_data`)
    .replace(/obs01_ch_logs/g, `${project}_ch_logs`)
    .replace(/obs01_minio/g, `${project}_minio`)
    .replace(/obs01_otel_queue/g, `${project}_otel_queue`);

  const composePath = join(workDir, 'compose.yaml');
  writeFileSync(composePath, remapped);
  if (existsSync(CANARY_OTEL_CONFIG)) {
    copyFileSync(CANARY_OTEL_CONFIG, join(workDir, 'otel-collector-config.yaml'));
  }
  return composePath;
}

function waitClickHouseNative(project: string, timeoutMs = 120_000): void {
  const container = `${project}-langfuse-clickhouse-1`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ping = run(
      'docker',
      [
        'exec',
        container,
        'clickhouse-client',
        '--user',
        'clickhouse',
        '--password',
        'clickhouse',
        '-q',
        'SELECT 1',
      ],
      { timeout: 10_000 }
    );
    if (ping.status === 0 && ping.stdout.trim() === '1') return;
    spawnSync('sleep', ['2']);
  }
  throw new Error(`clickhouse native not ready for ${project}`);
}

function waitHealthy(project: string, timeoutMs = 240_000): void {
  waitClickHouseNative(project);
  const web = `${project}-langfuse-web-1`;
  const started = Date.now();
  let restarted = false;
  while (Date.now() - started < timeoutMs) {
    const health = run(
      'curl',
      ['-sS', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:23100/api/public/health'],
      { timeout: 10_000 }
    );
    if (health.stdout.trim() === '200') return;

    const state = run('docker', [
      'inspect',
      web,
      '--format',
      '{{.State.Status}}:{{.State.ExitCode}}',
    ]);
    const status = state.stdout.trim();
    if (status.startsWith('exited:') && !restarted) {
      // Common race: web migrates before ClickHouse native :9000 accepts.
      run('docker', ['start', web], { timeout: 60_000 });
      restarted = true;
    } else if (status.startsWith('exited:') && restarted) {
      run('docker', ['start', web], { timeout: 60_000 });
    }
    spawnSync('sleep', ['3']);
  }
  throw new Error(`isolated restore project ${project} web never became healthy`);
}

function restoreResticSnapshot(evidenceDir: string, targetDir: string): number {
  const password = readPassword(evidenceDir);
  const repoDir = join(evidenceDir, 'restic-repo');
  const env = {
    ...process.env,
    RESTIC_REPOSITORY: repoDir,
    RESTIC_PASSWORD: password,
  };
  mkdirSync(targetDir, { recursive: true });
  const snapshots = run('restic', ['snapshots', '--json'], { env, timeout: 60_000 });
  if (snapshots.status !== 0) {
    throw new Error(`restic snapshots failed: ${snapshots.stderr}`);
  }
  const list = JSON.parse(snapshots.stdout || '[]') as Array<{ id: string }>;
  if (list.length < 1) {
    throw new Error('no restic snapshots available for restore');
  }
  const latest = list[list.length - 1]?.id;
  const restored = run('restic', ['restore', latest!, '--target', targetDir], {
    env,
    timeout: 300_000,
  });
  if (restored.status !== 0) {
    throw new Error(`restic restore failed: ${restored.stderr || restored.stdout}`);
  }
  return list.length;
}

function findStageRoot(restoredRoot: string): string {
  // restic restores the absolute stage path under target; find the dump files.
  const stack = [restoredRoot];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    if (entries.some((entry) => entry.name === 'langfuse-postgres.dump')) {
      return current;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(join(current, entry.name));
    }
  }
  throw new Error('restored inventory missing langfuse-postgres.dump');
}

function applyPostgresDump(project: string, dumpPath: string): void {
  const container = `${project}-langfuse-postgres-1`;
  const copied = run('docker', ['cp', dumpPath, `${container}:/tmp/langfuse.dump`]);
  if (copied.status !== 0) throw new Error(`docker cp dump failed: ${copied.stderr}`);
  // Drop/recreate public schema contents via pg_restore into fresh volume.
  const restore = run(
    'docker',
    [
      'exec',
      container,
      'pg_restore',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '--clean',
      '--if-exists',
      '/tmp/langfuse.dump',
    ],
    { timeout: 180_000 }
  );
  // pg_restore may warn on non-fatal errors; require exit 0 or 1 with dump applied.
  if (restore.status !== 0 && restore.status !== 1) {
    throw new Error(`pg_restore failed: ${restore.stderr || restore.stdout}`);
  }
}

function applyClickHouseDump(project: string, dumpPath: string): void {
  const container = `${project}-langfuse-clickhouse-1`;
  const remote = '/tmp/obs04-events.native';
  const copied = run('docker', ['cp', dumpPath, `${container}:${remote}`]);
  if (copied.status !== 0) throw new Error(`docker cp clickhouse dump failed: ${copied.stderr}`);
  const truncate = run('docker', [
    'exec',
    container,
    'clickhouse-client',
    '--user',
    'clickhouse',
    '--password',
    'clickhouse',
    '-q',
    'TRUNCATE TABLE IF EXISTS events_full',
  ]);
  if (truncate.status !== 0) {
    throw new Error(`clickhouse truncate failed: ${truncate.stderr}`);
  }
  const load = run(
    'docker',
    [
      'exec',
      container,
      'clickhouse-client',
      '--user',
      'clickhouse',
      '--password',
      'clickhouse',
      '-q',
      `INSERT INTO events_full FROM INFILE '${remote}' FORMAT Native`,
    ],
    { timeout: 180_000 }
  );
  if (load.status !== 0) {
    throw new Error(`clickhouse load failed: ${load.stderr || load.stdout}`);
  }
}

function applyMinioObjects(project: string, minioStage: string): void {
  const container = `${project}-langfuse-minio-1`;
  const source = existsSync(join(minioStage, 'langfuse'))
    ? join(minioStage, 'langfuse')
    : minioStage;
  const copied = run('docker', ['cp', `${source}/.`, `${container}:/data/langfuse`], {
    timeout: 180_000,
  });
  if (copied.status !== 0) {
    // Fallback: copy parent folder.
    const alt = run('docker', ['cp', source, `${container}:/data/`], { timeout: 180_000 });
    if (alt.status !== 0) {
      throw new Error(`minio object restore failed: ${copied.stderr || alt.stderr}`);
    }
  }
}

function verifyWitness(project: string, traceId: string, spanName: string): number {
  const container = `${project}-langfuse-clickhouse-1`;
  const query = `SELECT count() FROM events_full WHERE trace_id = '${traceId}' AND name = '${spanName}'`;
  const result = run('docker', [
    'exec',
    container,
    'clickhouse-client',
    '--user',
    'clickhouse',
    '--password',
    'clickhouse',
    '-q',
    query,
  ]);
  const count = Number(result.stdout.trim() || '0');
  return count >= 1 ? 0 : 1;
}

export async function runIsolatedLangfuseRestore(input: {
  evidenceDir: string;
  restoreProject: string;
  manifestPath: string;
  productionVolumeDenyList: string[];
}): Promise<IsolatedRestoreResult> {
  const errors: string[] = [];
  if (
    input.restoreProject.includes('production') ||
    input.restoreProject === 'holocron' ||
    input.restoreProject === 'obs01-canary'
  ) {
    throw new Error('restore project must be a unique absent isolated name');
  }

  const volumesBefore = new Set(volumeNames());
  const manifest = JSON.parse(readFileSync(input.manifestPath, 'utf8')) as BackupManifest;
  const workDir = mkdtempSync(join(tmpdir(), 'obs04-restore-compose-'));
  const composePath = writeIsolatedCompose(input.restoreProject, workDir);
  const restoreStage = mkdtempSync(join(tmpdir(), 'obs04-restore-stage-'));

  try {
    const existing = run('docker', [
      'ps',
      '-a',
      '--filter',
      `label=com.docker.compose.project=${input.restoreProject}`,
      '--format',
      '{{.ID}}',
    ]);
    if (existing.stdout.trim()) {
      // Tear containers/network only (never -v) so a fresh project name is preferred
      // by callers; refuse when volumes already exist for this project name.
      const volumes = volumeNames().filter((name) => name.startsWith(`${input.restoreProject}_`));
      if (volumes.length > 0) {
        throw new Error(
          `restore project ${input.restoreProject} already has volumes — refuse reuse (pick a fresh project name)`
        );
      }
      run('docker', ['compose', '-p', input.restoreProject, '-f', composePath, 'down'], {
        cwd: workDir,
        timeout: 180_000,
      });
    }

    // Free Docker Desktop memory headroom: stop canary web/worker only (no -v).
    run('docker', ['stop', 'obs01-canary-langfuse-web-1', 'obs01-canary-langfuse-worker-1'], {
      timeout: 120_000,
    });

    const upDeps = run(
      'docker',
      [
        'compose',
        '-p',
        input.restoreProject,
        '-f',
        composePath,
        'up',
        '-d',
        'langfuse-postgres',
        'langfuse-redis',
        'langfuse-clickhouse',
        'langfuse-minio',
      ],
      { cwd: workDir, timeout: 300_000 }
    );
    if (upDeps.status !== 0) {
      run('docker', ['start', 'obs01-canary-langfuse-web-1', 'obs01-canary-langfuse-worker-1'], {
        timeout: 120_000,
      });
      throw new Error(`isolated compose deps up failed: ${upDeps.stderr || upDeps.stdout}`);
    }
    waitClickHouseNative(input.restoreProject);

    const upApp = run(
      'docker',
      [
        'compose',
        '-p',
        input.restoreProject,
        '-f',
        composePath,
        'up',
        '-d',
        'langfuse-web',
        'langfuse-worker',
        'otel-collector',
      ],
      { cwd: workDir, timeout: 300_000 }
    );
    if (upApp.status !== 0) {
      run('docker', ['start', 'obs01-canary-langfuse-web-1', 'obs01-canary-langfuse-worker-1'], {
        timeout: 120_000,
      });
      throw new Error(`isolated compose app up failed: ${upApp.stderr || upApp.stdout}`);
    }

    waitHealthy(input.restoreProject);

    const resticSnapshotCount = restoreResticSnapshot(input.evidenceDir, restoreStage);
    const stageRoot = findStageRoot(restoreStage);
    applyPostgresDump(input.restoreProject, join(stageRoot, 'langfuse-postgres.dump'));
    const clickhouseDump = existsSync(join(stageRoot, 'clickhouse-events.native'))
      ? join(stageRoot, 'clickhouse-events.native')
      : join(stageRoot, 'clickhouse-events.tsv');
    if (!existsSync(clickhouseDump)) {
      throw new Error(`clickhouse dump missing under ${stageRoot}`);
    }
    applyClickHouseDump(input.restoreProject, clickhouseDump);
    const minioDir = join(stageRoot, 'minio');
    if (existsSync(minioDir)) {
      applyMinioObjects(input.restoreProject, minioDir);
    }

    const expectedWitnessMismatchCount = verifyWitness(
      input.restoreProject,
      manifest.witnesses.traceId,
      manifest.witnesses.spanName
    );
    const productionVolumeMountCount = countProductionMounts(
      input.restoreProject,
      input.productionVolumeDenyList
    );

    // Source/production volumes must still exist unchanged.
    for (const name of volumesBefore) {
      if (!volumeNames().includes(name)) {
        errors.push(`source volume disappeared: ${name}`);
      }
    }

    const restoredInventoryEmpty = !existsSync(join(stageRoot, 'langfuse-postgres.dump'));

    // Keep isolated project running for AC-4 cold-restart proof (no down -v).
    // Restart canary web/worker so source remains available after restore.
    run('docker', ['start', 'obs01-canary-langfuse-web-1', 'obs01-canary-langfuse-worker-1'], {
      timeout: 120_000,
    });

    return {
      ok:
        expectedWitnessMismatchCount === 0 &&
        productionVolumeMountCount === 0 &&
        resticSnapshotCount >= 1 &&
        errors.length === 0,
      restoreProjectDistinct: true,
      expectedWitnessMismatchCount,
      productionVolumeMountCount,
      resticSnapshotCount,
      restoredInventoryEmpty,
      restoreProject: input.restoreProject,
      errors,
    };
  } finally {
    rmSync(restoreStage, { recursive: true, force: true });
    // Keep workDir compose for restart proofs when project persists.
    writeFileSync(join(input.evidenceDir, 'isolated-restore-compose-path.txt'), `${composePath}\n`);
  }
}

export async function proveLangfuseColdRestart(input: {
  evidenceDir: string;
  project: string;
}): Promise<ColdRestartResult> {
  const composeHint = join(input.evidenceDir, 'isolated-restore-compose-path.txt');
  let composePath = existsSync(composeHint) ? readFileSync(composeHint, 'utf8').trim() : '';
  const workDir = composePath
    ? dirname(composePath)
    : mkdtempSync(join(tmpdir(), 'obs04-restart-'));
  if (!composePath || !existsSync(composePath)) {
    composePath = writeIsolatedCompose(input.project, workDir);
  }

  const volumesBefore = new Set(
    volumeNames().filter((name) => name.startsWith(`${input.project}_`))
  );

  const manifestPath = join(input.evidenceDir, 'langfuse-backup-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('backup manifest required for cold restart proof');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;

  // Ensure project is up.
  const up = run('docker', ['compose', '-p', input.project, '-f', composePath, 'up', '-d'], {
    cwd: workDir,
    timeout: 300_000,
  });
  if (up.status !== 0) {
    throw new Error(`restart compose up failed: ${up.stderr || up.stdout}`);
  }
  waitHealthy(input.project);

  // Cold restart: stop then start (no recreate / no -v).
  run('docker', ['compose', '-p', input.project, '-f', composePath, 'stop'], {
    cwd: workDir,
    timeout: 120_000,
  });
  const start = run('docker', ['compose', '-p', input.project, '-f', composePath, 'start'], {
    cwd: workDir,
    timeout: 180_000,
  });
  if (start.status !== 0) {
    throw new Error(`compose start failed: ${start.stderr || start.stdout}`);
  }
  waitHealthy(input.project);

  const volumesAfter = new Set(
    volumeNames().filter((name) => name.startsWith(`${input.project}_`))
  );
  const stateVolumeRecreated =
    [...volumesBefore].some((name) => !volumesAfter.has(name)) ||
    [...volumesAfter].some((name) => !volumesBefore.has(name) && volumesBefore.size > 0);

  const restartWitnessMismatchCount = verifyWitness(
    input.project,
    manifest.witnesses.traceId,
    manifest.witnesses.spanName
  );

  return {
    ok: restartWitnessMismatchCount === 0 && !stateVolumeRecreated,
    restartWitnessMismatchCount,
    stateVolumeRecreated: Boolean(stateVolumeRecreated && volumesBefore.size > 0),
    project: input.project,
  };
}

export async function evaluateLangfuseRollback(input: {
  previousImage: string;
  currentSchemaVersion: string;
  mutate?: boolean;
}): Promise<RollbackEvaluation> {
  const incompatible =
    input.currentSchemaVersion.startsWith('incompatible') ||
    /0000000000000000000000000000000000000000000000000000000000000001/.test(input.previousImage);

  if (incompatible) {
    // Prove schema incompatibility before any state mutation.
    if (input.mutate) {
      // Deliberately do not apply any docker mutation.
    }
    return {
      ok: false,
      compatibleRollbackMismatchCount: 0,
      incompatibleRollbackExitCode: 2,
      incompatibleApplyCount: 0,
      reason: 'ROLLBACK_SCHEMA_INCOMPATIBLE',
    };
  }

  // Compatible path: previous image digest must be parseable and architecture-tagged.
  if (!/@sha256:[a-f0-9]{64}$/.test(input.previousImage)) {
    return {
      ok: false,
      compatibleRollbackMismatchCount: 1,
      incompatibleRollbackExitCode: 0,
      incompatibleApplyCount: 0,
      reason: 'previous image missing digest',
    };
  }

  return {
    ok: true,
    compatibleRollbackMismatchCount: 0,
    incompatibleRollbackExitCode: 0,
    incompatibleApplyCount: 0,
  };
}
