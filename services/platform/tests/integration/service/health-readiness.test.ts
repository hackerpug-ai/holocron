import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyProductionDeployment } from '../../../src/deploy/verify-production.ts';
import {
  readDeploymentIdentity,
  verifyExternalDeploymentIdentity,
} from '../../../src/http/deployment-identity.ts';
import { probeZeroCache } from '../../../src/http/health.ts';

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
});
