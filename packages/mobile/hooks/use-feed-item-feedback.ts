import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useCallback, useMemo, useState } from 'react';
import { feedItemFeedbackById } from '@/app/zero/queries';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

export type FeedFeedbackValue = 'up' | 'down' | null;
type PendingFeedbackValue = 'positive' | 'negative' | null;

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
  const id = feedItemId ?? '';
  const [row] = useZeroQuery(feedItemFeedbackById(id));
  const { submitFeedback: submitQueuedFeedback } = useOfflineQueue();
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedbackValue>(null);
  const feedbackRow = (row ?? null) as FeedItemFeedbackRow | null;

  const currentFeedback: FeedFeedbackValue = useMemo(() => {
    if (pendingFeedback) return pendingFeedback === 'positive' ? 'up' : 'down';
    if (!feedItemId || !feedbackRow?.user_feedback) return null;
    if (feedbackRow.user_feedback === 'up' || feedbackRow.user_feedback === 'down') {
      return feedbackRow.user_feedback;
    }
    return null;
  }, [feedItemId, feedbackRow?.user_feedback, pendingFeedback]);

  const submitFeedback = useCallback(
    async (type: 'positive' | 'negative' | null) => {
      if (!feedItemId) return;
      // Only persist explicit thumbs; deselect is local UI concern.
      if (type === null) return;
      const result = await submitQueuedFeedback({
        feedItemId,
        sentiment: type,
        timestamp: Date.now(),
      });
      setPendingFeedback(result === 'queued' ? type : null);
    },
    [feedItemId, submitQueuedFeedback]
  );

  return {
    currentFeedback,
    submitFeedback,
  };
}
