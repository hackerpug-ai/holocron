import { getPlatformUrl, getRnApiKey, type PlatformJson } from '@/app/zero/platform';

export type VoiceSessionCredentials = {
  ephemeralKey: string;
  sessionId: string;
  instructions: string;
};

async function voiceFetch(path: string, init: RequestInit & { json?: PlatformJson } = {}) {
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

/** Start a realtime voice session without ever placing a provider key on-device. */
export async function createVoiceSession(conversationId: string): Promise<VoiceSessionCredentials> {
  const response = await voiceFetch('/api/voice-sessions', {
    method: 'POST',
    json: { conversationId },
  });
  if (!response.ok) {
    throw new Error(`voice session create failed: ${response.status}`);
  }
  const result = (await response.json()) as { session?: Partial<VoiceSessionCredentials> };
  const session = result.session;
  if (
    typeof session?.ephemeralKey !== 'string' ||
    typeof session.sessionId !== 'string' ||
    typeof session.instructions !== 'string'
  ) {
    throw new Error('voice session create returned invalid credentials');
  }
  return session as VoiceSessionCredentials;
}

/** Mark a completed native voice session durable; failure must not block UI cleanup. */
export async function endVoiceSession(sessionId: string): Promise<void> {
  const response = await voiceFetch(`/api/voice-sessions/${sessionId}/end`, {
    method: 'POST',
    json: {},
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`voice session end failed: ${response.status}`);
  }
}
