/**
 * Cell 4 — MCP transport
 *
 * Uses @mastra/mcp to create an MCP server with one tool, connects
 * an MCP client over stdio (real transport), lists tools + calls one,
 * gets validated output.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noopObserve } from '@mastra/core/tools';
import { MCPClient } from '@mastra/mcp';

export interface McpCellResult {
  ok: boolean;
  toolsCount?: number;
  toolResult?: { echoed: string; received: string; timestamp: string };
  error?: string;
}

export async function runMcpCell(): Promise<McpCellResult> {
  // Resolve relative to this file's directory (not CWD)
  const serverEntry = resolve(fileURLToPath(new URL('.', import.meta.url)), 'mcp-server-entry.ts');

  const mcpClient = new MCPClient({
    id: 'compat-mcp-client',
    servers: {
      compat: {
        command: 'bun',
        args: [serverEntry],
      },
    },
    timeout: 30_000,
  });

  try {
    // List tools from the connected server
    const tools = await mcpClient.listTools();

    // The tools are namespaced: `<serverName>_<toolId>`
    // For server "compat" and tool "compat-mcp-echo", the key is "compat_compat-mcp-echo"
    const toolKeys = Object.keys(tools);
    if (toolKeys.length === 0) {
      await mcpClient.disconnect();
      return { ok: false, error: 'no tools discovered from MCP server' };
    }

    // Find the echo tool (keys are namespaced as `<server>_<toolVarName>`)
    const echoKey = toolKeys.find((k) => k.toLowerCase().includes('echo'));
    if (!echoKey) {
      await mcpClient.disconnect();
      return {
        ok: false,
        toolsCount: toolKeys.length,
        error: 'compat-mcp-echo tool not found',
      };
    }

    const echoTool = tools[echoKey];
    if (!echoTool || typeof echoTool.execute !== 'function') {
      await mcpClient.disconnect();
      return {
        ok: false,
        toolsCount: toolKeys.length,
        error: 'echo tool has no execute function',
      };
    }

    // Call the tool — real execute over a real transport
    const result = await echoTool.execute(
      { message: 'mcp-transport-ok' },
      { observe: noopObserve }
    );

    await mcpClient.disconnect();

    return {
      ok: true,
      toolsCount: toolKeys.length,
      toolResult: {
        echoed: String(result.echoed ?? ''),
        received: String(result.received ?? ''),
        timestamp: String(result.timestamp ?? ''),
      },
    };
  } catch (err) {
    try {
      await mcpClient.disconnect();
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
