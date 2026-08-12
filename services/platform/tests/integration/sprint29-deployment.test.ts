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
  DEFAULT_DEPLOY_HOST,
  migrateLegacyRuntimeSecrets,
  renderDeploymentOverride,
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
});
