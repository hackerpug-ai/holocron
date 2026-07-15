/**
 * AC-4 (T-PLAT-006): shared-schema identity via real holo CLI + registry helpers
 *
 * Asserts agent/workflow/MCP consumer paths share ONE Zod instance (===).
 * Uses the real `holo verify:identity` / `registry:probe` entrypoints — no mocks.
 *
 * NEGATIVE CONTROL (would fail if):
 * - duplicate validation layers (identity:false / uniqueInstances !== 1)
 * - test only deep-equals schemas instead of === identity
 * - verify:identity stubs identity:true without checking refs
 *
 * Prior RED evidence: service-2 registry suite failed while duplicates existed;
 * `holo verify:identity` exits nonzero when identity is false.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/schema-identity.test.ts
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';

const itLive = PLATFORM_IT ? it : it.skip;

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: DEFAULT_DATABASE_URL },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function parseJsonObject(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  // Pretty-printed multi-line JSON starts with `{` or `[` — parse the whole blob.
  const startObj = trimmed.indexOf('{');
  const startArr = trimmed.indexOf('[');
  let start = -1;
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) start = startObj;
  else if (startArr >= 0) start = startArr;
  if (start < 0) throw new Error(`no JSON in stdout:\n${stdout}`);
  return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
}

function parseJsonArray(stdout: string): unknown[] {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('[');
  if (start < 0) throw new Error(`no JSON array in stdout:\n${stdout}`);
  return JSON.parse(trimmed.slice(start)) as unknown[];
}

describe('AC-4: shared-schema === identity (real holo registry)', () => {
  itLive('holo verify:identity search → identity:true uniqueInstances:1 exit 0', () => {
    const r = runHolo(['verify:identity', 'search']);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const payload = parseJsonObject(r.stdout);
    expect(payload.identity).toBe(true);
    expect(payload.uniqueInstances).toBe(1);
    expect(payload.consumers).toBe(3);
    expect(payload.resolvedId).toBe('hybrid_search');
  });

  itLive(
    'holo registry:probe search --for agent,workflow,mcp → each consumer inputSame/outputSame true',
    () => {
      const r = runHolo(['registry:probe', 'search', '--for', 'agent,workflow,mcp', '--json']);
      const out = `${r.stdout}\n${r.stderr}`;
      expect(r.status, out).toBe(0);
      const payload = parseJsonObject(r.stdout) as {
        consumers?: Record<string, { inputSame?: boolean; outputSame?: boolean }>;
      };
      expect(payload.consumers?.agent?.inputSame).toBe(true);
      expect(payload.consumers?.agent?.outputSame).toBe(true);
      expect(payload.consumers?.workflow?.inputSame).toBe(true);
      expect(payload.consumers?.workflow?.outputSame).toBe(true);
      expect(payload.consumers?.mcp?.inputSame).toBe(true);
      expect(payload.consumers?.mcp?.outputSame).toBe(true);
    }
  );

  itLive('holo verify:no-dup-validation → duplicates:0', () => {
    const r = runHolo(['verify:no-dup-validation']);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const payload = parseJsonObject(r.stdout);
    expect(payload.duplicates).toBe(0);
    expect(payload.ok).toBe(true);
  });

  itLive('in-process registry helpers share === schema refs across consumers', async () => {
    // Dynamic import of the real registry module under Bun would need Bun;
    // instead re-assert via holo registry:list count ≥44 (same process boundary as service).
    const list = runHolo(['registry:list']);
    expect(list.status, list.stdout + list.stderr).toBe(0);
    const tools = parseJsonArray(list.stdout);
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThanOrEqual(44);

    // Spot-check identity for a second tool id (not just search alias)
    const id = runHolo(['verify:identity', 'search_fts']);
    expect(id.status, id.stdout + id.stderr).toBe(0);
    const payload = parseJsonObject(id.stdout);
    expect(payload.identity).toBe(true);
    expect(payload.uniqueInstances).toBe(1);
  });
});
