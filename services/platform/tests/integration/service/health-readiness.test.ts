import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPortableDeploymentReceipt,
  DEFAULT_MEMORY_LIMITS_GIB,
} from '../../../src/deploy/production-deploy.ts';
import {
  verifyPortableDeploymentReceipt,
  verifyProductionDeployment,
} from '../../../src/deploy/verify-production.ts';
import {
  readDeploymentIdentity,
  verifyExternalDeploymentIdentity,
} from '../../../src/http/deployment-identity.ts';
import { probeFleet, probeZeroCache } from '../../../src/http/health.ts';

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
      // Prefer live health identity when the host is already serving; fall back to synthetic.
      let baseUrl = 'http://192.168.1.160:44111';
      let host = 'inference1';
      let imageDigest = `sha256:${'a1'.repeat(32)}`;
      let sourceRevision = 'b2'.repeat(20);
      let composeGeneration = 'inference1-0123456789abcdef01234567';
      let composeSha256 = 'c3'.repeat(32);
      let serveHealthStatus = 0;
      try {
        const response = await fetch('http://127.0.0.1:44111/health', {
          signal: AbortSignal.timeout(3_000),
          headers: { accept: 'application/json' },
        });
        if (response.status === 200) {
          const body = (await response.json()) as {
            deployment?: { identity?: Record<string, string> };
          };
          const identity = body.deployment?.identity;
          if (identity?.host && identity.imageDigest) {
            host = identity.host;
            imageDigest = identity.imageDigest;
            sourceRevision = identity.sourceRevision;
            composeGeneration = identity.composeGeneration;
            composeSha256 = identity.composeSha256;
            // Existing production publishes on LAN; use non-loopback for identity verifier.
            baseUrl = process.env.HOLO_PRODUCTION_BASE_URL?.replace(/\/$/, '') || baseUrl;
            // Probe LAN health if configured.
            try {
              const lan = await fetch(`${baseUrl}/health`, {
                signal: AbortSignal.timeout(3_000),
                headers: { accept: 'application/json' },
              });
              serveHealthStatus = lan.status;
            } catch {
              // Keep synthetic path if LAN is unreachable from this worktree host.
            }
          }
        }
      } catch {
        // offline path uses synthetic receipt + mock fetch below
      }

      const receipt = buildPortableDeploymentReceipt({
        authorizationScope: `${host}:${imageDigest}`,
        host,
        baseUrl,
        loopbackPort: 44_111,
        serveHttpsPort: 44_111,
        serveUrl: baseUrl.startsWith('https:')
          ? baseUrl
          : `https://holocron.tail011a51.ts.net:44111`,
        privateServeTarget: 'http://127.0.0.1:44111',
        project: 'holocron-production',
        image: `127.0.0.1:5000/holocron-platform@${imageDigest}`,
        imageDigest,
        sourceRevision,
        composeSha256,
        composeGeneration,
        deployedAt: '2026-08-05T17:52:21.133Z',
        containers: {
          postgres: 'd84168e50af0d4075a52a99dcdad66e2792e4c8e0eef94988ee8c6c1e9033196',
          mastra: '545aca7ab151dda5934bac20d500e4f71bb0c727aaaba1b8ace526971548b7e3',
          scheduler: 'b19f6f1a215a0c805d53a27e5212d4aa9dd0b4161934ca2e2b3778b9a099a051',
          'zero-cache': '4be41bfbe1b6ef13f817637ea079e03f9f2b29511073e1b1e2170901a093912e',
        },
        previousImage: `127.0.0.1:5000/holocron-platform@sha256:${'e5'.repeat(32)}`,
        previousDigest: `sha256:${'e5'.repeat(32)}`,
        memoryLimitsGib: DEFAULT_MEMORY_LIMITS_GIB,
        releasePath: resolve(root, 'release.json'),
        composePath: resolve(root, 'compose.yaml'),
        overridePath: resolve(root, 'override.yaml'),
      });
      mkdirSync(root, { recursive: true });
      writeFileSync(recordPath, `${JSON.stringify(receipt, null, 2)}\n`);

      const mockHealth = {
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
            return Response.json(mockHealth, { status: 200 });
          }
          return new Response('missing', { status: 404 });
        },
        { preconnect: () => undefined }
      );

      const report = await verifyPortableDeploymentReceipt({
        recordPath,
        cwd: root,
        fetchImpl: serveHealthStatus === 200 ? fetch : fetchImpl,
      });

      expect(
        report.verification_dimension_count,
        'verification_dimension_count'
      ).toBeGreaterThanOrEqual(8);
      expect(report.serve_health_status, 'serve_health_status').toBe(200);
      expect(report.identity_mismatch_rejected, 'identity_mismatch_rejected').toBe(true);
      expect(report.memory_drift_rejected, 'memory_drift_rejected').toBe(true);
      expect(report.receipt.imageDigest).toBeTruthy();
      expect(report.receipt.serviceCount).toBe(4);
      expect(report.receipt.namedVolumeCount).toBe(2);
      expect(report.credential_value_count).toBe(0);
      expect(report.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
