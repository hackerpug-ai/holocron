/**
 * Verify Manifest — cross-checks manifest tool IDs against the LIVE-registered tool IDs.
 * Exit 0 iff every registered tool has a manifest entry with populated fields + frozen fixtures,
 * no orphan entries exist, and both transports are declared.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getToolMap, type McpManifest } from './manifest-loader';
import { readRegisteredToolIds } from './registry-reader';

export interface VerifyManifestOptions {
  manifestPath: string;
  registryPath?: string;
  fixturesDir: string;
}

export interface ManifestIssue {
  tool_id: string;
  kind:
    | 'not_in_manifest'
    | 'not_registered'
    | 'fixtures_missing'
    | 'input_schema_null'
    | 'transports_null'
    | 'output_schema_null'
    | 'errors_empty_mutation'
    | 'replay_null_mutation'
    | 'error_fixture_missing';
  message: string;
}

export interface TransportIssue {
  kind: 'transport_missing';
  transport: string;
  message: string;
}

export interface VerifyManifestReport {
  tools_covered: number;
  tools_total: number;
  issues: Array<ManifestIssue | TransportIssue>;
  ok: boolean;
}

export function buildVerifyReport(
  manifest: McpManifest,
  opts: VerifyManifestOptions
): VerifyManifestReport {
  const registeredIds = readRegisteredToolIds(opts.registryPath);
  const manifestMap = getToolMap(manifest);

  const issues: Array<ManifestIssue | TransportIssue> = [];

  for (const toolId of registeredIds) {
    const entry = manifestMap.get(toolId);
    if (!entry) {
      issues.push({
        tool_id: toolId,
        kind: 'not_in_manifest',
        message: `${toolId} not covered by manifest`,
      });
      continue;
    }
    if (entry.input_schema == null) {
      issues.push({
        tool_id: toolId,
        kind: 'input_schema_null',
        message: `${toolId} input_schema is null`,
      });
    }
    if (entry.output_schema == null) {
      issues.push({
        tool_id: toolId,
        kind: 'output_schema_null',
        message: `Tool ${toolId}: output_schema is null — required for all tools`,
      });
    }
    if (entry.transports == null || entry.transports.length === 0) {
      issues.push({
        tool_id: toolId,
        kind: 'transports_null',
        message: `${toolId} transports not declared`,
      });
    }
    const isMutation = entry.side_effects != null && entry.side_effects !== '';
    if (isMutation && (!entry.errors || entry.errors.length === 0)) {
      issues.push({
        tool_id: toolId,
        kind: 'errors_empty_mutation',
        message: `Tool ${toolId}: errors array is empty — required for mutation tools`,
      });
    }
    if (isMutation && entry.replay == null) {
      issues.push({
        tool_id: toolId,
        kind: 'replay_null_mutation',
        message: `Tool ${toolId}: replay is null — required for mutation tools`,
      });
    }
    const fixturePath = resolve(opts.fixturesDir, `${toolId}_success.json`);
    if (!existsSync(fixturePath)) {
      issues.push({
        tool_id: toolId,
        kind: 'fixtures_missing',
        message: `${toolId} fixtures missing`,
      });
    }
    if (isMutation) {
      const errorFixturePath = resolve(opts.fixturesDir, `${toolId}_error.json`);
      if (!existsSync(errorFixturePath)) {
        issues.push({
          tool_id: toolId,
          kind: 'error_fixture_missing',
          message: `Tool ${toolId}: error fixture file missing`,
        });
      }
    }
  }

  for (const tool of manifest.tools) {
    if (!registeredIds.has(tool.id)) {
      issues.push({
        tool_id: tool.id,
        kind: 'not_registered',
        message: `${tool.id} not registered in holocron-mcp`,
      });
    }
  }

  const requiredTransports = ['stdio', 'streamable-http'];
  for (const t of requiredTransports) {
    if (!manifest.header.transports.includes(t)) {
      issues.push({
        kind: 'transport_missing',
        transport: t,
        message: `transport coverage incomplete: missing ${t}`,
      } as TransportIssue);
    }
  }

  const totalRegistered = registeredIds.size;
  const covered = [...registeredIds].filter((id) => {
    const entry = manifestMap.get(id);
    if (!entry) return false;
    if (entry.input_schema == null) return false;
    if (entry.output_schema == null) return false;
    if (entry.transports == null || entry.transports.length === 0) return false;
    const isMutation = entry.side_effects != null && entry.side_effects !== '';
    if (isMutation && (!entry.errors || entry.errors.length === 0)) return false;
    if (isMutation && entry.replay == null) return false;
    const fixturePath = resolve(opts.fixturesDir, `${id}_success.json`);
    if (!existsSync(fixturePath)) return false;
    if (isMutation) {
      const errorFixturePath = resolve(opts.fixturesDir, `${id}_error.json`);
      if (!existsSync(errorFixturePath)) return false;
    }
    return true;
  }).length;

  return {
    tools_covered: covered,
    tools_total: totalRegistered,
    issues,
    ok: issues.length === 0,
  };
}

export interface ProtocolReport {
  protocol: string;
  transports: string[];
  stateless: boolean;
  no_server_sampling: boolean;
  auth_summary: string;
  cancellation_summary: string;
  ok: boolean;
}

export function buildProtocolReport(manifest: McpManifest): ProtocolReport {
  const h = manifest.header;
  const authKeys = Object.keys(h.auth_policy);
  const cancelKeys = Object.keys(h.cancellation_policy);

  const authSummary = authKeys.length > 0 ? `${authKeys.join(', ')} configured` : 'MISSING';

  const cancelSummary =
    cancelKeys.length > 0
      ? `posture=${String(h.cancellation_policy.posture ?? '?')}, supported=${String(h.cancellation_policy.supported ?? '?')}`
      : 'MISSING';

  const ok =
    h.protocol.length > 0 &&
    h.transports.includes('stdio') &&
    h.transports.includes('streamable-http') &&
    authKeys.length > 0 &&
    cancelKeys.length > 0;

  return {
    protocol: h.protocol,
    transports: h.transports,
    stateless: h.stateless,
    no_server_sampling: h.no_server_sampling,
    auth_summary: authSummary,
    cancellation_summary: cancelSummary,
    ok,
  };
}

export function formatVerifyText(report: VerifyManifestReport): string {
  const lines: string[] = [];
  lines.push(
    `${report.tools_covered}/${report.tools_total} tools covered, both transports covered`
  );
  if (report.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of report.issues) {
      lines.push(`  - ${issue.message}`);
    }
  }
  return lines.join('\n');
}

export function formatProtocolText(report: ProtocolReport): string {
  const lines: string[] = [];
  lines.push(`Protocol: ${report.protocol}`);
  lines.push(`Transports: ${report.transports.join(', ')}`);
  lines.push(`Stateless: ${report.stateless}`);
  lines.push(`No server sampling: ${report.no_server_sampling}`);
  lines.push(`Auth policy: ${report.auth_summary}`);
  lines.push(`Cancellation policy: ${report.cancellation_summary}`);
  return lines.join('\n');
}
