import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-linking', () => ({
  parse: (url: string) => {
    // Mirror WHATWG + typical expo-linking for holocron://host/path
    try {
      const u = new URL(url);
      const path = u.pathname === '/' ? '' : u.pathname;
      return {
        scheme: u.protocol.replace(':', ''),
        hostname: u.hostname || null,
        path: path || null,
        queryParams: Object.fromEntries(u.searchParams.entries()),
      };
    } catch {
      return { scheme: null, hostname: null, path: null, queryParams: {} };
    }
  },
}));

import { resolveHolocronRoute } from '@/lib/holocron-deep-link';

describe('resolveHolocronRoute (GATE-FIX-004 step4 deeplink)', () => {
  it('resolves Maestro openLink holocron://whats-new (hostname form)', () => {
    expect(resolveHolocronRoute('holocron://whats-new')).toBe('whats-new');
  });

  it('resolves whats-new/social hostname+path', () => {
    expect(resolveHolocronRoute('holocron://whats-new/social')).toBe('whats-new/social');
  });

  it('resolves path-only holocron:///whats-new', () => {
    expect(resolveHolocronRoute('holocron:///whats-new')).toBe('whats-new');
  });

  it('resolves articles hostname form', () => {
    expect(resolveHolocronRoute('holocron://articles')).toBe('articles');
  });

  it('ignores non-holocron schemes', () => {
    expect(resolveHolocronRoute('https://example.com/whats-new')).toBeNull();
  });

  it('ignores expo-development-client host', () => {
    expect(
      resolveHolocronRoute('exp+holocron://expo-development-client/?url=http://127.0.0.1:8081')
    ).toBeNull();
  });
});
