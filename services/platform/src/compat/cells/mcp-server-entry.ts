/**
 * Standalone MCP server entrypoint for the compatibility spike.
 *
 * Spawns on stdio with one tool (compat-mcp-echo). The MCP cell
 * spawns this file as a subprocess via MCPClient stdio transport.
 *
 * Run:  bun services/platform/src/compat/cells/mcp-server-entry.ts
 */

import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { z } from 'zod';

const echoTool = createTool({
  id: 'compat-mcp-echo',
  description: 'Echoes input with metadata — MCP transport compatibility spike.',
  inputSchema: z.object({
    message: z.string().min(1),
  }),
  outputSchema: z.object({
    echoed: z.string(),
    received: z.string(),
    timestamp: z.string(),
  }),
  execute: async (inputData) => {
    return {
      echoed: `mcp:${inputData.message}`,
      received: inputData.message,
      timestamp: new Date().toISOString(),
    };
  },
});

const server = new MCPServer({
  name: 'compat-mcp-server',
  version: '1.0.0',
  tools: { echoTool },
});

await server.startStdio();
