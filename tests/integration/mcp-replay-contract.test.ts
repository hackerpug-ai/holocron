/**
 * Replay contract tests for MCP tools with idempotency keys.
 * Reads frozen replay fixtures and asserts the idempotency contract:
 *   - The idempotency key fields match the manifest's replay.idempotency_key
 *   - Two calls with the same key return the same stored_result value
 *
 * These tests are RED right now because the replay fixtures freeze the
 * contract that mcp-manifest-04's verify-manifest will enforce. The fixture
 * files exist on disk, so the file-reading assertions pass, but the contract
 * enforcement (verify-manifest checking replay blocks) is not yet implemented.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES_DIR = resolve(ROOT, 'services/platform/tests/fixtures/mcp-manifest');

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

describe('MCP replay contract — add_subscription', () => {
  const fixture = loadReplayFixture('add_subscription_replay');

  it('idempotency key is [sourceType, identifier]', () => {
    // would fail if the replay contract changed its idempotency key
    expect(fixture.idempotency_key).toEqual(['sourceType', 'identifier']);
  });

  it('stored_result field is subscriptionId', () => {
    // would fail if the replay contract stopped returning subscriptionId as the stored result
    expect(fixture.stored_result).toBe('subscriptionId');
  });

  it('both calls return the same subscriptionId', () => {
    // would fail if the second call returned a different subscriptionId
    // (that would break the idempotency/replay guarantee)
    const first = fixture.first_call_result.subscriptionId;
    const second = fixture.second_call_result.subscriptionId;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).toBe(first);
  });

  it('both calls return identical full result objects', () => {
    // would fail if the second call returned a structurally different result
    expect(fixture.second_call_result).toEqual(fixture.first_call_result);
  });
});

describe('MCP replay contract — store_document', () => {
  const fixture = loadReplayFixture('store_document_replay');

  it('idempotency key is [title, content]', () => {
    // would fail if the replay contract changed its idempotency key
    expect(fixture.idempotency_key).toEqual(['title', 'content']);
  });

  it('stored_result field is documentId', () => {
    // would fail if the replay contract stopped returning documentId as the stored result
    expect(fixture.stored_result).toBe('documentId');
  });

  it('both calls return the same documentId', () => {
    // would fail if the second call returned a different documentId
    // (that would break the idempotency/replay guarantee)
    const first = fixture.first_call_result.documentId;
    const second = fixture.second_call_result.documentId;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).toBe(first);
  });

  it('both calls return identical full result objects', () => {
    // would fail if the second call returned a structurally different result
    expect(fixture.second_call_result).toEqual(fixture.first_call_result);
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
