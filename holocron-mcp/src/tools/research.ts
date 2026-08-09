/**
 * Legacy deep-research helpers — not part of the 44-tool cutover surface.
 * Fail closed (S31-05); use platform research tools via MCP when available.
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

function unavailable(name: string): never {
  throw new Error(
    `NOT_AVAILABLE: legacy helper '${name}' has no platform MCP tool; use the 44-tool registry surface`
  );
}

export async function researchTopic(
  _client: PlatformMcpClient,
  _input: { topic: string; maxIterations?: number }
): Promise<never> {
  return unavailable("researchTopic");
}

export async function simpleResearch(
  _client: PlatformMcpClient,
  _input: { topic: string }
): Promise<never> {
  return unavailable("simpleResearch");
}
