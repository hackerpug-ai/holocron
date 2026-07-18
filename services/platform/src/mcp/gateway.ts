import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { toolsAsRecord } from '../tools/registry.ts';

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'holocron-postgres', version: '1.0.0' });
  const tools = toolsAsRecord();
  for (const [id, tool] of Object.entries(tools)) {
    const registered = tool as unknown as {
      description?: string;
      inputSchema?: unknown;
      execute?: (input: unknown, context?: unknown) => Promise<unknown>;
    };
    server.registerTool(
      id,
      {
        description: registered.description ?? id,
        inputSchema: registered.inputSchema as never,
      },
      async (input) => {
        if (!registered.execute) {
          throw new Error(`tool ${id} has no executable implementation`);
        }
        const result = await registered.execute(input, {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result as Record<string, unknown>,
        };
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
