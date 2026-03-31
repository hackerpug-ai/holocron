import type { Doc } from '@/convex/_generated/dataModel'

export type SubscriptionSource = Doc<'subscriptionSources'>
export type SubscriptionContent = Doc<'subscriptionContent'>
export type Document = Doc<'documents'>

/**
 * CreatorGroup represents a grouped set of subscriptions that belong to the same creator.
 * Groups are formed either by a shared creatorProfileId or by identifier for standalone subscriptions.
 *
 * Note: creatorProfileId is returned as string from Convex queries (not Id type) due to serialization.
 */
export interface CreatorGroup {
  /** Creator profile ID if exists, otherwise this is a standalone subscription group */
  creatorProfileId: string | null
  /** Canonical name (from creator profile or first subscription) */
  name: string
  /** All subscriptions in this group */
  subscriptions: SubscriptionSource[]
  /** Number of platforms/subscriptions in this group */
  platformCount: number
  /** Total number of researched documents across all subscriptions in the group */
  documentCount: number
  /** Timestamp of the most recent activity in this group */
  lastActivityAt: number
  /** Avatar URL if from creator profile (optional) */
  avatarUrl?: string
}

/**
 * SubscriptionWithContent represents a subscription with its associated content items.
 */
export interface SubscriptionWithContent {
  subscription: SubscriptionSource
  contentItems: Array<{
    content: SubscriptionContent
    document: Document | null
  }>
  hasResearchedContent: boolean
}

/**
 * Platform type for subscription sources.
 */
export type PlatformType =
  | 'youtube'
  | 'newsletter'
  | 'changelog'
  | 'reddit'
  | 'ebay'
  | 'whats-new'
  | 'creator'

/**
 * Platform type for creator profiles (extended with additional platforms).
 */
export type CreatorPlatformType = PlatformType | 'bluesky' | 'github' | 'website'
