import { getPlatformUrl, getRnApiKey, type PlatformJson } from '@/app/zero/platform';

type ImprovementPayload = {
  title: string;
  description: string;
  sourceScreen?: string;
  sourceComponent?: string | null;
};

async function improvementFetch(path: string, init: RequestInit & { json?: PlatformJson } = {}) {
  const base = getPlatformUrl();
  const key = getRnApiKey();
  if (!base) throw new Error('EXPO_PUBLIC_PLATFORM_URL is not set');
  if (!key) throw new Error('EXPO_PUBLIC_RN_API_KEY is not set');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${key}`);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  return fetch(`${base}${path}`, {
    ...init,
    headers,
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
}

async function command(path: string, init: RequestInit & { json?: PlatformJson }) {
  const response = await improvementFetch(path, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`improvement command failed: ${response.status} ${body}`);
  }
  return (await response.json()) as PlatformJson;
}

/** POST /api/improvements — durable native improvement creation. */
export async function createImprovement(payload: ImprovementPayload): Promise<string> {
  const result = await command('/api/improvements', { method: 'POST', json: payload });
  const improvement = result.improvement as { id?: unknown } | undefined;
  if (typeof improvement?.id !== 'string') throw new Error('improvement create returned no id');
  return improvement.id;
}

/** PATCH /api/improvements/:id — durable native edit and status transition. */
export async function updateImprovement(
  id: string,
  changes: Partial<Pick<ImprovementPayload, 'title' | 'description'>> & {
    status?: 'pending' | 'completed';
  }
): Promise<void> {
  await command(`/api/improvements/${id}`, { method: 'PATCH', json: changes });
}

/** DELETE /api/improvements/:id — durable native removal. */
export async function deleteImprovement(id: string): Promise<void> {
  await command(`/api/improvements/${id}`, { method: 'DELETE' });
}
