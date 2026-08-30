/**
 * imp-prod-tool-audit-remediation AC-3 — /health probes each GATING fleet role
 * with a real bounded inference call (tiny chat/embed), not just /v1/models,
 * and fails closed on probe errors. A dead upstream model that /v1/models
 * still lists must land in unavailable_roles and fail fleet readiness.
 *
 * Real HTTP only: a local stub OpenAI-compatible router (node http server —
 * no fetch/framework mocks) that always lists every model in /v1/models while
 * selected upstream models are dead (500) — exactly the false-green shape that
 * motivated this AC. Postgres not required (probeFleet is DB-free).
 *
 *   - AC-3a: healthy router → fleet ready, all gating roles present.
 *   - AC-3b (RED discriminator): dead chat upstream listed by /v1/models →
 *           divergent absent, ready:false, unavailable_roles=['divergent'].
 *   - AC-3c: dead embed upstream → embed absent, ready:false.
 *   - AC-3d: malformed probe response fails closed (never green).
 *   - AC-3e (SECURITY): cross-host redirect on a probe is rejected, never
 *           followed (FLEET_KEY cannot be exfiltrated).
 *   - AC-3f (SECURITY): URL-embedded credentials rejected (regression lock).
 *   - AC-3g (SECURITY): probes carry the FLEET_KEY bearer credential.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearManifestCache, loadFleetManifest } from '../../src/fleet/manifest.ts';
import { probeFleet } from '../../src/http/health.ts';
import { fleetReadinessFromProbes } from '../../src/inference/probe-fleet-roles.ts';

type Recorded = { path: string; authorization: string | null; body: string };

let server: http.Server;
let baseUrl = '';
let requests: Recorded[] = [];
let fixtureRoot = '';

const MANIFEST = {
  schemaVersion: '1.0.0',
  defaultEndpoint: 'http://stub.local:4545',
  roles: {
    divergent: stubRole('divergent', 'stub-chat-model'),
    convergent: stubRole('convergent', 'stub-chat-model'),
    judge: stubRole('judge', 'stub-chat-model'),
    embed: {
      ...stubRole('embed', 'stub-embed-model'),
      embed: {
        embeddingDimension: 1024,
        prefixPolicy: { query: 'query: ', document: 'passage: ' },
      },
    },
    rerank: stubRole('rerank', 'stub-rerank-model'),
    synthesis: stubRole('synthesis', 'stub-chat-model'),
  },
};

function stubRole(role: string, litellmModelId: string) {
  return {
    role,
    endpoint: 'http://stub.local:4545',
    litellmModelId,
    modelRevision: 'stub-revision',
    contextLimit: 8192,
    concurrency: 1,
    timeoutMs: 3000,
    structuredOutput: false,
    healthProbe: { path: '/v1/models', method: 'GET', timeoutMs: 3000, expectStatus: 200 },
    degradationAction: 'surface-unavailable',
  };
}

function reply(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function chatPayload(): Record<string, unknown> {
  return {
    id: 'chatcmpl-stub',
    object: 'chat.completion',
    choices: [{ message: { role: 'assistant', content: 'ok' } }],
  };
}

function embedPayload(): Record<string, unknown> {
  return { object: 'list', data: [{ object: 'embedding', embedding: [0.1, 0.2] }] };
}

function upstreamModelOk(model: string): boolean {
  return !model.startsWith('dead-');
}

async function probeWithManifest(): Promise<Awaited<ReturnType<typeof probeFleet>>> {
  clearManifestCache();
  try {
    return await probeFleet(baseUrl, resolve(fixtureRoot, 'manifest.json'));
  } finally {
    clearManifestCache();
  }
}

function writeManifest(): void {
  writeFileSync(
    resolve(fixtureRoot, 'manifest.json'),
    `${JSON.stringify(MANIFEST, null, 2)}\n`,
    'utf8'
  );
}

describe('probeFleet real inference probes (imp-prod-tool-audit AC-3)', () => {
  beforeAll(async () => {
    fixtureRoot = mkdtempSync(resolve(tmpdir(), 'ac3-fleet-'));
    writeManifest();
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push({
          path: req.url ?? '/',
          authorization: req.headers.authorization ?? null,
          body,
        });
        if (req.url === '/v1/models') {
          // Always lists every model — the alias list cannot detect a dead upstream.
          reply(res, 200, {
            data: [
              { id: 'stub-chat-model' },
              { id: 'stub-embed-model' },
              { id: 'stub-rerank-model' },
              { id: 'dead-chat-model' },
              { id: 'dead-embed-model' },
              { id: 'redirect-chat-model' },
              { id: 'garbage-chat-model' },
            ],
          });
          return;
        }
        let model = '';
        try {
          model = String((JSON.parse(body) as { model?: unknown }).model ?? '');
        } catch {
          model = '';
        }
        if (model === 'redirect-chat-model') {
          res.writeHead(302, { location: 'http://evil.example/hijack' });
          res.end();
          return;
        }
        if (model === 'garbage-chat-model') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('<not-json>');
          return;
        }
        if (req.url === '/v1/chat/completions') {
          if (!upstreamModelOk(model)) {
            reply(res, 500, { error: { message: `upstream dead for ${model}` } });
            return;
          }
          reply(res, 200, chatPayload());
          return;
        }
        if (req.url === '/v1/embeddings') {
          if (!upstreamModelOk(model)) {
            reply(res, 500, { error: { message: `upstream dead for ${model}` } });
            return;
          }
          reply(res, 200, embedPayload());
          return;
        }
        reply(res, 404, { error: 'not found' });
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    requests = [];
    process.env.FLEET_KEY = 'sk-test-ac3';
  });

  afterAll(async () => {
    delete process.env.FLEET_KEY;
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('AC-3a: healthy router → fleet ready with all gating roles present', async () => {
    const result = await probeWithManifest();
    expect(result.ready).toBe(true);
    expect(result.unavailable_roles).toEqual([]);
    for (const role of ['divergent', 'convergent', 'judge', 'embed'] as const) {
      expect(result.roles[role].present, role).toBe(true);
    }
  }, 15_000);

  it('AC-3b: dead chat upstream still listed by /v1/models fails readiness', async () => {
    MANIFEST.roles.divergent.litellmModelId = 'dead-chat-model';
    writeManifest();
    try {
      const result = await probeWithManifest();
      expect(result.ready).toBe(false);
      expect(result.unavailable_roles).toEqual(['divergent']);
      expect(result.roles.divergent.present).toBe(false);
      expect(result.roles.convergent.present).toBe(true);
      expect(result.roles.embed.present).toBe(true);
      expect(result.error).toMatch(/divergent/);
    } finally {
      MANIFEST.roles.divergent.litellmModelId = 'stub-chat-model';
      writeManifest();
    }
  }, 15_000);

  it('AC-3c: dead embed upstream fails readiness', async () => {
    MANIFEST.roles.embed.litellmModelId = 'dead-embed-model';
    writeManifest();
    try {
      const result = await probeWithManifest();
      expect(result.ready).toBe(false);
      expect(result.unavailable_roles).toEqual(['embed']);
      expect(result.roles.embed.present).toBe(false);
    } finally {
      MANIFEST.roles.embed.litellmModelId = 'stub-embed-model';
      writeManifest();
    }
  }, 15_000);

  it('AC-3d: malformed probe response fails closed', async () => {
    MANIFEST.roles.judge.litellmModelId = 'garbage-chat-model';
    writeManifest();
    try {
      const result = await probeWithManifest();
      expect(result.ready).toBe(false);
      expect(result.unavailable_roles).toContain('judge');
      expect(result.error).toMatch(/judge/);
    } finally {
      MANIFEST.roles.judge.litellmModelId = 'stub-chat-model';
      writeManifest();
    }
  }, 15_000);

  it('AC-3e: cross-host redirect on a probe is rejected, never followed', async () => {
    MANIFEST.roles.divergent.litellmModelId = 'redirect-chat-model';
    writeManifest();
    try {
      const result = await probeWithManifest();
      expect(result.ready).toBe(false);
      expect(result.unavailable_roles).toContain('divergent');
      expect(result.error).toMatch(/redirect/i);
      // The stub never saw a second (followed) probe — only the original request.
      const probeRequests = requests.filter((r) => r.path === '/v1/chat/completions');
      expect(probeRequests.length).toBeLessThanOrEqual(3);
    } finally {
      MANIFEST.roles.divergent.litellmModelId = 'stub-chat-model';
      writeManifest();
    }
  }, 15_000);

  it('AC-3f: URL-embedded credentials are rejected', async () => {
    const result = await probeFleet(
      `http://user:pass@127.0.0.1:${(server.address() as AddressInfo).port}`,
      resolve(fixtureRoot, 'manifest.json')
    );
    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/credentials are forbidden/);
  });

  it('AC-3g: probes carry the FLEET_KEY bearer credential', async () => {
    await probeWithManifest();
    const probeRequests = requests.filter((r) => r.path !== '/v1/models');
    expect(probeRequests.length).toBeGreaterThanOrEqual(4);
    expect(probeRequests.every((r) => r.authorization === 'Bearer sk-test-ac3')).toBe(true);
  }, 15_000);

  it('probe-fleet-roles: non-gating roles stay alias-driven via the aggregator', () => {
    const manifest = loadFleetManifest(resolve(fixtureRoot, 'manifest.json'));
    const readiness = fleetReadinessFromProbes(
      manifest,
      {
        divergent: { ok: true },
        convergent: { ok: true },
        judge: { ok: true },
        embed: { ok: true },
      },
      ['stub-rerank-model']
    );
    expect(readiness.ready).toBe(true);
    expect(readiness.roles.rerank.present).toBe(true);
    expect(readiness.roles.synthesis.present).toBe(false);
    expect(readiness.unavailable_roles).toEqual(['synthesis']);
  });
});
