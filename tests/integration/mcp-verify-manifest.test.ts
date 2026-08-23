/**
 * Integration tests for mcp:verify-manifest and operator inspection commands.
 * Run: MCP_IT=1 bunx vitest run tests/integration/mcp-verify-manifest.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const HOLO = resolve(ROOT, 'services/platform/src/cli/holo.ts');
const MANIFEST = resolve(
  ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml'
);
const FIXTURES_DIR = resolve(ROOT, 'services/platform/tests/fixtures/mcp-manifest');
const MANIFEST_MISSING_STORE_DOC = resolve(FIXTURES_DIR, 'manifest-missing-store_document.yaml');
const MANIFEST_ORPHAN_FAKE_TOOL = resolve(FIXTURES_DIR, 'manifest-orphan-fake_tool.yaml');

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('mcp:verify-manifest completeness gate', () => {
  it('committed manifest and fixtures exist on disk', () => {
    expect(existsSync(HOLO), 'holo.ts CLI must exist').toBe(true);
    expect(existsSync(MANIFEST), 'committed manifest must exist').toBe(true);
    expect(
      existsSync(MANIFEST_MISSING_STORE_DOC),
      'manifest-missing-store_document.yaml must exist'
    ).toBe(true);
    expect(existsSync(MANIFEST_ORPHAN_FAKE_TOOL), 'manifest-orphan-fake_tool.yaml must exist').toBe(
      true
    );
  });

  it('44/44 completeness: verify-manifest passes against the real committed manifest', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/49\/49/);
  });

  it('protocol pin: verify-manifest --protocol reports 2025-11-25', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST, '--protocol']);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/2025-11-25/);
  });

  it('unregistered tool control: verify-manifest exits non-zero naming store_document when its entry is removed', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST_MISSING_STORE_DOC]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/store_document/);
  });

  it('orphan entry control: verify-manifest exits non-zero naming fake_tool when an unknown tool is added', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST_ORPHAN_FAKE_TOOL]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/fake_tool/);
  });
});

describe('mcp:manifest-schema', () => {
  it('prints input_schema for store_document', () => {
    const r = runHolo(['mcp:manifest-schema', 'store_document', '--manifest', MANIFEST]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/input_schema/);
  });

  it('exits 1 for unknown tool', () => {
    const r = runHolo(['mcp:manifest-schema', 'nonexistent_tool', '--manifest', MANIFEST]);
    expect(r.status).toBe(1);
  });
});

describe('mcp:manifest-replay', () => {
  it('prints idempotency_key for add_subscription', () => {
    const r = runHolo(['mcp:manifest-replay', 'add_subscription', '--manifest', MANIFEST]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/idempotency_key/i);
  });

  it('exits 1 for tool with no replay contract', () => {
    const r = runHolo(['mcp:manifest-replay', 'get_document', '--manifest', MANIFEST]);
    expect(r.status).toBe(1);
  });
});

describe('mcp:list-mutations', () => {
  it('lists at least 21 mutations', () => {
    const r = runHolo(['mcp:list-mutations', '--manifest', MANIFEST]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/21|2[2-9]|[3-9]\d/);
  });
});
