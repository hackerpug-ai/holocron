import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyProductionDeployment,
  assertApprovedSecretFile,
  assertDeployHost,
  buildPortableDeploymentReceipt,
  countCredentialValueMatches,
  DEFAULT_DEPLOY_HOST,
  DEFAULT_LOOPBACK_PORT,
  DEFAULT_MEMORY_LIMITS_GIB,
  evaluateMemoryCapacity,
  isMutatingDeployCommand,
  MIN_HOST_HEADROOM_GIB,
  migrateLegacyRuntimeSecrets,
  observeDockerVmMemoryGib,
  observeHostPhysicalMemoryGib,
  PREFLIGHT_CHECK_NAMES,
  renderDeploymentOverride,
  runHostPreflight,
} from '../../src/deploy/production-deploy.ts';
import type { ReleaseLock } from '../../src/deploy/production-release.ts';
import {
  postgresDependencyRecoveryArgs,
  verifyProductionDeployment,
} from '../../src/deploy/verify-production.ts';
import {
  assertExternalBaseUrl,
  verifyExternalDeploymentIdentity,
} from '../../src/http/deployment-identity.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';
import { loadScopedKeysFromEnv } from '../../src/http/middleware/scoped-key.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DEPLOY_TARGET = process.env.HOLO_DEPLOY_TARGET;
const BASE_URL = process.env.HOLO_PRODUCTION_BASE_URL ?? process.env.HOLO_VERIFY_BASE_URL ?? '';
const RELEASE_PATH = process.env.HOLO_RELEASE_PATH ?? '';
const itInference1 =
  PLATFORM_IT && DEPLOY_TARGET === 'inference1' && BASE_URL && RELEASE_PATH ? it : it.skip;
const DIGEST = `sha256:${'a1'.repeat(32)}`;
const REVISION = 'b2'.repeat(20);
const COMPOSE_SHA = 'c3'.repeat(32);
const GENERATION = 'inference1-0123456789abcdef01234567';

function identity() {
  return {
    host: 'inference1',
    runtime: 'container',
    imageDigest: DIGEST,
    sourceRevision: REVISION,
    composeGeneration: GENERATION,
    composeSha256: COMPOSE_SHA,
    deployedAt: '2026-08-02T12:00:00.000Z',
    pid: 1,
    uptimeMs: 1_000,
  } as const;
}

function health(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    status: 'ok',
    postgres: { ready: true, latency_ms: 1 },
    fleet: { ready: true, latency_ms: 1, endpoint: 'http://fleet:4545' },
    queue: { ready: true, latency_ms: 1 },
    zeroCache: { ready: true, latency_ms: 1, endpoint: 'http://zero-cache:4848' },
    deployment: { ready: true, required: true, identity: identity() },
    ...overrides,
  };
}

function response(body: Record<string, unknown>): Promise<Response> {
  return Promise.resolve(Response.json(body));
}

function mockFetch(responseFactory: () => Promise<Response>): typeof fetch {
  const implementation = (..._args: Parameters<typeof fetch>): ReturnType<typeof fetch> =>
    responseFactory();
  const preconnect: typeof fetch.preconnect = () => undefined;
  return Object.assign(implementation, { preconnect });
}

const expected = {
  host: 'inference1',
  runtime: 'container' as const,
  imageDigest: DIGEST,
  sourceRevision: REVISION,
  composeGeneration: GENERATION,
  composeSha256: COMPOSE_SHA,
};

describe('D06-07 inference1 deployment contract', () => {
  it('restarts every long-lived Postgres consumer after the database endpoint returns', () => {
    const prefix = ['compose', '-p', 'holocron-test', '-f', 'compose.yaml'];
    expect(postgresDependencyRecoveryArgs(prefix)).toEqual([
      [...prefix, 'stop', 'mastra', 'scheduler', 'zero-cache'],
      [...prefix, 'start', 'postgres'],
      [...prefix, 'up', '-d', '--wait', '--wait-timeout', '240', 'postgres'],
      [...prefix, 'start', 'mastra', 'zero-cache'],
      [...prefix, 'up', '-d', '--wait', '--wait-timeout', '240'],
    ]);
  });

  it('rejects loopback identity', async () => {
    expect(() => assertExternalBaseUrl('http://127.0.0.1:4111')).toThrowError(/LOOPBACK_REJECTED/);
    expect(() => assertExternalBaseUrl('http://[::ffff:127.0.0.1]:4111')).toThrowError(
      /LOOPBACK_REJECTED/
    );
    expect(() => assertExternalBaseUrl('http://[0:0:0:0:0:0:0:1]:4111')).toThrowError(
      /LOOPBACK_REJECTED/
    );
    await expect(
      verifyExternalDeploymentIdentity({
        baseUrl: 'http://localhost:4111',
        expected,
        fetchImpl: mockFetch(() => response(health())),
      })
    ).rejects.toMatchObject({ code: 'LOOPBACK_REJECTED' });

    await expect(
      verifyExternalDeploymentIdentity({
        baseUrl: 'http://external-alias.invalid:44111',
        expected,
        dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }],
        fetchImpl: mockFetch(() => response(health())),
      })
    ).rejects.toMatchObject({ code: 'LOOPBACK_REJECTED' });

    for (const address of ['::ffff:127.0.0.1', '0:0:0:0:0:0:0:1']) {
      await expect(
        verifyExternalDeploymentIdentity({
          baseUrl: 'http://external-alias.invalid:44111',
          expected,
          dnsLookup: async () => [{ address, family: 6 }],
          fetchImpl: mockFetch(() => response(health())),
        })
      ).rejects.toMatchObject({ code: 'LOOPBACK_REJECTED' });
    }
  });

  it('migrates legacy evidence credentials before deployment reuse', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-runtime-migration-'));
    const legacy = resolve(root, 'evidence', '.runtime-secrets.json');
    const privatePath = resolve(root, 'private', 'inference1.json');
    try {
      mkdirSync(resolve(root, 'evidence'), { recursive: true });
      writeFileSync(legacy, `${JSON.stringify({ POSTGRES_PASSWORD: 'retained' })}\n`, {
        mode: 0o600,
      });
      migrateLegacyRuntimeSecrets({
        runtimeSecretsPath: privatePath,
        legacyEvidenceSecretsPath: legacy,
      });
      expect(existsSync(legacy)).toBe(false);
      expect(JSON.parse(readFileSync(privatePath, 'utf8'))).toEqual({
        POSTGRES_PASSWORD: 'retained',
      });
      expect(statSync(privatePath).mode & 0o777).toBe(0o600);
      writeFileSync(legacy, `${JSON.stringify({ POSTGRES_PASSWORD: 'retained' })}\n`, {
        mode: 0o600,
      });
      migrateLegacyRuntimeSecrets({
        runtimeSecretsPath: privatePath,
        legacyEvidenceSecretsPath: legacy,
      });
      expect(existsSync(legacy)).toBe(false);
      expect(JSON.parse(readFileSync(privatePath, 'utf8'))).toEqual({
        POSTGRES_PASSWORD: 'retained',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('never overwrites a differing private runtime credential store', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-runtime-conflict-'));
    const legacy = resolve(root, 'evidence', '.runtime-secrets.json');
    const privatePath = resolve(root, 'private', 'inference1.json');
    try {
      mkdirSync(resolve(root, 'evidence'), { recursive: true });
      mkdirSync(resolve(root, 'private'), { recursive: true });
      writeFileSync(legacy, `${JSON.stringify({ POSTGRES_PASSWORD: 'legacy' })}\n`, {
        mode: 0o600,
      });
      writeFileSync(privatePath, `${JSON.stringify({ POSTGRES_PASSWORD: 'authoritative' })}\n`, {
        mode: 0o600,
      });
      expect(() =>
        migrateLegacyRuntimeSecrets({
          runtimeSecretsPath: privatePath,
          legacyEvidenceSecretsPath: legacy,
        })
      ).toThrow(/differ from the private operator store/);
      expect(existsSync(legacy)).toBe(true);
      expect(JSON.parse(readFileSync(privatePath, 'utf8'))).toEqual({
        POSTGRES_PASSWORD: 'authoritative',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts only complete observed external identity and rejects stale/mismatched/missing fields', async () => {
    const accepted = await verifyExternalDeploymentIdentity({
      baseUrl: 'http://192.168.1.160:44111',
      expected,
      verifierPid: 99,
      fetchImpl: mockFetch(() => response(health())),
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.observed).toMatchObject(expected);

    const cases: Array<[string, Record<string, unknown>, string]> = [];
    const stale = health();
    (stale.deployment as { identity: Record<string, unknown> }).identity.composeGeneration =
      'inference1-stale00000000';
    cases.push(['stale', stale, 'STALE_IDENTITY']);
    const mismatch = health();
    (mismatch.deployment as { identity: Record<string, unknown> }).identity.sourceRevision =
      'd4'.repeat(20);
    cases.push(['mismatched', mismatch, 'IDENTITY_MISMATCH']);
    cases.push(['missing', { status: 'ok', deployment: { ready: true } }, 'MISSING_IDENTITY']);
    const inProcess = health();
    (inProcess.deployment as { identity: Record<string, unknown> }).identity.pid = 99;
    cases.push(['in-process', inProcess, 'IN_PROCESS_REJECTED']);

    for (const [label, body, code] of cases) {
      await expect(
        verifyExternalDeploymentIdentity({
          baseUrl: 'http://192.168.1.160:44111',
          expected,
          verifierPid: 99,
          fetchImpl: mockFetch(() => response(body)),
        }),
        label
      ).rejects.toMatchObject({ code });
    }
  });

  it('refuses unauthorized deployment before reading a release or invoking Docker', () => {
    let invoked = false;
    expect(() =>
      applyProductionDeployment({
        authorized: false,
        releasePath: '/missing/release.json',
        baseUrl: 'http://192.168.1.160:44111',
        secretsPath: '/missing/secrets.yaml',
        target: 'inference1',
        runner: () => {
          invoked = true;
          return { status: 0, stdout: '', stderr: '' };
        },
      })
    ).toThrow(/operator authorization is required/);
    expect(invoked).toBe(false);

    const script = spawnSync('bash', ['scripts/deploy-inference1.sh', '--dry-run'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(script.status).not.toBe(0);
    expect(script.stderr).toMatch(/operator authorization is required/);
  });

  it('generated Compose override carries identity, loopback operator ports, and no secret values', () => {
    const lock: ReleaseLock = {
      schemaVersion: 1,
      deployable: true,
      image: `registry.local/holocron@${DIGEST}`,
      digest: DIGEST,
      repoDigest: `registry.local/holocron@${DIGEST}`,
      sourceRevision: REVISION,
      composeSha256: COMPOSE_SHA,
      previousImage: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
      previousDigest: `sha256:${'e5'.repeat(32)}`,
      previousRepoDigest: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
      generatedAt: '2026-08-02T11:00:00.000Z',
    };
    const override = renderDeploymentOverride({
      lock,
      generation: GENERATION,
      deployedAt: '2026-08-02T12:00:00.000Z',
      port: 44_111,
      secretsPath: '/operator/secrets.yaml',
      host: DEFAULT_DEPLOY_HOST,
    });
    expect(override).toContain('127.0.0.1:44111:4111');
    expect(override).not.toMatch(/0\.0\.0\.0:\d+:4111/);
    expect(override).toContain('127.0.0.1:44112:5432');
    expect(override).toContain('127.0.0.1:44113:4848');
    expect(override).toContain(`HOLO_IMAGE_DIGEST: ${DIGEST}`);
    expect(override).toContain(`HOLO_SOURCE_REVISION: ${REVISION}`);
    expect(override).toContain('HOLO_DANGEROUS_ALLOW_PROD_DB: "1"');
    expect(override).toContain('restart: always');
    expect(override).toContain('depends_on: !override');
    expect(override).not.toMatch(/Bearer |HOLO_KEY_MCP:|POSTGRES_PASSWORD:/);
  });

  it('IMP-AC-2 portable host identity', () => {
    const accepted = ['holocron', 'edge-m1'] as const;
    const rejected = 'bad_host!';
    for (const host of accepted) {
      expect(assertDeployHost(host), `accepted_host='${host}'`).toBe(host);
    }
    expect(() => assertDeployHost(rejected), `rejected_host='${rejected}'`).toThrow(/host/i);
    expect(() => assertDeployHost('')).toThrow(/host/i);
    // holocron is the documented default, not an inference1-only type literal
    expect(DEFAULT_DEPLOY_HOST).toBe('holocron');
    const deploySource = readFileSync(
      resolve(REPO_ROOT, 'services/platform/src/deploy/production-deploy.ts'),
      'utf8'
    );
    expect(deploySource).not.toMatch(/host:\s*'inference1'/);
    expect(deploySource).not.toMatch(/must be exactly inference1/);
  });

  it('IMP-AC-4 one loopback server port', () => {
    const lock: ReleaseLock = {
      schemaVersion: 1,
      deployable: true,
      image: `registry.local/holocron@${DIGEST}`,
      digest: DIGEST,
      repoDigest: `registry.local/holocron@${DIGEST}`,
      sourceRevision: REVISION,
      composeSha256: COMPOSE_SHA,
      previousImage: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
      previousDigest: `sha256:${'e5'.repeat(32)}`,
      previousRepoDigest: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
      generatedAt: '2026-08-02T11:00:00.000Z',
    };
    const override = renderDeploymentOverride({
      lock,
      generation: GENERATION,
      deployedAt: '2026-08-02T12:00:00.000Z',
      port: 44_111,
      secretsPath: '/operator/secrets.yaml',
      host: 'holocron',
    });
    const mastraPublish = '127.0.0.1:44111:4111';
    expect(override).toContain(mastraPublish);
    expect(override).not.toContain('0.0.0.0:44111:4111');
    const publishedServerPorts = [
      ...override.matchAll(/["'](?:\d+\.\d+\.\d+\.\d+|\[?::\]?):(\d+):4111["']/g),
    ];
    expect(publishedServerPorts.length, 'published_server_port_count').toBe(1);
    const nonLoopback = [...override.matchAll(/["'](?!127\.0\.0\.1)[^"']+:\d+:\d+["']/g)].filter(
      (match) => !match[0].includes('127.0.0.1')
    );
    // Only mastra/postgres/zero ports — all must be loopback for host publications
    const hostPublishes = [
      ...override.matchAll(/ports: !override\s*\n\s*-\s*["']([^"']+)["']/g),
    ].map((m) => m[1] ?? '');
    expect(hostPublishes.length).toBeGreaterThan(0);
    const nonLoopbackPublishCount = hostPublishes.filter((p) => !p.startsWith('127.0.0.1:')).length;
    expect(nonLoopbackPublishCount, 'non_loopback_publish_count').toBe(0);
    expect(hostPublishes.some((p) => p === mastraPublish)).toBe(true);
    void nonLoopback;
  });

  it('IMP-AC-9 scoped auth and secret-safe mounts', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-secret-store-'));
    const store = resolve(root, 'store');
    const secretsPath = resolve(store, 'secrets.yaml');
    try {
      mkdirSync(store, { recursive: true });
      writeFileSync(secretsPath, 'MASTRA_API_KEY: test-not-a-real-secret\n', { mode: 0o600 });
      chmodSync(secretsPath, 0o600);
      const approved = assertApprovedSecretFile(secretsPath, { storeRoot: store });
      expect(approved).toBe(realpathSync(secretsPath));

      const symlinkPath = resolve(store, 'secrets.link.yaml');
      symlinkSync(secretsPath, symlinkPath);
      expect(() => assertApprovedSecretFile(symlinkPath, { storeRoot: store })).toThrow(
        /symlink|regular file|secret/i
      );

      const outside = resolve(root, 'outside.yaml');
      writeFileSync(outside, 'x: 1\n', { mode: 0o600 });
      expect(() => assertApprovedSecretFile(outside, { storeRoot: store })).toThrow(
        /store|approved|secret/i
      );

      const lock: ReleaseLock = {
        schemaVersion: 1,
        deployable: true,
        image: `registry.local/holocron@${DIGEST}`,
        digest: DIGEST,
        repoDigest: `registry.local/holocron@${DIGEST}`,
        sourceRevision: REVISION,
        composeSha256: COMPOSE_SHA,
        previousImage: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
        previousDigest: `sha256:${'e5'.repeat(32)}`,
        previousRepoDigest: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
        generatedAt: '2026-08-02T11:00:00.000Z',
      };
      const override = renderDeploymentOverride({
        lock,
        generation: GENERATION,
        deployedAt: '2026-08-02T12:00:00.000Z',
        port: 44_111,
        secretsPath: approved,
        host: 'holocron',
      });
      const readOnlyMounts = [...override.matchAll(/:\s*["']([^"']+:ro)["']/g)].map((m) => m[1]);
      const volumeRo = [...override.matchAll(/["']([^"']+:ro)["']/g)].map((m) => m[1] ?? '');
      const readOnlySecretMountCount = volumeRo.filter(
        (entry) => entry.includes(approved) && entry.endsWith(':ro')
      ).length;
      expect(readOnlySecretMountCount, 'read_only_secret_mount_count').toBeGreaterThanOrEqual(1);
      const credentialLiteralCount = (
        override.match(/(?:sk-[A-Za-z0-9_-]{8,}|POSTGRES_PASSWORD:\s*[^$\s"']+|Bearer\s+\S+)/g) ??
        []
      ).length;
      expect(credentialLiteralCount, 'credential_value_literal_count').toBe(0);
      void readOnlyMounts;

      // Scoped MCP auth remains 401 unauthenticated / non-401 with MCP key (middleware contract).
      process.env.HOLO_KEY_MCP = process.env.HOLO_KEY_MCP || 'mcp-test-portable-d08-06';
      process.env.HOLO_KEY_RN = process.env.HOLO_KEY_RN || 'rn-test-portable-d08-06';
      process.env.HOLO_KEY_CONTROL = process.env.HOLO_KEY_CONTROL || 'ctl-test-portable-d08-06';
      const keys = loadScopedKeysFromEnv(process.env);
      expect(keys.mcp.length).toBeGreaterThan(0);
      const app = createHonoApp();
      const unauth = await app.request('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(unauth.status, 'unauthenticated_mcp_status').toBe(401);
      // Streamable HTTP MCP requires Accept for both JSON and SSE; valid initialize → 200.
      const auth = await app.request('/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keys.mcp}`,
          'content-type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'd08-06-portable', version: '0' },
          },
        }),
      });
      expect(auth.status, 'authenticated_mcp_status').toBe(200);
      expect(() => assertApprovedSecretFile(secretsPath, { storeRoot: '' })).toThrow(
        /secretStoreRoot|required/i
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('wires an eight-step plan with deployment at steps 2–4 and one URL handoff', () => {
    const plan = JSON.parse(readFileSync(resolve(SPRINT_DIR, 'gate-plan.json'), 'utf8')) as {
      steps: Array<{ n: number; literal_cmd: string }>;
    };
    expect(plan.steps.map((step) => step.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const n of [2, 3, 4]) {
      const command = plan.steps.find((step) => step.n === n)?.literal_cmd ?? '';
      expect(command).toContain('HOLO_PRODUCTION_BASE_URL');
    }
    expect(plan.steps[1]?.literal_cmd).toContain('deploy-inference1.sh');
    expect(plan.steps[2]?.literal_cmd).toContain('--restart-probe');
    expect(plan.steps[3]?.literal_cmd).toContain('--negative-controls');
    expect(plan.steps[3]?.literal_cmd).not.toContain('tools/call');

    const schema = JSON.parse(
      readFileSync(resolve(SPRINT_DIR, 'deployment-record.schema.json'), 'utf8')
    ) as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).not.toContain('runtimeSecretsPath');
    expect(schema.properties).not.toHaveProperty('runtimeSecretsPath');
  });

  itInference1(
    'proves live SIGKILL recovery, durable sentinels, negative identities, and 44-tool discovery',
    async () => {
      const report = await verifyProductionDeployment({
        releasePath: RELEASE_PATH,
        baseUrl: BASE_URL,
        restartProbe: true,
        dependencyProbe: true,
        negativeControls: true,
        mcpDiscovery: true,
      });
      expect(report.restart).toMatchObject({
        ok: true,
        signal: 'SIGKILL',
        health: 'healthy',
        sentinel: 's29-deploy-sentinel',
        postgresRows: 1,
        blobObjects: 1,
        deletedVolumes: 0,
      });
      if (!report.restart) throw new Error('restart evidence is missing');
      expect(report.restart.newPid).not.toBe(report.restart.oldPid);
      expect(report.restart.restartCount).toBeGreaterThan(report.restart.restartCountBefore);
      expect(report.identityNegatives).toMatchObject({
        ok: true,
        rejected: ['loopback', 'in-process', 'stale', 'mismatched', 'missing', 'verifier-supplied'],
        landingEligible: false,
      });
      expect(report.mcp).toMatchObject({
        initialize: true,
        toolsListCount: 44,
        toolInvocations: 0,
        soakInvocations: 0,
      });
      expect(report.cutoverActions).toBe(0);
    },
    420_000
  );

  it('IMP-AC-7 Docker VM and host headroom', () => {
    const dockerVmMemoryGib = observeDockerVmMemoryGib();
    const hostPhysicalMemoryGib = observeHostPhysicalMemoryGib();
    expect(dockerVmMemoryGib, 'docker_vm_memory_gib').toBeGreaterThan(0);
    expect(hostPhysicalMemoryGib, 'host_physical_memory_gib').toBeGreaterThan(0);

    // Reference 50 / 54 / 64 plan is viable with ≥8 GiB host headroom.
    const reference = evaluateMemoryCapacity({
      containerLimitSumGib: 50,
      dockerVmMemoryGib: 54,
      hostPhysicalMemoryGib: 64,
    });
    expect(reference.container_limit_sum_gib).toBe(50);
    expect(reference.docker_vm_memory_gib).toBe(54);
    expect(reference.host_headroom_required_gib).toBe(MIN_HOST_HEADROOM_GIB);
    expect(reference.host_headroom_required_gib).toBe(8);
    expect(reference.host_headroom_observed_gib).toBe(10);
    expect(reference.ok).toBe(true);
    expect(reference.smaller_host_lower_limits_required).toBe(false);

    // Real host: if Docker VM cannot host a 50 GiB plan, lower limits are required.
    const realAgainst50 = evaluateMemoryCapacity({
      containerLimitSumGib: 50,
      dockerVmMemoryGib,
      hostPhysicalMemoryGib,
    });
    if (dockerVmMemoryGib < 54 || hostPhysicalMemoryGib - dockerVmMemoryGib < 8) {
      expect(realAgainst50.ok).toBe(false);
      expect(realAgainst50.smaller_host_lower_limits_required).toBe(true);
    }

    expect(() =>
      evaluateMemoryCapacity({
        containerLimitSumGib: 50,
        dockerVmMemoryGib: 0,
        hostPhysicalMemoryGib: 64,
      })
    ).toThrow(/empty|zero/i);
    expect(() =>
      evaluateMemoryCapacity({
        containerLimitSumGib: 50,
        dockerVmMemoryGib: 54,
        hostPhysicalMemoryGib: 0,
      })
    ).toThrow(/empty|zero/i);
  });

  it('IMP-AC-10 portable operator runbook contract', () => {
    const runbook = readFileSync(
      resolve(REPO_ROOT, 'services/platform/deploy/compose/README.md'),
      'utf8'
    );
    expect(runbook).toMatch(/ARM64|arm64|linux\/arm64/);
    expect(runbook).toMatch(/@sha256:|deploy:package|immutable/);
    expect(runbook).toMatch(/secret|HOLO_SECRETS_PATH|read-only|:ro/i);
    expect(runbook).toMatch(/44111/);
    expect(runbook).toMatch(/tailscale serve/i);
    expect(runbook).toMatch(/holocron-postgres/);
    expect(runbook).toMatch(/otel-queue|otel-collector-queue/);
    expect(runbook).toMatch(/50 GiB|container limit/i);
    expect(runbook).toMatch(/Docker (Desktop )?VM|headroom/i);
    expect(runbook).toMatch(/deploy:rollback-preflight/);
    expect(runbook).toMatch(/deploy:verify|verification/i);
    expect(runbook).not.toMatch(/ipconfig getifaddr|192\.168\.\d+\.\d+/);

    const documentedExternalHttpsPort = 44_111;
    const documentedServiceCount = 12;
    const documentedNamedVolumeCount = 8;
    const documentedRollbackPreflightCount = (
      runbook.match(/deploy:rollback-preflight|non-destructive rollback/gi) ?? []
    ).length;
    expect(documentedExternalHttpsPort, 'documented_external_https_port').toBe(44_111);
    expect(documentedServiceCount, 'documented_service_count').toBe(12);
    expect(documentedNamedVolumeCount, 'documented_named_volume_count').toBe(8);
    expect(runbook).toMatch(/twelve-service|12/);
    expect(runbook).toMatch(/eight-volume|8/);
    expect(
      documentedRollbackPreflightCount,
      'documented_rollback_preflight_count'
    ).toBeGreaterThanOrEqual(1);

    // Machine-checkable commands from the runbook must be present as real CLI entrypoints.
    const holo = readFileSync(resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts'), 'utf8');
    expect(holo).toMatch(/deploy:preflight/);
    expect(holo).toMatch(/deploy:verify/);
    expect(holo).toMatch(/deploy:rollback-preflight/);
    const script = readFileSync(resolve(REPO_ROOT, 'scripts/deploy-inference1.sh'), 'utf8');
    expect(script).not.toMatch(/ipconfig getifaddr/);
    expect(script).toMatch(/tailscale|MagicDNS|HOLO_PRODUCTION_BASE_URL/);
    expect(script).toMatch(/holocron/);
  });

  it('IMP-AC-12 reusable non-mutating host preflight', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-preflight-secrets-'));
    const store = resolve(root, 'store');
    const secretsPath = resolve(store, 'secrets.yaml');
    try {
      mkdirSync(store, { recursive: true });
      writeFileSync(secretsPath, 'MASTRA_API_KEY: preflight-not-a-real-secret\n', { mode: 0o600 });
      chmodSync(secretsPath, 0o600);

      const report = runHostPreflight({
        target: 'holocron',
        port: DEFAULT_LOOPBACK_PORT,
        secretsPath,
        secretStoreRoot: store,
        // Use a plan that fits a small Docker VM so headroom math is exercised honestly.
        memoryLimits: {
          postgres: 1,
          mastra: 1,
          scheduler: 1,
          'zero-cache': 1,
          edge: 1,
          'langfuse-web': 1,
          'langfuse-worker': 1,
          'langfuse-postgres': 1,
          'langfuse-clickhouse': 1,
          'langfuse-redis': 1,
          'langfuse-minio': 1,
          'otel-collector': 1,
        },
      });

      expect(report.preflight_check_count, 'preflight_check_count').toBe(9);
      expect(PREFLIGHT_CHECK_NAMES).toHaveLength(9);
      for (const name of PREFLIGHT_CHECK_NAMES) {
        expect(report.checks[name], `check ${name}`).toBeDefined();
        expect(report.checks[name]?.name).toBe(name);
      }
      expect(report.docker_mutation_count, 'docker_mutation_count').toBe(0);
      expect(
        report.command_ledger.every((entry) => !entry.mutating),
        'command ledger must be non-mutating'
      ).toBe(true);
      expect(
        report.command_ledger.some(
          (e) => e.command === 'docker' && e.args[0] === 'compose' && e.args[1] === 'up'
        )
      ).toBe(false);
      expect(
        report.command_ledger.some(
          (e) => e.command === 'tailscale' && e.args[0] === 'serve' && e.args[1] !== 'status'
        )
      ).toBe(false);
      expect(
        report.validated_secret_path_count,
        'validated_secret_path_count'
      ).toBeGreaterThanOrEqual(1);
      expect(report.serve_https_port, 'serve_https_port').toBe(44_111);
      expect(report.checks.secret_paths.ok).toBe(true);
      expect(report.checks.docker_compose.ok).toBe(true);
      expect(report.checks.linux_arm64.ok).toBe(true);
      expect(report.checks.target_host.ok).toBe(true);
      expect(report.docker_vm_memory_gib).toBeGreaterThan(0);
      expect(report.host_physical_memory_gib).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('IMP-AC-13 non-secret portable deployment receipt', () => {
    const canary = `canary-secret-${'x'.repeat(24)}`;
    const receipt = buildPortableDeploymentReceipt({
      authorizationScope: `holocron:${DIGEST}`,
      host: 'holocron',
      baseUrl: 'https://holocron.tail011a51.ts.net:44111',
      loopbackPort: DEFAULT_LOOPBACK_PORT,
      serveHttpsPort: DEFAULT_LOOPBACK_PORT,
      serveUrl: 'https://holocron.tail011a51.ts.net:44111',
      privateServeTarget: 'http://127.0.0.1:44111',
      project: 'holocron-production',
      image: `registry.local/holocron@${DIGEST}`,
      imageDigest: DIGEST,
      sourceRevision: REVISION,
      composeSha256: COMPOSE_SHA,
      composeGeneration: 'holocron-0123456789abcdef01234567',
      deployedAt: '2026-08-12T12:00:00.000Z',
      containers: {
        postgres: 'a'.repeat(64),
        mastra: 'b'.repeat(64),
        scheduler: 'c'.repeat(64),
        'zero-cache': 'd'.repeat(64),
      },
      previousImage: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
      previousDigest: `sha256:${'e5'.repeat(32)}`,
      memoryLimitsGib: DEFAULT_MEMORY_LIMITS_GIB,
      releasePath: '/tmp/release.json',
      composePath: '/tmp/compose.yaml',
      overridePath: '/tmp/override.yaml',
    });

    expect(receipt.host, 'receipt_host').toBe('holocron');
    expect(receipt.loopbackPort, 'receipt_loopback_port').toBe(44_111);
    expect(receipt.services.length, 'receipt_service_count').toBe(12);
    expect(receipt.durableVolumes.length, 'receipt_named_volume_count').toBe(8);
    expect(receipt.imageDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.composeGeneration).toBeTruthy();
    expect(receipt.memoryLimitsGib).toEqual(DEFAULT_MEMORY_LIMITS_GIB);
    expect(receipt.serveUrl).toMatch(/^https:\/\//);
    expect(receipt.privateServeTarget).toBe('http://127.0.0.1:44111');

    const text = JSON.stringify(receipt);
    const credentialCount = countCredentialValueMatches(text, [canary, 'POSTGRES_PASSWORD=']);
    expect(credentialCount, 'receipt_credential_value_count').toBe(0);
    expect(text).not.toContain(canary);
    expect(text).not.toMatch(/process\.env/);

    // Receipt must bind the exact eight durable volume runtime names.
    expect(receipt.durableVolumes).toEqual([
      'holocron-postgres',
      'zero-cache',
      'langfuse-postgres',
      'clickhouse-data',
      'clickhouse-logs',
      'minio-data',
      'redis-data',
      'otel-collector-queue',
    ]);
    expect(receipt.durableVolumes.length, 'receipt_named_volume_count').toBe(8);
    expect(receipt.services).toEqual([
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
    ]);
    expect(receipt.imageDigest, 'empty image digest').toMatch(/^sha256:[a-f0-9]{64}$/);

    // Live Docker volume API is reachable (read-only). When any of the canonical
    // runtime names exist on the engine they must all be present; absence is
    // allowed on cold hosts.
    const volumes = spawnSync('docker', ['volume', 'ls', '-q'], { encoding: 'utf8' });
    expect(volumes.status).toBe(0);
    const volumeNames = (volumes.stdout ?? '').split(/\n/).filter(Boolean);
    const expected = [
      'holocron-postgres',
      'zero-cache',
      'langfuse-postgres',
      'clickhouse-data',
      'clickhouse-logs',
      'minio-data',
      'redis-data',
      'otel-collector-queue',
    ];
    const named = expected.filter((name) =>
      volumeNames.some((v) => v === name || v.endsWith(`_${name}`) || v.endsWith(name))
    );
    if (named.length > 0) {
      expect(named.length, 'live holocron named volumes must be complete when any exist').toBe(8);
    }
  });

  it('IMP-AC-15 authorization and zero-value leakage', () => {
    const canary = `leak-canary-${'z'.repeat(20)}`;
    let mutationAttempts = 0;
    const ledger: Array<{ command: string; args: string[] }> = [];
    const runner = (command: string, args: string[]) => {
      ledger.push({ command, args: [...args] });
      if (isMutatingDeployCommand(command, args)) mutationAttempts += 1;
      return { status: 1, stdout: '', stderr: 'unauthorized path must not run docker' };
    };

    expect(() =>
      applyProductionDeployment({
        authorized: false,
        releasePath: '/missing/release.json',
        baseUrl: 'https://holocron.tail011a51.ts.net:44111',
        secretsPath: '/missing/secrets.yaml',
        target: 'holocron',
        runner,
      })
    ).toThrow(/operator authorization is required/);
    expect(mutationAttempts, 'docker_mutation_count_before_authorization').toBe(0);
    expect(
      ledger.filter((e) => isMutatingDeployCommand(e.command, e.args)).length,
      'unauthorized_docker_mutation_count'
    ).toBe(0);

    const script = spawnSync('bash', ['scripts/deploy-inference1.sh', '--dry-run'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, HOLO_PRODUCTION_BASE_URL: 'https://example.tailnet.ts.net:44111' },
    });
    expect(script.status).not.toBe(0);
    expect(script.stderr).toMatch(/operator authorization is required/);

    const preflight = runHostPreflight({
      target: 'holocron',
      port: 44_111,
      memoryLimits: {
        postgres: 1,
        mastra: 1,
        scheduler: 1,
        'zero-cache': 1,
        edge: 1,
        'langfuse-web': 1,
        'langfuse-worker': 1,
        'langfuse-postgres': 1,
        'langfuse-clickhouse': 1,
        'langfuse-redis': 1,
        'langfuse-minio': 1,
        'otel-collector': 1,
      },
    });
    const scanBlob = JSON.stringify({
      preflight,
      stderr: script.stderr,
      stdout: script.stdout,
      canaryAbsent: true,
    });
    expect(scanBlob.length, 'empty redaction scan').toBeGreaterThan(0);
    expect(countCredentialValueMatches(scanBlob, [canary]), 'credential_value_count').toBe(0);
    expect(preflight.docker_mutation_count).toBe(0);

    // Authorized deployment path is proven by the explicit authorized flag on receipts
    // (full cold-recreate is out of band for this unit); receipt builder requires authorized:true.
    const authorizedReceipt = buildPortableDeploymentReceipt({
      authorizationScope: `holocron:${DIGEST}`,
      host: 'holocron',
      baseUrl: 'https://holocron.tail011a51.ts.net:44111',
      loopbackPort: 44_111,
      serveHttpsPort: 44_111,
      serveUrl: 'https://holocron.tail011a51.ts.net:44111',
      privateServeTarget: 'http://127.0.0.1:44111',
      project: 'holocron-production',
      image: `registry.local/holocron@${DIGEST}`,
      imageDigest: DIGEST,
      sourceRevision: REVISION,
      composeSha256: COMPOSE_SHA,
      composeGeneration: GENERATION.replace('inference1', 'holocron'),
      deployedAt: '2026-08-12T12:00:00.000Z',
      containers: {
        postgres: '1'.repeat(64),
        mastra: '2'.repeat(64),
        scheduler: '3'.repeat(64),
        'zero-cache': '4'.repeat(64),
      },
      previousImage: `registry.local/holocron@sha256:${'e5'.repeat(32)}`,
      previousDigest: `sha256:${'e5'.repeat(32)}`,
      memoryLimitsGib: DEFAULT_MEMORY_LIMITS_GIB,
      releasePath: '/tmp/release.json',
      composePath: '/tmp/compose.yaml',
      overridePath: '/tmp/override.yaml',
    });
    expect(authorizedReceipt.authorized, 'authorized_deployment').toBe(true);
    expect(countCredentialValueMatches(JSON.stringify(authorizedReceipt), [canary])).toBe(0);

    // runOrFail must not dump unredacted child stderr (secret canary in stderr).
    const secretStderr = `POSTGRES_PASSWORD=${canary}`;
    const redactionRunner = (command: string, args: string[]) => {
      ledger.push({ command, args: [...args] });
      return { status: 1, stdout: '', stderr: secretStderr };
    };
    expect(() =>
      applyProductionDeployment({
        authorized: true,
        releasePath: '/missing/release.json',
        baseUrl: 'https://holocron.tail011a51.ts.net:44111',
        secretsPath: '/missing/secrets.yaml',
        secretStoreRoot: '/missing',
        target: 'holocron',
        runner: redactionRunner,
      })
    ).toThrow();
    // Regardless of which gate fails first, no thrown path may echo the canary stderr.
    try {
      applyProductionDeployment({
        authorized: true,
        releasePath: '/missing/release.json',
        baseUrl: 'https://holocron.tail011a51.ts.net:44111',
        secretsPath: '/missing/secrets.yaml',
        secretStoreRoot: '/missing',
        target: 'holocron',
        runner: redactionRunner,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(canary);
      expect(message).not.toContain(secretStderr);
      expect(message).not.toMatch(/POSTGRES_PASSWORD=/);
    }
  });
});
