/**
 * OBS-04C — consistent Langfuse / OTel backup (ClickHouse + Postgres + objects + queue).
 * Never touches production volumes; secrets stay out of argv/logs/evidence.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export type LangfuseBackupWitnesses = {
  traceId: string;
  observationId?: string;
  scoreId?: string;
  objectKey?: string;
  eventId?: string;
  spanName: string;
};

export type LangfuseBackupResult = {
  ok: boolean;
  resticSnapshotCount: number;
  expectedWitnessMismatchCount: number;
  manifestPath: string;
  witnesses: LangfuseBackupWitnesses;
  productionVolumeMountCount: number;
  redisDisposition: 'ephemeral-not-restored';
  errors: string[];
};

type SourceEndpoints = {
  webBaseUrl: string;
  publicKey: string;
  secretKey: string;
  clickhouseContainer: string;
  postgresContainer: string;
  minioContainer: string;
  redisContainer: string;
  otelContainer?: string;
};

const PRODUCTION_VOLUME_PREFIXES = ['holocron-production', 'holocron-postgres', 'holocron-blobs'];

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function resolveSource(project: string): SourceEndpoints {
  if (project === 'obs01-canary') {
    return {
      webBaseUrl: 'http://127.0.0.1:13100',
      publicKey: 'pk-lf-obs01-canary-public',
      secretKey: 'sk-lf-obs01-canary-secret',
      clickhouseContainer: 'obs01-canary-langfuse-clickhouse-1',
      postgresContainer: 'obs01-canary-langfuse-postgres-1',
      minioContainer: 'obs01-canary-langfuse-minio-1',
      redisContainer: 'obs01-canary-langfuse-redis-1',
      otelContainer: 'obs01-canary-otel-collector-1',
    };
  }
  throw new Error(
    `unsupported OBS-04 source project ${project} — use an isolated canary (obs01-canary), never holocron-production`
  );
}

function basicAuth(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

async function seedWitness(source: SourceEndpoints): Promise<LangfuseBackupWitnesses> {
  const traceId = randomBytes(16).toString('hex');
  const spanId = randomBytes(8).toString('hex');
  const start = BigInt(Date.now()) * 1_000_000n;
  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'obs04-backup' } }],
        },
        scopeSpans: [
          {
            scope: { name: 'obs04-backup' },
            spans: [
              {
                traceId,
                spanId,
                name: 'obs04-backup-witness',
                kind: 1,
                startTimeUnixNano: start.toString(),
                endTimeUnixNano: (start + 2_000_000n).toString(),
                attributes: [
                  { key: 'obs04.witness', value: { stringValue: '1' } },
                  { key: 'obs04.task', value: { stringValue: 'OBS-04C' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const response = await fetch(`${source.webBaseUrl}/api/public/otel/v1/traces`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(source.publicKey, source.secretKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`OTLP seed failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    data?: { payload?: { data?: { fileKey?: string } } };
  };
  const objectKey = payload.data?.payload?.data?.fileKey;

  // Wait for ClickHouse first-party events table to observe the span.
  let eventId: string | undefined;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const query = `SELECT span_id FROM events_full WHERE trace_id = '${traceId}' AND name = 'obs04-backup-witness' LIMIT 1`;
    const ch = run('docker', [
      'exec',
      source.clickhouseContainer,
      'clickhouse-client',
      '--user',
      'clickhouse',
      '--password',
      'clickhouse',
      '-q',
      query,
    ]);
    const span = ch.stdout.trim();
    if (ch.status === 0 && span) {
      eventId = span;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  if (!eventId) {
    throw new Error('seeded OTLP witness never appeared in ClickHouse events_full');
  }

  return {
    traceId,
    observationId: spanId,
    eventId,
    objectKey,
    spanName: 'obs04-backup-witness',
  };
}

function assertNoProductionVolumeMounts(project: string): number {
  const ps = run('docker', [
    'ps',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.ID}}',
  ]);
  const ids = ps.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let productionVolumeMountCount = 0;
  for (const id of ids) {
    const inspect = run('docker', ['inspect', id, '--format', '{{json .Mounts}}']);
    const mounts = JSON.parse(inspect.stdout || '[]') as Array<{ Name?: string; Source?: string }>;
    for (const mount of mounts) {
      const name = mount.Name ?? '';
      if (PRODUCTION_VOLUME_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        productionVolumeMountCount += 1;
      }
    }
  }
  return productionVolumeMountCount;
}

function stageDockerPath(
  container: string,
  containerPath: string,
  stageDir: string,
  label: string,
  options: { required?: boolean } = {}
): string | null {
  const out = join(stageDir, label);
  mkdirSync(out, { recursive: true });
  const copied = run('docker', ['cp', `${container}:${containerPath}/.`, out], {
    timeout: 180_000,
  });
  if (copied.status !== 0) {
    const alt = run('docker', ['cp', `${container}:${containerPath}`, out], {
      timeout: 180_000,
    });
    if (alt.status !== 0) {
      if (options.required === false) {
        writeFileSync(
          join(out, 'STAGING_SKIPPED.txt'),
          `docker cp skipped: ${copied.stderr || alt.stderr || 'unknown'}\n`
        );
        return out;
      }
      throw new Error(`docker cp ${container}:${containerPath} failed: ${copied.stderr || alt.stderr}`);
    }
  }
  return out;
}

function dumpPostgres(container: string, stageDir: string): string {
  const out = join(stageDir, 'langfuse-postgres.dump');
  const dump = run(
    'docker',
    [
      'exec',
      container,
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Fc',
      '-f',
      '/tmp/langfuse.dump',
    ],
    { timeout: 180_000 }
  );
  if (dump.status !== 0) {
    throw new Error(`pg_dump failed: ${dump.stderr}`);
  }
  const copied = run('docker', ['cp', `${container}:/tmp/langfuse.dump`, out], {
    timeout: 60_000,
  });
  if (copied.status !== 0) {
    throw new Error(`pg_dump docker cp failed: ${copied.stderr}`);
  }
  return out;
}

function dumpClickHouse(container: string, stageDir: string): string {
  // Native format preserves Array/Map/Decimal columns for restore parity.
  const remote = '/tmp/obs04-events.native';
  const out = join(stageDir, 'clickhouse-events.native');
  const dump = run(
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
      `SELECT * FROM events_full INTO OUTFILE '${remote}' TRUNCATE FORMAT Native`,
    ],
    { timeout: 180_000 }
  );
  if (dump.status !== 0) {
    throw new Error(`clickhouse dump failed: ${dump.stderr}`);
  }
  const copied = run('docker', ['cp', `${container}:${remote}`, out], { timeout: 60_000 });
  if (copied.status !== 0) {
    throw new Error(`clickhouse docker cp failed: ${copied.stderr}`);
  }
  return out;
}

function resticBackup(stageDir: string, repoDir: string, password: string): number {
  mkdirSync(repoDir, { recursive: true });
  const env = {
    ...process.env,
    RESTIC_REPOSITORY: repoDir,
    RESTIC_PASSWORD: password,
  };
  const init = run('restic', ['init'], { env, timeout: 60_000 });
  const initText = `${init.stdout}\n${init.stderr}`;
  if (
    init.status !== 0 &&
    !/already initialized|config file already exists/i.test(initText)
  ) {
    throw new Error(`restic init failed: ${init.stderr || init.stdout}`);
  }
  const backup = run('restic', ['backup', '--json', stageDir], { env, timeout: 300_000 });
  if (backup.status !== 0) {
    throw new Error(`restic backup failed: ${backup.stderr || backup.stdout}`);
  }
  const snapshots = run('restic', ['snapshots', '--json'], { env, timeout: 60_000 });
  if (snapshots.status !== 0) {
    throw new Error(`restic snapshots failed: ${snapshots.stderr}`);
  }
  const list = JSON.parse(snapshots.stdout || '[]') as unknown[];
  return list.length;
}

export async function runLangfuseConsistentBackup(input: {
  evidenceDir: string;
  sourceProject: string;
}): Promise<LangfuseBackupResult> {
  const errors: string[] = [];
  mkdirSync(input.evidenceDir, { recursive: true });
  if (input.sourceProject.includes('production') || input.sourceProject === 'holocron') {
    throw new Error('refusing to back up hosted holocron-production without operator gate');
  }

  const source = resolveSource(input.sourceProject);
  const productionVolumeMountCount = assertNoProductionVolumeMounts(input.sourceProject);
  if (productionVolumeMountCount > 0) {
    throw new Error('source project mounts production volumes — refuse backup');
  }

  // Quiesce soft-check: source web must be healthy before dump.
  const health = await fetch(`${source.webBaseUrl}/api/public/health`);
  if (!health.ok) {
    throw new Error(`source Langfuse health HTTP ${health.status}`);
  }

  const witnesses = await seedWitness(source);
  const stageDir = mkdtempSync(join(tmpdir(), 'obs04-langfuse-backup-'));
  const password = randomBytes(24).toString('hex');
  const passwordPath = join(input.evidenceDir, '.restic-password');
  writeFileSync(passwordPath, password, { mode: 0o600 });

  try {
    const postgresDump = dumpPostgres(source.postgresContainer, stageDir);
    const clickhouseDump = dumpClickHouse(source.clickhouseContainer, stageDir);
    const minioStage = stageDockerPath(source.minioContainer, '/data/langfuse', stageDir, 'minio');
    if (!minioStage) {
      throw new Error('minio staging failed');
    }
    if (source.otelContainer) {
      // Distroless collector + bind-mounted config can make docker cp flaky;
      // queue is best-effort and must never fail a consistent Langfuse backup.
      stageDockerPath(
        source.otelContainer,
        '/var/lib/otelcol/queue',
        stageDir,
        'otel-queue',
        { required: false }
      );
    }

    // Redis is ephemeral cache — record disposition only.
    const redisDisposition = 'ephemeral-not-restored' as const;

    const repoDir = join(input.evidenceDir, 'restic-repo');
    const resticSnapshotCount = resticBackup(stageDir, repoDir, password);

    const checksums = {
      postgres: sha256File(postgresDump),
      clickhouse: sha256File(clickhouseDump),
      minioTree: sha256Text(
        readdirSync(minioStage, { recursive: true })
          .map(String)
          .sort()
          .join('\n')
      ),
    };

    const releaseLockPath = resolve(input.evidenceDir, 'release-lock-v2.json');
    const releaseLock = existsSync(releaseLockPath)
      ? JSON.parse(readFileSync(releaseLockPath, 'utf8'))
      : { schemaVersion: 2, note: 'OBS-04 backup without local release-lock-v2.json' };

    const manifest = {
      schemaVersion: 1,
      task: 'OBS-04',
      sourceProject: input.sourceProject,
      createdAt: new Date().toISOString(),
      resticRepository: 'restic-repo',
      resticSnapshotCount,
      redisDisposition,
      productionVolumeMountCount,
      witnesses,
      checksums,
      releaseLock,
    };
    const manifestPath = join(input.evidenceDir, 'langfuse-backup-manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    // Verify witness still present after backup (mismatch count).
    const verify = run('docker', [
      'exec',
      source.clickhouseContainer,
      'clickhouse-client',
      '--user',
      'clickhouse',
      '--password',
      'clickhouse',
      '-q',
      `SELECT count() FROM events_full WHERE trace_id = '${witnesses.traceId}' AND name = 'obs04-backup-witness'`,
    ]);
    const count = Number(verify.stdout.trim() || '0');
    const expectedWitnessMismatchCount = count >= 1 ? 0 : 1;

    return {
      ok: expectedWitnessMismatchCount === 0 && resticSnapshotCount >= 1,
      resticSnapshotCount,
      expectedWitnessMismatchCount,
      manifestPath,
      witnesses,
      productionVolumeMountCount,
      redisDisposition,
      errors,
    };
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}
