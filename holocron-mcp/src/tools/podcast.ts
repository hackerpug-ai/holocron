/**
 * Podcast helpers — no longer backed by a shared-registry MCP tool.
 * Fail closed rather than fabricate success (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

function unavailable(name: string): never {
  throw new Error(
    `NOT_AVAILABLE: legacy helper '${name}' has no platform MCP tool; use the 44-tool registry surface`
  );
}

export async function createPodcastTranscript(
  _client: PlatformMcpClient,
  _input: { url: string; priority?: number }
): Promise<never> {
  return unavailable("createPodcastTranscript");
}

export async function getPodcastTranscriptStatus(
  _client: PlatformMcpClient,
  _input: { jobId: string }
): Promise<never> {
  return unavailable("getPodcastTranscriptStatus");
}

export async function getPodcastTranscriptText(
  _client: PlatformMcpClient,
  _input: { transcriptId: string }
): Promise<never> {
  return unavailable("getPodcastTranscriptText");
}
