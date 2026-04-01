import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Redirect old subscriptions feed deep link to What's New (social posts view).
 *
 * Deep link: holocron://subscriptions/feed
 * Redirects to: /subscriptions/social
 *
 * Query parameters are preserved during redirect.
 */
export default function SubscriptionsFeedRedirect() {
  const params = useLocalSearchParams<Record<string, string>>()

  // Build redirect URL with preserved query parameters
  const queryString = new URLSearchParams(params).toString()
  const href = queryString ? `/subscriptions/social?${queryString}` : '/subscriptions/social'

  return <Redirect href={href} />
}
