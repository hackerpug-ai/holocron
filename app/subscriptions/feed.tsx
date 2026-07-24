import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/lib/constants/routes';
import { log } from '@/lib/logger-client';

/**
 * Redirect old subscriptions feed deep link to What's New feed.
 *
 * Deep link: holocron://subscriptions/feed
 * Redirects to: /whats-new
 *
 * Query parameters are preserved during redirect.
 */
export default function SubscriptionsFeedRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();

  const queryString = new URLSearchParams(params as Record<string, string>).toString();
  const href = queryString ? `${ROUTES.WHATS_NEW}?${queryString}` : ROUTES.WHATS_NEW;

  log('Navigation').info('Legacy subscription feed route redirect', {
    from: ROUTES.LEGACY.SUBSCRIPTIONS_FEED,
    to: ROUTES.WHATS_NEW,
    params,
  });

  return <Redirect href={href} />;
}
