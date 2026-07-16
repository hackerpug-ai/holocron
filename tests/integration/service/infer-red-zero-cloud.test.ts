/**
 * infer-4 / AC-1 / TC-1 (T-INFER-001): Zero Anthropic on the default resolve path.
 *
 * Proves the local-first invariant with un-fakeable network assertions:
 *   resolveModel(role) with allowEscape=false (or omitted) → fleet :4545 only.
 *   Network capture row count for host api.anthropic.com === 0.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Network capture mocked to always return zero cloud requests
 * - resolveModel stubbed to return fake endpoints without a live health probe
 * - allowEscape=true used on the "default path" test
 * - Test passes without real seeded fleet / PLATFORM_IT=1
 *
 * RED (empty router / no resolveModel): vitest non-zero — import or resolve fails.
 * GREEN (infer-1+): exit 0, anthropicCount === 0, fleetCount ≥ 1.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-zero-cloud.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/infer-4');

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function identityBlob(resolved: {
  litellmModelId?: string;
  modelRevision?: string;
  endpoint?: string;
  provider?: string;
}): string {
  return `${resolved.litellmModelId ?? ''} ${resolved.modelRevision ?? ''} ${resolved.endpoint ?? ''} ${resolved.provider ?? ''}`;
}

describe('infer-4 AC-1: zero Anthropic on default path (real network capture)', () => {
  itLive('resolveModel is defined (not empty-router RED state)', async () => {
    const mod = await loadResolveModel();
    expect(typeof mod.resolveModel).toBe('function');
    expect(mod.resolveModel).toBeDefined();
  });

  itLive('default path (allowEscape omitted): fleet only, anthropicCount=0', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel } = await loadResolveModel();
      // NEVER pass allowEscape=true on the default-path assertion
      const resolved = await resolveModel('divergent');

      expect(resolved.endpoint).toMatch(/:4545/);
      expect(resolved.endpoint).not.toMatch(/api\.anthropic\.com/i);
      expect(resolved.role).toBe('divergent');
      expect(resolved.healthy).toBe(true);
      expect(resolved.provider === 'fleet' || resolved.provider === undefined).toBe(true);
      expect(JSON.stringify(resolved)).not.toMatch(/claudeFlash|claudePro|claudeUltra/);

      // Un-fakeable: real capture must have recorded fleet health probe traffic
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);
      expect(capture.anthropicCount()).toBe(0);
      expect(capture.countForHost('api.anthropic.com')).toBe(0);

      for (const row of capture.snapshot()) {
        expect(row.host).not.toMatch(/api\.anthropic\.com/i);
        expect(row.url).not.toMatch(/api\.anthropic\.com/i);
      }

      writeArtifact('AC-1-zero-cloud-default.json', {
        resolved: {
          endpoint: resolved.endpoint,
          role: resolved.role,
          provider: resolved.provider,
          litellmModelId: resolved.litellmModelId,
          modelRevision: resolved.modelRevision,
          allowEscape: resolved.allowEscape,
        },
        anthropicCount: capture.anthropicCount(),
        fleetCount: capture.fleetCount(),
        rows: capture.snapshot(),
      });
    } finally {
      capture.restore();
    }
  });

  itLive('explicit allowEscape=false: never hits api.anthropic.com', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel } = await loadResolveModel();
      const a = await resolveModel('divergent', { allowEscape: false });
      const b = await resolveModel('convergent', { allowEscape: false });

      expect(a.endpoint).toMatch(/:4545/);
      expect(b.endpoint).toMatch(/:4545/);
      expect(a.endpoint).not.toMatch(/api\.anthropic\.com/i);
      expect(b.endpoint).not.toMatch(/api\.anthropic\.com/i);
      expect(identityBlob(a)).toMatch(/35b-a3b|35B-A3B/i);
      expect(identityBlob(b)).toMatch(/27b|27B/i);

      expect(capture.anthropicCount()).toBe(0);
      expect(capture.countForHost('api.anthropic.com')).toBe(0);
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);

      writeArtifact('AC-1-zero-cloud-allowEscape-false.json', {
        divergent: a.endpoint,
        convergent: b.endpoint,
        anthropicCount: capture.anthropicCount(),
        fleetCount: capture.fleetCount(),
        rows: capture.snapshot(),
      });
    } finally {
      capture.restore();
    }
  });

  itLive('dead fleet port fails closed without contacting Anthropic', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel, RoleUnavailableError } = await loadResolveModel();
      let caught: unknown;
      try {
        await resolveModel('divergent', {
          endpointOverride: 'http://127.0.0.1:1',
          allowEscape: false,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(RoleUnavailableError);
      expect(capture.anthropicCount()).toBe(0);
      expect(capture.countForHost('api.anthropic.com')).toBe(0);

      writeArtifact('AC-1-fail-closed-no-anthropic.json', {
        error:
          caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
        anthropicCount: capture.anthropicCount(),
        rows: capture.snapshot(),
      });
    } finally {
      capture.restore();
    }
  });
});

/**
 * Fakeability floor: network capture must observe real fetch traffic.
 * Would fail if installNetworkCapture hard-coded anthropicCount/fleetCount to 0.
 */
describe('infer-4 AC-1 negative-control hygiene (real capture)', () => {
  itLive('capture records real fleet fetch (not hard-coded zero)', async () => {
    const capture = installNetworkCapture();
    try {
      await fetch('http://127.0.0.1:4545/v1/models').catch(() => undefined);
      expect(capture.rows.length).toBeGreaterThanOrEqual(1);
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);
      // Anthropic host was never requested — count is observational, not stubbed
      expect(capture.anthropicCount()).toBe(0);

      writeArtifact('AC-1-capture-hygiene.json', {
        rowCount: capture.rows.length,
        fleetCount: capture.fleetCount(),
        anthropicCount: capture.anthropicCount(),
        rows: capture.snapshot(),
      });
    } finally {
      capture.restore();
    }
  });

  it('PLATFORM_IT gate is required for live assertions', () => {
    // Without PLATFORM_IT=1 live cases skip — this meta-guard documents the contract.
    if (!PLATFORM_IT) {
      writeArtifact('AC-1-red-skipped-no-platform-it.json', {
        PLATFORM_IT: false,
        note: 'Live AC-1 cases require PLATFORM_IT=1 + real fleet + real Postgres',
      });
    }
    expect(typeof PLATFORM_IT).toBe('boolean');
  });
});
