/**
 * MCP Fixture Placeholder Audit — ensures no fixture ships unmarked placeholder data.
 *
 * Every JSON fixture in the mcp-manifest directory must either:
 *   1. Contain `"representative_example": true` at the top level (annotated synthetic data), OR
 *   2. Not contain any known placeholder patterns (kg_doc_store_, B0XXXXX, fake-id, placeholder, dummy)
 *
 * Run: MCP_IT=1 bunx vitest run tests/integration/mcp-fixture-placeholder-audit.test.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES_DIR = resolve(ROOT, 'services/platform/tests/fixtures/mcp-manifest');

/** Patterns that indicate synthetic/placeholder data */
const PLACEHOLDER_PATTERNS = [
  /kg_doc_store_/,
  /kg_sub_/,
  /kg_tool_/,
  /kg_imp_/,
  /kg_assim_/,
  /kg_shop_/,
  /kg_filter_/,
  /kg_replay_/,
  /kg_creator_/,
  /kg_research_/,
  /kg_doc_missing_/,
  /kg_sub_missing_/,
  /kg_tool_missing_/,
  /kg_imp_missing_/,
  /kg_assim_missing_/,
  /kg_creator_missing_/,
  /B0XXXXX/,
  /vid_abc123/,
  /vid_missing_/,
  /fake-id/i,
  /placeholder/i,
  /dummy/i,
];

/** Only audit JSON fixture files (skip YAML manifest fragments) */
const fixtureFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));

describe('MCP fixture placeholder audit', () => {
  it('fixture directory has JSON fixtures to audit', () => {
    // would fail if the fixtures directory were empty or missing
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  it.each(fixtureFiles)('%s — no unmarked placeholder data', (filename) => {
    // would fail if a fixture contained placeholder patterns without representative_example: true
    const filePath = resolve(FIXTURES_DIR, filename);
    const raw = readFileSync(filePath, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Skip non-JSON-parseable files (shouldn't happen for .json files)
      return;
    }

    const hasRepresentativeExample =
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).representative_example === true;

    const hasArrayRepresentative =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0] === 'object' &&
      parsed[0] !== null &&
      (parsed[0] as Record<string, unknown>).representative_example === true;

    const isMarked = hasRepresentativeExample || hasArrayRepresentative;

    if (!isMarked) {
      // If not marked, check for placeholder patterns
      for (const pattern of PLACEHOLDER_PATTERNS) {
        expect(
          pattern.test(raw),
          `${filename} contains placeholder pattern "${pattern.source}" but lacks "representative_example": true`
        ).toBe(false);
      }
    }
  });
});
