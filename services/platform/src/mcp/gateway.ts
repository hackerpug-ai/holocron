import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { listTools } from '../tools/registry.ts';
import { executePostgresMcpTool } from './executor.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'holocron-postgres', version: '1.0.0' });
  const tools = listTools();
  for (const tool of tools) {
    const id = tool.id;
    server.registerTool(
      id,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema instanceof z.ZodObject ? { outputSchema: tool.outputSchema } : {}),
      },
      async (input, extra) => {
        try {
          if (!isRecord(input)) {
            throw new Error('INVALID_ARGUMENT: MCP tool input must be an object');
          }
          const result = await executePostgresMcpTool(id, input, {
            signal: extra.signal,
          });
          const content = [{ type: 'text' as const, text: JSON.stringify(result) }];
          // MCP structuredContent is an object by protocol; array-shaped tool outputs
          // remain lossless in the canonical text content instead of being rejected by
          // CallToolResultSchema.
          return isRecord(result) ? { content, structuredContent: result } : { content };
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : String(error);
          const separator = rawMessage.indexOf(':');
          const prefix = separator > 0 ? rawMessage.slice(0, separator) : '';
          const code = /^[A-Z][A-Z0-9_]+$/.test(prefix)
            ? prefix
            : rawMessage === 'MCP request cancelled'
              ? 'CANCELLED'
              : 'INTERNAL_SERVER_ERROR';
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ code, message: rawMessage }) },
            ],
            isError: true,
          };
        }
      }
    );
  }
  return server;
}

/**
 * Stateless Streamable HTTP MCP gateway. Tool schemas come from the shared
 * registry; no Convex client or second validation layer is introduced here.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    allowedOrigins: [new URL(request.url).origin],
    enableDnsRebindingProtection: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function startMcpStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
