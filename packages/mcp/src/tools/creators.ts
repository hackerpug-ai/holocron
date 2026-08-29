/**
 * Creator tools that map to the shared 44-tool surface — platform MCP (S31-05).
 * Extra legacy helpers that have no MCP id fail closed (no fabricated success).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface AssimilateCreatorInput {
  profileId: string;
}

export interface GetCreatorTranscriptsInput {
  profileId: string;
  limit?: number;
}

export interface RegenerateTranscriptInput {
  videoId: string;
  profileId?: string;
}

export async function assimilateCreator(
  client: PlatformMcpClient,
  input: AssimilateCreatorInput
): Promise<unknown> {
  return client.callTool("assimilate_creator", { profileId: input.profileId });
}

export async function getCreatorTranscripts(
  client: PlatformMcpClient,
  input: GetCreatorTranscriptsInput
): Promise<unknown> {
  return client.callTool("get_creator_transcripts", {
    profileId: input.profileId,
    ...(input.limit !== undefined && { limit: input.limit }),
  });
}

export async function regenerateTranscript(
  client: PlatformMcpClient,
  input: RegenerateTranscriptInput
): Promise<unknown> {
  return client.callTool("regenerate_transcript", {
    videoId: input.videoId,
    ...(input.profileId !== undefined && { profileId: input.profileId }),
  });
}
