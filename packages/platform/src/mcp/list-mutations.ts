/**
 * List Mutations — lists all mutation tools (tools with non-null side_effects).
 */
import type { ManifestTool, McpManifest } from './manifest-loader';

export interface MutationEntry {
  tool_id: string;
  side_effects: string;
  idempotency_key: unknown[];
  stored_result: string | null;
}

export interface MutationsReport {
  mutations: MutationEntry[];
  total: number;
}

export function buildMutationsReport(manifest: McpManifest): MutationsReport {
  const mutations: MutationEntry[] = manifest.tools
    .filter((t: ManifestTool) => t.side_effects != null)
    .map((t: ManifestTool) => ({
      tool_id: t.id,
      side_effects: t.side_effects as string,
      idempotency_key: t.replay?.idempotency_key ?? [],
      stored_result: t.replay?.stored_result ?? null,
    }));

  return {
    mutations,
    total: mutations.length,
  };
}

export function formatMutationsText(report: MutationsReport): string {
  const lines: string[] = [];
  lines.push(`Mutation tools (${report.total}):`);
  lines.push('');
  for (const m of report.mutations) {
    lines.push(`  ${m.tool_id}`);
    lines.push(`    side_effects: ${m.side_effects}`);
    lines.push(`    idempotency_key: ${JSON.stringify(m.idempotency_key)}`);
    lines.push(`    stored_result: ${m.stored_result ?? 'none'}`);
    lines.push('');
  }
  return lines.join('\n');
}
