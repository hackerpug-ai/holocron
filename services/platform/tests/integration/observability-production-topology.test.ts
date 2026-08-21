/**
 * OBS-04 — Productionize Langfuse topology (AC-1 / AC-2).
 *
 * Verifies the canonical twelve-service / eight-volume Compose contract and
 * ReleaseLock schema v2 against OBS-01 Candidate A pins. No mocks.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/observability-production-topology.test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { REQUIRED_PLATFORM, REQUIRED_SERVICES } from '../../src/deploy/production-release.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/OBS-04');
const COMPOSE_PATH = resolve(REPO_ROOT, 'services/platform/deploy/compose/compose.yaml');
const IMAGE_LOCK_PATH = resolve(REPO_ROOT, 'services/platform/deploy/compose/image-lock.json');
const SOURCE_LOCK_PATH = resolve(
  REPO_ROOT,
  'services/platform/deploy/compose/observability-source-lock.json'
);
const LANGFUSE_COMPOSE_PATH = resolve(
  REPO_ROOT,
  'services/platform/deploy/compose/langfuse.compose.yaml'
);
const LANGFUSE_PLIST_PATH = resolve(
  REPO_ROOT,
  'services/platform/deploy/launchd/holocron-langfuse.plist'
);
const OTEL_COMPOSE_PATH = resolve(REPO_ROOT, 'services/platform/deploy/otel/compose.yaml');

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
  it("AC-1: canonical Compose + ReleaseLock v2 match OBS-01's exact ARM64 topology", async () => {
    requirePlatformIt();

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
});
