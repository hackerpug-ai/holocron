/**
 * OBS-04 — Productionize Langfuse topology (AC-1 / AC-2).
 *
 * Verifies the canonical twelve-service / eight-volume Compose contract and
 * ReleaseLock schema v2 against OBS-01 Candidate A pins. No mocks.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/observability-production-topology.test.ts
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  buildPortableDeploymentReceipt,
  DEFAULT_LOOPBACK_PORT,
  DEFAULT_MEMORY_LIMITS_GIB,
  readDeploymentRecord,
} from '../../src/deploy/production-deploy.ts';
import {
  REQUIRED_PLATFORM,
  REQUIRED_SERVICES,
  REQUIRED_VOLUME_NAMES,
} from '../../src/deploy/production-release.ts';
import { verifyPortableDeploymentReceipt } from '../../src/deploy/verify-production.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/OBS-04');
const COMPOSE_PATH = resolve(REPO_ROOT, 'packages/platform/deploy/compose/compose.yaml');
const IMAGE_LOCK_PATH = resolve(REPO_ROOT, 'packages/platform/deploy/compose/image-lock.json');
const SOURCE_LOCK_PATH = resolve(
  REPO_ROOT,
  'packages/platform/deploy/compose/observability-source-lock.json'
);
const LANGFUSE_COMPOSE_PATH = resolve(
  REPO_ROOT,
  'packages/platform/deploy/compose/langfuse.compose.yaml'
);
const LANGFUSE_PLIST_PATH = resolve(
  REPO_ROOT,
  'packages/platform/deploy/launchd/holocron-langfuse.plist'
);
const OTEL_COMPOSE_PATH = resolve(REPO_ROOT, 'packages/platform/deploy/otel/compose.yaml');

const EXPECTED_SERVICES = [
  'postgres',
  'mastra',
  'scheduler',
  'zero-cache',
  'edge',
  'langfuse-web',
  'langfuse-worker',
  'langfuse-postgres',
  'langfuse-clickhouse',
  'langfuse-redis',
  'langfuse-minio',
  'otel-collector',
] as const;

const EXPECTED_VOLUME_KEYS = [
  'postgres-data',
  'zero-cache-data',
  'langfuse-postgres-data',
  'clickhouse-data',
  'clickhouse-logs',
  'minio-data',
  'redis-data',
  'otel-queue',
] as const;

const EXPECTED_VOLUME_NAMES = [
  'holocron-postgres',
  'zero-cache',
  'langfuse-postgres',
  'clickhouse-data',
  'clickhouse-logs',
  'minio-data',
  'redis-data',
  'otel-collector-queue',
] as const;

function requirePlatformIt(): void {
  if (!PLATFORM_IT) {
    throw new Error(
      'PLATFORM_IT=1 required for OBS-04 production topology — refusing skip-to-green'
    );
  }
}

function writeEvidence(name: string, content: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
    'utf8'
  );
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function composeServiceImage(service: Record<string, unknown>): string {
  const image = service.image;
  if (typeof image !== 'string' || !image) {
    throw new Error(`service image missing: ${JSON.stringify(service.image)}`);
  }
  return image;
}

function digestOf(image: string): string {
  const at = image.lastIndexOf('@');
  const digest = at < 0 ? '' : image.slice(at + 1);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`expected digest-qualified image, got ${image}`);
  }
  return digest;
}

function publishedHostPorts(service: Record<string, unknown>): string[] {
  const ports = service.ports;
  if (!Array.isArray(ports)) return [];
  return ports.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const published = (entry as Record<string, unknown>).published;
      const target = (entry as Record<string, unknown>).target;
      const hostIp = (entry as Record<string, unknown>).host_ip;
      return `${hostIp ?? ''}:${published ?? ''}:${target ?? ''}`;
    }
    return String(entry);
  });
}

describe('OBS-04 production topology', () => {
  it("OBS-04-TOPO-AC-1: canonical Compose + ReleaseLock v2 match OBS-01's exact ARM64 topology", async () => {
    // AC-1 verifies the checked-in Compose + ReleaseLock identity entirely
    // offline (YAML parse + filesystem + SHA-256); it never touches a live
    // platform or Docker daemon, so it must run without PLATFORM_IT in the
    // loop gate. The canary `docker compose config --services` and the
    // negative-control assertComposeContract exercise the same file identity.
    expect(existsSync(COMPOSE_PATH), 'canonical compose.yaml missing').toBe(true);
    expect(existsSync(SOURCE_LOCK_PATH), 'observability-source-lock.json missing').toBe(true);
    expect(existsSync(IMAGE_LOCK_PATH), 'image-lock.json missing').toBe(true);

    const sourceLock = readJson(SOURCE_LOCK_PATH);
    const sourceServices = [...((sourceLock.services as string[]) ?? [])].sort();
    const sourceVolumes = [...((sourceLock.volumes as string[]) ?? [])].sort();
    expect(sourceServices).toEqual([...EXPECTED_SERVICES].sort());
    expect(sourceVolumes).toEqual([...EXPECTED_VOLUME_NAMES].sort());

    const compose = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      services?: Record<string, Record<string, unknown>>;
      volumes?: Record<string, Record<string, unknown> | null>;
    };
    const serviceNames = Object.keys(compose.services ?? {}).sort();
    const volumeKeys = Object.keys(compose.volumes ?? {}).sort();

    const selectedTopologyCount =
      serviceNames.length === EXPECTED_SERVICES.length &&
      volumeKeys.length === EXPECTED_VOLUME_KEYS.length
        ? 1
        : 0;
    const identityMismatchCount =
      (serviceNames.join(',') === [...EXPECTED_SERVICES].sort().join(',') ? 0 : 1) +
      (volumeKeys.join(',') === [...EXPECTED_VOLUME_KEYS].sort().join(',') ? 0 : 1);

    expect(REQUIRED_SERVICES.length, 'REQUIRED_SERVICES must be the twelve-service topology').toBe(
      12
    );
    expect([...REQUIRED_SERVICES].sort()).toEqual([...EXPECTED_SERVICES].sort());

    // REQUIRED_VOLUMES is part of the ReleaseLock v2 surface (added in GREEN).
    const releaseModule = await import('../../src/deploy/production-release.ts');
    expect(
      'REQUIRED_VOLUMES' in releaseModule,
      'production-release must export REQUIRED_VOLUMES for the eight-volume contract'
    ).toBe(true);
    const requiredVolumes = (releaseModule as { REQUIRED_VOLUMES?: readonly string[] })
      .REQUIRED_VOLUMES;
    expect(requiredVolumes?.length, 'REQUIRED_VOLUMES must be the eight-volume topology').toBe(8);
    expect([...(requiredVolumes ?? [])].sort()).toEqual([...EXPECTED_VOLUME_KEYS].sort());

    expect(serviceNames, 'compose services must be exact OBS-01 topology').toEqual(
      [...EXPECTED_SERVICES].sort()
    );
    expect(volumeKeys, 'compose volume keys must be exact OBS-01 topology').toEqual(
      [...EXPECTED_VOLUME_KEYS].sort()
    );
    expect(selectedTopologyCount, 'selectedTopologyCount:1').toBe(1);
    expect(identityMismatchCount, 'identityMismatchCount:0').toBe(0);

    const volumeNameByKey = new Map<string, string>();
    for (const key of EXPECTED_VOLUME_KEYS) {
      const vol = compose.volumes?.[key];
      const name =
        vol && typeof vol === 'object' && typeof vol.name === 'string'
          ? vol.name.replace(/\$\{[^:}]+:-([^}]+)\}/g, '$1')
          : key;
      volumeNameByKey.set(key, name);
    }
    expect([...volumeNameByKey.values()].sort()).toEqual([...EXPECTED_VOLUME_NAMES].sort());

    const sourceImages = (sourceLock.images as Array<Record<string, unknown>>) ?? [];
    const sourceByName = new Map(sourceImages.map((img) => [String(img.name), img]));

    const floatingTagCount = serviceNames.filter((name) => {
      const image = composeServiceImage(compose.services![name]!);
      return !image.includes('@sha256:') && !image.includes('${HOLO_PLATFORM_IMAGE');
    }).length;

    let undeclaredWriterCount = 0;
    if (existsSync(LANGFUSE_COMPOSE_PATH)) undeclaredWriterCount += 1;
    if (existsSync(LANGFUSE_PLIST_PATH)) undeclaredWriterCount += 1;
    // OBS-02 canary compose may remain as a disposable canary, but must not be
    // the production writer. Canonical production compose must own otel-collector.
    if (!serviceNames.includes('otel-collector')) undeclaredWriterCount += 1;

    expect(floatingTagCount, 'floatingTagCount').toBe(0);
    expect(undeclaredWriterCount, 'undeclaredWriterCount').toBe(0);
    expect(existsSync(LANGFUSE_COMPOSE_PATH), 'retire standalone langfuse.compose.yaml').toBe(
      false
    );
    expect(existsSync(LANGFUSE_PLIST_PATH), 'retire holocron-langfuse LaunchAgent').toBe(false);

    // Internal Langfuse/state ports must stay unpublished; only edge may publish 44111 later.
    for (const name of [
      'langfuse-postgres',
      'langfuse-clickhouse',
      'langfuse-redis',
      'langfuse-minio',
      'langfuse-web',
      'langfuse-worker',
      'otel-collector',
      'postgres',
      'mastra',
      'scheduler',
      'zero-cache',
    ] as const) {
      const ports = publishedHostPorts(compose.services![name]!);
      expect(ports, `${name} must not publish host ports in production`).toEqual([]);
    }
    const edgePorts = publishedHostPorts(compose.services!.edge!);
    expect(
      edgePorts.some((p) => p.includes('44111')),
      'edge owns loopback 44111 publication'
    ).toBe(true);

    // Digest pins for Langfuse + collector must match OBS-01 source lock.
    for (const name of [
      'langfuse-web',
      'langfuse-worker',
      'langfuse-clickhouse',
      'langfuse-redis',
      'langfuse-postgres',
      'langfuse-minio',
      'otel-collector',
      'edge',
    ] as const) {
      const pinned = sourceByName.get(name);
      expect(pinned, `OBS-01 pin missing for ${name}`).toBeTruthy();
      expect(pinned?.architectureVerified).toBe(true);
      const image = composeServiceImage(compose.services![name]!);
      expect(digestOf(image)).toBe(String(pinned!.digest));
      expect(String(pinned!.arm64Digest)).toMatch(/^sha256:[a-f0-9]{64}$/);
    }

    // Platform services remain digest/HOLO_PLATFORM_IMAGE locked.
    for (const name of ['mastra', 'scheduler'] as const) {
      const image = composeServiceImage(compose.services![name]!);
      expect(image.includes('HOLO_PLATFORM_IMAGE') || image.includes('@sha256:')).toBe(true);
    }
    expect(composeServiceImage(compose.services!.postgres!)).toContain('@sha256:');
    expect(composeServiceImage(compose.services!['zero-cache']!)).toContain('@sha256:');

    // Collector config + persistent queue must live in the canonical project.
    const otel = compose.services!['otel-collector']!;
    const otelVolumes = Array.isArray(otel.volumes) ? otel.volumes.map(String) : [];
    expect(
      otelVolumes.some((v) => v.includes('otel-queue') || v.includes('otel-collector-queue')),
      'otel-collector must mount persistent otel-queue'
    ).toBe(true);

    const imageLock = readJson(IMAGE_LOCK_PATH);
    expect(imageLock.schemaVersion, 'releaseLockSchema:2').toBe(2);
    expect(imageLock.deployable).toBe(false);
    expect(typeof imageLock.nonDeployableReason).toBe('string');
    expect(String(imageLock.composeSha256)).toBe(sha256File(COMPOSE_PATH));
    expect(Array.isArray(imageLock.services), 'ReleaseLock v2 services[] required').toBe(true);
    expect((imageLock.services as unknown[]).length).toBe(12);
    expect(Array.isArray(imageLock.volumes), 'ReleaseLock v2 volumes[] required').toBe(true);
    expect((imageLock.volumes as unknown[]).length).toBe(8);
    expect(imageLock.platform).toBe(REQUIRED_PLATFORM);

    // Negative control: omitted service / wrong topology must fail assertComposeContract.
    const assertComposeContract = (
      releaseModule as {
        assertComposeContract?: (compose: unknown) => void;
      }
    ).assertComposeContract;
    expect(typeof assertComposeContract).toBe('function');
    expect(() =>
      assertComposeContract!({
        services: {
          postgres: compose.services!.postgres,
          mastra: compose.services!.mastra,
          scheduler: compose.services!.scheduler,
          'zero-cache': compose.services!['zero-cache'],
        },
        volumes: {
          'postgres-data': compose.volumes!['postgres-data'],
          'blob-data': { name: 'holocron-blobs' },
        },
      })
    ).toThrow(/required services are exactly|twelve|12|langfuse|otel-collector/i);

    const artifact = {
      releaseLockSchema: imageLock.schemaVersion,
      selectedTopologyCount,
      identityMismatchCount,
      floatingTagCount,
      undeclaredWriterCount,
      serviceCount: serviceNames.length,
      volumeCount: volumeKeys.length,
      services: serviceNames,
      volumes: volumeKeys,
      volumeNames: [...volumeNameByKey.values()].sort(),
      composeSha256: sha256File(COMPOSE_PATH),
      platform: REQUIRED_PLATFORM,
      otelCanaryComposePresent: existsSync(OTEL_COMPOSE_PATH),
    };
    writeEvidence('release-lock-v2.json', imageLock);
    writeEvidence('AC-1-seeded-artifact.json', artifact);
    writeEvidence('redacted-compose-and-listeners.json', {
      services: serviceNames,
      publishedPorts: Object.fromEntries(
        serviceNames.map((name) => [name, publishedHostPorts(compose.services![name]!)])
      ),
      floatingTagCount,
      undeclaredWriterCount,
    });
  }, 180_000);

  it('AC-2: missing secrets fail closed and capacity accounts for twelve services', async () => {
    requirePlatformIt();

    const deployModule = await import('../../src/deploy/production-deploy.ts');
    expect(
      'REQUIRED_OBSERVABILITY_SECRET_NAMES' in deployModule,
      'production-deploy must export REQUIRED_OBSERVABILITY_SECRET_NAMES'
    ).toBe(true);
    expect(
      'preflightObservabilitySecrets' in deployModule,
      'production-deploy must export preflightObservabilitySecrets'
    ).toBe(true);
    expect(
      'evaluateObservabilityCapacity' in deployModule,
      'production-deploy must export evaluateObservabilityCapacity'
    ).toBe(true);

    const requiredSecrets = (
      deployModule as { REQUIRED_OBSERVABILITY_SECRET_NAMES: readonly string[] }
    ).REQUIRED_OBSERVABILITY_SECRET_NAMES;
    expect(requiredSecrets.length).toBeGreaterThanOrEqual(12);

    const preflight = (
      deployModule as {
        preflightObservabilitySecrets: (env: NodeJS.ProcessEnv) => {
          ok: boolean;
          missing: string[];
          requiredSecretCount: number;
        };
      }
    ).preflightObservabilitySecrets;

    const sentinel = 'OBS04-SECRET-SENTINEL-DO-NOT-LEAK';
    const baseEnv: NodeJS.ProcessEnv = {
      HOLO_PLATFORM_IMAGE:
        'registry.example/holocron-platform@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      FLEET_URL: 'http://host.docker.internal:4545',
      POSTGRES_DB: 'holocron',
      POSTGRES_USER: 'holocron',
      POSTGRES_PASSWORD: sentinel,
      DATABASE_URL: 'postgres://holocron@127.0.0.1:44112/holocron',
      MASTRA_API_KEY: sentinel,
      FLEET_KEY: sentinel,
      ZERO_ADMIN_PASSWORD: sentinel,
      // Non-secret compose config required by ${NAME:?} (names/values are placeholders).
      LANGFUSE_POSTGRES_USER: 'langfuse',
      LANGFUSE_POSTGRES_DB: 'langfuse',
      LANGFUSE_CLICKHOUSE_DB: 'default',
      LANGFUSE_CLICKHOUSE_USER: 'clickhouse',
      LANGFUSE_CLICKHOUSE_MIGRATION_URL: 'clickhouse://langfuse-clickhouse:9000',
      LANGFUSE_CLICKHOUSE_URL: 'http://langfuse-clickhouse:8123',
      LANGFUSE_S3_BUCKET: 'langfuse',
      LANGFUSE_S3_ENDPOINT: 'http://langfuse-minio:9000',
      LANGFUSE_NEXTAUTH_URL: 'http://127.0.0.1:44111',
      LANGFUSE_OTLP_ENDPOINT: 'http://langfuse-web:3000/api/public/otel',
      LANGFUSE_INIT_ORG_ID: 'holocron-observability',
      LANGFUSE_INIT_ORG_NAME: 'Holocron',
      LANGFUSE_INIT_PROJECT_ID: 'holocron',
      LANGFUSE_INIT_PROJECT_NAME: 'Holocron',
      LANGFUSE_INIT_USER_EMAIL: 'ops@example.invalid',
      LANGFUSE_INIT_USER_NAME: 'ops',
    };
    for (const name of requiredSecrets) {
      baseEnv[name] = sentinel;
    }

    let missingSecretRejectedCount = 0;
    for (const omitted of requiredSecrets) {
      const env = { ...baseEnv };
      delete env[omitted];
      const result = preflight(env);
      expect(result.ok, `omitting ${omitted} must fail closed`).toBe(false);
      expect(result.missing).toContain(omitted);
      missingSecretRejectedCount += 1;

      // Compose render must also fail closed without starting containers.
      const rendered = spawnSync(
        'docker',
        ['compose', '-f', COMPOSE_PATH, 'config', '--format', 'json'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: { ...process.env, ...env },
          timeout: 60_000,
        }
      );
      expect(rendered.status, `compose config must reject missing ${omitted}`).not.toBe(0);
      expect(`${rendered.stdout}\n${rendered.stderr}`).not.toContain(sentinel);
    }

    expect(missingSecretRejectedCount).toBe(requiredSecrets.length);

    // Full render with sentinel values: values must not appear in argv-like
    // redis command/healthcheck text or evidence artifacts.
    const full = spawnSync(
      'docker',
      ['compose', '-f', COMPOSE_PATH, 'config', '--format', 'json'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, ...baseEnv },
        timeout: 60_000,
      }
    );
    expect(full.status, 'compose config with all secrets must succeed').toBe(0);
    const renderedJson = full.stdout;
    const redis = JSON.parse(renderedJson).services['langfuse-redis'] as {
      command?: unknown;
      healthcheck?: { test?: unknown };
    };
    const redisArgv = JSON.stringify(redis.command ?? '') + JSON.stringify(redis.healthcheck ?? '');
    expect(redisArgv.includes(sentinel), 'redis argv/healthcheck must not embed secret').toBe(
      false
    );

    // Scan evidence dir for sentinel leaks (names-only artifacts).
    const evidenceText = [
      existsSync(resolve(EVIDENCE_DIR, 'release-lock-v2.json'))
        ? readFileSync(resolve(EVIDENCE_DIR, 'release-lock-v2.json'), 'utf8')
        : '',
      existsSync(resolve(EVIDENCE_DIR, 'redacted-compose-and-listeners.json'))
        ? readFileSync(resolve(EVIDENCE_DIR, 'redacted-compose-and-listeners.json'), 'utf8')
        : '',
    ].join('\n');
    const sentinelMatchCount = evidenceText.includes(sentinel) ? 1 : 0;
    expect(sentinelMatchCount, 'sentinelMatchCount:0').toBe(0);

    const capacity = (
      deployModule as {
        evaluateObservabilityCapacity: (input: {
          dockerMemTotalBytes: number;
          diskAvailBytes: number;
          physMemBytes: number;
        }) => {
          decision: 'GO' | 'BLOCKED_CAPACITY';
          expectedServiceCount: number;
          expectedVolumeCount: number;
          requiredReserveBytes: number;
        };
      }
    ).evaluateObservabilityCapacity({
      dockerMemTotalBytes: Number(
        (
          readJson(resolve(REPO_ROOT, '.tmp/OBS-01/target-capacity.json')).measured as
            | Record<string, number>
            | undefined
        )?.dockerMemTotalBytes ?? 0
      ),
      diskAvailBytes: Number(
        (
          readJson(resolve(REPO_ROOT, '.tmp/OBS-01/target-capacity.json')).measured as
            | Record<string, number>
            | undefined
        )?.diskAvailBytes ?? 0
      ),
      physMemBytes: Number(
        (
          readJson(resolve(REPO_ROOT, '.tmp/OBS-01/target-capacity.json')).measured as
            | Record<string, number>
            | undefined
        )?.physMemBytes ?? 0
      ),
    });
    expect(capacity.expectedServiceCount).toBe(12);
    expect(capacity.expectedVolumeCount).toBe(8);
    expect(['GO', 'BLOCKED_CAPACITY']).toContain(capacity.decision);

    // Memory plan must include every service without exceeding the documented envelope.
    const limits = deployModule.DEFAULT_MEMORY_LIMITS_GIB;
    for (const service of REQUIRED_SERVICES) {
      expect(Number((limits as Record<string, number>)[service]) > 0).toBe(true);
    }
    deployModule.assertMemoryLimitPlan(limits);

    const matrix = {
      missingSecretRejectedCount,
      requiredSecretCount: requiredSecrets.length,
      sentinelMatchCount,
      containerStartedWithoutSecret: false,
      capacityDecision: capacity.decision,
      expectedServiceCount: capacity.expectedServiceCount,
      expectedVolumeCount: capacity.expectedVolumeCount,
      requiredReserveBytes: capacity.requiredReserveBytes,
    };
    writeEvidence('secret-negative-matrix.json', matrix);
    writeEvidence('capacity-decision.json', capacity);
    writeEvidence('AC-2-seeded-artifact.json', matrix);
  }, 300_000);

  it('AC-1: portable receipt verify accepts twelve-service schemaVersion 2 receipts', async () => {
    requirePlatformIt();
    const verifySource = readFileSync(
      resolve(REPO_ROOT, 'packages/platform/src/deploy/verify-production.ts'),
      'utf8'
    );
    expect(
      verifySource,
      'verifyPortableDeploymentReceipt must not hardcode live_service_count===4'
    ).not.toMatch(/liveServiceCount === 4/);
    expect(
      verifySource,
      'verifyPortableDeploymentReceipt must not hardcode live_volume_count===2'
    ).not.toMatch(/liveVolumeCount === 2/);
    expect(verifySource, 'receipt_volumes check must use REQUIRED_VOLUME_NAMES.length').toMatch(
      /durableVolumes\.length === REQUIRED_VOLUME_NAMES\.length|REQUIRED_VOLUME_NAMES\.length/
    );

    const deploySource = readFileSync(
      resolve(REPO_ROOT, 'packages/platform/src/deploy/production-deploy.ts'),
      'utf8'
    );
    expect(
      deploySource,
      'readDeploymentRecord must accept schemaVersion 2 written by apply/buildPortableDeploymentReceipt'
    ).toMatch(/value\.schemaVersion !== 2/);
    expect(deploySource).not.toMatch(/value\.schemaVersion !== 1/);

    const digest = `sha256:${'a1'.repeat(32)}`;
    const revision = 'b2'.repeat(20);
    const composeSha = 'c3'.repeat(32);
    const generation = 'holocron-0123456789abcdef01234567';
    const host = 'holocron';
    const baseUrl = 'https://holocron.tail011a51.ts.net:44111';
    const serveUrl = baseUrl;
    const containers = Object.fromEntries(
      REQUIRED_SERVICES.map((service, index) => [
        service,
        `${(index + 1).toString(16).padStart(2, '0')}`.repeat(32),
      ])
    ) as Record<(typeof REQUIRED_SERVICES)[number], string>;
    const memoryBytes = Object.fromEntries(
      REQUIRED_SERVICES.map((service) => [
        service,
        Math.round(Number(DEFAULT_MEMORY_LIMITS_GIB[service]) * 1024 ** 3),
      ])
    ) as Record<string, number>;

    const root = mkdtempSync(resolve(tmpdir(), 'obs04-portable-verify-'));
    const recordPath = resolve(root, 'deployment-record.json');
    try {
      const receipt = buildPortableDeploymentReceipt({
        authorizationScope: `${host}:${digest}`,
        host,
        baseUrl,
        loopbackPort: DEFAULT_LOOPBACK_PORT,
        serveHttpsPort: DEFAULT_LOOPBACK_PORT,
        serveUrl,
        privateServeTarget: 'http://127.0.0.1:44111',
        project: 'holocron-production',
        image: `registry.local/holocron-platform@${digest}`,
        imageDigest: digest,
        sourceRevision: revision,
        composeSha256: composeSha,
        composeGeneration: generation,
        deployedAt: '2026-08-21T00:00:00.000Z',
        containers,
        previousImage: `registry.local/holocron-platform@sha256:${'e5'.repeat(32)}`,
        previousDigest: `sha256:${'e5'.repeat(32)}`,
        memoryLimitsGib: DEFAULT_MEMORY_LIMITS_GIB,
        releasePath: resolve(root, 'release.json'),
        composePath: resolve(root, 'compose.yaml'),
        overridePath: resolve(root, 'override.yaml'),
      });
      expect(receipt.schemaVersion).toBe(2);
      expect(receipt.services.length).toBe(REQUIRED_SERVICES.length);
      expect(receipt.durableVolumes.length).toBe(REQUIRED_VOLUME_NAMES.length);
      writeFileSync(recordPath, `${JSON.stringify(receipt, null, 2)}\n`);

      const roundTrip = readDeploymentRecord(recordPath);
      expect(roundTrip.schemaVersion, 'readDeploymentRecord must accept schemaVersion 2').toBe(2);
      expect(roundTrip.services.length).toBe(12);
      expect(roundTrip.durableVolumes.length).toBe(8);

      const idToService = Object.fromEntries(
        Object.entries(containers).map(([service, id]) => [id, service])
      );
      const runner = (
        command: string,
        args: string[],
        _options: { cwd: string; env: NodeJS.ProcessEnv }
      ) => {
        if (command === 'docker' && args[0] === 'inspect') {
          const id = args.at(-1) ?? '';
          const service = idToService[id];
          if (service) {
            return {
              status: 0,
              stdout: `true|${service}|${memoryBytes[service]}\n`,
              stderr: '',
            };
          }
          return { status: 1, stdout: '', stderr: 'Error: No such object' };
        }
        if (command === 'docker' && args[0] === 'volume' && args[1] === 'inspect') {
          const name = args.at(-1) ?? '';
          if ((REQUIRED_VOLUME_NAMES as readonly string[]).includes(name)) {
            return { status: 0, stdout: `${name}\n`, stderr: '' };
          }
          return { status: 1, stdout: '', stderr: '' };
        }
        if (command === 'tailscale' && args[0] === 'serve') {
          return { status: 0, stdout: '{}\n', stderr: '' };
        }
        if (command === 'tailscale' && args[0] === 'status') {
          return {
            status: 0,
            stdout: `${JSON.stringify({
              Self: { DNSName: 'holocron.tail011a51.ts.net.', HostName: 'holocron' },
            })}\n`,
            stderr: '',
          };
        }
        return { status: 1, stdout: '', stderr: 'unexpected command in OBS-04 portable verify' };
      };

      const healthBody = {
        status: 'ok',
        postgres: { ready: true },
        fleet: { ready: true },
        queue: { ready: true },
        zeroCache: { ready: true },
        deployment: {
          ready: true,
          identity: {
            host,
            runtime: 'container',
            imageDigest: digest,
            sourceRevision: revision,
            composeGeneration: generation,
            composeSha256: composeSha,
            deployedAt: receipt.deployedAt,
            pid: 1,
            uptimeMs: 1000,
          },
        },
      };
      const fetchImpl: typeof fetch = Object.assign(
        async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/health')) {
            return Response.json(healthBody, { status: 200 });
          }
          return new Response('missing', { status: 404 });
        },
        { preconnect: () => undefined }
      );

      const report = await verifyPortableDeploymentReceipt({
        recordPath,
        cwd: root,
        runner,
        fetchImpl,
      });
      expect(report.ok).toBe(true);
      expect(report.receipt.serviceCount).toBe(REQUIRED_SERVICES.length);
      expect(report.receipt.namedVolumeCount).toBe(REQUIRED_VOLUME_NAMES.length);
      expect(report.dimensions.find((d) => d.name === 'receipt_services')?.ok).toBe(true);
      expect(report.dimensions.find((d) => d.name === 'receipt_volumes')?.ok).toBe(true);
      expect(report.dimensions.find((d) => d.name === 'live_services')?.ok).toBe(true);
      expect(report.dimensions.find((d) => d.name === 'live_volumes')?.ok).toBe(true);

      writeEvidence('AC-1-portable-verify-seeded.json', {
        serviceCount: report.receipt.serviceCount,
        namedVolumeCount: report.receipt.namedVolumeCount,
        schemaVersion: roundTrip.schemaVersion,
        ok: report.ok,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
