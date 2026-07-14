/**
 * MCP Fixture Coverage — ensures every mutation tool has error + replay fixtures.
 *
 * Loads the committed manifest, enumerates tools with non-null side_effects
 * (mutation tools), and verifies each has a corresponding `_error.json` and
 * `_replay.json` fixture on disk.
 *
 * Run: MCP_IT=1 bunx vitest run tests/integration/mcp-fixture-coverage.test.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadManifest, type ManifestTool } from '../../services/platform/src/mcp/manifest-loader';

const ROOT = resolve(import.meta.dirname, '../..');
const MANIFEST_PATH = resolve(
  ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml'
);
const FIXTURES_DIR = resolve(ROOT, 'services/platform/tests/fixtures/mcp-manifest');

const manifest = loadManifest(MANIFEST_PATH);

/** Mutation tools = tools with non-null side_effects */
const mutationTools: ManifestTool[] = manifest.tools.filter(
  (t: ManifestTool) => t.side_effects != null
);

describe('MCP fixture coverage — error fixtures', () => {
  it('has at least 21 error fixtures on disk', () => {
    // would fail if error fixtures were deleted or never created
    const errorFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('_error.json'));
    expect(
      errorFiles.length,
      `expected >= 21 error fixtures, got ${errorFiles.length}`
    ).toBeGreaterThanOrEqual(21);
  });

  it('every mutation tool has a corresponding {tool_id}_error.json', () => {
    // would fail if any mutation tool lacked an error fixture
    const missing: string[] = [];
    for (const tool of mutationTools) {
      const fixturePath = resolve(FIXTURES_DIR, `${tool.id}_error.json`);
      if (!existsSync(fixturePath)) {
        missing.push(tool.id);
      }
    }
    expect(missing, `mutation tools missing error fixtures: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('MCP fixture coverage — replay fixtures', () => {
  it('has at least 21 replay fixtures on disk', () => {
    // would fail if replay fixtures were deleted or never created
    const replayFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('_replay.json'));
    expect(
      replayFiles.length,
      `expected >= 21 replay fixtures, got ${replayFiles.length}`
    ).toBeGreaterThanOrEqual(21);
  });

  it('every mutation tool has a corresponding {tool_id}_replay.json', () => {
    // would fail if any mutation tool lacked a replay fixture
    const missing: string[] = [];
    for (const tool of mutationTools) {
      const fixturePath = resolve(FIXTURES_DIR, `${tool.id}_replay.json`);
      if (!existsSync(fixturePath)) {
        missing.push(tool.id);
      }
    }
    expect(missing, `mutation tools missing replay fixtures: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('MCP fixture coverage — mutation tool count', () => {
  it('manifest declares at least 21 mutation tools', () => {
    // would fail if mutation tools were removed from the manifest
    expect(mutationTools.length).toBeGreaterThanOrEqual(21);
  });
});

describe('MCP fixture coverage — error code catalog validation', () => {
  it.each(
    mutationTools.map((t) => [t.id, t.errors.map((e) => e.code)])
  )('%s — error fixture code exists in manifest errors catalog', (toolId: string, manifestErrorCodes: string[]) => {
    const fixturePath = resolve(FIXTURES_DIR, `${toolId}_error.json`);
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      code: string;
      message: string;
    };
    expect(
      manifestErrorCodes,
      `Tool ${toolId}: fixture code '${fixture.code}' is not in manifest catalog [${manifestErrorCodes.join(', ')}]`
    ).toContain(fixture.code);
  });
});
