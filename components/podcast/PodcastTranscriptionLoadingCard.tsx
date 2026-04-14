import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/text";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface PodcastTranscriptionLoadingCardProps {
  content_id: string;
  url: string;
  platform: "spotify" | "apple_podcasts" | "rss" | "direct_mp3";
  onTranscriptComplete?: (transcriptId: string) => void;
}

/**
 * PodcastTranscriptionLoadingCard
 *
 * Shows loading state for podcast transcription.
 * Polls for status and automatically transitions to completion state.
 */
export function PodcastTranscriptionLoadingCard({
  content_id,
  url,
  platform,
  onTranscriptComplete,
}: PodcastTranscriptionLoadingCardProps) {
  const [status, setStatus] = useState<"downloading" | "transcribing" | "completed" | "failed">("downloading");
  const getTranscriptStatus = useAction(api.audioTranscripts.actions.getTranscriptStatus);

  useEffect(() => {
    // Poll for status every 3 seconds
    const interval = setInterval(async () => {
      try {
        const result = await getTranscriptStatus({ contentId: content_id });

        if (result.status === "completed" && result.transcriptId) {
          setStatus("completed");
          clearInterval(interval);
          onTranscriptComplete?.(result.transcriptId);
        } else if (result.status === "failed") {
          setStatus("failed");
          clearInterval(interval);
        } else if (result.status === "transcribing") {
          setStatus("transcribing");
        }
      } catch (error) {
        console.error("Failed to check transcript status:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [content_id, getTranscriptStatus, onTranscriptComplete]);

  const getStatusMessage = () => {
    switch (status) {
      case "downloading":
        return "Downloading podcast audio...";
      case "transcribing":
        return "Transcribing with Deepgram Nova-3...";
      case "completed":
        return "Transcription complete!";
      case "failed":
        return "Transcription failed. Please try again.";
    }
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case "spotify":
        return "🎙️";
      case "apple_podcasts":
        return "🍎";
      case "rss":
        return "📡";
      case "direct_mp3":
        return "🎵";
    }
  };

  return (
    <View className="flex-row p-4 rounded-xl my-2 bg-surface-variant">
      <View className="mr-3">
        <Text className="text-4xl">{getPlatformIcon()}</Text>
      </View>

      <View className="flex-1">
        <Text className="text-lg font-semibold text-on-surface-variant">
          Podcast Transcription
        </Text>
        <Text className="text-sm text-on-surface-variant opacity-70 mt-1 mb-2">
          {url}
        </Text>
        <View className="flex-row items-center">
          {status !== "completed" && status !== "failed" && (
            <ActivityIndicator size="small" />
          )}
          <Text className="text-xs text-on-surface-variant ml-2">
            {getStatusMessage()}
          </Text>
        </View>
      </View>
    </View>
  );
}
