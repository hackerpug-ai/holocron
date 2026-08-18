/**
 * S33-PLAT-03 — fleet readiness is based on live per-role model presence.
 *
 * This suite is intentionally live-only. It requires PLATFORM_IT=1 and a
 * reachable LiteLLM router in FLEET_URL; no fetch, framework, database, or
 * model-provider mocks are permitted.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearManifestCache } from '../../src/fleet/manifest.ts';
import { runHealthCheck } from '../../src/http/health.ts';

if (process.env.PLATFORM_IT !== '1') {
  throw new Error(
    'S33-PLAT-03 requires PLATFORM_IT=1: this suite verifies a real LiteLLM router and database-backed health probes'
  );
}

const APPROVED_TEST_FLEET_ORIGIN = 'http://holocron.tail011a51.ts.net:4545';

function assertApprovedTestFleetOrigin(value: string): string {
  const candidate = value.trim();
  if (candidate !== APPROVED_TEST_FLEET_ORIGIN) {
    throw new Error(
      `S33-PLAT-03 requires the approved real test router ${APPROVED_TEST_FLEET_ORIGIN}; received ${candidate || '(missing)'}`
    );
  }
  return candidate;
}

const configuredFleetUrl = process.env.FLEET_URL?.trim();
if (!configuredFleetUrl) {
  throw new Error(
    'S33-PLAT-03 requires FLEET_URL to name the real LiteLLM router; no static or laptop-only substitute is accepted'
  );
}
const FLEET_URL = assertApprovedTestFleetOrigin(configuredFleetUrl);

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/platform/fleet/manifest.json');

const DISALLOWED_FLEET_ENDPOINTS = [
  'http://127.0.0.1:4545',
  'http://localhost:4545',
  'http://host.docker.internal:4545',
  'http://inference1.tail011a51.ts.net:4545',
  'http://holocron.tail011a51.ts.net:4546',
  'http://holocron.tail011a51.ts.net:4545/v1',
  'http://holocron.tail011a51.ts.net:4545/?probe=wrong',
  'http://operator-secret@holocron.tail011a51.ts.net:4545',
] as const;

type ManifestJson = {
  roles: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

let fixtureRoot = '';
let manifest: ManifestJson;
let liveModelIds: string[] = [];

type RoleAwareHealth = {
  body: {
    fleet: {
      ready: boolean;
      latency_ms: number;
      roles: Record<
        string,
        { present: boolean; litellmModelId: string; degradationAction?: string }
      >;
      unavailable_roles: string[];
    };
    failing_dependency: string | null;
  };
};

async function fetchLiveModelIds(): Promise<string[]> {
  const endpoint = FLEET_URL.replace(/\/?v1\/?$/, '');
  const response = await fetch(`${endpoint}/v1/models`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  expect(response.status, `GET ${endpoint}/v1/models`).toBe(200);
  const payload = (await response.json()) as { data?: unknown };
  const ids = Array.isArray(payload.data)
    ? payload.data.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || !('id' in entry)) return [];
        const id = (entry as { id?: unknown }).id;
        return typeof id === 'string' ? [id] : [];
      })
    : [];
  expect(ids.length, `live model list from ${endpoint}`).toBeGreaterThanOrEqual(3);
  return ids;
}

function writeManifestFixture(role: 'divergent' | 'embed'): string {
  const altered = structuredClone(manifest);
  altered.roles[role].litellmModelId =
    role === 'divergent' ? 's33-model-that-does-not-exist' : 's33-embedding-that-does-not-exist';
  const path = resolve(fixtureRoot, `${role}-unserved.json`);
  writeFileSync(path, `${JSON.stringify(altered, null, 2)}\n`, 'utf8');
  return path;
}

async function healthWithManifest(manifestPath: string) {
  const previous = process.env.FLEET_MANIFEST_PATH;
  process.env.FLEET_MANIFEST_PATH = manifestPath;
  clearManifestCache();
  try {
    return (await runHealthCheck({
      fleetEndpoint: FLEET_URL,
      strictReadiness: false,
    })) as unknown as RoleAwareHealth;
  } finally {
    if (previous === undefined) delete process.env.FLEET_MANIFEST_PATH;
    else process.env.FLEET_MANIFEST_PATH = previous;
    clearManifestCache();
  }
}

describe('S33-PLAT-03 live fleet role readiness', () => {
  beforeAll(async () => {
    fixtureRoot = mkdtempSync(resolve(tmpdir(), 'holocron-s33-plat-03-'));
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ManifestJson;
    liveModelIds = await fetchLiveModelIds();
    console.log(
      JSON.stringify({
        task: 'S33-PLAT-03',
        fleetEndpoint: FLEET_URL.replace(/\/?v1\/?$/, ''),
        liveModelIds,
      })
    );
  });

  afterAll(() => {
    clearManifestCache();
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('AC-1/TC-1: an unserved divergent model fails fleet readiness', async () => {
    const body = (await healthWithManifest(writeManifestFixture('divergent'))).body;
    expect(body.fleet.ready).toBe(false);
    expect(body.failing_dependency).toBe('fleet');
    expect(body.fleet.latency_ms).toBeGreaterThan(0);
    expect(liveModelIds.length).toBeGreaterThanOrEqual(3);
    expect(liveModelIds).not.toContain('s33-model-that-does-not-exist');
    expect(body.fleet.roles.divergent).toMatchObject({
      present: false,
      litellmModelId: 's33-model-that-does-not-exist',
    });
    expect(body.fleet.roles.convergent.present).toBe(true);
    expect(body.fleet.roles.embed.present).toBe(true);
    expect(body.fleet.unavailable_roles).toContain('divergent');
    console.log(JSON.stringify({ task: 'S33-PLAT-03', ac: 'AC-1-divergent', health: body }));
  }, 30_000);

  it('AC-1/TC-2: an unserved embed model also fails fleet readiness', async () => {
    const body = (await healthWithManifest(writeManifestFixture('embed'))).body;
    expect(body.fleet.ready).toBe(false);
    expect(body.failing_dependency).toBe('fleet');
    expect(body.fleet.roles.embed).toMatchObject({
      present: false,
      litellmModelId: 's33-embedding-that-does-not-exist',
    });
    expect(body.fleet.roles.divergent.present).toBe(true);
    expect(liveModelIds).not.toContain('s33-embedding-that-does-not-exist');
    expect([...body.fleet.unavailable_roles].sort()).toEqual(['embed', 'rerank']);
    console.log(JSON.stringify({ task: 'S33-PLAT-03', ac: 'AC-1-embed', health: body }));
  }, 30_000);

  it('AC-2/TC-3/TC-4: committed manifest reports four gating roles present and rerank absent', async () => {
    const body = (await healthWithManifest(MANIFEST_PATH)).body;
    expect(Object.keys(body.fleet.roles).sort()).toEqual([
      'convergent',
      'divergent',
      'embed',
      'judge',
      'rerank',
    ]);
    for (const role of ['divergent', 'convergent', 'judge', 'embed'] as const) {
      expect(body.fleet.roles[role].present, role).toBe(true);
    }
    expect(body.fleet.roles.rerank).toMatchObject({
      present: false,
      litellmModelId: 'qwen3-reranker',
      degradationAction: 'fail-closed',
    });
    expect(body.fleet.unavailable_roles).toEqual(['rerank']);
    expect(body.fleet.ready).toBe(true);
    console.log(JSON.stringify({ task: 'S33-PLAT-03', ac: 'AC-2', health: body }));
  }, 30_000);

  it.each(
    DISALLOWED_FLEET_ENDPOINTS
  )('provenance negative control: rejects non-approved fleet endpoint %s', (fleetEndpoint) => {
    expect(() => assertApprovedTestFleetOrigin(fleetEndpoint), fleetEndpoint).toThrow(
      'approved real test router'
    );
  });
});
