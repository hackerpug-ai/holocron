import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useCallback, useMemo } from 'react';
import { feedItemFeedbackById } from '@/app/zero/queries';

export type FeedFeedbackValue = 'up' | 'down' | null;

type FeedItemFeedbackRow = {
  id: string;
  user_feedback?: string | null;
  user_feedback_at?: number | null;
};

/**
 * Feed-item feedback via Zero (getFeedItemFeedback + submitFeedItemFeedback).
 * Shared by VideoCard / SocialCard / ReleaseCard (Rule of 2+).
 */
export function useFeedItemFeedback(feedItemId?: string | null) {
  const zero = useZero();
  const id = feedItemId ?? '';
  const [row] = useZeroQuery(feedItemFeedbackById(id));
  const feedbackRow = (row ?? null) as FeedItemFeedbackRow | null;

  const currentFeedback: FeedFeedbackValue = useMemo(() => {
    if (!feedItemId || !feedbackRow?.user_feedback) return null;
    if (feedbackRow.user_feedback === 'up' || feedbackRow.user_feedback === 'down') {
      return feedbackRow.user_feedback;
    }
    return null;
  }, [feedItemId, feedbackRow?.user_feedback]);

  const submitFeedback = useCallback(
    async (type: 'positive' | 'negative' | null) => {
      if (!feedItemId) return;
      // Only persist explicit thumbs; deselect is local UI concern.
      if (type === null) return;
      const feedback = type === 'positive' ? 'up' : 'down';
      await zero.mutate.feed_items.update({
        id: feedItemId,
        user_feedback: feedback,
        user_feedback_at: Date.now(),
      });
    },
    [feedItemId, zero]
  );

  return {
    currentFeedback,
    submitFeedback,
  };
}
