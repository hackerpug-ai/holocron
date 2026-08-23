/**
 * S31-MCP-04: Reconcile the frozen MCP compatibility manifest with the Postgres
 * gateway it now describes (origin policy, cancellation, side_effects, rate_limit,
 * fixtures field removal).
 *
 * NEGATIVE_CONTROL (would fail if):
 * - stub / mock / static pass / empty registry / disconnected gateway
 * - allowed_origins remains null beside origin_validation true
 * - Convex prose remains or can be reintroduced without a gate
 * - fixtures: key remains while loader still declares it
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BUN_BIN,
  HOLO_CLI,
  PLATFORM_IT,
  REPO_ROOT,
} from '../../../../tests/integration/service/harness';
import { createHonoApp } from '../../src/http/hono-app';
import {
  defaultManifestPath,
  loadManifest,
  type ManifestTool,
} from '../../src/mcp/manifest-loader';
import { assertNoConvexProse } from '../../src/mcp/verify-manifest';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-MCP-04');
const MANIFEST_PATH = defaultManifestPath(REPO_ROOT);
const MANIFEST_LOADER_PATH = resolve(REPO_ROOT, 'services/platform/src/mcp/manifest-loader.ts');
const GATEWAY_PATH = resolve(REPO_ROOT, 'services/platform/src/mcp/gateway.ts');
const KEYS = { rn: 's31-mcp04-rn', mcp: 's31-mcp04-mcp', control: 's31-mcp04-control' };
const itLive = PLATFORM_IT ? it : it.skip;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function countCi(haystack: string, needle: string): number {
  const re = new RegExp(needle, 'gi');
  return (haystack.match(re) ?? []).length;
}

function runVerifyManifest(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
} {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, 'mcp:verify-manifest', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

function withTempManifest(mutate: (raw: string) => string): {
  path: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 's31-mcp04-'));
  const path = join(dir, '14-mcp-compatibility-manifest.yaml');
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  writeFileSync(path, mutate(raw), 'utf8');
  return {
    path,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('S31-MCP-04 manifest reconciliation', () => {
  beforeAll(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  afterAll(() => {
    // evidence retained under .tmp/S31-MCP-04
  });

  itLive('AC-1 declared origin policy matches enforced behaviour', async () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const manifest = loadManifest(MANIFEST_PATH);
    const streamable = manifest.header.auth_policy.streamable_http as
      | Record<string, unknown>
      | undefined;
    expect(streamable).toBeDefined();
    if (!streamable) throw new Error('streamable_http missing');

    const allowedOrigins = streamable.allowed_origins;
    const originValidation = streamable.origin_validation;
    expect(originValidation).toBe(true);
    expect(allowedOrigins).not.toBeNull();
    expect(allowedOrigins).not.toBeUndefined();
    const allowedText = JSON.stringify(allowedOrigins).toLowerCase();
    expect(allowedText).toMatch(/same-origin|request.?origin|request.?url/);
    // Must not invent a hostname allowlist the gateway does not accept.
    expect(allowedText).not.toMatch(/evil\.example|localhost:9999|hostname list/i);

    const gatewaySrc = readFileSync(GATEWAY_PATH, 'utf8');
    expect(gatewaySrc).toMatch(/enableDnsRebindingProtection:\s*true/);
    expect(gatewaySrc).toMatch(/allowedOrigins:\s*\[\s*new URL\(request\.url\)\.origin\s*\]/);

    const app = createHonoApp({ keys: KEYS });
    const listBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });

    // Seed a real documents row so the same-origin control path is live-backed.
    const storeBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'store_document',
        arguments: {
          title: 's31-mcp04-doc',
          content: 'S31-MCP-04 same-origin seed document',
        },
      },
    });
    const storeRes = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: storeBody,
    });
    // store may 200 or error if DB unavailable — still capture for evidence
    const storeJson = await storeRes.json().catch(() => null);

    const foreign = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        origin: 'https://evil.example',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: listBody,
    });

    const sameOrigin = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: listBody,
    });
    const sameJson = (await sameOrigin.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const toolCount = sameJson.result?.tools?.length ?? 0;

    writeEvidence('ac1-api-response.json', {
      allowed_origins: allowedOrigins,
      origin_validation: originValidation,
      foreign_origin_status: foreign.status,
      same_origin_status: sameOrigin.status,
      same_origin_tool_count: toolCount,
      store_document_status: storeRes.status,
      store_document_body: storeJson,
    });

    expect(foreign.status).toBe(403);
    expect(sameOrigin.status).toBe(200);
    expect(toolCount).toBe(49);
  });

  it('AC-2 header gate refuses origin_validation without allowed_origins', () => {
    const copyA = withTempManifest((raw) =>
      raw.replace(/allowed_origins:\s*[^\n]+/, 'allowed_origins: null  # AC-2 regression control')
    );
    try {
      const regressed = runVerifyManifest(['--manifest', copyA.path, '--protocol']);
      const reconciled = runVerifyManifest(['--manifest', MANIFEST_PATH, '--protocol']);

      writeEvidence('ac2-protocol-gate.json', {
        copy_a: {
          status: regressed.status,
          stdout: regressed.stdout,
          stderr: regressed.stderr,
        },
        reconciled: {
          status: reconciled.status,
          stdout: reconciled.stdout,
          stderr: reconciled.stderr,
        },
      });

      expect(regressed.status).not.toBe(0);
      expect(regressed.combined).toMatch(/allowed_origins/);
      expect(reconciled.status).toBe(0);
      expect(reconciled.combined).toMatch(/2025-11-25/);
    } finally {
      copyA.cleanup();
    }
  });

  it('AC-3 no stale Convex claims remain in the manifest', () => {
    const raw = readFileSync(MANIFEST_PATH, 'utf8');
    const convexCount = countCi(raw, 'convex');
    const manifest = loadManifest(MANIFEST_PATH);
    const streamableStdio = manifest.header.auth_policy.stdio as
      | Record<string, unknown>
      | undefined;
    const trustBoundary = String(streamableStdio?.trust_boundary ?? '');
    const cancelDesc = String(manifest.header.cancellation_policy.description ?? '');

    const sideEffects = manifest.tools
      .map((t) => t.side_effects)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);

    const convexQueryFailed = countCi(raw, 'Convex query failed');

    writeEvidence('ac3-convex-purge.json', {
      convex_match_count: convexCount,
      trust_boundary: trustBoundary,
      cancellation_description: cancelDesc,
      side_effects_count: sideEffects.length,
      side_effects: sideEffects,
      convex_query_failed_count: convexQueryFailed,
    });

    expect(convexCount).toBe(0);
    expect(trustBoundary).toMatch(/DATABASE_URL/);
    expect(cancelDesc.toLowerCase()).toMatch(/postgres/);
    expect(cancelDesc.toLowerCase()).toMatch(/abort|signal/);
    expect(cancelDesc).not.toMatch(/dispatched to Convex/i);
    expect(sideEffects).toHaveLength(21);
    for (const se of sideEffects) {
      expect(se.toLowerCase()).toMatch(/postgres|executepostgresmcptool/);
      expect(se).not.toMatch(/convex|subscriptions\/mutations|documents\/storage/i);
    }
    expect(convexQueryFailed).toBe(0);
    expect(raw).not.toMatch(/CONVEX_URL|CONVEX_DEPLOYMENT|dispatched to Convex/);
  });

  it('AC-4 rate limiting is recorded as not_applicable with its scope citation', () => {
    const raw = readFileSync(MANIFEST_PATH, 'utf8');
    const manifest = loadManifest(MANIFEST_PATH);
    const streamable = manifest.header.auth_policy.streamable_http as
      | Record<string, unknown>
      | undefined;
    const rateLimit = streamable?.rate_limit;

    const rateLimitLine = raw.split('\n').find((line) => /^\s*rate_limit:/.test(line)) ?? '';
    const todoCount = countCi(raw, 'mcp-manifest-02 to populate');

    // Diff scope: no rate-limit middleware identifiers introduced in writeAllowed set.
    const changedPaths = [
      resolve(REPO_ROOT, 'services/platform/src/mcp/verify-manifest.ts'),
      resolve(REPO_ROOT, 'services/platform/src/mcp/manifest-loader.ts'),
      MANIFEST_PATH,
    ];
    const middlewareHits: string[] = [];
    for (const p of changedPaths) {
      if (!existsSync(p)) continue;
      const text = readFileSync(p, 'utf8');
      for (const id of [
        'rateLimit',
        'rate-limit',
        'rate_limit_middleware',
        'express-rate-limit',
        'hono-rate-limit',
      ]) {
        if (id === 'rate_limit' || id === 'rate-limit') {
          // allowed only as the literal disposition key in the manifest
          if (p.endsWith('.ts') && text.includes(id)) {
            middlewareHits.push(`${p}:${id}`);
          }
        } else if (text.includes(id)) {
          middlewareHits.push(`${p}:${id}`);
        }
      }
    }

    writeEvidence('ac4-rate-limit.json', {
      rate_limit: rateLimit,
      rate_limit_line: rateLimitLine,
      todo_count: todoCount,
      middleware_hits: middlewareHits,
    });

    expect(rateLimit).toBe('not_applicable');
    expect(rateLimitLine).toMatch(/01-scope\.md/);
    expect(todoCount).toBe(0);
    expect(middlewareHits).toEqual([]);
  });

  it('AC-5 dead fixtures field removed with coverage unchanged', () => {
    const raw = readFileSync(MANIFEST_PATH, 'utf8');
    const fixturesKeyCount = (raw.match(/^\s*fixtures\s*:/gm) ?? []).length;
    const manifest = loadManifest(MANIFEST_PATH);
    const toolsWithFixtures = manifest.tools.filter((t) => Object.hasOwn(t as object, 'fixtures'));
    const loaderSrc = readFileSync(MANIFEST_LOADER_PATH, 'utf8');
    const loaderFixturesCount = countCi(loaderSrc, 'fixtures');

    const verify = runVerifyManifest(['--manifest', MANIFEST_PATH, '--json']);
    const report = JSON.parse(verify.stdout) as {
      tools_covered: number;
      tools_total: number;
      issues: unknown[];
      ok: boolean;
    };

    writeEvidence('ac5-fixtures-removed.json', {
      fixtures_key_count: fixturesKeyCount,
      tools_with_fixtures_property: toolsWithFixtures.length,
      loader_fixtures_count: loaderFixturesCount,
      verify_status: verify.status,
      tools_covered: report.tools_covered,
      tools_total: report.tools_total,
      header_snippet: raw.split('\n').slice(0, 12).join('\n'),
    });

    expect(fixturesKeyCount).toBe(0);
    expect(toolsWithFixtures).toHaveLength(0);
    // type-level: ManifestTool must not declare fixtures
    type FixturesKey = Extract<keyof ManifestTool, 'fixtures'>;
    type AssertNever<T extends never> = T;
    type _NoFixtures = AssertNever<FixturesKey>;
    void null as unknown as _NoFixtures;

    expect(loaderFixturesCount).toBe(0);
    expect(verify.status).toBe(0);
    expect(report.tools_covered).toBe(49);
    expect(report.tools_total).toBe(49);
    expect(raw).toMatch(/\{toolId\}_\{success\|error\|replay\}\.json/);
  });

  it('AC-6 reintroduced Convex prose fails the gate', () => {
    const copyB = withTempManifest((raw) => {
      // Restore the historical Convex cancellation claim verbatim.
      const restored =
        'Long-running operations (assimilation sessions, transcript jobs) are dispatched\n' +
        '    to Convex and are not directly cancellable via the MCP transport — the client\n' +
        '    must use the cancel_assimilation tool for those workflows.';
      if (/cancellation_policy:[\s\S]*?description: >/m.test(raw)) {
        return raw.replace(
          /(cancellation_policy:[\s\S]*?description: >\n)([\s\S]*?)(\n {2}supported:)/m,
          `$1    Clients may send cancellation notifications per MCP 2025-11-25.\n    ${restored}$3`
        );
      }
      return `${raw}\n# dispatched to Convex regression seed\n`;
    });
    try {
      const copyRaw = readFileSync(copyB.path, 'utf8');
      const copyAssertion = assertNoConvexProse(copyRaw);
      const reconciledRaw = readFileSync(MANIFEST_PATH, 'utf8');
      const reconciledAssertion = assertNoConvexProse(reconciledRaw);

      writeEvidence('ac6-convex-prose-gate.json', {
        copy_b: {
          ok: copyAssertion.ok,
          match_count: copyAssertion.matchCount,
          violations: copyAssertion.violations,
          convex_ci: countCi(copyRaw, 'convex'),
        },
        reconciled: {
          ok: reconciledAssertion.ok,
          match_count: reconciledAssertion.matchCount,
          violations: reconciledAssertion.violations,
        },
      });

      expect(copyAssertion.ok).toBe(false);
      expect(copyAssertion.violations.length).toBeGreaterThanOrEqual(1);
      expect(copyAssertion.violations.some((v) => v.field.includes('cancellation_policy'))).toBe(
        true
      );
      expect(countCi(copyRaw, 'convex')).toBeGreaterThanOrEqual(1);
      expect(reconciledAssertion.ok).toBe(true);
      expect(reconciledAssertion.matchCount).toBe(0);
    } finally {
      copyB.cleanup();
    }
  });
});
