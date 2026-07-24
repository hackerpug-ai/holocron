/**
 * Route constants for navigation
 *
 * Centralized route definitions to avoid hardcoded strings and
 * enable easier refactoring.
 */

export const ROUTES = {
  /**
   * What's New intelligence briefing feed (drawer)
   */
  WHATS_NEW: '/whats-new',

  /**
   * Social posts subview under What's New
   */
  WHATS_NEW_SOCIAL: '/whats-new/social',

  /**
   * Subscriptions management/settings list (Zero-backed sources)
   * Deep link: holocron://subscriptions
   */
  SUBSCRIPTIONS_SETTINGS: '/subscriptions',

  /**
   * Explicit settings alias (redirects to SUBSCRIPTIONS_SETTINGS)
   */
  SUBSCRIPTIONS_SETTINGS_ALIAS: '/subscriptions/settings',

  /**
   * Legacy routes that redirect to new locations
   */
  LEGACY: {
    SUBSCRIPTIONS: '/subscriptions',
    SUBSCRIPTIONS_FEED: '/subscriptions/feed',
  },
} as const;

/**
 * Legacy feed routes that should redirect to What's New
 */
export const LEGACY_FEED_ROUTES = [ROUTES.LEGACY.SUBSCRIPTIONS_FEED] as const;
