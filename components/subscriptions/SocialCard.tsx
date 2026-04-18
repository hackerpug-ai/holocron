/**
 * SocialCard - Social post card with circular author avatar, content preview, and engagement metrics
 */

import { useMutation, useQuery } from 'convex/react';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { MessageSquare, ThumbsUp } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { cn } from '@/lib/utils';
import { FeedbackButtons } from './FeedbackButtons';
import { SummaryText } from './SummaryText';

export interface SocialCardProps {
  authorAvatarUrl?: string;
  authorName: string;
  authorHandle: string;
  contentPreview: string;
  /** Optional summary text */
  summary?: string;
  likes?: number;
  comments?: number;
  source: string; // "Twitter/X" | "Bluesky" | etc.
  publishedAt?: string;
  onPress?: () => void;
  testID?: string;
  /** Feed item ID for feedback functionality */
  feedItemId?: Id<'feedItems'>;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * SocialCard - displays a social post with author info, avatar, content preview, and engagement metrics
 *
 * Used in subscription feeds to show social media content from platforms like Twitter/X, Bluesky, etc.
 * The circular avatar gracefully falls back to initials when no avatar URL is provided.
 */
export function SocialCard({
  authorAvatarUrl,
  authorName,
  authorHandle,
  contentPreview,
  summary,
  likes,
  comments,
  source,
  publishedAt: _publishedAt,
  onPress,
  testID = 'social-card',
  feedItemId,
}: SocialCardProps) {
  const initials = getInitials(authorName);

  // Fetch feedback state if feedItemId is provided
  const feedbackData = useQuery(
    api.feeds.queries.getFeedItemFeedback,
    feedItemId ? { feedItemId } : 'skip'
  );
  const currentFeedback = feedbackData?.feedback ?? null;

  const submitFeedbackMutation = useMutation(api.feeds.mutations.submitFeedback);

  const handleFeedback = (type: 'positive' | 'negative' | null) => {
    if (!feedItemId) return;

    // Map FeedbackButtons type to Convex type
    // Only submit if not null (deselecting)
    if (type !== null) {
      const feedback = type === 'positive' ? 'up' : 'down';
      submitFeedbackMutation({ feedItemId, feedback });
    }
  };

  return (
    <Pressable testID={testID} onPress={onPress} className="active:opacity-70">
      <Card
        className={cn('border-border bg-card overflow-hidden', onPress && 'pressable-opacity')}
        testID={`${testID}-card`}
      >
        <View className="flex-row items-center gap-3 p-3" testID={`${testID}-header`}>
          {/* Avatar */}
          <View
            className="h-10 w-10 overflow-hidden rounded-full"
            testID={`${testID}-avatar-container`}
          >
            {authorAvatarUrl ? (
              <View
                className="flex h-full w-full items-center justify-center rounded-full bg-primary/10"
                testID={`${testID}-avatar`}
              >
                {/* In production, use FastImage for optimized avatar loading */}
                <Text className="text-sm font-semibold text-primary">{initials}</Text>
              </View>
            ) : (
              <View
                className="flex h-full w-full items-center justify-center rounded-full bg-primary/10"
                testID={`${testID}-initials`}
              >
                <Text className="text-sm font-semibold text-primary">{initials}</Text>
              </View>
            )}
          </View>

          {/* Author info */}
          <View className="flex-1 gap-0.5" testID={`${testID}-author-info`}>
            <Text
              className="text-foreground text-base font-semibold"
              numberOfLines={1}
              testID={`${testID}-author-name`}
            >
              {authorName}
            </Text>
            <Text className="text-muted-foreground text-sm" testID={`${testID}-author-handle`}>
              @{authorHandle}
            </Text>
          </View>

          {/* Source badge */}
          <View className="rounded-full bg-muted px-2.5 py-1" testID={`${testID}-source-badge`}>
            <Text className="text-muted-foreground text-xs font-medium">{source}</Text>
          </View>
        </View>

        {/* Content preview */}
        <View className="gap-2 px-3 pb-3" testID={`${testID}-content`}>
          <Text
            className="text-foreground text-base leading-snug"
            numberOfLines={3}
            testID={`${testID}-content-preview`}
          >
            {contentPreview}
          </Text>

          {/* Summary */}
          <SummaryText summary={summary} title={contentPreview} testID={`${testID}-summary`} />

          {/* Engagement metrics and feedback */}
          <View className="flex-row items-center justify-between pt-1">
            <View className="flex-row items-center gap-3">
              {likes !== undefined && (
                <View className="flex-row items-center gap-1" testID={`${testID}-likes`}>
                  <ThumbsUp size={14} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-xs">{likes}</Text>
                </View>
              )}
              {comments !== undefined && (
                <View className="flex-row items-center gap-1" testID={`${testID}-comments`}>
                  <MessageSquare size={14} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-xs">{comments}</Text>
                </View>
              )}
            </View>

            {/* Feedback buttons */}
            {feedItemId && (
              <FeedbackButtons
                findingId={feedItemId}
                currentFeedback={
                  currentFeedback === 'up'
                    ? 'positive'
                    : currentFeedback === 'down'
                      ? 'negative'
                      : null
                }
                onFeedback={handleFeedback}
                testID={`${testID}-feedback`}
              />
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
