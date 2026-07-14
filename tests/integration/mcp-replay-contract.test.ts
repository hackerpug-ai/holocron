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
 *
 * Parameterized across ALL mutation tools loaded dynamically from the manifest.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  AddImprovementSchema,
  AddSubscriptionSchema,
  AssimilateCreatorSchema,
  AssimilationSessionIdSchema,
  CheckSubscriptionsSchema,
  CloseImprovementSchema,
  RegenerateTranscriptSchema,
  RejectAssimilationPlanSchema,
  RemoveSubscriptionSchema,
  RemoveToolSchema,
  SetImprovementStatusSchema,
  SetSubscriptionFilterSchema,
  ShareDocumentSchema,
  ShopProductsSchema,
  StartAssimilationSchema,
  SteerAssimilationSchema,
  StoreDocumentSchema,
  StoreToolSchema,
  UpdateDocumentSchema,
  UpdateToolSchema,
} from '../../holocron-mcp/src/config/validation';
import { loadManifest, type ManifestTool } from '../../services/platform/src/mcp/manifest-loader';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES_DIR = resolve(ROOT, 'services/platform/tests/fixtures/mcp-manifest');
const MANIFEST_PATH = resolve(
  ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml'
);

// --- Dynamic mutation-tool enumeration (same pattern as mcp-fixture-coverage) ---

const manifest = loadManifest(MANIFEST_PATH);
const mutationTools: ManifestTool[] = manifest.tools.filter(
  (t: ManifestTool) => t.side_effects != null
);

// --- Schema map: tool id → Zod schema ---

const TOOL_SCHEMA_MAP: Record<string, { shape: Record<string, unknown> }> = {
  store_document: StoreDocumentSchema,
  update_document: UpdateDocumentSchema,
  share_document: ShareDocumentSchema,
  add_subscription: AddSubscriptionSchema,
  remove_subscription: RemoveSubscriptionSchema,
  check_subscriptions: CheckSubscriptionsSchema,
  set_subscription_filter: SetSubscriptionFilterSchema,
  store_tool: StoreToolSchema,
  update_tool: UpdateToolSchema,
  remove_tool: RemoveToolSchema,
  shop_products: ShopProductsSchema,
  start_assimilation: StartAssimilationSchema,
  approve_assimilation_plan: AssimilationSessionIdSchema,
  reject_assimilation_plan: RejectAssimilationPlanSchema,
  cancel_assimilation: AssimilationSessionIdSchema,
  steer_assimilation: SteerAssimilationSchema,
  assimilate_creator: AssimilateCreatorSchema,
  regenerate_transcript: RegenerateTranscriptSchema,
  add_improvement: AddImprovementSchema,
  close_improvement: CloseImprovementSchema,
  set_improvement_status: SetImprovementStatusSchema,
};

// --- Helpers ---

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
  const parsed = parseYaml(raw) as {
    tools: Array<{
      id: string;
      replay: { idempotency_key: string[]; stored_result: string } | null;
    }>;
  };
  const tool = parsed.tools.find((t) => t.id === toolId);
  if (!tool?.replay) {
    throw new Error(`Tool ${toolId} has no replay block in manifest`);
  }
  return tool.replay.idempotency_key;
}

// --- Parameterized cross-source validation for ALL mutation tools ---

describe('MCP replay contract — cross-source validation (all mutation tools)', () => {
  it.each(
    mutationTools.map((t) => [t.id])
  )('%s — fixture idempotency_key matches manifest replay.idempotency_key', (toolId: string) => {
    const schema = TOOL_SCHEMA_MAP[toolId];
    if (!schema) {
      throw new Error(`Tool ${toolId} not found in TOOL_SCHEMA_MAP — add its Zod schema import`);
    }
    const fixture = loadReplayFixture(`${toolId}_replay`);
    const manifestKey = loadManifestReplayKey(toolId);
    expect(fixture.idempotency_key).toEqual(manifestKey);
  });

  it.each(
    mutationTools.map((t) => [t.id])
  )('%s — manifest idempotency_key fields exist in real Zod schema', (toolId: string) => {
    const schema = TOOL_SCHEMA_MAP[toolId];
    if (!schema) {
      throw new Error(`Tool ${toolId} not found in TOOL_SCHEMA_MAP`);
    }
    const manifestKey = loadManifestReplayKey(toolId);
    for (const field of manifestKey) {
      expect(schema.shape).toHaveProperty(field);
    }
  });

  it.each(
    mutationTools.map((t) => [t.id])
  )('%s — fixture idempotency_key fields exist in real Zod schema', (toolId: string) => {
    const schema = TOOL_SCHEMA_MAP[toolId];
    if (!schema) {
      throw new Error(`Tool ${toolId} not found in TOOL_SCHEMA_MAP`);
    }
    const fixture = loadReplayFixture(`${toolId}_replay`);
    for (const field of fixture.idempotency_key) {
      expect(schema.shape).toHaveProperty(field);
    }
  });
});

// --- Suite-shape self-test (preserved from original) ---

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
