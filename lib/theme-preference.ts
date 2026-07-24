import { Storage } from 'expo-sqlite/kv-store';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_PREFERENCE_KEY = 'holocron.theme-mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export async function getThemePreference(): Promise<ThemeMode | null> {
  const value = await Storage.getItemAsync(THEME_PREFERENCE_KEY);
  return isThemeMode(value) ? value : null;
}

export function setThemePreference(mode: ThemeMode): Promise<void> {
  return Storage.setItemAsync(THEME_PREFERENCE_KEY, mode);
}
