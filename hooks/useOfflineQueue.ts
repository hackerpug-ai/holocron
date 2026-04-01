import { useEffect, useState, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNetworkStatus } from './useNetworkStatus'

const FEEDBACK_QUEUE_KEY = 'offline_feedback_queue'
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

export interface QueuedFeedback {
  findingId: string
  sentiment: 'positive' | 'negative'
  timestamp: number
}

export interface CachedFeedItem {
  title: string
  url: string
  source: string
  category: "discovery" | "release" | "trend" | "discussion"
  score?: number
  summary?: string
  publishedAt?: string
  author?: string
  engagementVelocity?: number
  tags?: string[]
  cachedAt: number
}

const CACHE_KEY = 'offline_feed_cache'

/**
 * Check if cache entry is still valid (less than 7 days old)
 */
function isCacheValid(cachedAt: number): boolean {
  return Date.now() - cachedAt < CACHE_MAX_AGE
}

/**
 * Hook for managing offline feedback queue and cached feed items
 * Handles queuing feedback when offline and flushing when back online
 */
export function useOfflineQueue() {
  const { isOnline } = useNetworkStatus()
  const [queueLength, setQueueLength] = useState(0)
  const [isFlushing, setIsFlushing] = useState(false)

  /**
   * Get the current feedback queue from AsyncStorage
   */
  const getQueue = useCallback(async (): Promise<QueuedFeedback[]> => {
    try {
      const stored = await AsyncStorage.getItem(FEEDBACK_QUEUE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Failed to get feedback queue:', error)
      return []
    }
  }, [])

  /**
   * Add feedback to the offline queue
   */
  const queueFeedback = useCallback(async (feedback: QueuedFeedback) => {
    try {
      const queue = await getQueue()
      queue.push(feedback)
      await AsyncStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(queue))
      setQueueLength(queue.length)
    } catch (error) {
      console.error('Failed to queue feedback:', error)
    }
  }, [getQueue])

  /**
   * Submit feedback (placeholder - actual submission will be handled by the mutation)
   * This is called by flushQueue for each item in the queue
   */
  const submitFeedback = async (feedback: QueuedFeedback) => {
    // This will be replaced with the actual Convex mutation
    // For now, we just log it
    console.log('Submitting queued feedback:', feedback)
    // TODO: Call Convex mutation here
    // await api.feedback.mutations.submit(feedback.findingId, feedback.sentiment)
  }

  /**
   * Flush the feedback queue by submitting all queued items
   */
  const flushQueue = useCallback(async () => {
    if (!isOnline || isFlushing) {
      return
    }

    setIsFlushing(true)
    try {
      const queue = await getQueue()
      if (queue.length === 0) {
        return
      }

      // Submit all queued feedback
      await Promise.all(queue.map((f) => submitFeedback(f)))

      // Clear queue after successful submission
      await AsyncStorage.removeItem(FEEDBACK_QUEUE_KEY)
      setQueueLength(0)
    } catch (error) {
      console.error('Failed to flush feedback queue:', error)
    } finally {
      setIsFlushing(false)
    }
  }, [isOnline, isFlushing, getQueue])

  /**
   * Auto-flush queue when coming back online
   */
  useEffect(() => {
    if (isOnline) {
      flushQueue()
    }
  }, [isOnline, flushQueue])

  /**
   * Initialize queue length on mount
   */
  useEffect(() => {
    getQueue().then((queue) => {
      setQueueLength(queue.length)
    })
  }, [getQueue])

  /**
   * Cache feed items for offline access
   */
  const cacheFeedItems = useCallback(async (items: CachedFeedItem[]) => {
    try {
      const itemsWithTimestamp = items.map((item) => ({
        ...item,
        cachedAt: Date.now(),
      }))
      // Cache only the last 50 items
      const itemsToCache = itemsWithTimestamp.slice(0, 50)
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(itemsToCache))
    } catch (error) {
      console.error('Failed to cache feed items:', error)
    }
  }, [])

  /**
   * Get cached feed items if still valid
   */
  const getCachedFeedItems = useCallback(async (): Promise<CachedFeedItem[] | null> => {
    try {
      const stored = await AsyncStorage.getItem(CACHE_KEY)
      if (!stored) {
        return null
      }

      const items: CachedFeedItem[] = JSON.parse(stored)

      // Check if cache is still valid (less than 7 days old)
      if (items.length > 0 && !isCacheValid(items[0].cachedAt)) {
        // Cache is expired, clear it
        await clearCache()
        return null
      }

      return items
    } catch (error) {
      console.error('Failed to get cached feed items:', error)
      return null
    }
  }, [])

  /**
   * Clear the feed cache
   */
  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CACHE_KEY)
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }, [])

  return {
    queueFeedback,
    getQueue,
    flushQueue,
    queueLength,
    isFlushing,
    cacheFeedItems,
    getCachedFeedItems,
    clearCache,
  }
}
