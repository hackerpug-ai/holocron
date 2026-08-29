/**
 * holo fulcrum:substrate-check — prove the Fulcrum role set per node from each
 * node's OWN real /v1/models response (FUL-INFRA-001).
 *
 * Expected role -> basename bindings come only from
 * packages/platform/deploy/fleet/fulcrum-roles.json (ADR-008 vocabulary;
 * judge and every coder role forbidden). Readiness is fail-closed: a node
 * that answers but serves a short model list is NOT ready (landmine: "server
 * answers but serves nothing"), and a stopped node is named individually —
 * never hidden behind an aggregate answer.
 *
 * Flags:
 *   --json                    append the machine-readable report (single line)
 *   --endpoint <url>          probe ONE endpoint instead of the declared fleet
 *   --print-expected          print the expected role -> basename bindings
 *   --report-basenames        tally served basenames per node (coder vs fulcrum)
 *   --trace-requested-roles   emit the requested-role trace + forbidden tally
 *
 * Exit 0 only when every probed node serves every expected role; exit 1
 * otherwise (unreachable node, short model list, malformed expectation file).
 */
import { resolve } from 'node:path';
import {
  buildSubstrateReport,
  defaultFulcrumRolesPath,
  type FulcrumNodeProbe,
  type FulcrumRolesFile,
  loadFulcrumRoles,
  probeFulcrumNode,
} from '../../fleet/fulcrum-role-readiness.ts';

const PROBE_TIMEOUT_MS = 8_000;

export type FulcrumSubstrateCheckResult = {
  ok: boolean;
  lines: string[];
  json: Record<string, unknown> | null;
};

function resolveRolesPath(repoRoot: string): string {
  const override = process.env.FULCRUM_ROLES_FILE;
  if (override && override.length > 0) {
    return resolve(override);
  }
  return defaultFulcrumRolesPath(repoRoot);
}

async function probeAll(
  targets: Array<{ node: string; endpoint: string }>
): Promise<FulcrumNodeProbe[]> {
  return Promise.all(
    targets.map((t) =>
      probeFulcrumNode(t.node, t.endpoint, (url, init) => fetch(url, init), PROBE_TIMEOUT_MS)
    )
  );
}

function fleetLines(
  manifest: FulcrumRolesFile,
  report: ReturnType<typeof buildSubstrateReport>,
  flags: {
    printExpected: boolean;
    reportBasenames: boolean;
    traceRequestedRoles: boolean;
  }
): string[] {
  const lines: string[] = [];
  if (flags.printExpected) {
    lines.push(`expected_roles=${report.expected_roles.join(',')}`);
    for (const [role, entry] of Object.entries(manifest.roles).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      lines.push(`expected ${role}=${entry.basename} (${entry.size_gb}GB, ${entry.hf_repo})`);
    }
  }
  for (const node of report.nodes) {
    if (!node.reachable) {
      lines.push(`${node.node} UNREACHABLE ${node.error ?? ''}`.trimEnd());
      continue;
    }
    for (const binding of node.comparison?.roles ?? []) {
      if (binding.present) {
        lines.push(`${node.node} ${binding.role}=${binding.basename}`);
      } else {
        lines.push(`${node.node} missing=${binding.role} (expected ${binding.basename})`);
      }
    }
  }
  lines.push(`nodes_ready=${report.nodes_ready} roles_per_node=${report.roles_per_node ?? 0}`);
  if (flags.reportBasenames) {
    const coder = report.nodes.reduce(
      (sum, n) => sum + (n.comparison?.coder_basenames_served ?? 0),
      0
    );
    const fulcrum = report.nodes.reduce(
      (sum, n) => sum + (n.comparison?.fulcrum_basenames_served ?? 0),
      0
    );
    lines.push(`coder_basenames_served=${coder} fulcrum_basenames_served=${fulcrum}`);
    for (const node of report.nodes) {
      if (node.reachable) {
        lines.push(`${node.node} resident_gb=${node.comparison?.resident_gb ?? 0}`);
      }
    }
  }
  if (flags.traceRequestedRoles && report.requested_roles !== null) {
    lines.push(`requested_roles=${report.requested_roles.join(',')}`);
    lines.push(`forbidden_role_hits=${report.forbidden_role_hits ?? 0}`);
  }
  const unreachable = report.unreachable_nodes;
  const missingUnion = [...new Set(report.nodes.flatMap((n) => n.missing_roles))].sort();
  if (unreachable.length > 0) {
    lines.push(`FULCRUM_SUBSTRATE_UNREACHABLE nodes=${unreachable.join(',')}`);
  }
  if (missingUnion.length > 0) {
    lines.push(`FULCRUM_SUBSTRATE_INCOMPLETE missing=${missingUnion.join(',')}`);
  }
  if (unreachable.length === 0 && missingUnion.length === 0) {
    lines.push('FULCRUM_SUBSTRATE_OK');
  }
  return lines;
}

function endpointLines(
  manifest: FulcrumRolesFile,
  report: ReturnType<typeof buildSubstrateReport>
): string[] {
  const lines: string[] = [];
  const node = report.nodes[0];
  if (!node) {
    return ['FULCRUM_SUBSTRATE_INVALID no endpoint probed'];
  }
  lines.push(`endpoint=${node.endpoint}`);
  lines.push(`expected_roles=${report.expected_roles.join(',')}`);
  if (!node.reachable) {
    lines.push(
      `FULCRUM_SUBSTRATE_UNREACHABLE endpoint=${node.endpoint} ${node.error ?? ''}`.trimEnd()
    );
    return lines;
  }
  lines.push(`present=${node.present_roles.join(',')}`);
  if (node.missing_roles.length > 0) {
    lines.push(`FULCRUM_SUBSTRATE_INCOMPLETE missing=${node.missing_roles.join(',')}`);
  } else {
    lines.push('FULCRUM_SUBSTRATE_OK');
  }
  return lines;
}

export async function runFulcrumSubstrateCheck(options?: {
  repoRoot?: string;
  endpoint?: string | null;
  printExpected?: boolean;
  reportBasenames?: boolean;
  traceRequestedRoles?: boolean;
}): Promise<FulcrumSubstrateCheckResult> {
  const repoRoot = options?.repoRoot ?? resolve(import.meta.dirname, '../../../../..');
  const endpointOverride = options?.endpoint ?? null;
  let manifest: FulcrumRolesFile;
  try {
    manifest = loadFulcrumRoles(resolveRolesPath(repoRoot));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lines = [`FULCRUM_SUBSTRATE_INVALID fulcrum roles file rejected (fail-closed): ${msg}`];
    return { ok: false, lines, json: { mode: 'invalid', error: msg, ready: false } };
  }

  const targets = endpointOverride
    ? [{ node: new URL(endpointOverride).hostname, endpoint: endpointOverride }]
    : Object.entries(manifest.nodes).map(([node, n]) => ({ node, endpoint: n.endpoint }));

  const probes = await probeAll(targets);
  const report = buildSubstrateReport(manifest, probes, {
    mode: endpointOverride ? 'endpoint' : 'fleet',
    traceRequestedRoles: options?.traceRequestedRoles ?? false,
  });

  const lines =
    report.mode === 'endpoint'
      ? endpointLines(manifest, report)
      : fleetLines(manifest, report, {
          printExpected: options?.printExpected ?? false,
          reportBasenames: options?.reportBasenames ?? false,
          traceRequestedRoles: options?.traceRequestedRoles ?? false,
        });

  const jsonDoc: Record<string, unknown> = {
    mode: report.mode,
    expected_roles: report.expected_roles,
    ready: report.ready,
    nodes: report.nodes.map((n) => ({
      node: n.node,
      endpoint: n.endpoint,
      reachable: n.reachable,
      error: n.error,
      models: n.models,
      roles: n.comparison?.roles ?? null,
      missing_roles: n.missing_roles,
      present_roles: n.present_roles,
      resident_gb: n.comparison?.resident_gb ?? 0,
      ready: n.ready,
    })),
    nodes_ready: report.nodes_ready,
    roles_per_node: report.roles_per_node,
    unreachable_nodes: report.unreachable_nodes,
  };
  if (report.mode === 'endpoint') {
    const n = report.nodes[0];
    jsonDoc.present_roles = n?.present_roles ?? [];
    jsonDoc.missing_roles = n?.missing_roles ?? [];
  }
  if (report.requested_roles !== null) {
    jsonDoc.requested_roles = report.requested_roles;
    jsonDoc.forbidden_role_hits = report.forbidden_role_hits;
  }

  return { ok: report.ready, lines, json: jsonDoc };
}

export function formatSubstrateCheckText(
  result: FulcrumSubstrateCheckResult,
  json: boolean
): string {
  return json && result.json
    ? `${result.lines.join('\n')}\n${JSON.stringify(result.json)}`
    : result.lines.join('\n');
}
