/**
 * Route constants for navigation
 *
 * Centralized route definitions to avoid hardcoded strings and
 * enable easier refactoring.
 */

export const ROUTES = {
  /**
   * What's New feed route (social posts from subscriptions)
   * NOTE: This is the new location for the feed, previously at /subscriptions/feed
   */
  WHATS_NEW: '/subscriptions/social',

  /**
   * Subscriptions management/settings route
   */
  SUBSCRIPTIONS_SETTINGS: '/subscriptions/settings',

  /**
   * Legacy routes that redirect to new locations
   */
  LEGACY: {
    SUBSCRIPTIONS: '/subscriptions',
    SUBSCRIPTIONS_FEED: '/subscriptions/feed',
  },
} as const

/**
 * Legacy feed routes that should redirect to What's New
 */
export const LEGACY_FEED_ROUTES = [
  ROUTES.LEGACY.SUBSCRIPTIONS,
  ROUTES.LEGACY.SUBSCRIPTIONS_FEED,
] as const
