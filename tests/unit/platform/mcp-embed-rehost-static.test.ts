/**
 * Static inventory for the production MCP tool surface and holocron LiteLLM
 * embed routing. No live services — asserts shipped artifacts on disk.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { verifyMcpRehost } from '../../../packages/platform/src/mcp/verify-rehost';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const COMPOSE_PATH = resolve(REPO_ROOT, 'packages/platform/deploy/compose/router.compose.yaml');
const MINI_BASES = [
  'http://inference1.tail011a51.ts.net:8003/v1',
  'http://inference2.tail011a51.ts.net:8003/v1',
] as const;

function embedApiBases(composeText: string): string[] {
  const doc = parseYaml(composeText) as {
    configs?: { 'router-config'?: { content?: string } };
  };
  const content = doc.configs?.['router-config']?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('router.compose.yaml omitted inline LiteLLM config content');
  }
  const cfg = parseYaml(content) as {
    model_list?: Array<{
      model_name?: string;
      litellm_params?: { api_base?: string };
    }>;
  };
  return (cfg.model_list ?? [])
    .filter((entry) => entry.model_name === 'qwen3-embedding')
    .map((entry) => entry.litellm_params?.api_base)
    .filter((base): base is string => typeof base === 'string' && base.length > 0);
}

describe('production MCP inventory + embed backend topology', () => {
  it('registered tools match the frozen manifest with zero throw-only or Convex residue', () => {
    const report = verifyMcpRehost({ cwd: REPO_ROOT });
    expect(report.manifestTools).toBeGreaterThanOrEqual(44);
    expect(report.registeredTools).toBe(report.manifestTools);
    expect(report.missingTools).toEqual([]);
    expect(report.extraTools).toEqual([]);
    expect(report.missingExecutors).toEqual([]);
    expect(report.throwOnlyCases).toEqual([]);
    expect(report.convexRefs).toEqual([]);
    expect(report.ok, report.issues.join('; ')).toBe(true);
  });

  it('routes qwen3-embedding at inference1 and inference2, never laptop or loopback', () => {
    const text = readFileSync(COMPOSE_PATH, 'utf8');
    const bases = embedApiBases(text).sort();
    expect(bases).toEqual([...MINI_BASES].sort());
    expect(text).not.toMatch(/qwen3-embedding[\s\S]{0,400}laptop\.tail011a51\.ts\.net/);
    for (const base of bases) {
      expect(base).not.toContain('laptop.tail011a51.ts.net');
      expect(base).not.toMatch(/127\.0\.0\.1|localhost/);
    }
  });
});
