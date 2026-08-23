/**
 * Integration tests for mcp:verify-manifest field validation.
 * Verifies the gate fails closed on null output_schema, empty errors (mutations),
 * null replay (mutations), and missing error fixture files.
 *
 * Run: MCP_IT=1 bunx vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts
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
const MALFORMED_DIR = resolve(FIXTURES_DIR, 'malformed');
const NULL_OUTPUT_SCHEMA = resolve(MALFORMED_DIR, 'null-output-schema.yaml');
const EMPTY_ERRORS = resolve(MALFORMED_DIR, 'empty-errors.yaml');
const NULL_REPLAY = resolve(MALFORMED_DIR, 'null-replay.yaml');

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

describe('mcp:verify-manifest field validation', () => {
  it('malformed manifests and fixtures exist on disk', () => {
    expect(existsSync(HOLO), 'holo.ts CLI must exist').toBe(true);
    expect(existsSync(MANIFEST), 'committed manifest must exist').toBe(true);
    expect(existsSync(NULL_OUTPUT_SCHEMA), 'null-output-schema.yaml must exist').toBe(true);
    expect(existsSync(EMPTY_ERRORS), 'empty-errors.yaml must exist').toBe(true);
    expect(existsSync(NULL_REPLAY), 'null-replay.yaml must exist').toBe(true);
  });

  it('output_schema null: gate exits non-zero naming tool + output_schema', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', NULL_OUTPUT_SCHEMA]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/get_research_session/);
    expect(out).toMatch(/output_schema/);
  });

  it('empty errors: gate exits non-zero naming tool + errors', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', EMPTY_ERRORS]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/store_document/);
    expect(out).toMatch(/errors/);
  });

  it('null replay: gate exits non-zero naming tool + replay', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', NULL_REPLAY]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/store_document/);
    expect(out).toMatch(/replay/);
  });

  it('error message format: output_schema message contains both tool ID and field name', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', NULL_OUTPUT_SCHEMA]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).toMatch(/Tool get_research_session: output_schema is null/);
  });

  it('error message format: errors message contains both tool ID and field name', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', EMPTY_ERRORS]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).toMatch(/Tool store_document: errors array is empty/);
  });

  it('error message format: replay message contains both tool ID and field name', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', NULL_REPLAY]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).toMatch(/Tool store_document: replay is null/);
  });

  it('valid manifest: gate passes against the real committed manifest (no regression)', () => {
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/49\/49/);
  });
});
