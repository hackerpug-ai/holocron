import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { submitFeedItemFeedback } from '@/app/zero/subscriptions';
import { useNetworkStatus } from './useNetworkStatus';

const FEEDBACK_QUEUE_KEY = 'offline_feedback_queue';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export interface QueuedFeedback {
  feedItemId: string;
  sentiment: 'positive' | 'negative';
  timestamp: number;
}

export interface CachedFeedItem {
  title: string;
  url: string;
  source: string;
  category: 'discovery' | 'release' | 'trend' | 'discussion';
  score?: number;
  summary?: string;
  publishedAt?: string;
  author?: string;
  engagementVelocity?: number;
  tags?: string[];
  cachedAt: number;
}

const CACHE_KEY = 'offline_feed_cache';

type QueueListener = (length: number) => void;

const queueListeners = new Set<QueueListener>();
let queueOperation: Promise<void> = Promise.resolve();
let activeFlush: Promise<void> | null = null;

function notifyQueueListeners(length: number) {
  for (const listener of queueListeners) listener(length);
}

function serializeQueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const run = queueOperation.then(operation, operation);
  queueOperation = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readQueue(): Promise<QueuedFeedback[]> {
  const stored = await AsyncStorage.getItem(FEEDBACK_QUEUE_KEY);
  return stored ? (JSON.parse(stored) as QueuedFeedback[]) : [];
}

async function writeQueue(queue: QueuedFeedback[]) {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(FEEDBACK_QUEUE_KEY);
  } else {
    await AsyncStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(queue));
  }
  notifyQueueListeners(queue.length);
}

/**
 * Check if cache entry is still valid (less than 7 days old)
 */
function isCacheValid(cachedAt: number): boolean {
  return Date.now() - cachedAt < CACHE_MAX_AGE;
}

/**
 * Hook for managing offline feedback queue and cached feed items
 * Handles queuing feedback when offline and flushing when back online
 */
export function useOfflineQueue() {
  const { isOnline } = useNetworkStatus();
  const [queueLength, setQueueLength] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);

  /**
   * Get the current feedback queue from AsyncStorage
   */
  const getQueue = useCallback(async (): Promise<QueuedFeedback[]> => {
    try {
      return await readQueue();
    } catch (error) {
      console.error('Failed to get feedback queue:', error);
      return [];
    }
  }, []);

  /**
   * Add feedback to the offline queue
   */
  const queueFeedback = useCallback(async (feedback: QueuedFeedback) => {
    try {
      await serializeQueueOperation(async () => {
        const queue = await readQueue();
        // One queued result per item: the most recent explicit choice wins.
        const nextQueue = queue.filter((item) => item.feedItemId !== feedback.feedItemId);
        nextQueue.push(feedback);
        await writeQueue(nextQueue);
        setQueueLength(nextQueue.length);
      });
    } catch (error) {
      console.error('Failed to queue feedback:', error);
    }
  }, []);

  const persistFeedback = useCallback(async (feedback: QueuedFeedback) => {
    await submitFeedItemFeedback(
      feedback.feedItemId,
      feedback.sentiment === 'positive' ? 'up' : 'down'
    );
  }, []);

  /** Submit immediately when possible; preserve work if connectivity is stale or absent. */
  const submitFeedback = useCallback(
    async (feedback: QueuedFeedback): Promise<'submitted' | 'queued'> => {
      if (!isOnline) {
        await queueFeedback(feedback);
        return 'queued';
      }

      try {
        await persistFeedback(feedback);
        return 'submitted';
      } catch (error) {
        console.warn('Feedback submit failed; queued for retry:', error);
        await queueFeedback(feedback);
        return 'queued';
      }
    },
    [isOnline, persistFeedback, queueFeedback]
  );

  /**
   * Flush the feedback queue by submitting all queued items
   */
  const flushQueue = useCallback(async () => {
    if (!isOnline || isFlushing || activeFlush) {
      return;
    }

    setIsFlushing(true);
    activeFlush = (async () => {
      try {
        while (true) {
          const queued = await getQueue();
          const feedback = queued[0];
          if (!feedback) return;

          await persistFeedback(feedback);

          // Remove only the successfully persisted item. If the user changed their
          // choice while this request was in flight, keep the newer queue entry.
          await serializeQueueOperation(async () => {
            const latestQueue = await readQueue();
            const nextQueue = latestQueue.filter(
              (item) =>
                !(item.feedItemId === feedback.feedItemId && item.timestamp === feedback.timestamp)
            );
            await writeQueue(nextQueue);
            setQueueLength(nextQueue.length);
          });
        }
      } catch (error) {
        console.warn('Queued feedback remains pending after retry failure:', error);
      } finally {
        activeFlush = null;
        setIsFlushing(false);
      }
    })();
    await activeFlush;
  }, [isOnline, isFlushing, getQueue, persistFeedback]);

  /**
   * Auto-flush queue when coming back online
   */
  useEffect(() => {
    if (isOnline) {
      flushQueue();
    }
  }, [isOnline, flushQueue]);

  /**
   * Initialize queue length on mount
   */
  useEffect(() => {
    getQueue().then((queue) => {
      setQueueLength(queue.length);
    });
  }, [getQueue]);

  useEffect(() => {
    const listener = (length: number) => setQueueLength(length);
    queueListeners.add(listener);
    return () => {
      queueListeners.delete(listener);
    };
  }, []);

  /**
   * Cache feed items for offline access
   */
  const cacheFeedItems = useCallback(async (items: CachedFeedItem[]) => {
    try {
      const itemsWithTimestamp = items.map((item) => ({
        ...item,
        cachedAt: Date.now(),
      }));
      // Cache only the last 50 items
      const itemsToCache = itemsWithTimestamp.slice(0, 50);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(itemsToCache));
    } catch (error) {
      console.error('Failed to cache feed items:', error);
    }
  }, []);

  /**
   * Clear the feed cache
   */
  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, []);

  /**
   * Get cached feed items if still valid
   */
  const getCachedFeedItems = useCallback(async (): Promise<CachedFeedItem[] | null> => {
    try {
      const stored = await AsyncStorage.getItem(CACHE_KEY);
      if (!stored) {
        return null;
      }

      const items: CachedFeedItem[] = JSON.parse(stored);

      // Check if cache is still valid (less than 7 days old)
      if (items.length > 0 && !isCacheValid(items[0].cachedAt)) {
        // Cache is expired, clear it
        await clearCache();
        return null;
      }

      return items;
    } catch (error) {
      console.error('Failed to get cached feed items:', error);
      return null;
    }
  }, [clearCache]);

  return {
    queueFeedback,
    getQueue,
    flushQueue,
    queueLength,
    isFlushing,
    isOnline,
    submitFeedback,
    cacheFeedItems,
    getCachedFeedItems,
    clearCache,
  };
}
