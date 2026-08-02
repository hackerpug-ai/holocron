import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyProductionDeployment,
  renderDeploymentOverride,
} from '../../src/deploy/production-deploy.ts';
import type { ReleaseLock } from '../../src/deploy/production-release.ts';
import { verifyProductionDeployment } from '../../src/deploy/verify-production.ts';
import {
  assertExternalBaseUrl,
  verifyExternalDeploymentIdentity,
} from '../../src/http/deployment-identity.ts';

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

const expected = {
  host: 'inference1',
  runtime: 'container' as const,
  imageDigest: DIGEST,
  sourceRevision: REVISION,
  composeGeneration: GENERATION,
  composeSha256: COMPOSE_SHA,
};

describe('D06-07 inference1 deployment contract', () => {
  it('rejects loopback identity', async () => {
    expect(() => assertExternalBaseUrl('http://127.0.0.1:4111')).toThrowError(/LOOPBACK_REJECTED/);
    await expect(
      verifyExternalDeploymentIdentity({
        baseUrl: 'http://localhost:4111',
        expected,
        fetchImpl: () => response(health()),
      })
    ).rejects.toMatchObject({ code: 'LOOPBACK_REJECTED' });
  });

  it('accepts only complete observed external identity and rejects stale/mismatched/missing fields', async () => {
    const accepted = await verifyExternalDeploymentIdentity({
      baseUrl: 'http://192.168.1.160:44111',
      expected,
      verifierPid: 99,
      fetchImpl: () => response(health()),
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
          fetchImpl: () => response(body),
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

  it('generated Compose override carries identity, one external port, and no secret values', () => {
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
    });
    expect(override).toContain('0.0.0.0:44111:4111');
    expect(override).toContain(`HOLO_IMAGE_DIGEST: ${DIGEST}`);
    expect(override).toContain(`HOLO_SOURCE_REVISION: ${REVISION}`);
    expect(override).toContain('depends_on: !override');
    expect(override).not.toMatch(/Bearer |HOLO_KEY_MCP:|POSTGRES_PASSWORD:/);
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
