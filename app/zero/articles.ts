import { getPlatformUrl, getRnApiKey, type PlatformJson } from '@/app/zero/platform';

function articleFetch(path: string, init: RequestInit & { json?: PlatformJson } = {}) {
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

/** Create a durable article from imported Markdown. */
export async function createImportedArticle(title: string, content: string): Promise<string> {
  const response = await articleFetch('/api/documents', {
    method: 'POST',
    json: { title, content, category: 'general' },
  });
  if (!response.ok) throw new Error(`article create failed: ${response.status}`);
  const result = (await response.json()) as { document?: { id?: unknown } };
  if (typeof result.document?.id !== 'string') throw new Error('article create returned no id');
  return result.document.id;
}
