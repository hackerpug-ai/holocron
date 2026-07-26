/**
 * Deterministic E2E / Maestro image fixture URI.
 *
 * Priority:
 *  1. EXPO_PUBLIC_E2E_FIXTURE_URI (explicit file:// or http URI)
 *  2. Bundled assets/e2e/test-fixture.jpg (same bytes as tests/fixtures/test-fixture.jpg)
 *
 * Only returns a URI in __DEV__ or when EXPO_PUBLIC_HOLO_E2E=1 so production
 * builds never silently seed a fixture image on attach.
 */
import { Asset } from 'expo-asset';
import { Image, type ImageSourcePropType } from 'react-native';

// Bundled copy of tests/fixtures/test-fixture.jpg (800x600, known SHA-256).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BUNDLED_FIXTURE = require('../../assets/e2e/test-fixture.jpg') as number & ImageSourcePropType;

export function isE2eFixtureAttachEnabled(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  const flag = process.env.EXPO_PUBLIC_HOLO_E2E ?? process.env.HOLO_E2E;
  return flag === '1' || flag === 'true';
}

/** Sync best-effort URI (env override or resolveAssetSource). Prefer resolveE2eFixtureUriAsync for upload. */
export function resolveE2eFixtureUri(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_E2E_FIXTURE_URI?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (!isE2eFixtureAttachEnabled()) {
    return null;
  }

  try {
    const resolved = Image.resolveAssetSource(BUNDLED_FIXTURE);
    if (resolved?.uri && resolved.uri.length > 0) {
      return resolved.uri;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Async fixture URI that downloads the asset to a local file when needed.
 * Prefer this for attach → fetch(blob) → upload so Metro http asset URLs are not required.
 */
export async function resolveE2eFixtureUriAsync(): Promise<string | null> {
  const fromEnv = process.env.EXPO_PUBLIC_E2E_FIXTURE_URI?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (!isE2eFixtureAttachEnabled()) {
    return null;
  }
  try {
    const asset = Asset.fromModule(BUNDLED_FIXTURE);
    if (!asset.localUri) {
      await asset.downloadAsync();
    }
    const uri = asset.localUri ?? asset.uri ?? null;
    if (uri && uri.length > 0) return uri;
  } catch {
    // fall back to sync resolveAssetSource
  }
  return resolveE2eFixtureUri();
}

/** Prefer an explicit seed URI, else deterministic e2e fixture when enabled. */
export function resolveAttachImageUri(seedUri?: string | null): string | null {
  if (typeof seedUri === 'string' && seedUri.trim().length > 0) {
    return seedUri.trim();
  }
  return resolveE2eFixtureUri();
}

export async function resolveAttachImageUriAsync(seedUri?: string | null): Promise<string | null> {
  if (typeof seedUri === 'string' && seedUri.trim().length > 0) {
    return seedUri.trim();
  }
  return resolveE2eFixtureUriAsync();
}
