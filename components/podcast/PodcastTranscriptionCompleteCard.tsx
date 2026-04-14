import React from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";

interface PodcastTranscriptionCompleteCardProps {
  transcript_id: string;
  preview_text?: string;
  word_count?: number;
  duration_ms?: number;
  language?: string;
  metadata?: {
    speakers?: number;
    platform?: string;
  };
}

/**
 * PodcastTranscriptionCompleteCard
 *
 * Shows completed podcast transcription with key stats.
 * Tappable to view full transcript as a document.
 */
export function PodcastTranscriptionCompleteCard({
  transcript_id,
  preview_text,
  word_count,
  duration_ms,
  language,
  metadata,
}: PodcastTranscriptionCompleteCardProps) {
  const router = useRouter();

  const formatDuration = () => {
    if (!duration_ms) return "Unknown duration";
    const minutes = Math.floor(duration_ms / 60000);
    const seconds = Math.floor((duration_ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const handlePress = () => {
    // Navigate to document view with the transcript
    router.push(`/document/${transcript_id}`);
  };

  return (
    <Pressable onPress={handlePress}>
      <View className="p-4 rounded-xl my-2 bg-surface-variant">
        <View className="flex-row justify-between items-center mb-3">
          <View className="flex-row items-center">
            <Text className="text-3xl">✅</Text>
            <Text className="text-lg font-semibold text-on-surface-variant ml-2">
              Podcast Transcribed
            </Text>
          </View>
          <ChevronRight size={20} className="text-on-surface-variant" />
        </View>

        {preview_text && (
          <Text
            className="text-base leading-5 mb-3 opacity-80 text-on-surface-variant"
            numberOfLines={3}
          >
            {preview_text}
          </Text>
        )}

        <View className="flex-row flex-wrap mb-2">
          {word_count && (
            <View className="mr-4 mb-1">
              <Text className="text-xs text-on-surface-variant">
                {word_count.toLocaleString()} words
              </Text>
            </View>
          )}

          {duration_ms && (
            <View className="mr-4 mb-1">
              <Text className="text-xs text-on-surface-variant">
                {formatDuration()}
              </Text>
            </View>
          )}

          {metadata?.speakers && (
            <View className="mr-4 mb-1">
              <Text className="text-xs text-on-surface-variant">
                {metadata.speakers} speaker{metadata.speakers > 1 ? "s" : ""}
              </Text>
            </View>
          )}

          {language && (
            <View className="mr-4 mb-1">
              <Text className="text-xs text-on-surface-variant">
                {language.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <Text className="text-xs font-semibold text-primary">
          Tap to view full transcript →
        </Text>
      </View>
    </Pressable>
  );
}
