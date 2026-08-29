/**
 * Manifest Schema — prints a tool's input_schema, output_schema, and defaults.
 */
import type { ManifestTool, McpManifest } from './manifest-loader';
import { getToolMap } from './manifest-loader';

export interface SchemaReport {
  tool_id: string;
  found: boolean;
  input_schema: unknown;
  output_schema: unknown;
  defaults: Record<string, unknown>;
}

export function buildSchemaReport(manifest: McpManifest, toolId: string): SchemaReport {
  const map = getToolMap(manifest);
  const tool: ManifestTool | undefined = map.get(toolId);
  if (!tool) {
    return {
      tool_id: toolId,
      found: false,
      input_schema: null,
      output_schema: null,
      defaults: {},
    };
  }
  return {
    tool_id: toolId,
    found: true,
    input_schema: tool.input_schema,
    output_schema: tool.output_schema,
    defaults: tool.defaults,
  };
}

export function formatSchemaText(report: SchemaReport): string {
  const lines: string[] = [];
  if (!report.found) {
    lines.push(`Tool not found: ${report.tool_id}`);
    return lines.join('\n');
  }
  lines.push(`Tool: ${report.tool_id}`);
  lines.push('--- input_schema ---');
  lines.push(JSON.stringify(report.input_schema, null, 2));
  lines.push('--- output_schema ---');
  lines.push(JSON.stringify(report.output_schema, null, 2));
  lines.push('--- defaults ---');
  lines.push(JSON.stringify(report.defaults, null, 2));
  return lines.join('\n');
}
