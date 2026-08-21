/**
 * RED negative-control suite for the MCP compatibility manifest gate.
 * Drives the REAL `holo mcp:verify-manifest` entrypoint — no mocks.
 *
 * These tests are RED right now because `mcp:verify-manifest` does not exist
 * yet (mcp-manifest-04 builds it). They will turn GREEN when the command is
 * implemented with real teeth.
 *
 * Each control asserts a concrete failure signature and would FAIL if the gate
 * reported green while the disconnect is present.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

describe('MCP manifest negative controls (RED teeth)', () => {
  it('committed manifest, holo entrypoint, and negative-control manifests exist on disk', () => {
    // would fail if the RED start state is not seeded — the test needs real artifacts
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

  it('45/45 completeness: verify-manifest passes against the real committed manifest', () => {
    // would fail if verify-manifest reported fewer than 45 tools or exited non-zero
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/45\/45/);
  });

  it('fixture-missing control: verify-manifest exits non-zero naming store_document when its entry is removed', () => {
    // would fail if verify-manifest exited 0 while a tool's contract block is missing
    // (that would make the gate fakeable — you could delete a tool's contract and still pass)
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST_MISSING_STORE_DOC]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/store_document/);
  });

  it('orphan-entry control: verify-manifest exits non-zero naming fake_tool when an unknown tool is added', () => {
    // would fail if verify-manifest exited 0 while an orphan tool entry exists
    // (that would mean the gate does not check that manifest entries map to real MCP tools)
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST_ORPHAN_FAKE_TOOL]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/fake_tool/);
  });

  it('fixture-file-removed control: verify-manifest exits non-zero naming store_document when its success fixture is deleted', () => {
    // would fail if verify-manifest exited 0 while a tool's success fixture file is missing
    // (that would make the gate fakeable — you could delete a fixture and the gate would not notice)
    // DISTINCT from manifest-entry-removed: here the manifest entry is intact but the fixture FILE is gone
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'holocron-fixtures-'));
    try {
      cpSync(FIXTURES_DIR, tmpDir, { recursive: true });
      const fixtureFile = resolve(tmpDir, 'store_document_success.json');
      rmSync(fixtureFile, { force: true });
      expect(existsSync(fixtureFile), 'fixture must be deleted for test').toBe(false);
      const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST, '--fixtures-dir', tmpDir]);
      const out = `${r.stdout}\n${r.stderr}`;
      expect(r.status, out).not.toBe(0);
      expect(out).toMatch(/store_document/);
      expect(out).toMatch(/fixtures missing/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AC-1 missing replay fixture fails the gate', () => {
    // would fail if static | stub | empty | mock | deleted — missing replay must fail with exact kind
    // and drop tools_covered below 44 (the historical hole printed 44/44 and exited 0)
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'holocron-fixtures-replay-'));
    try {
      cpSync(FIXTURES_DIR, tmpDir, { recursive: true });
      const replayFiles = readdirSync(tmpDir).filter((f: string) => f.endsWith('_replay.json'));
      expect(replayFiles.length, 'pre-deletion temp copy must have 21 replay fixtures').toBe(21);
      const replayFile = resolve(tmpDir, 'store_document_replay.json');
      rmSync(replayFile, { force: true });
      expect(existsSync(replayFile), 'replay fixture must be deleted for test').toBe(false);

      const r = runHolo([
        'mcp:verify-manifest',
        '--manifest',
        MANIFEST,
        '--fixtures-dir',
        tmpDir,
        '--json',
      ]);
      const out = `${r.stdout}\n${r.stderr}`;
      expect(r.status, out).not.toBe(0);
      expect(out).not.toMatch(/44\/44/);

      const report = JSON.parse(r.stdout) as {
        ok: boolean;
        tools_covered: number;
        tools_total: number;
        issues: Array<{ tool_id?: string; kind: string }>;
      };
      expect(report.ok).toBe(false);
      expect(report.tools_covered).toBe(43);
      expect(report.tools_total).toBe(44);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(
        report.issues.some(
          (i) => i.tool_id === 'store_document' && i.kind === 'replay_fixture_missing'
        )
      ).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AC-2 missing error fixture fails the gate', () => {
    // would fail if static | stub | empty | mock | deleted — error_fixture_missing must fire
    // (path existed in code without a negative control)
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'holocron-fixtures-error-'));
    try {
      cpSync(FIXTURES_DIR, tmpDir, { recursive: true });
      const errorFile = resolve(tmpDir, 'store_document_error.json');
      rmSync(errorFile, { force: true });
      expect(existsSync(errorFile), 'error fixture must be deleted for test').toBe(false);

      const r = runHolo([
        'mcp:verify-manifest',
        '--manifest',
        MANIFEST,
        '--fixtures-dir',
        tmpDir,
        '--json',
      ]);
      const out = `${r.stdout}\n${r.stderr}`;
      expect(r.status, out).not.toBe(0);

      const report = JSON.parse(r.stdout) as {
        ok: boolean;
        tools_covered: number;
        tools_total: number;
        issues: Array<{ tool_id?: string; kind: string }>;
      };
      expect(report.ok).toBe(false);
      expect(report.tools_covered).toBe(43);
      expect(report.tools_covered).not.toBe(44);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(
        report.issues.some(
          (i) => i.tool_id === 'store_document' && i.kind === 'error_fixture_missing'
        )
      ).toBe(true);
      expect(
        report.issues.some((i) => i.tool_id === 'store_document' && i.kind === 'fixtures_missing')
      ).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AC-3 intact frozen fixtures pass 44 of 44', () => {
    // would fail if stub | empty | static | removed — intact set must stay green at 44/44
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'holocron-fixtures-intact-'));
    try {
      cpSync(FIXTURES_DIR, tmpDir, { recursive: true });
      const r = runHolo([
        'mcp:verify-manifest',
        '--manifest',
        MANIFEST,
        '--fixtures-dir',
        tmpDir,
        '--json',
      ]);
      const out = `${r.stdout}\n${r.stderr}`;
      expect(r.status, out).toBe(0);

      const report = JSON.parse(r.stdout) as {
        ok: boolean;
        tools_covered: number;
        tools_total: number;
        issues: Array<{ tool_id?: string; kind: string }>;
      };
      expect(report.ok).toBe(true);
      expect(report.tools_covered).toBe(44);
      expect(report.tools_total).toBe(44);
      expect(report.issues).toHaveLength(0);

      const verifySrc = readFileSync(
        resolve(ROOT, 'services/platform/src/mcp/verify-manifest.ts'),
        'utf8'
      );
      const kindBlock = verifySrc.match(/kind:\s*((?:\s*\|\s*'[^']+')+)/);
      expect(kindBlock, 'ManifestIssue.kind union must be present').toBeTruthy();
      const kinds = [...(kindBlock?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
      expect(
        kinds.length,
        `expected 11-member kind union, got ${kinds.length}: ${kinds.join(',')}`
      ).toBe(11);
      expect(kinds).toContain('replay_fixture_missing');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AC-4 missing success fixture still fails', () => {
    // would fail if static | stub | empty | deleted — success-fixture control must still fire
    // under the widened covered predicate
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'holocron-fixtures-success-'));
    try {
      cpSync(FIXTURES_DIR, tmpDir, { recursive: true });
      const successFiles = readdirSync(tmpDir).filter((f: string) => f.endsWith('_success.json'));
      expect(successFiles.length, 'pre-deletion temp copy must have 44 success fixtures').toBe(44);
      const successFile = resolve(tmpDir, 'check_subscriptions_success.json');
      rmSync(successFile, { force: true });
      expect(existsSync(successFile), 'success fixture must be deleted for test').toBe(false);

      const r = runHolo([
        'mcp:verify-manifest',
        '--manifest',
        MANIFEST,
        '--fixtures-dir',
        tmpDir,
        '--json',
      ]);
      const out = `${r.stdout}\n${r.stderr}`;
      expect(r.status, out).not.toBe(0);

      const report = JSON.parse(r.stdout) as {
        ok: boolean;
        tools_covered: number;
        tools_total: number;
        issues: Array<{ tool_id?: string; kind: string }>;
      };
      expect(report.ok).toBe(false);
      expect(report.tools_covered).toBe(43);
      expect(report.tools_covered).not.toBe(44);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(
        report.issues.some(
          (i) => i.tool_id === 'check_subscriptions' && i.kind === 'fixtures_missing'
        )
      ).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('protocol pin: verify-manifest --protocol reports 2025-11-25', () => {
    // would fail if verify-manifest did not pin or report the MCP protocol version
    const r = runHolo(['mcp:verify-manifest', '--manifest', MANIFEST, '--protocol']);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/2025-11-25/);
  });
});

// Always-on shape checks so CI sees the suite even before verify-manifest exists
describe('MCP manifest negative control suite shape', () => {
  it('does not use skip-to-green guards on control tests', () => {
    const self = readFileSync(
      resolve(ROOT, 'tests/integration/mcp-manifest-negative-controls.test.ts'),
      'utf8'
    );
    // Strip this meta-assertion block's own mentions, then require zero live skip calls.
    const withoutMeta = self.replace(
      /describe\('MCP manifest negative control suite shape'[\s\S]*$/,
      ''
    );
    expect(withoutMeta).not.toMatch(/\bit\.skip\s*\(/);
    expect(withoutMeta).not.toMatch(/\btest\.skip\s*\(/);
    expect(withoutMeta).not.toMatch(/\bdescribe\.skip\s*\(/);
  });

  it('documents would-fail-if disconnects per control', () => {
    const self = readFileSync(
      resolve(ROOT, 'tests/integration/mcp-manifest-negative-controls.test.ts'),
      'utf8'
    );
    // Each control must name its disconnect so a reviewer can trace the intent
    expect(self).toMatch(/would fail if verify-manifest reported fewer than 44 tools/);
    expect(self).toMatch(
      /would fail if verify-manifest exited 0 while a tool's contract block is missing/
    );
    expect(self).toMatch(
      /would fail if verify-manifest exited 0 while an orphan tool entry exists/
    );
    expect(self).toMatch(
      /would fail if verify-manifest exited 0 while a tool's success fixture file is missing/
    );
    expect(self).toMatch(
      /would fail if verify-manifest did not pin or report the MCP protocol version/
    );
  });

  it('frozen fixture directory has exactly 45 success fixtures', () => {
    const files = readdirSync(FIXTURES_DIR).filter((f: string) => f.endsWith('_success.json'));
    expect(files.length, `expected 45 success fixtures, got ${files.length}`).toBe(45);
  });
});
