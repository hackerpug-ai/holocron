/**
 * Manifest Replay — prints a tool's idempotency key + stored result from the replay field.
 * Also reads the replay fixture file if it exists.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpManifest } from './manifest-loader';
import { getToolMap } from './manifest-loader';

export interface ReplayReport {
  tool_id: string;
  found: boolean;
  has_replay: boolean;
  idempotency_key: unknown[];
  stored_result: string | null;
  fixture: unknown;
}

export function buildReplayReport(
  manifest: McpManifest,
  toolId: string,
  fixturesDir: string
): ReplayReport {
  const map = getToolMap(manifest);
  const tool = map.get(toolId);

  if (!tool) {
    return {
      tool_id: toolId,
      found: false,
      has_replay: false,
      idempotency_key: [],
      stored_result: null,
      fixture: null,
    };
  }

  if (!tool.replay) {
    return {
      tool_id: toolId,
      found: true,
      has_replay: false,
      idempotency_key: [],
      stored_result: null,
      fixture: null,
    };
  }

  const fixturePath = resolve(fixturesDir, `${toolId}_replay.json`);
  let fixture: unknown = null;
  if (existsSync(fixturePath)) {
    try {
      fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    } catch {
      fixture = null;
    }
  }

  return {
    tool_id: toolId,
    found: true,
    has_replay: true,
    idempotency_key: tool.replay.idempotency_key,
    stored_result: tool.replay.stored_result,
    fixture,
  };
}

export function formatReplayText(report: ReplayReport): string {
  const lines: string[] = [];
  if (!report.found) {
    lines.push(`Tool not found: ${report.tool_id}`);
    return lines.join('\n');
  }
  if (!report.has_replay) {
    lines.push(`No replay contract for: ${report.tool_id}`);
    return lines.join('\n');
  }
  lines.push(`Tool: ${report.tool_id}`);
  lines.push(`Idempotency key: ${JSON.stringify(report.idempotency_key)}`);
  lines.push(`Stored result field: ${report.stored_result}`);
  if (report.fixture) {
    lines.push('--- replay fixture ---');
    lines.push(JSON.stringify(report.fixture, null, 2));
  }
  return lines.join('\n');
}
