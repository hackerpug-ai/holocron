"use node";

import { ActionCtx } from "../_generated/server";

/**
 * Platform detection from URL
 */
export function detectPodcastPlatform(url: string): "spotify" | "apple_podcasts" | "rss" | "direct_mp3" | null {
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.includes("spotify.com")) return "spotify";
  if (normalizedUrl.includes("podcasts.apple.com")) return "apple_podcasts";
  if (normalizedUrl.includes(".mp3") || normalizedUrl.includes("audio/mpeg")) return "direct_mp3";
  if (normalizedUrl.includes("rss") || normalizedUrl.includes("feed") || normalizedUrl.includes("xml")) return "rss";
  return null;
}

/**
 * Generate content ID from URL
 */
export function generateContentId(url: string): string {
  // Create a hash-like ID from the URL
  const hash = Buffer.from(url).toString("base64").replace(/[+/=]/g, "").slice(0, 16);
  return `podcast_${hash}`;
}

/**
 * Extract audio URL from Spotify episode page
 * Uses Jina Reader to parse the page and extract the audio file URL
 */
export async function extractSpotifyAudioUrl(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl);

    if (!response.ok) {
      throw new Error(`Jina Reader error: ${response.statusText}`);
    }

    const text = await response.text();

    // Spotify audio URLs are typically in specific patterns
    // Look for .mp3 or audio file URLs in the parsed content
    const audioUrlMatch = text.match(/https?:\/\/[^\s"']+\.(mp3|m4a|m4b|opus)/i);
    if (audioUrlMatch) {
      return audioUrlMatch[0];
    }

    // Also check for Spotify CDN URLs
    const cdnMatch = text.match(/https:\/\/[a-z0-9.-]+scdn\.co\/audio\/[a-z0-9/-]+/i);
    if (cdnMatch) {
      return cdnMatch[0];
    }

    return null;
  } catch (error) {
    console.error("Failed to extract Spotify audio URL:", error);
    return null;
  }
}

/**
 * Extract audio URL from Apple Podcasts episode page
 */
export async function extractApplePodcastsAudioUrl(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl);

    if (!response.ok) {
      throw new Error(`Jina Reader error: ${response.statusText}`);
    }

    const text = await response.text();

    // Apple Podcasts typically has audio URLs in specific formats
    const audioUrlMatch = text.match(/https?:\/\/[^\s"']+\.(mp3|m4a|m4b)/i);
    return audioUrlMatch ? audioUrlMatch[0] : null;
  } catch (error) {
    console.error("Failed to extract Apple Podcasts audio URL:", error);
    return null;
  }
}

/**
 * Download audio file and store in Convex storage
 * Returns the storage ID and file size
 */
export async function downloadAndStoreAudio(
  ctx: ActionCtx,
  audioUrl: string
): Promise<{ storageId: string; sizeBytes: number }> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const storageId = await ctx.storage.store(arrayBuffer as any); // Type assertion for Convex storage
  const sizeBytes = arrayBuffer.byteLength;

  return { storageId, sizeBytes };
}

/**
 * Transcribe audio using Deepgram Nova-3 API
 */
export async function transcribeWithDeepgram(
  audioBuffer: ArrayBuffer,
  apiKey: string
): Promise<{ text: string; language: string; duration: number; speakers?: number }> {
  // Create a Blob from the ArrayBuffer, then wrap in File
  const audioBlob = new Blob([audioBuffer], { type: "audio/mp3" });
  const audioFile = new File([audioBlob], "audio.mp3", { type: "audio/mp3" });

  const formData = new FormData();
  formData.append("audio", audioFile);
  formData.append("model", "nova-3");
  formData.append("smart_format", "true");
  formData.append("diarize", "true"); // Speaker diarization
  formData.append("utterances", "true"); // Split by speaker turns
  formData.append("punctuate", "true"); // Add punctuation
  formData.append("paragraphs", "true"); // Group into paragraphs

  const response = await fetch("https://api.deepgram.com/v1/listen", {
    method: "POST",
    headers: {
      "Authorization": `Token ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram API error: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  // Check if we have utterances (speaker diarization)
  if (result.results?.utterances && Array.isArray(result.results.utterances)) {
    // Combine utterances into full transcript with speaker labels
    const transcript = result.results.utterances
      .map((u: any) => `[Speaker ${u.speaker}]: ${u.transcript}`)
      .join("\n\n");

    const uniqueSpeakers = new Set(result.results.utterances.map((u: any) => u.speaker));

    return {
      text: transcript,
      language: result.results.channels?.[0]?.detected_language || "en",
      duration: result.metadata?.duration || 0,
      speakers: uniqueSpeakers.size,
    };
  }

  // Fallback: no utterances, use the full transcript
  const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

  return {
    text: transcript,
    language: result.results?.channels?.[0]?.detected_language || "en",
    duration: result.metadata?.duration || 0,
    speakers: 1,
  };
}
