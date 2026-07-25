import { getPlatformUrl, getRnApiKey, type PlatformJson } from '@/app/zero/platform';

async function command(path: string, init: RequestInit & { json?: PlatformJson }) {
  const base = getPlatformUrl();
  const key = getRnApiKey();
  if (!base) throw new Error('EXPO_PUBLIC_PLATFORM_URL is not set');
  if (!key) throw new Error('EXPO_PUBLIC_RN_API_KEY is not set');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${key}`);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`subscription command failed: ${response.status} ${body}`);
  }
  return (await response.json()) as PlatformJson;
}

/** Persist the existing subscription's automatic-research preference. */
export async function updateSubscriptionAutoResearch(
  id: string,
  autoResearch: boolean
): Promise<void> {
  await command(`/api/subscriptions/${id}`, {
    method: 'PATCH',
    json: { autoResearch },
  });
}

/** Remove a subscription source and its collected content from the durable store. */
export async function deleteSubscription(id: string): Promise<void> {
  await command(`/api/subscriptions/${id}`, { method: 'DELETE' });
}

/** Persist a feed item's explicit relevance feedback. Safe to retry with the same value. */
export async function submitFeedItemFeedback(id: string, feedback: 'up' | 'down'): Promise<void> {
  await command(`/api/feed-items/${id}/feedback`, {
    method: 'POST',
    json: { feedback },
  });
}
