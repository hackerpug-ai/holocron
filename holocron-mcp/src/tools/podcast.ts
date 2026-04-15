/**
 * Podcast transcription tools for Holocron MCP
 * Transcribes podcast episodes from Spotify, Apple Podcasts, RSS feeds, and direct MP3 links
 */

import type { HolocronConvexClient } from "../convex/client.ts";

/**
 * Create a podcast transcript job from a URL
 */
export interface CreatePodcastTranscriptInput {
  url: string;
  priority?: number;
}

export interface CreatePodcastTranscriptOutput {
  success: boolean;
  alreadyExists: boolean;
  jobId?: string;
  transcriptId?: string;
  contentId: string;
  platform?: "spotify" | "apple_podcasts" | "rss" | "direct_mp3";
  status?: string;
}

export async function createPodcastTranscript(
  client: HolocronConvexClient,
  input: CreatePodcastTranscriptInput
): Promise<CreatePodcastTranscriptOutput> {
  return await client.action<CreatePodcastTranscriptOutput>(
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    "audioTranscripts/actions:createPodcastTranscriptJob" as any,
    {
      url: input.url,
      priority: input.priority ?? 8,
    }
  );
}

/**
 * Get transcript status by content ID
 */
export interface GetPodcastTranscriptStatusInput {
  contentId: string;
}

export interface GetPodcastTranscriptStatusOutput {
  status: "completed" | "pending" | "downloading" | "transcribing" | "failed" | "not_found";
  transcriptId?: string;
  jobId?: string;
  previewText?: string;
  wordCount?: number;
  durationMs?: number;
  language?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export async function getPodcastTranscriptStatus(
  client: HolocronConvexClient,
  input: GetPodcastTranscriptStatusInput
): Promise<GetPodcastTranscriptStatusOutput> {
  return await client.action<GetPodcastTranscriptStatusOutput>(
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    "audioTranscripts/actions:getTranscriptStatus" as any,
    {
      contentId: input.contentId,
    }
  );
}

/**
 * Get full transcript text
 */
export interface GetPodcastTranscriptTextInput {
  transcriptId: string;
}

export interface GetPodcastTranscriptTextOutput {
  text: string;
  metadata: {
    sourceUrl: string;
    contentId: string;
    wordCount: number;
    durationMs?: number;
    language?: string;
    generatedAt: number;
    transcriptSource: string;
  };
}

export async function getPodcastTranscriptText(
  client: HolocronConvexClient,
  input: GetPodcastTranscriptTextInput
): Promise<GetPodcastTranscriptTextOutput> {
  return await client.action<GetPodcastTranscriptTextOutput>(
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    "audioTranscripts/actions:getTranscriptText" as any,
    {
      transcriptId: input.transcriptId,
    }
  );
}
