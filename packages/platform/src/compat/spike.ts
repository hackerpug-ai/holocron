/**
 * Spike orchestrator — runs all 5 cells, collects results,
 * prints the 5-cell matrix, exits 0 iff 5/5 green.
 */
import { Mastra } from '@mastra/core/mastra';
import pkgJson from '../../package.json' with { type: 'json' };
import { createObservability, createStorage } from '../mastra.ts';
import { type AgentCellResult, createFleetAgent, runAgentCell } from './cells/agent.ts';
import { type McpCellResult, runMcpCell } from './cells/mcp.ts';
import { type OtelCellResult, runOtelCell } from './cells/otel.ts';
import { runToolCell, type ToolCellResult } from './cells/tool.ts';
import { compatWorkflow, runWorkflowCell, type WorkflowCellResult } from './cells/workflow.ts';

export interface SpikeResult {
  ok: boolean;
  runtime: { bun: string };
  cells: {
    agent: { status: 'green' | 'red'; detail?: string };
    tool: { status: 'green' | 'red'; detail?: string };
    workflow: { status: 'green' | 'red'; detail?: string };
    mcp: { status: 'green' | 'red'; detail?: string };
    otel: { status: 'green' | 'red'; detail?: string };
  };
  versions: Record<string, string>;
  otelSpans?: number;
  cloudRequests?: number;
  agentText?: string;
  workflowStatus?: string;
  mcpTools?: number;
  traceId?: string;
}

function resolveVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const [dep, version] of Object.entries(pkgJson.dependencies ?? {})) {
    if (dep.startsWith('@mastra/') || dep === 'ai' || dep === 'zod' || dep.startsWith('@ai-sdk/')) {
      versions[dep] = version as string;
    }
  }
  return versions;
}

function cellResult(ok: boolean, detail?: string): { status: 'green' | 'red'; detail?: string } {
  return { status: ok ? 'green' : 'red', detail };
}

export async function runSpike(): Promise<SpikeResult> {
  const versions = resolveVersions();
  const bunVersion =
    (globalThis as unknown as { Bun?: { version: string } }).Bun?.version ?? 'unknown';

  // Create storage — we'll test if it's reachable before using it
  let mastra: Mastra;
  let storageReachable = true;

  try {
    const storage = createStorage();
    const observability = createObservability();
    // Structural local-first: await resolveModel(role) → createFleetChatModel
    const agent = await createFleetAgent({ role: 'divergent' });
    mastra = new Mastra({
      storage,
      observability,
      agents: { 'compat-agent': agent },
      workflows: { compatWorkflow },
    });
  } catch {
    return {
      ok: false,
      runtime: { bun: bunVersion },
      cells: {
        agent: cellResult(false, 'mastra init failed'),
        tool: cellResult(false, 'mastra init failed'),
        workflow: cellResult(false, 'mastra init failed'),
        mcp: cellResult(false, 'mastra init failed'),
        otel: cellResult(false, 'mastra init failed'),
      },
      versions,
      cloudRequests: 0,
    };
  }

  // ── Cell 2: Tool (no Postgres needed) ────────────────────
  const toolResult: ToolCellResult = await runToolCell();

  // ── Cell 1: Agent (needs fleet) ───────────────────────────
  const agentResult: AgentCellResult = await runAgentCell(mastra);

  // ── Cell 3: Workflow (needs Postgres) ─────────────────────
  let workflowResult: WorkflowCellResult;
  if (storageReachable) {
    workflowResult = await runWorkflowCell(mastra);
    // If workflow failed due to storage, mark storage as unreachable
    if (!workflowResult.ok && workflowResult.error?.includes('connect')) {
      storageReachable = false;
    }
  } else {
    workflowResult = { ok: false, error: 'Postgres unreachable' };
  }

  // ── Cell 4: MCP (independent) ─────────────────────────────
  const mcpResult: McpCellResult = await runMcpCell();

  // ── Cell 5: OTel (needs Postgres + prior calls) ───────────
  let otelResult: OtelCellResult;
  if (storageReachable) {
    otelResult = await runOtelCell(mastra);
    if (!otelResult.ok && otelResult.error?.includes('connect')) {
      storageReachable = false;
    }
  } else {
    otelResult = { ok: false, error: 'Postgres unreachable' };
  }

  // Assemble result
  const result: SpikeResult = {
    ok: false, // computed below
    runtime: { bun: bunVersion },
    cells: {
      agent: cellResult(agentResult.ok, agentResult.error ?? agentResult.text),
      tool: cellResult(toolResult.ok, toolResult.error ?? toolResult.output?.echoed),
      workflow: cellResult(workflowResult.ok, workflowResult.error ?? workflowResult.result),
      mcp: cellResult(mcpResult.ok, mcpResult.error ?? mcpResult.toolResult?.echoed),
      otel: cellResult(otelResult.ok, otelResult.error ?? `${otelResult.otelSpans} spans`),
    },
    versions,
    otelSpans: otelResult.otelSpans,
    cloudRequests: agentResult.cloudRequests,
    agentText: agentResult.text,
    workflowStatus: workflowResult.status,
    mcpTools: mcpResult.toolsCount,
    traceId: otelResult.traceId,
  };

  // 5/5 green iff all cells pass
  const allGreen =
    result.cells.agent.status === 'green' &&
    result.cells.tool.status === 'green' &&
    result.cells.workflow.status === 'green' &&
    result.cells.mcp.status === 'green' &&
    result.cells.otel.status === 'green';
  result.ok = allGreen;

  return result;
}

// ── output formatting ───────────────────────────────────────

export function formatMatrix(r: SpikeResult): string {
  const lines: string[] = [];
  lines.push('======================================================');
  lines.push('   COMPATIBILITY SPIKE — 5-Cell Smoke Matrix');
  lines.push('======================================================');
  lines.push('');
  lines.push(`  Runtime:  Bun ${r.runtime.bun}`);
  lines.push('');
  lines.push('  --------------------------------------------');
  for (const [name, cell] of Object.entries(r.cells)) {
    const icon = cell.status === 'green' ? '[GREEN]' : '[RED]  ';
    lines.push(`  ${icon}  ${name}`);
    if (cell.detail) {
      lines.push(`         ${cell.detail}`);
    }
  }
  lines.push('  --------------------------------------------');
  lines.push('');

  const green = Object.values(r.cells).filter((c) => c.status === 'green').length;
  lines.push(`  Result: ${green}/5 cells green`);
  lines.push('');

  // Version table
  lines.push('  Pinned versions:');
  for (const [pkg, ver] of Object.entries(r.versions)) {
    lines.push(`    ${pkg.padEnd(35)} ${ver}`);
  }
  lines.push('');

  // Metrics
  if (r.otelSpans !== undefined) lines.push(`  OTel spans: ${r.otelSpans}`);
  if (r.cloudRequests !== undefined) lines.push(`  Cloud requests: ${r.cloudRequests}`);
  if (r.workflowStatus) lines.push(`  Workflow status: ${r.workflowStatus}`);
  if (r.mcpTools !== undefined) lines.push(`  MCP tools: ${r.mcpTools}`);
  if (r.traceId) lines.push(`  Trace ID: ${r.traceId}`);

  return lines.join('\n');
}

export function formatJson(r: SpikeResult): string {
  return JSON.stringify(r);
}
