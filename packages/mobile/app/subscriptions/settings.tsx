import { Redirect } from 'expo-router';
import { ROUTES } from '@/lib/constants/routes';

/**
 * Canonical settings path redirects to the Zero settings list at /subscriptions.
 * Deep link: holocron://subscriptions/settings → holocron://subscriptions
 */
export default function SubscriptionsSettingsRedirect() {
  return <Redirect href={ROUTES.SUBSCRIPTIONS_SETTINGS} />;
}
