/**
 * MCP Manifest Loader — parses the 14-mcp-compatibility-manifest.yaml into a typed model.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ReplayContract {
  idempotency_key: unknown[];
  stored_result: string;
}

export interface ManifestTool {
  id: string;
  input_schema: unknown;
  output_schema: unknown;
  defaults: Record<string, unknown>;
  errors: Array<{ code: string; description: string }>;
  pagination: unknown;
  side_effects: string | null;
  idempotency: string | null;
  replay: ReplayContract | null;
  transports: string[];
  fixtures: unknown;
}

export interface ManifestHeader {
  protocol: string;
  transports: string[];
  stateless: boolean;
  no_server_sampling: boolean;
  auth_policy: Record<string, unknown>;
  cancellation_policy: Record<string, unknown>;
}

export interface McpManifest {
  header: ManifestHeader;
  tools: ManifestTool[];
}

export function defaultManifestPath(cwd = process.cwd()): string {
  return resolve(
    cwd,
    '.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml'
  );
}

export function loadManifest(path: string): McpManifest {
  const abs = resolve(path);
  const raw = readFileSync(abs, 'utf8');
  const parsed = (parseYaml(raw) ?? {}) as Record<string, unknown>;

  const transports = (parsed.transports as string[]) ?? [];
  const toolsRaw = (parsed.tools as Array<Record<string, unknown>>) ?? [];

  const tools: ManifestTool[] = toolsRaw.map((t) => ({
    id: String(t.id),
    input_schema: t.input_schema ?? null,
    output_schema: t.output_schema ?? null,
    defaults: (t.defaults as Record<string, unknown>) ?? {},
    errors: (t.errors as Array<{ code: string; description: string }>) ?? [],
    pagination: t.pagination ?? null,
    side_effects: (t.side_effects as string | null) ?? null,
    idempotency: (t.idempotency as string | null) ?? null,
    replay: (t.replay as ReplayContract | null) ?? null,
    transports: (t.transports as string[]) ?? [],
    fixtures: t.fixtures ?? null,
  }));

  return {
    header: {
      protocol: String(parsed.protocol ?? ''),
      transports,
      stateless: Boolean(parsed.stateless),
      no_server_sampling: Boolean(parsed.no_server_sampling),
      auth_policy: (parsed.auth_policy as Record<string, unknown>) ?? {},
      cancellation_policy: (parsed.cancellation_policy as Record<string, unknown>) ?? {},
    },
    tools,
  };
}

export function getToolMap(manifest: McpManifest): Map<string, ManifestTool> {
  const map = new Map<string, ManifestTool>();
  for (const t of manifest.tools) {
    map.set(t.id, t);
  }
  return map;
}
