/**
 * S33-PLAT-02 — resolveModel configured-base precedence and truthful revisions.
 *
 * This suite is intentionally live-only. It must be run with PLATFORM_IT=1 and
 * FLEET_URL set to the deployed LiteLLM router for the configured-base cases.
 * No fetch or model-provider mocks are permitted: the router health probe,
 * model listing, and one real completion are all part of the evidence.
 *
 * Run:
 *   PLATFORM_IT=1 FLEET_URL=http://<deployed-router>:4545 \
 *     pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearManifestCache,
  type FleetRoleManifest,
  getFleetManifest,
} from '../../src/fleet/manifest.ts';
import {
  normalizeEndpointBase,
  RoleUnavailableError,
  resolveModel,
} from '../../src/inference/resolve-model.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
if (!PLATFORM_IT) {
  throw new Error(
    'S33-PLAT-02 requires PLATFORM_IT=1: this suite verifies real LiteLLM routers and a real completion'
  );
}

const configuredFleetUrl = process.env.FLEET_URL?.trim();
if (!configuredFleetUrl) {
  throw new Error(
    'S33-PLAT-02 requires FLEET_URL to name the deployed LiteLLM router; no laptop-only substitute is accepted for AC-1'
  );
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/platform/fleet/manifest.json');
const LAPTOP_DEFAULT = 'http://127.0.0.1:4545';
const DEAD_BASE = 'http://127.0.0.1:9';

type LiveModel = { id?: unknown };
type LiveModelsResponse = { data?: LiveModel[] };

async function fetchLiveModelIds(base: string): Promise<string[]> {
  const endpoint = normalizeEndpointBase(base);
  const response = await fetch(`${endpoint}/v1/models`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  expect(response.status, `GET ${endpoint}/v1/models`).toBe(200);
  const payload = (await response.json()) as LiveModelsResponse;
  const ids = (payload.data ?? [])
    .map((model) => (typeof model.id === 'string' ? model.id : null))
    .filter((id): id is string => id !== null);
  expect(ids.length, `live model list from ${endpoint}`).toBeGreaterThanOrEqual(3);
  return ids;
}

async function fetchRealCompletion(base: string, model: string): Promise<string> {
  const endpoint = normalizeEndpointBase(base);
  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.FLEET_KEY ?? 'sk-none'}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: 'Reply with a short non-empty confirmation that the fleet router is reachable.',
        },
      ],
      max_tokens: 32,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  expect(response.status, `POST ${endpoint}/v1/chat/completions`).toBe(200);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = payload.choices?.[0]?.message?.content;
  expect(typeof text).toBe('string');
  expect(String(text).trim()).not.toBe('');
  return String(text).trim();
}

async function withFleetUrl<T>(url: string | undefined, callback: () => Promise<T>): Promise<T> {
  const previous = process.env.FLEET_URL;
  if (url === undefined) delete process.env.FLEET_URL;
  else process.env.FLEET_URL = url;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.FLEET_URL;
    else process.env.FLEET_URL = previous;
  }
}

function loadManifestFixture(): FleetRoleManifest {
  clearManifestCache();
  return getFleetManifest(MANIFEST_PATH);
}

describe('S33-PLAT-02 resolveModel reaches the configured real router', () => {
  let manifest: FleetRoleManifest;
  let configuredIds: string[];
  let laptopIds: string[];

  beforeAll(async () => {
    manifest = loadManifestFixture();
    configuredIds = await fetchLiveModelIds(configuredFleetUrl);
    laptopIds = await fetchLiveModelIds(LAPTOP_DEFAULT);
    console.log(
      JSON.stringify(
        {
          task: 'S33-PLAT-02',
          configuredBase: normalizeEndpointBase(configuredFleetUrl),
          manifestDefaultEndpoint: manifest.defaultEndpoint,
          manifestRoleEndpoints: Object.fromEntries(
            Object.entries(manifest.roles).map(([role, entry]) => [role, entry.endpoint])
          ),
          configuredLiveModelIds: configuredIds,
          laptopLiveModelIds: laptopIds,
        },
        null,
        2
      )
    );
  });

  afterAll(() => {
    clearManifestCache();
  });

  it('AC-1/TC-1/TC-2 resolves all gating roles at configured base and completes for real', async () => {
    const configuredEndpoint = normalizeEndpointBase(configuredFleetUrl);
    expect(configuredEndpoint).not.toBe(manifest.defaultEndpoint);

    await withFleetUrl(configuredFleetUrl, async () => {
      const roles = ['divergent', 'convergent', 'judge', 'embed'] as const;
      const resolved = await Promise.all(roles.map((role) => resolveModel(role)));

      for (const model of resolved) {
        expect(model.provider).toBe('fleet');
        expect(model.healthy).toBe(true);
        expect(model.endpoint).toBe(configuredEndpoint);
        expect(model.endpoint).not.toBe(manifest.roles[model.role].endpoint);
        expect(model.baseURL).toBe(`${configuredEndpoint}/v1`);
        expect(configuredIds).toContain(model.litellmModelId);
        expect(model.modelRevision).toBeTruthy();
        console.log(
          JSON.stringify({
            role: model.role,
            endpoint: model.endpoint,
            baseURL: model.baseURL,
            litellmModelId: model.litellmModelId,
            modelRevision: model.modelRevision,
          })
        );
      }

      expect(resolved.map((model) => model.litellmModelId)).toEqual([
        'implementer',
        'reviewer',
        'reviewer',
        'qwen3-embedding',
      ]);

      const completion = await fetchRealCompletion(configuredEndpoint, resolved[0].litellmModelId);
      console.log(JSON.stringify({ completionTextLength: completion.length }));
    });
  }, 180_000);

  it('AC-2/TC-3 fails closed at a real closed configured port without fallback', async () => {
    const refused = await fetch(`${DEAD_BASE}/v1/models`, {
      signal: AbortSignal.timeout(2_000),
    }).catch(() => null);
    expect(refused).toBeNull();

    await withFleetUrl(DEAD_BASE, async () => {
      let thrown: unknown;
      try {
        await resolveModel('divergent');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(RoleUnavailableError);
      expect(thrown).toMatchObject({
        code: 'ROLE_UNAVAILABLE',
        endpoint: DEAD_BASE,
      });
      expect(thrown instanceof Error ? thrown.message : '').toContain('health probe failed');
      console.log(
        JSON.stringify(
          {
            deadBase: DEAD_BASE,
            errorName: thrown instanceof Error ? thrown.name : typeof thrown,
            errorCode:
              thrown && typeof thrown === 'object' && 'code' in thrown
                ? (thrown as { code: unknown }).code
                : null,
            errorEndpoint:
              thrown && typeof thrown === 'object' && 'endpoint' in thrown
                ? (thrown as { endpoint: unknown }).endpoint
                : null,
            message: thrown instanceof Error ? thrown.message : String(thrown),
          },
          null,
          2
        )
      );
    });
  });

  it('AC-2/TC-4 falls back to the committed manifest endpoint for laptop dev', async () => {
    await withFleetUrl(undefined, async () => {
      const resolved = await resolveModel('divergent');
      expect(resolved.healthy).toBe(true);
      expect(resolved.endpoint).toBe(manifest.roles.divergent.endpoint);
      expect(resolved.endpoint).toBe(LAPTOP_DEFAULT);
      expect(resolved.litellmModelId).toBe('implementer');
      expect(laptopIds).toContain(resolved.litellmModelId);
      console.log(JSON.stringify({ laptopFallback: resolved }));
    });
  }, 30_000);

  it('AC-3/TC-5 matches real route revisions and preserves fail-closed absence', async () => {
    const currentManifest = loadManifestFixture();
    expect(currentManifest.roles.divergent.modelRevision).toBe('Qwen3.6-35B-A3B-MLX-8bit');
    expect(currentManifest.roles.convergent.modelRevision).toBe('Qwen3.8-27B-8bit');
    expect(currentManifest.roles.judge.modelRevision).toBe('Qwen3.8-27B-8bit');
    expect(currentManifest.roles.embed.modelRevision).toBe('Qwen3-Embedding-0.6B-4bit-DWQ');
    expect(currentManifest.roles.embed.embed?.embeddingDimension).toBe(1024);
    expect(currentManifest.roles.rerank.modelRevision).toBe('BAAI-bge-reranker-v2-m3-mlx-fp16');
    expect(currentManifest.roles.rerank.modelRevision).not.toBe('qwen3-reranker-0.6b');
    expect(
      configuredIds.filter((id) => id === currentManifest.roles.rerank.litellmModelId)
    ).toHaveLength(0);
    expect(currentManifest.roles.rerank.degradationAction).toBe('fail-closed');
    expect(currentManifest.roles.embed.degradationAction).toBe('fail-closed');
    expect(readFileSync(MANIFEST_PATH, 'utf8')).not.toContain('qwen3.6-27b-mtp-q8_0');
    console.log(
      JSON.stringify(
        {
          configuredLiveModelIds: configuredIds,
          revisions: Object.fromEntries(
            Object.entries(currentManifest.roles).map(([role, entry]) => [
              role,
              entry.modelRevision,
            ])
          ),
          rerankAbsent: !configuredIds.includes(currentManifest.roles.rerank.litellmModelId),
          rerankDegradationAction: currentManifest.roles.rerank.degradationAction,
          embedDegradationAction: currentManifest.roles.embed.degradationAction,
        },
        null,
        2
      )
    );
  });

  it('preserves cloud endpoint refusal on the default fleet path', async () => {
    const cloudManifest: FleetRoleManifest = {
      ...manifest,
      roles: {
        ...manifest.roles,
        divergent: { ...manifest.roles.divergent, endpoint: 'https://api.openai.com' },
      },
    };
    await withFleetUrl(undefined, async () => {
      await expect(
        resolveModel('divergent', { manifest: cloudManifest, skipHealth: true })
      ).rejects.toMatchObject({
        code: 'ROLE_UNAVAILABLE',
        endpoint: 'https://api.openai.com',
      });
    });
  });
});
