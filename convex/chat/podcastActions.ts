"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { detectPodcastPlatform } from "../audioTranscripts/internal";

interface HandlePodcastUrlResult {
  success: boolean;
  error?: string;
  jobId?: string;
  contentId?: string;
  platform?: "spotify" | "apple_podcasts" | "rss" | "direct_mp3";
}

/**
 * Handle podcast URL from chat
 * Creates transcript job and posts loading card
 */
export const handlePodcastUrl = action({
  args: {
    conversationId: v.id("conversations"),
    url: v.string(),
  },
  handler: async (ctx, args): Promise<HandlePodcastUrlResult> => {
    const platform = detectPodcastPlatform(args.url);

    if (!platform) {
      // Post error card
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId: args.conversationId,
        role: "agent",
        content: "Unsupported podcast URL. Please provide a Spotify, Apple Podcasts, RSS feed, or direct MP3 link.",
        messageType: "error",
      });

      return {
        success: false,
        error: "Unsupported podcast URL",
      };
    }

    try {
      // Create transcript job
      const result = await ctx.runAction(api.audioTranscripts.actions.createPodcastTranscriptJob, {
        url: args.url,
        priority: 8, // High priority (user-initiated)
      });

      if (!result.success) {
        throw new Error("Failed to create transcript job");
      }

      // Post appropriate card based on whether job already existed
      if (result.alreadyExists) {
        if (result.transcriptId) {
          // Transcript already exists, post document card
          await ctx.runMutation(api.chatMessages.mutations.create, {
            conversationId: args.conversationId,
            role: "agent",
            content: "This podcast has already been transcribed.",
            messageType: "result_card",
            cardData: {
              card_type: "podcast_transcription_complete",
              transcript_id: result.transcriptId,
            },
          });
        } else if (result.jobId) {
          // Job already in progress
          await ctx.runMutation(api.chatMessages.mutations.create, {
            conversationId: args.conversationId,
            role: "agent",
            content: "Podcast transcription is already in progress.",
            messageType: "result_card",
            cardData: {
              card_type: "podcast_transcription_loading",
              content_id: result.contentId,
              platform,
              url: args.url,
            },
          });
        }
      } else {
        // New job created, post loading card
        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId: args.conversationId,
          role: "agent",
          content: "Starting podcast transcription...",
          messageType: "result_card",
          cardData: {
            card_type: "podcast_transcription_loading",
            content_id: result.contentId,
            platform,
            url: args.url,
          },
        });
      }

      return {
        success: true,
        jobId: result.jobId,
        contentId: result.contentId,
        platform,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId: args.conversationId,
        role: "agent",
        content: `Failed to start podcast transcription: ${errorMessage}`,
        messageType: "error",
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});

interface CheckPodcastTranscriptStatusResult {
  success: boolean;
  completed: boolean;
  transcriptId?: string;
  error?: string;
  status?: string;
}

/**
 * Check podcast transcription status and update card if complete
 */
export const checkPodcastTranscriptStatus = action({
  args: {
    conversationId: v.id("conversations"),
    contentId: v.string(),
  },
  handler: async (ctx, args): Promise<CheckPodcastTranscriptStatusResult> => {
    const status = await ctx.runAction(api.audioTranscripts.actions.getTranscriptStatus, {
      contentId: args.contentId,
    });

    if (status.status === "completed" && status.transcriptId) {
      // Post completion card
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId: args.conversationId,
        role: "agent",
        content: "Podcast transcription complete!",
        messageType: "result_card",
        cardData: {
          card_type: "podcast_transcription_complete",
          transcript_id: status.transcriptId,
          content_id: args.contentId,
          preview_text: status.previewText,
          word_count: status.wordCount,
          duration_ms: status.durationMs,
          language: status.language,
          metadata: status.metadata,
        },
      });

      return {
        success: true,
        completed: true,
        transcriptId: status.transcriptId,
      };
    }

    if (status.status === "failed") {
      // Post error card
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId: args.conversationId,
        role: "agent",
        content: `Podcast transcription failed: ${status.errorMessage || "Unknown error"}`,
        messageType: "error",
      });

      return {
        success: false,
        completed: false,
        error: status.errorMessage,
      };
    }

    return {
      success: true,
      completed: false,
      status: status.status,
    };
  },
});
