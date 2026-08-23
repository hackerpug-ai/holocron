import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertMemoryLimitPlan,
  buildPortableDeploymentReceipt,
  DEFAULT_MEMORY_LIMITS_GIB,
  evaluateMemoryCapacity,
  MAX_MEMORY_LIMIT_SUM_GIB,
  MIN_DOCKER_VM_OVERHEAD_GIB,
  MIN_HOST_HEADROOM_GIB,
  observeDockerVmMemoryGib,
  observeHostPhysicalMemoryGib,
} from '../../../src/deploy/production-deploy.ts';
import {
  CROSS_TAILNET_DRILL_SCHEMA,
  CROSS_TAILNET_PEER_RECEIPT_SCHEMA,
  hashStableIdentity,
  sealCrossTailnetDrillEvidence,
  verifyCrossTailnetPeerReceipt,
  verifyPortableDeploymentReceipt,
  verifyProductionDeployment,
} from '../../../src/deploy/verify-production.ts';
import {
  readDeploymentIdentity,
  verifyExternalDeploymentIdentity,
} from '../../../src/http/deployment-identity.ts';
import { probeFleet, probeZeroCache } from '../../../src/http/health.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const D08_08_EVIDENCE = resolve(REPO_ROOT, '.tmp/D08-08');

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DEPLOY_TARGET = process.env.HOLO_DEPLOY_TARGET;
const BASE_URL = process.env.HOLO_PRODUCTION_BASE_URL ?? process.env.HOLO_VERIFY_BASE_URL ?? '';
const RELEASE_PATH = process.env.HOLO_RELEASE_PATH ?? '';
const itInference1 =
  PLATFORM_IT && DEPLOY_TARGET === 'inference1' && BASE_URL && RELEASE_PATH ? it : it.skip;

describe('D06-07 production health readiness', () => {
  let zeroServer: Server | null = null;
  let zeroUrl = '';

  beforeAll(async () => {
    const server = createServer((request, response) => {
      if (request.url === '/keepalive') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
      } else {
        response.writeHead(404);
        response.end('missing');
      }
    });
    zeroServer = server;
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address() as AddressInfo;
    zeroUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (zeroServer) {
      const server = zeroServer;
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it('fails deployment identity closed when production fields are missing', () => {
    const probe = readDeploymentIdentity(
      { HOLO_PRODUCTION_READINESS: '1' },
      { pid: 17, uptimeMs: 10 }
    );
    expect(probe.ready).toBe(false);
    expect(probe.identity).toBeNull();
    expect(probe.error).toContain('missing deployment identity fields');
  });

  it('probes the real zero-cache keepalive endpoint', async () => {
    const ready = await probeZeroCache(zeroUrl, true);
    expect(ready.ready).toBe(true);
    expect(ready.endpoint).toBe(zeroUrl);
    expect(ready.latency_ms).toBeGreaterThan(0);

    if (!zeroServer) throw new Error('zero-cache test server was not started');
    const server = zeroServer;
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    zeroServer = null;
    const down = await probeZeroCache(zeroUrl, true);
    expect(down.ready).toBe(false);
    expect(down.error).toBeTruthy();
  });

  it('never exposes fleet URL credentials in readiness output', async () => {
    const result = await probeFleet('https://operator-secret@fleet.example/v1');
    expect(result).toMatchObject({
      ready: false,
      endpoint: 'https://fleet.example',
      error: 'fleet endpoint credentials are forbidden',
    });
    expect(JSON.stringify(result)).not.toContain('operator-secret');
  });

  itInference1(
    'proves all external readiness dimensions and Postgres-down HTTP 503',
    async () => {
      const report = await verifyProductionDeployment({
        releasePath: RELEASE_PATH,
        baseUrl: BASE_URL,
        dependencyProbe: true,
        negativeControls: false,
        restartProbe: false,
        mcpDiscovery: false,
      });
      expect(report.ok).toBe(true);
      expect(report.dependency).toMatchObject({
        ok: true,
        removed: 'postgres',
        status: 503,
        failingDependency: 'postgres',
        restored: true,
      });
      const accepted = await verifyExternalDeploymentIdentity({
        baseUrl: BASE_URL,
        expected: {
          host: report.release.host,
          runtime: report.release.runtime,
          imageDigest: report.release.imageDigest,
          sourceRevision: report.release.sourceRevision,
          composeGeneration: report.release.composeGeneration,
          composeSha256: (report.readiness.deployment as { identity: { composeSha256: string } })
            .identity.composeSha256,
        },
      });
      expect(accepted.health.status).toBe('ok');
      for (const field of ['postgres', 'fleet', 'queue', 'zeroCache', 'deployment']) {
        expect((accepted.health[field] as { ready: boolean }).ready, field).toBe(true);
      }
    },
    300_000
  );

  it('IMP-AC-14 receipt-driven private verification', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-portable-verify-'));
    const recordPath = resolve(root, 'deployment-record.json');
    try {
      // Deterministic Docker/Tailscale binding — not mock health / LAN alone.
      // Container IDs + HostConfig.Memory + named volumes are exercised via the
      // same inspect paths production verify uses (DeploymentRunner).
      const host = 'holocron';
      const imageDigest = `sha256:${'a1'.repeat(32)}`;
      const sourceRevision = 'b2'.repeat(20);
      const composeGeneration = 'holocron-0123456789abcdef01234567';
      const composeSha256 = 'c3'.repeat(32);
      // Non-loopback literal IP skips DNS while remaining external for identity.
      const baseUrl = 'http://192.0.2.10:44111';
      const serveUrl = 'https://holocron.tail011a51.ts.net:44111';
      const containers = {
        postgres: 'aa'.repeat(32),
        mastra: 'bb'.repeat(32),
        scheduler: 'cc'.repeat(32),
        'zero-cache': 'dd'.repeat(32),
      } as const;
      const memoryBytes = {
        postgres: 16 * 1024 ** 3,
        mastra: 16 * 1024 ** 3,
        scheduler: 8 * 1024 ** 3,
        'zero-cache': 10 * 1024 ** 3,
      } as const;
      const idToService = Object.fromEntries(
        Object.entries(containers).map(([service, id]) => [id, service])
      ) as Record<string, keyof typeof memoryBytes>;

      const receipt = buildPortableDeploymentReceipt({
        authorizationScope: `${host}:${imageDigest}`,
        host,
        baseUrl,
        loopbackPort: 44_111,
        serveHttpsPort: 44_111,
        serveUrl,
        privateServeTarget: 'http://127.0.0.1:44111',
        project: 'holocron-production',
        image: `registry.local/holocron-platform@${imageDigest}`,
        imageDigest,
        sourceRevision,
        composeSha256,
        composeGeneration,
        deployedAt: '2026-08-05T17:52:21.133Z',
        containers: { ...containers },
        previousImage: `registry.local/holocron-platform@sha256:${'e5'.repeat(32)}`,
        previousDigest: `sha256:${'e5'.repeat(32)}`,
        memoryLimitsGib: DEFAULT_MEMORY_LIMITS_GIB,
        releasePath: resolve(root, 'release.json'),
        composePath: resolve(root, 'compose.yaml'),
        overridePath: resolve(root, 'override.yaml'),
      });
      mkdirSync(root, { recursive: true });
      writeFileSync(recordPath, `${JSON.stringify(receipt, null, 2)}\n`);

      let dockerInspectCount = 0;
      let volumeInspectCount = 0;
      const runner = (
        command: string,
        args: string[],
        _options: { cwd: string; env: NodeJS.ProcessEnv }
      ) => {
        if (command === 'docker' && args[0] === 'inspect') {
          dockerInspectCount += 1;
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
          volumeInspectCount += 1;
          const name = args.at(-1) ?? '';
          if (name === 'holocron-postgres' || name === 'holocron-blobs') {
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
        return { status: 1, stdout: '', stderr: 'unexpected command in portable verify fixture' };
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
            imageDigest,
            sourceRevision,
            composeGeneration,
            composeSha256,
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

      expect(dockerInspectCount, 'docker inspect binding').toBeGreaterThanOrEqual(4);
      expect(volumeInspectCount, 'volume inspect binding').toBeGreaterThanOrEqual(2);
      expect(
        report.verification_dimension_count,
        'verification_dimension_count'
      ).toBeGreaterThanOrEqual(8);
      expect(report.serve_health_status, 'serve_health_status').toBe(200);
      expect(report.identity_mismatch_rejected, 'identity_mismatch_rejected').toBe(true);
      expect(report.memory_drift_rejected, 'memory_drift_rejected').toBe(true);
      expect(report.dimensions.find((d) => d.name === 'live_services')?.ok, 'live_services').toBe(
        true
      );
      expect(report.dimensions.find((d) => d.name === 'live_volumes')?.ok, 'live_volumes').toBe(
        true
      );
      expect(
        report.dimensions.find((d) => d.name === 'live_memory_contract')?.ok,
        'live_memory_contract'
      ).toBe(true);
      expect(report.receipt.imageDigest).toBeTruthy();
      expect(report.receipt.serviceCount).toBe(4);
      expect(report.receipt.namedVolumeCount).toBe(2);
      expect(report.credential_value_count).toBe(0);
      expect(report.ok).toBe(true);

      // Negative control: zero live services must fail closed (no soft-pass on count=0).
      const emptyContainersReceipt = buildPortableDeploymentReceipt({
        authorizationScope: `${host}:${imageDigest}`,
        host,
        baseUrl,
        loopbackPort: 44_111,
        serveHttpsPort: 44_111,
        serveUrl,
        privateServeTarget: 'http://127.0.0.1:44111',
        project: 'holocron-production',
        image: `registry.local/holocron-platform@${imageDigest}`,
        imageDigest,
        sourceRevision,
        composeSha256,
        composeGeneration,
        deployedAt: '2026-08-05T17:52:21.133Z',
        containers: {
          postgres: '11'.repeat(32),
          mastra: '22'.repeat(32),
          scheduler: '33'.repeat(32),
          'zero-cache': '44'.repeat(32),
        },
        previousImage: `registry.local/holocron-platform@sha256:${'e5'.repeat(32)}`,
        previousDigest: `sha256:${'e5'.repeat(32)}`,
        memoryLimitsGib: DEFAULT_MEMORY_LIMITS_GIB,
        releasePath: resolve(root, 'release.json'),
        composePath: resolve(root, 'compose.yaml'),
        overridePath: resolve(root, 'override.yaml'),
      });
      const emptyPath = resolve(root, 'empty-containers-record.json');
      writeFileSync(emptyPath, `${JSON.stringify(emptyContainersReceipt, null, 2)}\n`);
      await expect(
        verifyPortableDeploymentReceipt({
          recordPath: emptyPath,
          cwd: root,
          runner: () => ({ status: 1, stdout: '', stderr: 'No such object' }),
          fetchImpl,
        })
      ).rejects.toThrow(/portable receipt verification failed|live_services/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('IMP-AC-20 lifecycle memory and headroom contract (50/54/64/8/10, reject 51)', () => {
    const composeReadme = readFileSync(
      resolve(REPO_ROOT, 'services/platform/deploy/compose/README.md'),
      'utf8'
    );
    const launchdReadme = readFileSync(
      resolve(REPO_ROOT, 'services/platform/deploy/launchd/README.md'),
      'utf8'
    );

    // Docs retain the three-layer memory contract with explicit numbers.
    for (const doc of [composeReadme, launchdReadme]) {
      expect(doc).toMatch(/50 GiB/);
      expect(doc).toMatch(/54 GiB|docker_vm_memory_gib=54|VM ≥ selected sum \+ \*\*4 GiB\*\*/i);
      expect(doc).toMatch(/8 GiB|host_headroom_required_gib=8/);
      expect(doc).toMatch(/10 GiB|host_headroom_observed_gib=10/);
      expect(doc).toMatch(/51 GiB|over_budget_51_gib_rejected/);
    }
    expect(composeReadme).toMatch(/IMP-AC-20|container_limit_sum_gib=50/);
    expect(composeReadme).toMatch(/independently pass|three layers/i);

    expect(MAX_MEMORY_LIMIT_SUM_GIB).toBe(50);
    expect(MIN_HOST_HEADROOM_GIB).toBe(8);
    expect(MIN_DOCKER_VM_OVERHEAD_GIB).toBe(4);

    // Reference 50 / 54 / 64 plan: required headroom 8, observed 10.
    const reference = evaluateMemoryCapacity({
      containerLimitSumGib: 50,
      dockerVmMemoryGib: 54,
      hostPhysicalMemoryGib: 64,
    });
    expect(reference.container_limit_sum_gib, 'container_limit_sum_gib=50').toBe(50);
    expect(reference.docker_vm_memory_gib, 'docker_vm_memory_gib=54').toBe(54);
    expect(reference.host_headroom_required_gib, 'host_headroom_required_gib=8').toBe(8);
    expect(reference.host_headroom_observed_gib, 'host_headroom_observed_gib=10').toBe(10);
    expect(reference.ok).toBe(true);
    expect(reference.smaller_host_lower_limits_required).toBe(false);

    // 51 GiB container plan is rejected by the limit plan and capacity evaluator.
    let overBudgetRejected = false;
    try {
      assertMemoryLimitPlan({ postgres: 20, mastra: 20, scheduler: 6, 'zero-cache': 5 });
    } catch (error) {
      expect(String(error)).toMatch(/50|budget|memory/i);
      overBudgetRejected = true;
    }
    expect(overBudgetRejected, 'over_budget_51_gib_rejected from assertMemoryLimitPlan').toBe(true);
    overBudgetRejected = false;
    try {
      evaluateMemoryCapacity({
        containerLimitSumGib: 51,
        dockerVmMemoryGib: 54,
        hostPhysicalMemoryGib: 64,
      });
    } catch (error) {
      expect(String(error)).toMatch(/50|budget|memory/i);
      overBudgetRejected = true;
    }
    expect(overBudgetRejected, "over_budget_51_gib_rejected='true'").toBe(true);

    // Insufficient VM or host headroom fails closed and requires lower limits.
    const tightVm = evaluateMemoryCapacity({
      containerLimitSumGib: 50,
      dockerVmMemoryGib: 50,
      hostPhysicalMemoryGib: 64,
    });
    expect(tightVm.ok).toBe(false);
    expect(tightVm.smaller_host_lower_limits_required).toBe(true);

    const tightHost = evaluateMemoryCapacity({
      containerLimitSumGib: 50,
      dockerVmMemoryGib: 54,
      hostPhysicalMemoryGib: 60,
    });
    expect(tightHost.ok).toBe(false);
    expect(tightHost.host_headroom_observed_gib).toBe(6);

    // Default plan sums to the 50 GiB ceiling.
    const defaultSum = Object.values(DEFAULT_MEMORY_LIMITS_GIB).reduce((a, b) => a + b, 0);
    expect(defaultSum).toBe(50);
    expect(defaultSum).toBeLessThanOrEqual(MAX_MEMORY_LIMIT_SUM_GIB);

    // Real Docker VM + host observations (must be non-empty / non-zero).
    const dockerVmMemoryGib = observeDockerVmMemoryGib();
    const hostPhysicalMemoryGib = observeHostPhysicalMemoryGib();
    expect(dockerVmMemoryGib, 'real docker_vm_memory_gib').toBeGreaterThan(0);
    expect(hostPhysicalMemoryGib, 'real host_physical_memory_gib').toBeGreaterThan(0);

    const realAgainst50 = evaluateMemoryCapacity({
      containerLimitSumGib: 50,
      dockerVmMemoryGib,
      hostPhysicalMemoryGib,
    });
    // This host may have a small Docker VM — then lower limits are required.
    if (dockerVmMemoryGib < 54 || hostPhysicalMemoryGib - dockerVmMemoryGib < 8) {
      expect(realAgainst50.ok).toBe(false);
      expect(realAgainst50.smaller_host_lower_limits_required).toBe(true);
    }

    mkdirSync(D08_08_EVIDENCE, { recursive: true });
    writeFileSync(
      resolve(D08_08_EVIDENCE, 'imp-ac-20-memory.json'),
      `${JSON.stringify(
        {
          container_limit_sum_gib: reference.container_limit_sum_gib,
          docker_vm_memory_gib: reference.docker_vm_memory_gib,
          host_headroom_required_gib: reference.host_headroom_required_gib,
          host_headroom_observed_gib: reference.host_headroom_observed_gib,
          over_budget_51_gib_rejected: 'true',
          real_docker_vm_memory_gib: dockerVmMemoryGib,
          real_host_physical_memory_gib: hostPhysicalMemoryGib,
          real_50_plan_ok: realAgainst50.ok,
          smaller_host_lower_limits_required: realAgainst50.smaller_host_lower_limits_required,
        },
        null,
        2
      )}\n`
    );
  });

  it('IMP-AC-5/18/19 cross-tailnet peer receipt and two-device runbook contract', () => {
    const composeReadme = readFileSync(
      resolve(REPO_ROOT, 'services/platform/deploy/compose/README.md'),
      'utf8'
    );
    expect(composeReadme).toMatch(/Cross-tailnet cold-host recovery drill|IMP-AC-5/);
    expect(composeReadme).toMatch(/Node A|node A/);
    expect(composeReadme).toMatch(/Node B|node B|authorized peer/i);
    expect(composeReadme).toMatch(/44111/);
    expect(composeReadme).toMatch(/mcp_tool_count|44 tools|tools\/list/);
    expect(composeReadme).toMatch(/unreachable_serve|44112/);
    expect(composeReadme).toMatch(/funnel_endpoint_count|never Funnel|Funnel must stay zero/i);
    expect(composeReadme).toMatch(/credential_value_count/);
    expect(composeReadme).toMatch(/peer-receipt|peer receipt/i);
    expect(composeReadme).not.toMatch(/Bearer\s+sk-|MASTRA_API_KEY\s*[:=]\s*['"][^'"]+['"]/);

    const root = mkdtempSync(resolve(tmpdir(), 'holocron-cross-tailnet-'));
    try {
      const generation = 'holocron-0123456789abcdef01234567';
      const digest = `sha256:${'a1'.repeat(32)}`;
      const targetHash = hashStableIdentity('holocron.tail011a51.ts.net');
      const peerHash = hashStableIdentity('inference1.tail011a51.ts.net');
      expect(targetHash).toMatch(/^[a-f0-9]{64}$/);
      expect(peerHash).not.toBe(targetHash);

      const peerPath = resolve(root, 'peer-receipt.json');
      const peerBody = {
        schema: CROSS_TAILNET_PEER_RECEIPT_SCHEMA,
        peer_identity_hash: peerHash,
        target_fqdn_hash: targetHash,
        serve_https_port: 44_111,
        health_status: 200,
        health_after_restart_status: 200,
        mcp_tool_count: 44,
        mcp_after_restart_tool_count: 44,
        unreachable_serve_rejection_count: 1,
        observed_at: new Date().toISOString(),
        compose_generation: generation,
        image_digest: digest,
      };
      writeFileSync(peerPath, `${JSON.stringify(peerBody, null, 2)}\n`);

      const peer = verifyCrossTailnetPeerReceipt({
        peerReceiptPath: peerPath,
        expectedGeneration: generation,
        expectedDigest: digest,
        expectedTargetFqdnHash: targetHash,
      });
      expect(peer.mcp_tool_count).toBe(49);
      expect(peer.serve_https_port).toBe(44_111);

      // Wrong identity digest must reject.
      expect(() =>
        verifyCrossTailnetPeerReceipt({
          peerReceiptPath: peerPath,
          expectedDigest: `sha256:${'0'.repeat(64)}`,
        })
      ).toThrow(/image_digest|drill target/i);

      // Credential canary must reject.
      const dirtyPath = resolve(root, 'dirty-peer.json');
      writeFileSync(
        dirtyPath,
        `${JSON.stringify({ ...peerBody, note: 'Bearer sk-abcdefghijklmnopqrstuvwxyz012345' }, null, 2)}\n`
      );
      expect(() => verifyCrossTailnetPeerReceipt({ peerReceiptPath: dirtyPath })).toThrow(
        /credential/i
      );

      const evidencePath = resolve(root, 'cross-tailnet-drill.json');
      const sealed = sealCrossTailnetDrillEvidence({
        peer,
        server: {
          target_fqdn_hash: targetHash,
          image_digest: digest,
          source_revision: 'b2'.repeat(20),
          compose_generation: generation,
          healthy_service_count: 4,
          postgres_down_health_status: 503,
          recovered_health_status: 200,
          mastra_restart_count: 1,
          postgres_sentinel_rows: 1,
          blob_sentinel_objects: 1,
          funnel_enabled: false,
          funnel_endpoint_count: 0,
          wrong_identity_rejection_count: 1,
          missing_dependency_rejection_count: 1,
        },
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        evidencePath,
      });
      expect(sealed.schema).toBe(CROSS_TAILNET_DRILL_SCHEMA);
      expect(sealed.status).toBe('pass');
      expect(sealed.real_device_count).toBe(2);
      expect(sealed.second_device_health_status).toBe(200);
      expect(sealed.mcp_tool_count).toBe(49);
      expect(sealed.funnel_endpoint_count).toBe(0);
      expect(sealed.credential_value_count).toBe(0);
      expect(sealed.raw_environment_present).toBe(false);
      expect(JSON.parse(readFileSync(evidencePath, 'utf8')).status).toBe('pass');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
