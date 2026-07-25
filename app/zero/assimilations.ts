import { getPlatformUrl, getRnApiKey, type PlatformJson } from '@/app/zero/platform';

type AssimilationDecision = { decision: 'approve' } | { decision: 'reject'; feedback?: string };

async function command(id: string, decision: AssimilationDecision): Promise<void> {
  const base = getPlatformUrl();
  const key = getRnApiKey();
  if (!base) throw new Error('EXPO_PUBLIC_PLATFORM_URL is not set');
  if (!key) throw new Error('EXPO_PUBLIC_RN_API_KEY is not set');

  const response = await fetch(`${base}/api/assimilations/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(decision),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`assimilation decision failed: ${response.status} ${body}`);
  }
  await response.json().catch(() => undefined as PlatformJson | undefined);
}

/** Start the server-side execution for a reviewed plan exactly once. */
export async function approveAssimilationPlan(id: string): Promise<void> {
  await command(id, { decision: 'approve' });
}

/** Persist reviewer feedback and return the plan to planning for revision. */
export async function rejectAssimilationPlan(id: string, feedback?: string): Promise<void> {
  await command(id, { decision: 'reject', feedback });
}
