/**
 * S31-MCP-02 — classify MCP mutation tools by manifest idempotency contract.
 *
 * Prefix rules are case-sensitive and match the frozen compatibility manifest:
 *   - "Idempotent..." / "Semi-idempotent..." → must survive double-call with one row
 *   - "Not..." → must appear in an asserted exclusion set (never silently skipped)
 */

import { buildMutationsReport } from '../../../src/mcp/list-mutations';
import type { ManifestTool, McpManifest } from '../../../src/mcp/manifest-loader';

export type IdempotencyKind = 'idempotent' | 'semi-idempotent' | 'not-idempotent' | 'unclassified';

export type ClassifiedMutation = {
  readonly toolId: string;
  readonly idempotency: string;
  readonly kind: IdempotencyKind;
  readonly hasReplay: boolean;
  readonly idempotencyKey: readonly unknown[];
  readonly storedResult: string | null;
};

/** Case-sensitive prefix match used by the S31-MCP-02 cutover gate. */
export function classifyIdempotency(idempotency: string | null | undefined): IdempotencyKind {
  if (idempotency == null || idempotency.length === 0) return 'unclassified';
  if (idempotency.startsWith('Semi-idempotent')) return 'semi-idempotent';
  if (idempotency.startsWith('Idempotent')) return 'idempotent';
  if (idempotency.startsWith('Not')) return 'not-idempotent';
  return 'unclassified';
}

export function classifyMutationTool(tool: ManifestTool): ClassifiedMutation {
  return {
    toolId: tool.id,
    idempotency: tool.idempotency ?? '',
    kind: classifyIdempotency(tool.idempotency),
    hasReplay: tool.replay != null,
    idempotencyKey: tool.replay?.idempotency_key ?? [],
    storedResult: tool.replay?.stored_result ?? null,
  };
}

export function listMutationTools(manifest: McpManifest): ManifestTool[] {
  return manifest.tools.filter((t) => t.side_effects != null);
}

export function classifyAllMutations(manifest: McpManifest): ClassifiedMutation[] {
  return listMutationTools(manifest).map(classifyMutationTool);
}

export function declaredIdempotentMutations(manifest: McpManifest): ClassifiedMutation[] {
  return classifyAllMutations(manifest).filter(
    (m) => (m.kind === 'idempotent' || m.kind === 'semi-idempotent') && m.hasReplay
  );
}

export function declaredSemiIdempotentMutations(manifest: McpManifest): ClassifiedMutation[] {
  return classifyAllMutations(manifest).filter((m) => m.kind === 'semi-idempotent' && m.hasReplay);
}

export function declaredNotIdempotentMutations(manifest: McpManifest): ClassifiedMutation[] {
  return classifyAllMutations(manifest).filter((m) => m.kind === 'not-idempotent');
}

export function sortedMutationToolIds(manifest: McpManifest): string[] {
  return buildMutationsReport(manifest)
    .mutations.map((m) => m.tool_id)
    .slice()
    .sort((a, b) => a.localeCompare(b));
}

export function sortedIds(entries: ReadonlyArray<{ toolId: string }>): string[] {
  return entries
    .map((e) => e.toolId)
    .slice()
    .sort((a, b) => a.localeCompare(b));
}
