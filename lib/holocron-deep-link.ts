import * as Linking from 'expo-linking';

/**
 * Resolve holocron:// route key for in-app navigation.
 *
 * URL shapes (WHATWG + expo-linking):
 *   holocron://whats-new          → hostname=whats-new, path empty  ← Maestro openLink
 *   holocron://whats-new/social   → hostname=whats-new, path=social
 *   holocron:///whats-new         → hostname empty, path=/whats-new
 *
 * Step4 full-driver fail: only checking parsed.path missed the hostname form,
 * so openLink completed while the app stayed on chat.
 */
export function resolveHolocronRoute(url: string): string | null {
  const parsed = Linking.parse(url);
  if (parsed.scheme !== 'holocron') return null;

  const host = (parsed.hostname || '').replace(/^\//, '');
  // Skip Expo Dev Client host — not an app route
  if (host === 'expo-development-client') return null;

  const path = (parsed.path || '').replace(/^\//, '');
  if (host && path) return `${host}/${path}`.replace(/\/+/g, '/');
  if (host) return host;
  if (path) return path;
  return null;
}
