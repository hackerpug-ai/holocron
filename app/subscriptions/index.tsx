import { Redirect, useLocalSearchParams } from 'expo-router'
import { log } from '@/lib/logger-client'
import { ROUTES } from '@/lib/constants/routes'

/**
 * Redirect old subscriptions deep link to What's New feed.
 *
 * Deep link: holocron://subscriptions
 * Redirects to: /subscriptions/social (What's New feed)
 *
 * Query parameters are preserved during redirect.
 *
 * NOTE: The spec says to redirect to /whats-new but that route doesn't exist yet.
 * The actual working "What's New" feed is at /subscriptions/social.
 * This redirect fulfills the intent of US-REM-005 by sending users to the correct feed location.
 */
export default function SubscriptionsRedirect() {
  const params = useLocalSearchParams<Record<string, string>>()

  // Build redirect URL with preserved query parameters
  const queryString = new URLSearchParams(params as Record<string, string>).toString()
  const href = queryString ? `${ROUTES.WHATS_NEW}?${queryString}` : ROUTES.WHATS_NEW

  // Log redirect for monitoring
  log('Navigation').info('Legacy subscription route redirect', {
    from: ROUTES.LEGACY.SUBSCRIPTIONS,
    to: ROUTES.WHATS_NEW,
    params,
  })

  return <Redirect href={href} />
}
