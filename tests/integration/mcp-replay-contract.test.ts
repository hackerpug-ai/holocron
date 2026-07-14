/**
 * Replay contract tests for MCP tools with idempotency keys.
 * Cross-validates the idempotency contract across THREE independent sources:
 *   1. The replay fixture JSON — its idempotency_key field
 *   2. The manifest YAML — replay.idempotency_key for the tool
 *   3. The real Zod schema — actual input fields that form the dedup key
 *
 * The cross-source validation is the PRIMARY proof of the replay contract.
 * Fixture-internal consistency (both calls return the same stored result) is a
 * SECONDARY check — it validates the fixture's own shape, not real behavior.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  AddSubscriptionSchema,
  StoreDocumentSchema,
} from '../../holocron-mcp/src/config/validation';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES_DIR = resolve(ROOT, 'services/platform/tests/fixtures/mcp-manifest');
const MANIFEST_PATH = resolve(
  ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml'
);

interface ReplayFixture {
  idempotency_key: string[];
  stored_result: string;
  first_call_result: Record<string, unknown>;
  second_call_result: Record<string, unknown>;
}

function loadReplayFixture(name: string): ReplayFixture {
  const path = resolve(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as ReplayFixture;
}

function loadManifestReplayKey(toolId: string): string[] {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = parseYaml(raw) as {
    tools: Array<{
      id: string;
      replay: { idempotency_key: string[]; stored_result: string } | null;
    }>;
  };
  const tool = manifest.tools.find((t) => t.id === toolId);
  if (!tool?.replay) {
    throw new Error(`Tool ${toolId} has no replay block in manifest`);
  }
  return tool.replay.idempotency_key;
}

describe('MCP replay contract — add_subscription (cross-source validation)', () => {
  const fixture = loadReplayFixture('add_subscription_replay');
  const manifestKey = loadManifestReplayKey('add_subscription');

  it('fixture idempotency_key matches manifest replay.idempotency_key', () => {
    expect(fixture.idempotency_key).toEqual(manifestKey);
  });

  it('manifest idempotency_key fields exist in the real AddSubscriptionSchema', () => {
    for (const field of manifestKey) {
      expect(AddSubscriptionSchema.shape).toHaveProperty(field);
    }
  });

  it('fixture idempotency_key fields exist in the real AddSubscriptionSchema', () => {
    for (const field of fixture.idempotency_key) {
      expect(AddSubscriptionSchema.shape).toHaveProperty(field);
    }
  });

  it('stored_result field is subscriptionId', () => {
    expect(fixture.stored_result).toBe('subscriptionId');
  });

  it('fixture internal consistency — both calls return the same stored result', () => {
    const storedField = fixture.stored_result;
    expect(fixture.first_call_result[storedField]).toBeDefined();
    expect(fixture.second_call_result[storedField]).toBeDefined();
    expect(fixture.second_call_result[storedField]).toBe(fixture.first_call_result[storedField]);
  });
});

describe('MCP replay contract — store_document (cross-source validation)', () => {
  const fixture = loadReplayFixture('store_document_replay');
  const manifestKey = loadManifestReplayKey('store_document');

  it('fixture idempotency_key matches manifest replay.idempotency_key', () => {
    expect(fixture.idempotency_key).toEqual(manifestKey);
  });

  it('manifest idempotency_key fields exist in the real StoreDocumentSchema', () => {
    for (const field of manifestKey) {
      expect(StoreDocumentSchema.shape).toHaveProperty(field);
    }
  });

  it('fixture idempotency_key fields exist in the real StoreDocumentSchema', () => {
    for (const field of fixture.idempotency_key) {
      expect(StoreDocumentSchema.shape).toHaveProperty(field);
    }
  });

  it('stored_result field is documentId', () => {
    expect(fixture.stored_result).toBe('documentId');
  });

  it('fixture internal consistency — both calls return the same stored result', () => {
    const storedField = fixture.stored_result;
    expect(fixture.first_call_result[storedField]).toBeDefined();
    expect(fixture.second_call_result[storedField]).toBeDefined();
    expect(fixture.second_call_result[storedField]).toBe(fixture.first_call_result[storedField]);
  });
});

describe('MCP replay contract suite shape', () => {
  it('does not use skip-to-green guards', () => {
    const self = readFileSync(
      resolve(ROOT, 'tests/integration/mcp-replay-contract.test.ts'),
      'utf8'
    );
    const withoutMeta = self.replace(/describe\('MCP replay contract suite shape'[\s\S]*$/, '');
    expect(withoutMeta).not.toMatch(/\bit\.skip\s*\(/);
    expect(withoutMeta).not.toMatch(/\btest\.skip\s*\(/);
    expect(withoutMeta).not.toMatch(/\bdescribe\.skip\s*\(/);
  });
});
